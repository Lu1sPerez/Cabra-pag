'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { todayLocal } from '@/actions/report-actions';
import { isoDate, parseDate, presetRange, PRESETS, type PresetId } from '@/lib/date-range';
import { BarList, money } from '@/components/admin/analytics/charts';
import {
  createExpense,
  deleteExpense,
  getExpenseCategories,
  getExpenses,
  updateExpense,
  type Expense,
} from '@/actions/expense-actions';

const METHODS: { id: string; label: string }[] = [
  { id: 'cash', label: 'Efectivo' },
  { id: 'card', label: 'Tarjeta' },
  { id: 'mercadopago', label: 'MercadoPago' },
  { id: 'transfer', label: 'Transferencia' },
];
const methodLabel = (id: string | null) => METHODS.find((m) => m.id === id)?.label ?? 'Sin dato';

const DEFAULT_CATEGORIES = ['Insumos', 'Alquiler', 'Servicios', 'Sueldos', 'Impuestos', 'Mantenimiento'];

const inputClass =
  'rounded-md border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

// Acepta "8500", "8.500" o "8500,50"
function parseAmount(raw: string) {
  const n = Number(raw.trim().replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

// Fecha elegida -> momento a guardar: ahora si es hoy, mediodía si es otro día
function toTimestamp(date: string) {
  if (date === todayLocal()) return new Date().toISOString();
  const d = parseDate(date);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}

type Draft = { date: string; concept: string; category: string; amount: string; method: string };

const emptyDraft = (): Draft => ({ date: todayLocal(), concept: '', category: 'Insumos', amount: '', method: 'cash' });

function validate(d: Draft) {
  if (!d.concept.trim()) return 'Escribe el concepto del gasto.';
  if (!d.category.trim()) return 'Elige o escribe una categoría.';
  if (parseAmount(d.amount) === null) return 'Ingresa un monto válido, mayor a cero.';
  return null;
}

export default function ExpensesEditor() {
  const [preset, setPreset] = useState<PresetId | null>('month');
  const [[from, to], setRange] = useState<[string, string]>(() => presetRange('month'));
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [rows, cats] = await Promise.all([getExpenses(from, to), getExpenseCategories()]);
    setExpenses(rows);
    setCategories(cats);
  }, [from, to]);

  useEffect(() => {
    setLoading(true);
    reload()
      .catch((e) => {
        console.error(e);
        setError('No se pudieron cargar los gastos. Revisa que hayas ejecutado 02a-estructura.sql.');
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

  const allCategories = useMemo(
    () => Array.from(new Set([...DEFAULT_CATEGORIES, ...categories])).sort((a, b) => a.localeCompare(b)),
    [categories]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return expenses.filter(
      (e) => (!categoryFilter || e.category === categoryFilter) && (!q || e.concept.toLowerCase().includes(q))
    );
  }, [expenses, search, categoryFilter]);

  const total = expenses.reduce((acc, e) => acc + e.amount, 0);
  const visibleTotal = visible.reduce((acc, e) => acc + e.amount, 0);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses) map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([category, amount]) => ({
        key: category,
        label: category,
        value: amount,
        valueText: `${money(amount)} (${total > 0 ? Math.round((amount / total) * 100) : 0}%)`,
      }));
  }, [expenses, total]);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validate(draft);
    if (problem) return setError(problem);
    run(async () => {
      await createExpense({
        spent_at: toTimestamp(draft.date),
        concept: draft.concept.trim(),
        category: draft.category.trim(),
        amount: parseAmount(draft.amount)!,
        payment_method: draft.method,
      });
      setDraft((d) => ({ ...emptyDraft(), date: d.date, category: d.category, method: d.method }));
    }, 'Gasto agregado.');
  };

  const choosePreset = (id: PresetId) => {
    setPreset(id);
    setRange(presetRange(id));
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Gastos</h1>
          <p className="text-sm text-slate-500">
            Compras, alquiler, servicios y cualquier salida de dinero del local. Se descuentan de las ventas en el
            resultado del análisis.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          {PRESETS.map((p) => (
            <Button
              key={p.id}
              size="sm"
              variant={preset === p.id ? 'default' : 'outline'}
              aria-pressed={preset === p.id}
              onClick={() => choosePreset(p.id)}
            >
              {p.label}
            </Button>
          ))}
          <div className="flex items-end gap-2 sm:ml-auto">
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Desde</span>
              <input
                type="date"
                value={from}
                max={todayLocal()}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  setPreset(null);
                  setRange(([, t]) => (v > t ? [v, v] : [v, t]));
                }}
                className="mt-1 block rounded-md border bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Hasta</span>
              <input
                type="date"
                value={to}
                max={todayLocal()}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  setPreset(null);
                  setRange(([f]) => (v < f ? [v, v] : [f, v]));
                }}
                className="mt-1 block rounded-md border bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
          </div>
        </div>
      </div>

      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {ok && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">{ok}</p>}

      {/* Nuevo gasto */}
      <form onSubmit={handleCreate} className="rounded-xl border bg-white p-4 space-y-3">
        <h2 className="font-semibold text-slate-800">Nuevo gasto</h2>
        <div className="flex flex-wrap gap-2">
          <input
            type="date"
            value={draft.date}
            max={todayLocal()}
            onChange={(e) => e.target.value && setDraft({ ...draft, date: e.target.value })}
            aria-label="Fecha"
            className={inputClass}
          />
          <input
            value={draft.concept}
            onChange={(e) => setDraft({ ...draft, concept: e.target.value })}
            placeholder="Concepto (ej.: leche, alquiler, luz)"
            aria-label="Concepto"
            className={cn(inputClass, 'flex-1 min-w-[12rem]')}
          />
          <input
            list="expense-categories"
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
            placeholder="Categoría"
            aria-label="Categoría"
            className={cn(inputClass, 'w-44')}
          />
          <input
            value={draft.amount}
            onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
            inputMode="decimal"
            placeholder="Monto"
            aria-label="Monto"
            className={cn(inputClass, 'w-32')}
          />
          <select
            value={draft.method}
            onChange={(e) => setDraft({ ...draft, method: e.target.value })}
            aria-label="Medio de pago"
            className={inputClass}
          >
            {METHODS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <Button type="submit" disabled={saving}>
            <Plus size={16} />
            Agregar
          </Button>
        </div>
        <datalist id="expense-categories">
          {allCategories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <p className="text-xs text-slate-500">
          Puedes elegir una categoría existente o escribir una nueva.
        </p>
      </form>

      {loading ? (
        <p className="text-slate-500">Cargando gastos…</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          {/* Lista */}
          <section className="space-y-3 min-w-0">
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[12rem]">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por concepto"
                  aria-label="Buscar gastos por concepto"
                  className={cn(inputClass, 'w-full pl-9')}
                />
              </div>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                aria-label="Filtrar por categoría"
                className={inputClass}
              >
                <option value="">Todas las categorías</option>
                {Array.from(new Set(expenses.map((e) => e.category)))
                  .sort((a, b) => a.localeCompare(b))
                  .map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
              </select>
            </div>

            {visible.length === 0 ? (
              <p className="rounded-xl border bg-white p-6 text-center text-slate-500">
                {expenses.length === 0 ? 'No hay gastos en este período.' : 'Ningún gasto coincide con el filtro.'}
              </p>
            ) : (
              <ul className="rounded-xl border bg-white divide-y">
                {visible.map((e) =>
                  editingId === e.id ? (
                    <EditRow
                      key={e.id}
                      expense={e}
                      saving={saving}
                      onCancel={() => setEditingId(null)}
                      onSave={(d) => {
                        const problem = validate(d);
                        if (problem) return setError(problem);
                        const originalDate = isoDate(new Date(e.spent_at));
                        run(async () => {
                          await updateExpense(e.id, {
                            spent_at: d.date === originalDate ? e.spent_at : toTimestamp(d.date),
                            concept: d.concept.trim(),
                            category: d.category.trim(),
                            amount: parseAmount(d.amount)!,
                            payment_method: d.method,
                          });
                          setEditingId(null);
                        }, 'Gasto actualizado.');
                      }}
                    />
                  ) : (
                    <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-[12rem]">
                        <p className="font-medium text-slate-800">{e.concept}</p>
                        <p className="text-xs text-slate-500">
                          {new Date(e.spent_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} ·{' '}
                          {e.category} · {methodLabel(e.payment_method)}
                        </p>
                      </div>
                      <span className="w-28 text-right font-semibold text-slate-900 tabular-nums">
                        {money(e.amount)}
                      </span>
                      <Button size="sm" variant="outline" onClick={() => setEditingId(e.id)} aria-label={`Editar ${e.concept}`}>
                        <Pencil size={14} />
                        Editar
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-9 w-9 text-red-600 hover:bg-red-50"
                        disabled={saving}
                        aria-label={`Eliminar ${e.concept}`}
                        onClick={() => {
                          if (!window.confirm(`¿Eliminar el gasto "${e.concept}" por ${money(e.amount)}?`)) return;
                          run(() => deleteExpense(e.id), 'Gasto eliminado.');
                        }}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </li>
                  )
                )}
              </ul>
            )}
            {visible.length > 0 && (search || categoryFilter) && (
              <p className="text-sm text-slate-600 text-right">
                {visible.length} {visible.length === 1 ? 'gasto' : 'gastos'} filtrados ·{' '}
                <strong className="tabular-nums">{money(visibleTotal)}</strong>
              </p>
            )}
          </section>

          {/* Resumen */}
          <aside className="space-y-4">
            <div className="rounded-xl border bg-white p-4">
              <p className="text-sm text-slate-500">Total del período</p>
              <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{money(total)}</p>
              <p className="text-xs text-slate-500">
                {expenses.length} {expenses.length === 1 ? 'gasto' : 'gastos'}
              </p>
            </div>
            <BarList title="Por categoría" items={byCategory} emptyText="Sin gastos en este período." />
          </aside>
        </div>
      )}
    </div>
  );
}

function EditRow({
  expense,
  saving,
  onCancel,
  onSave,
}: {
  expense: Expense;
  saving: boolean;
  onCancel: () => void;
  onSave: (d: Draft) => void;
}) {
  const [d, setD] = useState<Draft>({
    date: isoDate(new Date(expense.spent_at)),
    concept: expense.concept,
    category: expense.category,
    amount: String(expense.amount).replace('.', ','),
    method: expense.payment_method ?? 'cash',
  });

  return (
    <li className="px-4 py-3 bg-blue-50/50">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(d);
        }}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        className="flex flex-wrap items-center gap-2"
      >
        <input
          type="date"
          value={d.date}
          max={todayLocal()}
          onChange={(e) => e.target.value && setD({ ...d, date: e.target.value })}
          aria-label="Fecha"
          className={inputClass}
        />
        <input
          autoFocus
          value={d.concept}
          onChange={(e) => setD({ ...d, concept: e.target.value })}
          aria-label="Concepto"
          className={cn(inputClass, 'flex-1 min-w-[10rem]')}
        />
        <input
          list="expense-categories"
          value={d.category}
          onChange={(e) => setD({ ...d, category: e.target.value })}
          aria-label="Categoría"
          className={cn(inputClass, 'w-40')}
        />
        <input
          value={d.amount}
          onChange={(e) => setD({ ...d, amount: e.target.value })}
          inputMode="decimal"
          aria-label="Monto"
          className={cn(inputClass, 'w-28')}
        />
        <select
          value={d.method}
          onChange={(e) => setD({ ...d, method: e.target.value })}
          aria-label="Medio de pago"
          className={inputClass}
        >
          {METHODS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" disabled={saving}>
          Guardar
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </form>
    </li>
  );
}
