// Asistente de análisis con IA (solo admin).
// La IA no accede a la base directamente: pide datos a través de "herramientas"
// que este servidor ejecuta con la sesión del admin, así RLS sigue aplicando.
// Funciona con cualquier proveedor compatible con la API de OpenAI (Groq, Gemini, OpenRouter…).
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BASE_URL = (process.env.AI_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/$/, '');
const MODEL = process.env.AI_MODEL || 'openai/gpt-oss-120b';
const DEFAULT_TZ = 'America/Argentina/Buenos_Aires';
const MAX_TOOL_ROUNDS = 5;
const MAX_HISTORY = 12;
const MAX_MESSAGE_CHARS = 2000;

type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
};

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

// ---------------------------------------------------------------------------
// Fechas

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validTz(tz: unknown) {
  if (typeof tz !== 'string' || !tz) return DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TZ;
  }
}

function todayIn(tz: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
}

function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Desfase horario de la zona en esa fecha, por ejemplo "-03:00"
function offsetFor(date: string, tz: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(
    new Date(`${date}T12:00:00Z`)
  );
  const value = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = value.match(/GMT([+-]\d{2})(?::?(\d{2}))?/);
  return m ? `${m[1]}:${m[2] ?? '00'}` : '+00:00';
}

function rangeFor(desde: unknown, hasta: unknown, tz: string) {
  if (typeof desde !== 'string' || typeof hasta !== 'string' || !DATE_RE.test(desde) || !DATE_RE.test(hasta)) {
    throw new Error('Las fechas deben tener formato AAAA-MM-DD.');
  }
  if (hasta < desde) throw new Error('La fecha "hasta" no puede ser anterior a "desde".');
  const end = addDays(hasta, 1);
  const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000;
  if (days > 400) throw new Error('El rango máximo es de 400 días.');
  return {
    start: `${desde}T00:00:00${offsetFor(desde, tz)}`,
    end: `${end}T00:00:00${offsetFor(end, tz)}`,
    days,
  };
}

// ---------------------------------------------------------------------------
// Herramientas que la IA puede usar

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'resumen_ventas',
      description:
        'Ventas, gastos y estadísticas de un período: totales, comparación con el período anterior de igual duración, ventas por día/hora/día de la semana, productos, categorías, mozos, medios de pago, gastos por categoría y márgenes por producto.',
      parameters: {
        type: 'object',
        properties: {
          desde: { type: 'string', description: 'Fecha inicial, formato AAAA-MM-DD (incluida).' },
          hasta: { type: 'string', description: 'Fecha final, formato AAAA-MM-DD (incluida).' },
        },
        required: ['desde', 'hasta'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'estado_salon',
      description:
        'Situación en este momento: estado de cada mesa, mesas abiertas con su consumo y hace cuánto están abiertas, lo cobrado hoy y los gastos de hoy.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'detalle_gastos',
      description: 'Lista de los gastos más grandes de un período, opcionalmente de una sola categoría.',
      parameters: {
        type: 'object',
        properties: {
          desde: { type: 'string', description: 'Fecha inicial, formato AAAA-MM-DD.' },
          hasta: { type: 'string', description: 'Fecha final, formato AAAA-MM-DD.' },
          categoria: { type: 'string', description: 'Categoría exacta, por ejemplo "Insumos". Opcional.' },
        },
        required: ['desde', 'hasta'],
      },
    },
  },
];

const round = (n: unknown) => Math.round(Number(n ?? 0));

