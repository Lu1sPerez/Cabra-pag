'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { Check, RotateCcw, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/browser';
import { createExpense, updateExpense, type ExpenseInput } from '@/actions/expense-actions';
import { updateProduct } from '@/actions/menu-actions';

// --- Propuestas que devuelve el servidor (la IA nunca guarda: el admin confirma) ---
type ExpenseFields = { date: string; concept: string; category: string; amount: number; method: string | null };
type ProductFields = { price: number; cost: number | null; is_active: boolean };

type Proposal =
  | { id: string; kind: 'expense_create'; data: ExpenseFields }
  | { id: string; kind: 'expense_update'; expenseId: string; before: ExpenseFields; after: ExpenseFields }
  | { id: string; kind: 'product_update'; productId: string; name: string; before: ProductFields; after: ProductFields };

type ProposalState = Proposal & { status: 'pending' | 'saving' | 'saved' | 'cancelled' | 'error'; error?: string };

type Message = { role: 'user' | 'assistant'; content: string; proposals?: ProposalState[] };

const SUGGESTIONS = [
  '¿Cómo venimos hoy?',
  'Compara esta semana con la anterior',
  '¿Qué productos dejan más ganancia?',
  '¿En qué gastamos más este mes?',
  'Anota un gasto de $15.000 en leche pagado con MercadoPago',
  'Se terminaron las medialunas de manteca',
];

const METHOD_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  mercadopago: 'MercadoPago',
  transfer: 'Transferencia',
};

const money = (n: number | null) => (n == null ? 'Sin cargar' : `$${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`);
const methodLabel = (m: string | null) => (m ? METHOD_LABELS[m] ?? m : 'Sin dato');
const dateLabel = (d: string) => {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
};

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Fecha elegida -> momento a guardar: ahora si es hoy, mediodía si es otro día
function toTimestamp(date: string) {
  if (date === localToday()) return new Date().toISOString();
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, 12).toISOString();
}

async function applyProposal(p: Proposal) {
  if (p.kind === 'expense_create') {
    await createExpense({
      spent_at: toTimestamp(p.data.date),
      concept: p.data.concept,
      category: p.data.category,
      amount: p.data.amount,
      payment_method: p.data.method,
    });
  } else if (p.kind === 'expense_update') {
    const patch: Partial<ExpenseInput> = {
      concept: p.after.concept,
      category: p.after.category,
      amount: p.after.amount,
      payment_method: p.after.method,
    };
    if (p.after.date !== p.before.date) patch.spent_at = toTimestamp(p.after.date);
    await updateExpense(p.expenseId, patch);
  } else {
    await updateProduct(p.productId, { price: p.after.price, cost: p.after.cost, is_active: p.after.is_active });
  }
}

// Resumen en texto para que la IA sepa, en el siguiente mensaje, qué se confirmó
function outcomeNote(p: ProposalState) {
  const what =
    p.kind === 'expense_create'
      ? `gasto nuevo "${p.data.concept}" por ${money(p.data.amount)}`
      : p.kind === 'expense_update'
        ? `corrección del gasto "${p.before.concept}"`
        : `cambio en el producto "${p.name}"`;
  if (p.status === 'saved') return `[El usuario confirmó y se guardó: ${what}.]`;
  if (p.status === 'cancelled') return `[El usuario canceló: ${what}.]`;
  if (p.status === 'error') return `[No se pudo guardar: ${what}.]`;
  return `[Pendiente de confirmar: ${what}.]`;
}

// --- Formato simple de las respuestas: **negrita** y listas ---
function renderInline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>
  );
}

function FormattedText({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      blocks.push(
        <ul key={`l${blocks.length}`} className="list-disc pl-5 space-y-1">
          {list.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ul>
      );
      list = [];
    }
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const item = line.match(/^(?:[-•*]|\d+\.)\s+(.*)$/);
    if (item) {
      list.push(item[1]);
      continue;
    }
    flush();
    if (!line) continue;
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    blocks.push(
      <p key={`p${blocks.length}`} className={heading ? 'font-semibold' : undefined}>
        {renderInline(heading ? heading[1] : line)}
      </p>
    );
  }
  flush();
  return <div className="space-y-2">{blocks}</div>;
}

