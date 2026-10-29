'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  adjustmentLabel,
  createPaymentMethod,
  getPaymentMethods,
  KIND_LABELS,
  savePaymentMethodOrder,
  updatePaymentMethod,
  type AdjustmentType,
  type MethodKind,
  type PaymentMethodInput,
  type PaymentMethodRow,
} from '@/actions/payment-methods-actions';

const inputClass =
  'h-11 rounded-lg border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

type Draft = { name: string; kind: MethodKind; adjustment_type: AdjustmentType; pct: string; counts_as_cash: boolean; is_active: boolean };

const toDraft = (m?: PaymentMethodRow): Draft => ({
  name: m?.name ?? '',
  kind: m?.kind ?? 'card',
  adjustment_type: m?.adjustment_type ?? 'none',
  pct: m ? String(m.adjustment_pct).replace('.', ',') : '',
  counts_as_cash: m?.counts_as_cash ?? false,
  is_active: m?.is_active ?? true,
});

function describe(m: PaymentMethodRow) {
  const parts = [KIND_LABELS[m.kind]];
  const adj = adjustmentLabel(m);
  parts.push(adj ? `${m.adjustment_type === 'surcharge' ? 'recargo' : 'descuento'} ${adj.replace(/^[+−]/, '')}` : 'sin ajuste');
  if (m.counts_as_cash) parts.push('entra en el arqueo de efectivo');
  return parts.join(' · ');
}