// Reduce la respuesta del análisis para no gastar tokens de más
function compactAnalytics(a: any, days: number) {
  let daily = (a.daily ?? []).map((d: any) => ({ dia: d.day, ventas: round(d.sales), mesas: d.orders }));
  if (days > 45) {
    const byMonth = new Map<string, { ventas: number; mesas: number }>();
    for (const d of daily) {
      const k = d.dia.slice(0, 7);
      const prev = byMonth.get(k) ?? { ventas: 0, mesas: 0 };
      byMonth.set(k, { ventas: prev.ventas + d.ventas, mesas: prev.mesas + d.mesas });
    }
    daily = Array.from(byMonth.entries()).map(([mes, v]) => ({ mes, ...v }));
  }
  const kpis = (k: any) => ({
    ventas: round(k?.sales),
    mesas_cobradas: k?.orders ?? 0,
    ticket_promedio: round(k?.avg_ticket),
    unidades: round(k?.items),
    minutos_promedio_por_mesa: k?.avg_minutes == null ? null : round(k.avg_minutes),
  });
  const margins = a.margins ?? [];
  return {
    periodo_actual: kpis(a.kpis),
    periodo_anterior: kpis(a.previous),
    gastos: {
      total: round(a.expenses?.total),
      total_periodo_anterior: round(a.expenses?.previous),
      por_categoria: (a.expenses?.by_category ?? []).map((c: any) => ({ categoria: c.category, total: round(c.total), cantidad: c.count })),
    },
    resultado: round(a.kpis?.sales) - round(a.expenses?.total),
    [days > 45 ? 'ventas_por_mes' : 'ventas_por_dia']: daily,
    ventas_por_hora: (a.hourly ?? []).filter((h: any) => Number(h.sales) > 0).map((h: any) => ({ hora: h.hour, ventas: round(h.sales), mesas: h.orders })),
    ventas_por_dia_semana: (a.weekday ?? []).map((w: any) => ({ dia: ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'][w.dow - 1], ventas: round(w.sales), mesas: w.orders })),
    productos_top: (a.products ?? []).slice(0, 10).map((p: any) => ({ producto: p.name, categoria: p.category, unidades: round(p.qty), ventas: round(p.amount) })),
    categorias: (a.categories ?? []).map((c: any) => ({ categoria: c.name, unidades: round(c.qty), ventas: round(c.amount) })),
    mozos: (a.staff ?? []).map((s: any) => ({ mozo: s.name, mesas: s.orders, ventas: round(s.sales), ticket_promedio: round(s.avg_ticket) })),
    medios_de_pago: (a.payments ?? []).map((p: any) => ({ medio: p.method, cobros: p.orders, ventas: round(p.sales) })),
    margenes: {
      porcentaje_de_ventas_con_costo_cargado: a.cost_coverage == null ? null : Math.round(Number(a.cost_coverage) * 100),
      mayor_ganancia: margins.slice(0, 8).map((m: any) => ({ producto: m.name, unidades: round(m.qty), ventas: round(m.revenue), costo: round(m.cost), ganancia: round(m.margin) })),
      menor_ganancia: margins.slice(-5).reverse().map((m: any) => ({ producto: m.name, ventas: round(m.revenue), ganancia: round(m.margin) })),
    },
  };
}

async function runTool(name: string, args: any, supabase: any, tz: string) {
  try {
    if (name === 'resumen_ventas') {
      const r = rangeFor(args.desde, args.hasta, tz);
      const { data, error } = await supabase.rpc('get_sales_analytics', { p_start: r.start, p_end: r.end, p_tz: tz });
      if (error) throw error;
      return { desde: args.desde, hasta: args.hasta, ...compactAnalytics(data, r.days) };
    }
    if (name === 'estado_salon') {
      const { data, error } = await supabase.rpc('get_live_status', { p_tz: tz });
      if (error) throw error;
      return data;
    }
    if (name === 'detalle_gastos') {
      const r = rangeFor(args.desde, args.hasta, tz);
      let q = supabase
        .from('expenses')
        .select('spent_at, concept, category, amount, payment_method')
        .gte('spent_at', r.start)
        .lt('spent_at', r.end)
        .order('amount', { ascending: false })
        .limit(25);
      if (typeof args.categoria === 'string' && args.categoria.trim()) q = q.eq('category', args.categoria.trim());
      const { data, error } = await q;
      if (error) throw error;
      return {
        gastos_mas_grandes: (data ?? []).map((g: any) => ({
          fecha: new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(g.spent_at)),
          concepto: g.concept,
          categoria: g.category,
          monto: round(g.amount),
          medio: g.payment_method,
        })),
      };
    }
    return { error: `Herramienta desconocida: ${name}` };
  } catch (e: any) {
    return { error: e?.message ?? 'No se pudieron obtener los datos.' };
  }
}

function systemPrompt(tz: string) {
  const today = todayIn(tz);
  const weekday = new Intl.DateTimeFormat('es-AR', { timeZone: tz, weekday: 'long' }).format(new Date());
  return `Eres el asistente de análisis de un café/restaurante. Ayudas al dueño a entender sus ventas, gastos y la operación del salón.

Hoy es ${weekday} ${today} (zona horaria ${tz}). Los montos están en pesos argentinos.

Reglas:
- Obtén siempre los números con las herramientas. Nunca inventes ni estimes cifras que no te dieron.
- Para "hoy", "ayer", "esta semana", "este mes", "el mes pasado", calcula las fechas a partir de hoy.
- Responde en español, breve y claro: primero la respuesta directa, luego como máximo 3 o 4 puntos con el detalle relevante.
- Escribe los montos con separador de miles, por ejemplo $1.234.567, y los porcentajes redondeados.
- Si haces recomendaciones, básalas en los datos y aclara qué supones.
- Si los datos no alcanzan para responder, dilo y sugiere qué cargar (por ejemplo, el costo de los productos).

Definiciones:
- Ventas = total cobrado de las mesas cerradas, ya con descuentos.
- Resultado = ventas − gastos registrados en el mismo período.
- La ganancia por producto usa el costo unitario cargado; es informativa y no se resta del resultado, porque las compras ya están en los gastos.
- Medios de pago: cash = Efectivo, card = Tarjeta, mercadopago = MercadoPago, transfer = Transferencia.
- Las ventas importadas de la app anterior no tienen hora de apertura de mesa.`;
}

// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) return fail(500, 'Falta configurar la clave AI_API_KEY en el servidor.');

  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return fail(401, 'Inicia sesión para usar el asistente.');

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) return fail(401, 'Tu sesión venció. Vuelve a ingresar.');

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', userData.user.id).maybeSingle();
  if (profile?.role !== 'admin') return fail(403, 'El asistente es solo para administradores.');

  let body: any;
  try {
    body = await req.json();
  } catch {
    return fail(400, 'Solicitud inválida.');
  }

  const tz = validTz(body?.tz);
  const history: ChatMessage[] = (Array.isArray(body?.messages) ? body.messages : [])
    .filter((m: any) => (m?.role === 'user' || m?.role === 'assistant') && typeof m?.content === 'string' && m.content.trim())
    .slice(-MAX_HISTORY)
    .map((m: any) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }));

  if (history.length === 0 || history[history.length - 1].role !== 'user') {
    return fail(400, 'Escribe una pregunta.');
  }

  const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt(tz) }, ...history];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    let res: Response;
    try {
      res = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          messages,
          tools: TOOLS,
          tool_choice: round < MAX_TOOL_ROUNDS ? 'auto' : 'none',
          temperature: 0.2,
        }),
      });
    } catch (e) {
      console.error(e);
      return fail(502, 'No se pudo conectar con el servicio de IA.');
    }

    if (res.status === 429) {
      return fail(429, 'Se alcanzó el límite gratuito del servicio de IA. Prueba de nuevo en un minuto.');
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('IA error', res.status, detail);
      return fail(502, `El servicio de IA respondió con un error (${res.status}).`);
    }

    const data = await res.json();
    const msg = data?.choices?.[0]?.message;

    if (msg?.tool_calls?.length) {
      messages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: msg.tool_calls });
      for (const call of msg.tool_calls) {
        let args: any = {};
        try {
          args = JSON.parse(call.function?.arguments || '{}');
        } catch {
          args = {};
        }
        const result = await runTool(call.function?.name, args, supabase, tz);
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      }
      continue;
    }

    const reply = typeof msg?.content === 'string' ? msg.content.trim() : '';
    return NextResponse.json({ reply: reply || 'No pude generar una respuesta. Intenta reformular la pregunta.' });
  }

  return fail(500, 'La consulta necesitó demasiados pasos. Intenta una pregunta más concreta.');
}