// --- Tarjeta de confirmación ---
type Row = { label: string; before?: string; value: string };

function rowsFor(p: Proposal): { title: string; rows: Row[] } {
  if (p.kind === 'expense_create') {
    return {
      title: 'Nuevo gasto',
      rows: [
        { label: 'Fecha', value: dateLabel(p.data.date) },
        { label: 'Concepto', value: p.data.concept },
        { label: 'Categoría', value: p.data.category },
        { label: 'Monto', value: money(p.data.amount) },
        { label: 'Medio de pago', value: methodLabel(p.data.method) },
      ],
    };
  }
  if (p.kind === 'expense_update') {
    const all: Row[] = [
      { label: 'Fecha', before: dateLabel(p.before.date), value: dateLabel(p.after.date) },
      { label: 'Concepto', before: p.before.concept, value: p.after.concept },
      { label: 'Categoría', before: p.before.category, value: p.after.category },
      { label: 'Monto', before: money(p.before.amount), value: money(p.after.amount) },
      { label: 'Medio de pago', before: methodLabel(p.before.method), value: methodLabel(p.after.method) },
    ];
    return {
      title: `Corregir gasto: ${p.before.concept} (${money(p.before.amount)})`,
      rows: all.filter((r) => r.before !== r.value),
    };
  }
  const state = (a: boolean) => (a ? 'Activo' : 'Desactivado');
  const all: Row[] = [
    { label: 'Precio', before: money(p.before.price), value: money(p.after.price) },
    { label: 'Costo', before: money(p.before.cost), value: money(p.after.cost) },
    { label: 'Estado', before: state(p.before.is_active), value: state(p.after.is_active) },
  ];
  return { title: `Cambiar producto: ${p.name}`, rows: all.filter((r) => r.before !== r.value) };
}