export default function PaymentMethodsEditor() {
  const [methods, setMethods] = useState<PaymentMethodRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(toDraft());

  const reload = useCallback(async () => setMethods(await getPaymentMethods()), []);

  useEffect(() => {
    reload()
      .catch((e) => {
        console.error(e);
        setError('No se pudieron cargar los medios de pago. Revisa que hayas ejecutado pagos.sql.');
      })
      .finally(() => setLoading(false));
  }, [reload]);

  const run = async (action: () => Promise<void>, okText: string) => {
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      await action();
      await reload();
      setOk(okText);
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? 'Ocurrió un error inesperado.');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (m?: PaymentMethodRow) => {
    setEditing(m ? m.id : 'new');
    setDraft(toDraft(m));
    setError(null);
    setOk(null);
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const name = draft.name.trim();
    if (!name) return setError('Escribe un nombre.');
    let pct = 0;
    if (draft.adjustment_type !== 'none') {
      pct = Number(draft.pct.replace(',', '.'));
      if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return setError('El porcentaje debe estar entre 0 y 100.');
    }
    const payload: Partial<PaymentMethodInput> = {
      name,
      kind: draft.kind,
      adjustment_type: draft.adjustment_type,
      adjustment_pct: pct,
      counts_as_cash: draft.counts_as_cash,
      is_active: draft.is_active,
    };
    run(async () => {
      if (editing === 'new') {
        const last = methods[methods.length - 1]?.sort_order ?? 0;
        await createPaymentMethod({ ...(payload as PaymentMethodInput), sort_order: last + 10, ticket_note: null });
      } else if (editing) {
        await updatePaymentMethod(editing, payload);
      }
      setEditing(null);
    }, editing === 'new' ? `${name} ya aparece al cobrar.` : 'Cambios guardados.');
  };

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= methods.length) return;
    const next = [...methods];
    [next[index], next[target]] = [next[target], next[index]];
    const withOrder = next.map((m, i) => ({ ...m, sort_order: (i + 1) * 10 }));
    setMethods(withOrder);
    run(() => savePaymentMethodOrder(withOrder.map(({ id, sort_order }) => ({ id, sort_order }))), 'Orden guardado.');
  };

  if (loading) return <div className="p-6 text-slate-500">Cargando medios de pago…</div>;

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 flex flex-col lg:flex-row gap-6">
      <section className="flex-1 min-w-0 space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-500">Ajustes</p>
            <h1 className="font-display text-4xl font-extrabold tracking-tight text-slate-900 leading-none">Medios de pago</h1>
          </div>
          <Button onClick={() => startEdit()} disabled={saving}>
            <Plus size={16} aria-hidden="true" />
            Agregar medio
          </Button>
        </header>
        <p className="text-sm text-slate-600">
          El orden de esta lista es el que ve el mozo al cobrar. Desactivar un medio lo oculta del cobro, pero conserva los
          cobros anteriores.
        </p>

        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {ok && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{ok}</p>}

        <ul className="rounded-2xl border bg-white divide-y">
          {methods.map((m, i) => (
            <li key={m.id} className={cn('flex flex-wrap items-center gap-3 px-4 py-3', editing === m.id && 'bg-blue-50')}>
              <div className="flex flex-col">
                <button
                  type="button"
                  aria-label={`Subir ${m.name}`}
                  disabled={i === 0 || saving}
                  onClick={() => move(i, -1)}
                  className="h-6 w-8 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30 flex items-center justify-center"
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  aria-label={`Bajar ${m.name}`}
                  disabled={i === methods.length - 1 || saving}
                  onClick={() => move(i, 1)}
                  className="h-6 w-8 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30 flex items-center justify-center"
                >
                  <ArrowDown size={14} />
                </button>
              </div>
              <div className={cn('flex-1 min-w-[10rem]', !m.is_active && 'opacity-55')}>
                <p className="font-bold text-slate-900">{m.name}</p>
                <p className="text-xs text-slate-600">{describe(m)}</p>
              </div>
              <span
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-bold',
                  m.is_active ? 'bg-blue-100 text-slate-900' : 'bg-slate-100 text-slate-600'
                )}
              >
                {m.is_active ? 'Activo' : 'Desactivado'}
              </span>
              <Button size="sm" variant="outline" onClick={() => startEdit(m)} aria-label={`Editar ${m.name}`}>
                <Pencil size={14} aria-hidden="true" />
                Editar
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <aside className="w-full lg:w-[340px] shrink-0">
        {editing ? (
          <form onSubmit={save} className="rounded-2xl border bg-white p-5 space-y-4">
            <h2 className="font-display text-2xl font-extrabold text-slate-900">
              {editing === 'new' ? 'Nuevo medio de pago' : draft.name || 'Editar medio'}
            </h2>

            <label className="block space-y-1.5">
              <span className="text-sm font-bold text-slate-600">Nombre que ve el mozo</span>
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Ej.: Crédito, Débito, MODO"
                className={cn(inputClass, 'w-full')}
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-bold text-slate-600">Tipo</span>
              <select
                value={draft.kind}
                onChange={(e) => {
                  const kind = e.target.value as MethodKind;
                  setDraft({ ...draft, kind, counts_as_cash: kind === 'cash' ? true : draft.counts_as_cash });
                }}
                className={cn(inputClass, 'w-full')}
              >
                {(Object.keys(KIND_LABELS) as MethodKind[]).map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>

            <fieldset className="space-y-1.5">
              <legend className="text-sm font-bold text-slate-600">Ajuste sobre el total</legend>
              <div className="flex gap-2">
                <div role="group" aria-label="Tipo de ajuste" className="flex gap-0.5 rounded-lg bg-slate-100 p-0.5">
                  {(
                    [
                      ['none', 'Ninguno'],
                      ['surcharge', 'Recargo'],
                      ['discount', 'Descuento'],
                    ] as [AdjustmentType, string][]
                  ).map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={draft.adjustment_type === v}
                      onClick={() => setDraft({ ...draft, adjustment_type: v })}
                      className={cn(
                        'h-10 rounded-md px-2.5 text-sm font-bold',
                        draft.adjustment_type === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {draft.adjustment_type !== 'none' && (
                  <label className="flex h-11 flex-1 items-center gap-1 rounded-lg border px-3">
                    <span className="sr-only">Porcentaje</span>
                    <input
                      value={draft.pct}
                      onChange={(e) => setDraft({ ...draft, pct: e.target.value })}
                      inputMode="decimal"
                      className="w-full text-sm font-bold outline-none"
                    />
                    <span className="font-bold text-slate-600">%</span>
                  </label>
                )}
              </div>
              <p className="text-xs text-slate-500">Se aplica al cobrar con este medio y queda detallado en el ticket.</p>
            </fieldset>

            <label className="flex items-start gap-2.5 text-sm text-slate-900">
              <input
                type="checkbox"
                className="mt-0.5 h-5 w-5 accent-blue-600"
                checked={draft.counts_as_cash}
                onChange={(e) => setDraft({ ...draft, counts_as_cash: e.target.checked })}
              />
              Cuenta como efectivo en el arqueo de caja
            </label>
            <label className="flex items-start gap-2.5 text-sm text-slate-900">
              <input
                type="checkbox"
                className="mt-0.5 h-5 w-5 accent-blue-600"
                checked={draft.is_active}
                onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
              />
              Disponible al cobrar
            </label>

            <div className="flex gap-2">
              <Button type="submit" className="flex-1 h-11" disabled={saving}>
                Guardar
              </Button>
              <Button type="button" variant="outline" className="h-11" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : (
          <div className="rounded-2xl border bg-white p-5 text-sm text-slate-600">
            Elige un medio para editarlo, o agrega uno nuevo (por ejemplo, separar Tarjeta en Débito y Crédito con recargo).
          </div>
        )}
      </aside>
    </div>
  );
}
