// Asistente de análisis con IA (solo admin).
// La IA no accede a la base directamente: pide datos a través de "herramientas"
// que este servidor ejecuta con la sesión del admin, así RLS sigue aplicando.
// La IA nunca escribe: solo PROPONE cambios (gastos, productos). La app los muestra
// como tarjetas y se guardan únicamente si el admin toca "Guardar".
// Funciona con cualquier proveedor compatible con la API de OpenAI (Groq, Gemini, OpenRouter…).
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BASE_URL = (process.env.AI_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/$/, '');
const MODEL = process.env.AI_MODEL || 'openai/gpt-oss-120b';
const DEFAULT_TZ = 'America/Argentina/Buenos_Aires';
const MAX_TOOL_ROUNDS = 6;
const MAX_HISTORY = 12;
const MAX_MESSAGE_CHARS = 2000;

type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
};

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

const METHODS = ['cash', 'card', 'mercadopago', 'transfer'] as const;

type ExpenseFields = { date: string; concept: string; category: string; amount: number; method: string | null };
type ProductFields = { price: number; cost: number | null; is_active: boolean };

type Proposal =
  | { id: string; kind: 'expense_create'; data: ExpenseFields }
  | { id: string; kind: 'expense_update'; expenseId: string; before: ExpenseFields; after: ExpenseFields }
  | { id: string; kind: 'product_update'; productId: string; name: string; before: ProductFields; after: ProductFields };