function ProposalCard({
  proposal,
  onSave,
  onCancel,
}: {
  proposal: ProposalState;
  onSave: () => void;
  onCancel: () => void;
}) {
  const { title, rows } = rowsFor(proposal);
  const done = proposal.status === 'saved' || proposal.status === 'cancelled';

  return (
    <div className={cn('rounded-lg border bg-white p-3 space-y-3', done && 'opacity-70')}>
      <p className="font-semibold text-slate-800">{title}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {rows.map((r) => (
          <Fragment key={r.label}>
            <dt className="text-slate-500">{r.label}</dt>
            <dd className="text-slate-900">
              {r.before !== undefined && (
                <>
                  <span className="text-slate-500 line-through">{r.before}</span>
                  <span aria-hidden="true"> → </span>
                  <span className="sr-only"> cambia a </span>
                </>
              )}
              <span className="font-medium">{r.value}</span>
            </dd>
          </Fragment>
        ))}
      </dl>

      {proposal.status === 'saved' && (
        <p className="flex items-center gap-1 text-sm font-medium text-green-700">
          <Check size={16} aria-hidden="true" /> Guardado
        </p>
      )}
      {proposal.status === 'cancelled' && <p className="text-sm text-slate-500">Cancelado, no se guardó nada.</p>}
      {proposal.status === 'error' && (
        <p role="alert" className="text-sm text-red-700">
          No se pudo guardar: {proposal.error}
        </p>
      )}

      {!done && (
        <div className="flex gap-2">
          <Button size="sm" onClick={onSave} disabled={proposal.status === 'saving'}>
            {proposal.status === 'saving' ? 'Guardando…' : proposal.status === 'error' ? 'Reintentar' : 'Guardar'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={proposal.status === 'saving'}>
            Cancelar
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

export default function AssistantChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

  const setProposal = (msgIndex: number, id: string, patch: Partial<ProposalState>) => {
    setMessages((prev) =>
      prev.map((m, i) =>
        i === msgIndex && m.proposals
          ? { ...m, proposals: m.proposals.map((p) => (p.id === id ? ({ ...p, ...patch } as ProposalState) : p)) }
          : m
      )
    );
  };

  const save = async (msgIndex: number, p: ProposalState) => {
    setProposal(msgIndex, p.id, { status: 'saving', error: undefined });
    try {
      await applyProposal(p);
      setProposal(msgIndex, p.id, { status: 'saved' });
    } catch (e: any) {
      console.error(e);
      setProposal(msgIndex, p.id, { status: 'error', error: e?.message ?? 'error desconocido' });
    }
  };

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || loading) return;

    const next: Message[] = [...messages, { role: 'user', content: question }];
    setMessages(next);
    setInput('');
    setError(null);
    setLoading(true);

    try {
      const { data } = await createClient().auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Tu sesión venció. Vuelve a ingresar.');

      // Al historial se le suma el resultado de cada tarjeta (guardada, cancelada…)
      const history = next.map((m) => ({
        role: m.role,
        content: m.proposals?.length ? `${m.content}\n${m.proposals.map(outcomeNote).join('\n')}` : m.content,
      }));

      const res = await fetch('/api/asistente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: history, tz: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? 'No se pudo obtener una respuesta.');

      const proposals: ProposalState[] = (body.proposals ?? []).map((p: Proposal) => ({ ...p, status: 'pending' }));
      setMessages([...next, { role: 'assistant', content: body.reply, proposals }]);
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? 'No se pudo obtener una respuesta.');
      setMessages(messages);
      setInput(question);
    } finally {
      setLoading(false);
    }
  };

  const hasPending = messages.some((m) => m.proposals?.some((p) => p.status === 'pending' || p.status === 'error'));

  return (
    <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-4rem)] p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Asistente</h1>
          <p className="text-sm text-slate-500">
            Pregunta por ventas, gastos o el salón. También puede preparar gastos y cambios de productos para que los
            confirmes.
          </p>
        </div>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (hasPending && !window.confirm('Hay cambios sin confirmar. ¿Empezar una conversación nueva igual?')) return;
              setMessages([]);
              setError(null);
            }}
            disabled={loading}
          >
            <RotateCcw size={16} />
            Nueva conversación
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto rounded-xl border bg-white p-4 space-y-4" aria-live="polite">
        {messages.length === 0 && !loading ? (
          <div className="h-full flex flex-col items-center justify-center gap-4 text-center">
            <p className="text-slate-500">Elige una pregunta para empezar o escribe la tuya.</p>
            <div className="flex flex-wrap justify-center gap-2 max-w-xl">
              {SUGGESTIONS.map((s) => (
                <Button key={s} variant="outline" size="sm" className="rounded-full" onClick={() => send(s)}>
                  {s}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className="max-w-[85%] space-y-2">
                <div
                  className={cn(
                    'rounded-xl px-4 py-3 text-sm leading-relaxed',
                    m.role === 'user' ? 'bg-blue-600 text-white whitespace-pre-wrap' : 'bg-slate-50 text-slate-800'
                  )}
                >
                  {m.role === 'user' ? m.content : <FormattedText text={m.content} />}
                </div>
                {m.proposals?.map((p) => (
                  <ProposalCard
                    key={p.id}
                    proposal={p}
                    onSave={() => save(i, p)}
                    onCancel={() => setProposal(i, p.id, { status: 'cancelled' })}
                  />
                ))}
              </div>
            </div>
          ))
        )}

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">Revisando los datos…</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="mt-3 flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escribe tu pregunta o pide anotar un gasto…"
          aria-label="Mensaje para el asistente"
          maxLength={2000}
          disabled={loading}
          className="flex-1 min-w-0 rounded-md border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <Button type="submit" disabled={loading || !input.trim()} aria-label="Enviar mensaje">
          <Send size={16} />
          Enviar
        </Button>
      </form>
      <p className="mt-2 text-xs text-slate-500">
        El asistente nunca guarda solo: cada cambio aparece como una tarjeta y se aplica recién cuando tocas Guardar.
        Las preguntas y los datos necesarios se envían al servicio de IA configurado.
      </p>
    </div>
  );
}
