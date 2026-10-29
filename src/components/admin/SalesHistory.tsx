'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Download, Search, Share2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getSalesHistory, type ClosedOrder } from '@/actions/history-actions';
import { isoDate, presetRange, PRESETS, type PresetId } from '@/lib/date-range';
import { downloadTicket, shareTicket, ticketNumber, type TicketData } from '@/lib/ticket';

const money = (n: number) => `$ ${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;
const round2 = (n: number) => Math.round(n * 100) / 100;
const PAGE = 60;

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });

const dayLabel = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  const s = new Date(y, m - 1, d).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

type Line = { name: string; qty: number; unitPrice: number };

// Junta los renglones del mismo producto y precio (se pidieron en distintas tandas)
function groupItems(o: ClosedOrder): Line[] {
  const map = new Map<string, Line>();
  for (const it of o.order_items ?? []) {
    const name = it.products?.name ?? 'Producto eliminado';
    const unitPrice = Number(it.unit_price ?? 0);
    const key = `${name}|${unitPrice}`;
    const prev = map.get(key);
    if (prev) prev.qty += it.quantity;
    else map.set(key, { name, qty: it.quantity, unitPrice });
  }
  return Array.from(map.values()).sort((a, b) => b.qty * b.unitPrice - a.qty * a.unitPrice);
}

type Row = {
  order: ClosedOrder;
  day: string;
  lines: Line[];
  itemCount: number;
  subtotal: number;
  discount: number;
  adjustments: number;
  total: number;
  methods: string[];
  staff: string[];
  table: string;
  haystack: string;
};

function toRow(o: ClosedOrder): Row {
  const lines = groupItems(o);
  const subtotal = round2(lines.reduce((acc, l) => acc + l.qty * l.unitPrice, 0));
  const payments = o.payments ?? [];
  const methods = Array.from(new Set(payments.map((p) => p.method)));
  if (!methods.length && o.payment_method) methods.push(o.payment_method);
  const staff = Array.from(
    new Set([...payments.map((p) => p.staff ?? ''), o.closer?.name ?? ''].filter(Boolean))
  );
  const table = o.tables?.name ?? 'Mesa';
  return {
    order: o,
    day: isoDate(new Date(o.paid_at)),
    lines,
    itemCount: lines.reduce((acc, l) => acc + l.qty, 0),
    subtotal,
    discount: Number(o.discount ?? 0),
    adjustments: Number(o.adjustments ?? 0),
    total: Number(o.total ?? 0),
    methods,
    staff,
    table,
    haystack: normalize([table, ...staff, ...methods, ...lines.map((l) => l.name), ticketNumber(o.id)].join(' ')),
  };
}

function ticketFor(r: Row): TicketData {
  const o = r.order;
  return {
    kind: 'receipt',
    orderId: o.id,
    tableName: r.table,
    date: new Date(o.paid_at),
    staffNames: r.staff,
    items: r.lines,
    discount: r.discount,
    discountReason: o.discount_reason,
    payments: (o.payments ?? []).map((p) => ({
      method: p.method,
      amount: Number(p.amount),
      adjustment: Number(p.adjustment),
      cashGiven: p.cash_given == null ? null : Number(p.cash_given),
    })),
  };
}

function csvCell(v: string | number) {
  const s = String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(rows: Row[], from: string, to: string) {
  const header = ['Fecha', 'Hora', 'Ticket', 'Mesa', 'Atendió', 'Producto', 'Cantidad', 'Precio unitario', 'Importe', 'Descuento cuenta', 'Total cuenta', 'Medios de pago'];
  const out = [header.join(';')];
  for (const r of rows) {
    const base = [r.day, timeOf(r.order.paid_at), ticketNumber(r.order.id), r.table, r.staff.join(', ')];
    const tail = [r.discount, r.total, r.methods.join(' + ')];
    const lines = r.lines.length ? r.lines : [{ name: '(sin detalle)', qty: 0, unitPrice: 0 }];
    for (const l of lines) {
      out.push([...base, l.name, l.qty, l.unitPrice, round2(l.qty * l.unitPrice), ...tail].map(csvCell).join(';'));
    }
  }
  const blob = new Blob(['﻿' + out.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ventas-${from}${from === to ? '' : `-a-${to}`}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function SalesHistory() {
  const [preset, setPreset] = useState<PresetId | null>('today');
  const [[from, to], setRange] = useState<[string, string]>(() => presetRange('today'));
  const [orders, setOrders] = useState<ClosedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [method, setMethod] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const today = isoDate(new Date());

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    getSalesHistory(from, to)
      .then((d) => {
        if (!active) return;
        setOrders(d);
        setLimit(PAGE);
        setOpenId(null);
      })
      .catch((e) => {
        console.error(e);
        if (active) setError('No se pudo cargar el historial. Revisa la conexión con Supabase.');
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [from, to]);

  const rows = useMemo(() => orders.map(toRow), [orders]);

  const allMethods = useMemo(
    () => Array.from(new Set(rows.flatMap((r) => r.methods))).sort((a, b) => a.localeCompare(b)),
    [rows]
  );

  const filtered = useMemo(() => {
    const words = normalize(query).split(/\s+/).filter(Boolean);
    return rows.filter(
      (r) => (!method || r.methods.includes(method)) && words.every((w) => r.haystack.includes(w))
    );
  }, [rows, query, method]);

  const summary = useMemo(() => {
    const total = filtered.reduce((acc, r) => acc + r.total, 0);
    const discounts = filtered.reduce((acc, r) => acc + r.discount, 0);
    const items = filtered.reduce((acc, r) => acc + r.itemCount, 0);
    return { count: filtered.length, total, discounts, items, average: filtered.length ? total / filtered.length : 0 };
  }, [filtered]);

  // Agrupado por día, respetando el límite de renglones mostrados
  const days = useMemo(() => {
    const totals = new Map<string, { count: number; total: number }>();
    for (const r of filtered) {
      const t = totals.get(r.day) ?? { count: 0, total: 0 };
      totals.set(r.day, { count: t.count + 1, total: t.total + r.total });
    }
    const groups: { day: string; count: number; total: number; rows: Row[] }[] = [];
    for (const r of filtered.slice(0, limit)) {
      let g = groups[groups.length - 1];
      if (!g || g.day !== r.day) {
        g = { day: r.day, ...totals.get(r.day)!, rows: [] };
        groups.push(g);
      }
      g.rows.push(r);
    }
    return groups;
  }, [filtered, limit]);

  const choosePreset = (id: PresetId) => {
    setPreset(id);
    setRange(presetRange(id));
  };
  const setFrom = (v: string) => {
    if (!v) return;
    setPreset(null);
    setRange(([, t]) => (v > t ? [v, v] : [v, t]));
  };
  const setTo = (v: string) => {
    if (!v) return;
    setPreset(null);
    setRange(([f]) => (v < f ? [v, v] : [f, v]));
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl font-extrabold leading-none tracking-tight text-slate-900">Ventas</h1>
          <p className="mt-2 text-sm text-slate-500">Cada mesa cobrada, con lo que consumió, quién atendió y cómo pagó.</p>
        </div>
        <button
          type="button"
          onClick={() => downloadCsv(filtered, from, to)}
          disabled={!filtered.length}
          className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-900 hover:bg-slate-100 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Descargar CSV
        </button>
      </header>

      {/* Rango de fechas */}
      <div className="flex flex-wrap items-end gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={preset === p.id}
            onClick={() => choosePreset(p.id)}
            className={cn(
              'h-10 rounded-xl px-3 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
              preset === p.id ? 'bg-slate-900 text-slate-50' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
            )}
          >
            {p.label}
          </button>
        ))}
        <div className="flex items-end gap-2 sm:ml-auto">
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Desde</span>
            <input
              type="date"
              value={from}
              max={today}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 block h-10 rounded-xl border border-slate-300 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Hasta</span>
            <input
              type="date"
              value={to}
              max={today}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 block h-10 rounded-xl border border-slate-300 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
        </div>
      </div>

      {/* Búsqueda y medio de pago */}
      <div className="space-y-2">
        <label className="relative block">
          <span className="sr-only">Buscar</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por mesa, producto, mozo o número de ticket"
            className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
        {allMethods.length > 1 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por medio de pago">
            {[null, ...allMethods].map((m) => (
              <button
                key={m ?? 'all'}
                type="button"
                aria-pressed={method === m}
                onClick={() => setMethod(m)}
                className={cn(
                  'h-9 rounded-full px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                  method === m ? 'bg-blue-600 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                )}
              >
                {m ?? 'Todos los medios'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Resumen */}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Cuentas', value: String(summary.count) },
          { label: 'Vendido', value: money(round2(summary.total)) },
          { label: 'Promedio por cuenta', value: money(round2(summary.average)) },
          { label: 'Descuentos', value: money(round2(summary.discounts)) },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <dt className="text-xs font-semibold text-slate-500">{s.label}</dt>
            <dd className="font-display text-2xl font-extrabold tabular-nums text-slate-900">{s.value}</dd>
          </div>
        ))}
      </dl>

      {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {loading && <p className="text-sm text-slate-500" aria-live="polite">Cargando ventas…</p>}
      {!loading && !error && !filtered.length && (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
          {orders.length ? 'Ninguna venta coincide con la búsqueda.' : 'No hay mesas cobradas en este período.'}
        </p>
      )}

      {/* Listado por día */}
      {!loading &&
        days.map((g) => (
          <section key={g.day} aria-labelledby={`dia-${g.day}`} className="space-y-2">
            <div className="flex items-baseline justify-between gap-3 px-1">
              <h2 id={`dia-${g.day}`} className="font-display text-lg font-bold text-slate-900">
                {dayLabel(g.day)}
              </h2>
              <span className="text-sm text-slate-500 tabular-nums">
                {g.count} {g.count === 1 ? 'cuenta' : 'cuentas'} · <strong className="text-slate-900">{money(round2(g.total))}</strong>
              </span>
            </div>

            <ul className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {g.rows.map((r, i) => {
                const open = openId === r.order.id;
                const preview = r.lines.map((l) => `${l.qty} ${l.name}`).join(', ');
                return (
                  <li key={r.order.id} className={cn(i > 0 && 'border-t border-slate-200')}>
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-controls={`venta-${r.order.id}`}
                      onClick={() => setOpenId(open ? null : r.order.id)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
                    >
                      <span className="w-12 shrink-0 text-sm font-semibold tabular-nums text-slate-500">{timeOf(r.order.paid_at)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-baseline gap-x-2">
                          <strong className="text-slate-900">{r.table}</strong>
                          {r.staff.length > 0 && <span className="text-sm text-slate-500">{r.staff.join(', ')}</span>}
                        </span>
                        <span className="block truncate text-sm text-slate-500">{preview || 'Sin detalle de productos'}</span>
                      </span>
                      <span className="hidden shrink-0 text-right text-sm text-slate-500 sm:block">{r.methods.join(' + ')}</span>
                      <span className="w-24 shrink-0 text-right font-bold tabular-nums text-slate-900">{money(r.total)}</span>
                      <ChevronDown
                        className={cn('h-5 w-5 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')}
                        aria-hidden="true"
                      />
                    </button>

                    {open && (
                      <div id={`venta-${r.order.id}`} className="grid gap-4 border-t border-slate-200 bg-slate-50 px-4 py-4 md:grid-cols-[minmax(0,1fr)_280px]">
                        <div>
                          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Consumo</h3>
                          {r.lines.length ? (
                            <table className="w-full text-sm">
                              <tbody>
                                {r.lines.map((l) => (
                                  <tr key={`${l.name}|${l.unitPrice}`} className="border-b border-slate-200 last:border-0">
                                    <td className="w-10 py-1.5 font-semibold tabular-nums text-slate-900">{l.qty}×</td>
                                    <td className="py-1.5 text-slate-900">
                                      {l.name}
                                      <span className="ml-2 text-xs text-slate-500">{money(l.unitPrice)} c/u</span>
                                    </td>
                                    <td className="py-1.5 text-right tabular-nums">{money(round2(l.qty * l.unitPrice))}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <p className="text-sm text-slate-500">Esta venta no tiene el detalle de productos (por ejemplo, una venta importada).</p>
                          )}

                          <dl className="mt-3 grid grid-cols-[1fr_auto] gap-y-1 border-t border-slate-300 pt-3 text-sm">
                            <dt className="text-slate-500">Subtotal</dt>
                            <dd className="text-right tabular-nums">{money(r.subtotal)}</dd>
                            {r.discount > 0 && (
                              <>
                                <dt className="text-slate-500">
                                  Descuento{r.order.discount_reason ? ` · ${r.order.discount_reason}` : ''}
                                </dt>
                                <dd className="text-right tabular-nums">− {money(r.discount)}</dd>
                              </>
                            )}
                            {r.adjustments !== 0 && (
                              <>
                                <dt className="text-slate-500">{r.adjustments > 0 ? 'Recargos' : 'Bonificaciones'} por medio de pago</dt>
                                <dd className="text-right tabular-nums">
                                  {r.adjustments > 0 ? '+ ' : '− '}
                                  {money(Math.abs(r.adjustments))}
                                </dd>
                              </>
                            )}
                            <dt className="font-bold text-slate-900">Total cobrado</dt>
                            <dd className="text-right font-display text-lg font-extrabold tabular-nums text-slate-900">{money(r.total)}</dd>
                          </dl>
                        </div>

                        <div className="space-y-3">
                          <div>
                            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                              {(r.order.payments ?? []).length > 1 ? 'Pagos' : 'Pago'}
                            </h3>
                            <ul className="space-y-2">
                              {(r.order.payments ?? []).map((p, idx) => {
                                const amount = Number(p.amount);
                                const given = p.cash_given == null ? null : Number(p.cash_given);
                                return (
                                  <li key={idx} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                                    <div className="flex justify-between gap-2">
                                      <strong className="text-slate-900">{p.method}</strong>
                                      <span className="font-semibold tabular-nums">{money(amount)}</span>
                                    </div>
                                    <div className="text-xs text-slate-500">
                                      {timeOf(p.paid_at)}
                                      {p.staff ? ` · ${p.staff}` : ''}
                                      {given != null && given > amount ? ` · pagó con ${money(given)}, vuelto ${money(round2(given - amount))}` : ''}
                                    </div>
                                  </li>
                                );
                              })}
                              {!(r.order.payments ?? []).length && (
                                <li className="text-sm text-slate-500">{r.methods.join(' + ') || 'Sin dato'}</li>
                              )}
                            </ul>
                          </div>

                          <p className="text-xs text-slate-500">Ticket {ticketNumber(r.order.id)}</p>

                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => downloadTicket(ticketFor(r))}
                              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-bold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                            >
                              <Download className="h-4 w-4" aria-hidden="true" />
                              Ticket
                            </button>
                            <button
                              type="button"
                              onClick={() => shareTicket(ticketFor(r))}
                              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border-2 border-blue-600 text-sm font-bold text-blue-600 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                            >
                              <Share2 className="h-4 w-4" aria-hidden="true" />
                              Compartir
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

      {!loading && filtered.length > limit && (
        <button
          type="button"
          onClick={() => setLimit((l) => l + PAGE)}
          className="h-11 w-full rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-900 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          Mostrar más ({filtered.length - limit} restantes)
        </button>
      )}
    </div>
  );
}