const newId = () => Math.random().toString(36).slice(2, 10);

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
      description:
        'Lista gastos de un período con su id. Sin "texto" devuelve los más grandes; con "texto" busca por concepto y devuelve los más recientes. Úsala también para encontrar el id de un gasto antes de proponer corregirlo.',
      parameters: {
        type: 'object',
        properties: {
          desde: { type: 'string', description: 'Fecha inicial, formato AAAA-MM-DD.' },
          hasta: { type: 'string', description: 'Fecha final, formato AAAA-MM-DD.' },
          categoria: { type: 'string', description: 'Categoría exacta, por ejemplo "Insumos". Opcional.' },
          texto: { type: 'string', description: 'Parte del concepto a buscar, por ejemplo "leche". Opcional.' },
        },
        required: ['desde', 'hasta'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_productos',
      description:
        'Busca productos del menú por nombre y devuelve id, nombre, categoría, precio, costo y si está activo. Úsala antes de proponer un cambio de producto.',
      parameters: {
        type: 'object',
        properties: { texto: { type: 'string', description: 'Parte del nombre, por ejemplo "medialuna".' } },
        required: ['texto'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'proponer_gasto',
      description:
        'Prepara un gasto NUEVO para que el usuario lo confirme. No guarda nada: la app muestra una tarjeta con botones Guardar y Cancelar.',
      parameters: {
        type: 'object',
        properties: {
          fecha: { type: 'string', description: 'AAAA-MM-DD. Si el usuario no la dice, usa hoy.' },
          concepto: { type: 'string', description: 'Qué se compró o pagó, breve.' },
          categoria: { type: 'string', description: 'Preferentemente una de las categorías existentes.' },
          monto: { type: 'number', description: 'Monto en pesos, mayor a cero.' },
          medio: { type: 'string', enum: [...METHODS], description: 'Medio de pago, si se conoce.' },
        },
        required: ['fecha', 'concepto', 'categoria', 'monto'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'proponer_cambio_gasto',
      description:
        'Prepara una corrección o recategorización de un gasto existente (usa el id de detalle_gastos). Solo incluye los campos que cambian. No guarda nada hasta que el usuario confirme.',
      parameters: {
        type: 'object',
        properties: {
          gasto_id: { type: 'string' },
          fecha: { type: 'string', description: 'AAAA-MM-DD' },
          concepto: { type: 'string' },
          categoria: { type: 'string' },
          monto: { type: 'number' },
          medio: { type: 'string', enum: [...METHODS] },
        },
        required: ['gasto_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'proponer_cambio_producto',
      description:
        'Prepara un cambio de precio, de costo, o activar/desactivar un producto (usa el id de buscar_productos). Solo incluye lo que cambia. No guarda nada hasta que el usuario confirme.',
      parameters: {
        type: 'object',
        properties: {
          producto_id: { type: 'string' },
          precio: { type: 'number', description: 'Precio de venta nuevo, mayor a cero.' },
          costo: { type: 'number', description: 'Costo unitario nuevo, cero o más.' },
          activo: { type: 'boolean', description: 'false para desactivar (por ejemplo, agotado), true para activar.' },
        },
        required: ['producto_id'],
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Validación de propuestas

const isUuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
const roundMoney = (n: number) => Math.round(n * 100) / 100;

function checkDate(value: unknown, tz: string) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) throw new Error('La fecha debe tener formato AAAA-MM-DD.');
  if (value > todayIn(tz)) throw new Error('La fecha no puede ser futura.');
  return value;
}

function checkAmount(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error('El monto debe ser mayor a cero.');
  return roundMoney(n);
}

function checkText(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Falta ${field}.`);
  const t = value.trim().slice(0, 120);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function checkMethod(value: unknown) {
  if (value == null || value === '') return null;
  if (!METHODS.includes(value as any)) throw new Error('Medio de pago no válido.');
  return value as string;
}

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

async function runTool(name: string, args: any, supabase: any, tz: string, proposals: Proposal[]) {
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
      const texto = typeof args.texto === 'string' ? args.texto.trim().replace(/[%_,()]/g, ' ') : '';
      let q = supabase
        .from('expenses')
        .select('id, spent_at, concept, category, amount, payment_method')
        .gte('spent_at', r.start)
        .lt('spent_at', r.end)
        .order(texto ? 'spent_at' : 'amount', { ascending: false })
        .limit(25);
      if (typeof args.categoria === 'string' && args.categoria.trim()) q = q.eq('category', args.categoria.trim());
      if (texto) q = q.ilike('concept', `%${texto}%`);
      const { data, error } = await q;
      if (error) throw error;
      return {
        gastos: (data ?? []).map((g: any) => ({
          id: g.id,
          fecha: new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(g.spent_at)),
          concepto: g.concept,
          categoria: g.category,
          monto: round(g.amount),
          medio: g.payment_method,
        })),
      };
    }
    if (name === 'buscar_productos') {
      const texto = checkText(args.texto, 'el texto a buscar').replace(/[%_,()]/g, ' ');
      const { data, error } = await supabase
        .from('products')
        .select('id, name, price, cost, is_active, categories ( name )')
        .ilike('name', `%${texto}%`)
        .order('name')
        .limit(15);
      if (error) throw error;
      return {
        productos: (data ?? []).map((p: any) => ({
          id: p.id,
          nombre: p.name,
          categoria: p.categories?.name ?? null,
          precio: Number(p.price),
          costo: p.cost == null ? null : Number(p.cost),
          activo: p.is_active !== false,
        })),
      };
    }

    if (name === 'proponer_gasto') {
      const data: ExpenseFields = {
        date: checkDate(args.fecha ?? todayIn(tz), tz),
        concept: checkText(args.concepto, 'el concepto'),
        category: checkText(args.categoria, 'la categoría'),
        amount: checkAmount(args.monto),
        method: checkMethod(args.medio),
      };
      proposals.push({ id: newId(), kind: 'expense_create', data });
      return { ok: true, estado: 'Propuesta lista. El usuario debe tocar Guardar para registrarla.', propuesta: data };
    }

    if (name === 'proponer_cambio_gasto') {
      if (!isUuid(args.gasto_id)) throw new Error('Falta el id del gasto (búscalo con detalle_gastos).');
      const { data: g, error } = await supabase
        .from('expenses')
        .select('id, spent_at, concept, category, amount, payment_method')
        .eq('id', args.gasto_id)
        .maybeSingle();
      if (error) throw error;
      if (!g) throw new Error('No encontré ese gasto.');
      const before: ExpenseFields = {
        date: new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(g.spent_at)),
        concept: g.concept,
        category: g.category,
        amount: Number(g.amount),
        method: g.payment_method,
      };
      const after: ExpenseFields = {
        date: args.fecha != null ? checkDate(args.fecha, tz) : before.date,
        concept: args.concepto != null ? checkText(args.concepto, 'el concepto') : before.concept,
        category: args.categoria != null ? checkText(args.categoria, 'la categoría') : before.category,
        amount: args.monto != null ? checkAmount(args.monto) : before.amount,
        method: args.medio != null ? checkMethod(args.medio) : before.method,
      };
      if (JSON.stringify(before) === JSON.stringify(after)) throw new Error('No hay ningún cambio respecto del gasto actual.');
      proposals.push({ id: newId(), kind: 'expense_update', expenseId: g.id, before, after });
      return { ok: true, estado: 'Propuesta lista. El usuario debe tocar Guardar para aplicarla.', antes: before, despues: after };
    }

    if (name === 'proponer_cambio_producto') {
      if (!isUuid(args.producto_id)) throw new Error('Falta el id del producto (búscalo con buscar_productos).');
      const { data: p, error } = await supabase
        .from('products')
        .select('id, name, price, cost, is_active')
        .eq('id', args.producto_id)
        .maybeSingle();
      if (error) throw error;
      if (!p) throw new Error('No encontré ese producto.');
      const before: ProductFields = {
        price: Number(p.price),
        cost: p.cost == null ? null : Number(p.cost),
        is_active: p.is_active !== false,
      };
      let cost = before.cost;
      if (args.costo != null) {
        const c = Number(args.costo);
        if (!Number.isFinite(c) || c < 0) throw new Error('El costo debe ser cero o más.');
        cost = roundMoney(c);
      }
      const after: ProductFields = {
        price: args.precio != null ? checkAmount(args.precio) : before.price,
        cost,
        is_active: typeof args.activo === 'boolean' ? args.activo : before.is_active,
      };
      if (JSON.stringify(before) === JSON.stringify(after)) throw new Error('No hay ningún cambio respecto del producto actual.');
      proposals.push({ id: newId(), kind: 'product_update', productId: p.id, name: p.name, before, after });
      return { ok: true, estado: 'Propuesta lista. El usuario debe tocar Guardar para aplicarla.', producto: p.name, antes: before, despues: after };
    }

    return { error: `Herramienta desconocida: ${name}` };
  } catch (e: any) {
    return { error: e?.message ?? 'No se pudieron obtener los datos.' };
  }
}

function systemPrompt(tz: string, categories: string[]) {
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
- Las ventas importadas de la app anterior no tienen hora de apertura de mesa.

Cambios (gastos y productos):
- Tú no guardas nada. Con las herramientas "proponer_…" preparas el cambio y la app le muestra al usuario una tarjeta con Guardar y Cancelar.
- Nunca digas que algo quedó guardado: di que lo preparaste y que lo confirme con el botón Guardar.
- Para corregir un gasto o cambiar un producto, primero búscalo para obtener su id. Si hay varias coincidencias, pregunta cuál es.
- Si falta un dato imprescindible (por ejemplo, el monto), pregúntalo antes de proponer.
- Categorías de gastos existentes: ${categories.length ? categories.join(', ') : 'todavía no hay'}. Usa una de ellas si corresponde.
- No puedes cobrar mesas, aplicar descuentos ni borrar datos; si lo piden, explica que se hace desde la pantalla correspondiente.`;
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

  const { data: catRows } = await supabase.from('expenses').select('category').limit(2000);
  const categories = Array.from(new Set<string>((catRows ?? []).map((r: any) => r.category))).sort();

  const proposals: Proposal[] = [];
  const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt(tz, categories) }, ...history];

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
        const result = await runTool(call.function?.name, args, supabase, tz, proposals);
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      }
      continue;
    }

    const reply = typeof msg?.content === 'string' ? msg.content.trim() : '';
    return NextResponse.json({
      reply: reply || (proposals.length ? 'Preparé el cambio. Revísalo y toca Guardar para confirmarlo.' : 'No pude generar una respuesta. Intenta reformular la pregunta.'),
      proposals,
    });
  }

  if (proposals.length) {
    return NextResponse.json({ reply: 'Preparé el cambio. Revísalo y toca Guardar para confirmarlo.', proposals });
  }
  return fail(500, 'La consulta necesitó demasiados pasos. Intenta una pregunta más concreta.');
}
