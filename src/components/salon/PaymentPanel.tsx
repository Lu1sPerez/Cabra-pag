'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Download, Share2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  applyDiscount,
  getOrderPayments,
  registerPayment,
  voidPayment,
  type OpenOrder,
  type OrderPayment,
} from '@/actions/order-actions';
import {
  adjustmentFor,
  adjustmentLabel,
  getPaymentMethods,
  type PaymentMethodRow,
} from '@/actions/payment-methods-actions';
import { downloadTicket, shareTicket, ticketTotals, type TicketData } from '@/lib/ticket';

type Mode = 'all' | 'equal' | 'items';

const MODES: { id: Mode; label: string }[] = [
  { id: 'all', label: 'Todo junto' },
  { id: 'equal', label: 'Partes iguales' },
  { id: 'items', label: 'Por productos' },
];

const QUICK_PERCENTS = [5, 10, 15, 20];

const round2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => `$ ${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;
const parseNumber = (raw: string) => {
  const n = Number(raw.trim().replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};

type Unit = { key: string; itemId: string; name: string; price: number; paid: boolean };

interface PaymentPanelProps {
  tableId: string;
  tableName: string;
  order: OpenOrder;
  staffToken: string | null;
  staffName: string | null;
  onClose: () => void;
  onFinished: () => void;
  onSessionError: (e: unknown) => boolean;
}

export default function PaymentPanel({
  tableId,
  tableName,
  order,
  staffToken,
  staffName,
  onClose,
  onFinished,
  onSessionError,
}: PaymentPanelProps) {
  const [methods, setMethods] = useState<PaymentMethodRow[]>([]);
  const [payments, setPayments] = useState<OrderPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  // Bloqueo inmediato: un doble toque no puede registrar dos pagos
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>('all');
  const [parts, setParts] = useState(2);
  const [methodId, setMethodId] = useState<string | null>(null);
  const [cashGiven, setCashGiven] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Descuento (solo antes del primer pago)
  const initialDiscount = Number(order.discount ?? 0);
  const [discountOpen, setDiscountOpen] = useState(initialDiscount > 0);
  const [discountMode, setDiscountMode] = useState<'percent' | 'amount'>(initialDiscount > 0 ? 'amount' : 'percent');
  const [discountValue, setDiscountValue] = useState(initialDiscount > 0 ? String(initialDiscount) : '');
  const [discountReason, setDiscountReason] = useState(order.discount_reason ?? '');

  // Cobro terminado
  const [done, setDone] = useState<{ payments: OrderPayment[]; discount: number; reason: string | null } | null>(null);

  const reloadPayments = useCallback(async () => {
    setPayments(await getOrderPayments(order.id));
  }, [order.id]);

  useEffect(() => {
    let active = true;
    Promise.all([getPaymentMethods(true), getOrderPayments(order.id)])
      .then(([m, p]) => {
        if (!active) return;
        setMethods(m);
        setPayments(p);
        setMethodId(m[0]?.id ?? null);
      })
      .catch((e) => {
        console.error(e);
        if (active) setError('No se pudieron cargar los medios de pago. Revisa que hayas ejecutado pagos.sql.');
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [order.id]);

  // Cerrar con Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) (done ? onFinished : onClose)();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, done, onClose, onFinished]);

  // --- Cálculos (la base vuelve a calcular todo al cobrar) ---
  const items = order.order_items;
  const subtotal = round2(items.reduce((acc, i) => acc + i.quantity * Number(i.unit_price ?? 0), 0));
  const hasPayments = payments.length > 0;

  const { draftDiscount, discountError } = useMemo(() => {
    if (!discountOpen || discountValue.trim() === '') return { draftDiscount: 0, discountError: null as string | null };
    const v = parseNumber(discountValue);
    if (Number.isNaN(v) || v < 0) return { draftDiscount: 0, discountError: 'Ingresa un número válido.' };
    if (discountMode === 'percent') {
      if (v > 100) return { draftDiscount: 0, discountError: 'El porcentaje no puede superar 100%.' };
      return { draftDiscount: round2((subtotal * v) / 100), discountError: null };
    }
    if (v > subtotal) return { draftDiscount: 0, discountError: 'El descuento no puede superar la cuenta.' };
    return { draftDiscount: round2(v), discountError: null };
  }, [discountOpen, discountValue, discountMode, subtotal]);

  const discount = hasPayments ? initialDiscount : draftDiscount;
  const net = round2(subtotal - discount);
  const paidBase = round2(payments.reduce((acc, p) => acc + p.base_amount, 0));
  const due = Math.max(0, round2(net - paidBase));

  const units: Unit[] = useMemo(() => {
    const paidCount = new Map<string, number>();
    for (const p of payments) for (const it of p.items ?? []) paidCount.set(it.id, (paidCount.get(it.id) ?? 0) + it.qty);
    const list: Unit[] = [];
    for (const i of items) {
      const paid = paidCount.get(i.id) ?? 0;
      for (let k = 0; k < i.quantity; k++) {
        list.push({
          key: `${i.id}:${k}`,
          itemId: i.id,
          name: i.products?.name ?? 'Producto',
          price: Number(i.unit_price ?? 0),
          paid: k < paid,
        });
      }
    }
    return list;
  }, [items, payments]);

  const pendingUnits = units.filter((u) => !u.paid);
  const selectedUnits = pendingUnits.filter((u) => selected.has(u.key));
  const partsLeft = Math.max(1, parts - payments.length);

  let base = due;
  if (mode === 'equal') base = partsLeft === 1 ? due : round2(due / partsLeft);
  if (mode === 'items') {
    const raw = selectedUnits.reduce((acc, u) => acc + u.price, 0);
    base =
      selectedUnits.length === 0
        ? 0
        : selectedUnits.length === pendingUnits.length
          ? due
          : Math.min(due, round2(subtotal > 0 ? (raw * net) / subtotal : 0));
  }

  const method = methods.find((m) => m.id === methodId) ?? null;
  const adjustment = method ? adjustmentFor(method, base) : 0;
  const charged = round2(base + adjustment);
  const isCash = method?.kind === 'cash';
  const given = parseNumber(cashGiven || '0');
  const cashTooLow = isCash && cashGiven !== '' && given < charged;

  const suggestions = useMemo(() => {
    const rounded = [1000, 5000, 10000, 20000].map((step) => Math.ceil(charged / step) * step);
    return Array.from(new Set(rounded)).filter((v) => v > charged).slice(0, 3);
  }, [charged]);

  const canPay = !busy && !loading && !!method && base > 0 && !cashTooLow && !discountError && due > 0;

  // --- Ticket ---
  const ticketFor = (list: OrderPayment[], disc: number, reason: string | null): TicketData => ({
    kind: 'receipt',
    orderId: order.id,
    tableName,
    date: new Date(),
    staffNames: staffName ? [staffName] : [],
    items: items.map((i) => ({ name: i.products?.name ?? 'Producto', qty: i.quantity, unitPrice: Number(i.unit_price ?? 0) })),
    discount: disc,
    discountReason: reason,
    payments: list.map((p) => ({ method: p.method_name, amount: p.amount, adjustment: p.adjustment, cashGiven: p.cash_given })),
  });

  const share = async (data: TicketData) => {
    const r = await shareTicket(data);
    if (r === 'downloaded') setNotice('Ticket descargado.');
  };

  // --- Acciones ---
  const handleError = (e: any) => {
    console.error(e);
    if (onSessionError(e)) return;
    setError(e?.message ?? 'No se pudo registrar el cobro.');
  };

  const pay = async () => {
    if (!canPay || !method || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (!hasPayments) {
        await applyDiscount(tableId, discount, discount > 0 ? discountReason.trim() || null : null, staffToken);
      }
      const unitsByItem = new Map<string, number>();
      for (const u of selectedUnits) unitsByItem.set(u.itemId, (unitsByItem.get(u.itemId) ?? 0) + 1);
      const itemsPayload = mode === 'items' ? Array.from(unitsByItem, ([id, qty]) => ({ id, qty })) : null;
      const cash = isCash && cashGiven !== '' ? given : null;

      const result = await registerPayment({
        tableId,
        methodId: method.id,
        baseAmount: mode === 'items' ? null : base,
        staffToken,
        cashGiven: cash,
        items: itemsPayload,
      });

      const newPayment: OrderPayment = {
        id: result.payment_id,
        method_name: method.name,
        base_amount: round2(result.charged - result.adjustment),
        adjustment: result.adjustment,
        amount: result.charged,
        cash_given: cash,
        items: itemsPayload,
        paid_at: new Date().toISOString(),
      };

      setCashGiven('');
      setSelected(new Set());

      if (result.closed) {
        setDone({ payments: [...payments, newPayment], discount, reason: discount > 0 ? discountReason.trim() || null : null });
      } else {
        await reloadPayments();
        setNotice(
          `Cobrado ${money(result.charged)}${result.change ? ` · vuelto ${money(result.change)}` : ''}. Falta ${money(result.remaining)}.`
        );
      }
    } catch (e) {
      handleError(e);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const cancelPayment = async (p: OrderPayment) => {
    if (busyRef.current) return;
    if (!window.confirm(`¿Anular el pago de ${money(p.amount)} con ${p.method_name}?`)) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await voidPayment(p.id, staffToken);
      await reloadPayments();
      setNotice('Pago anulado.');
    } catch (e) {
      handleError(e);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const toggleUnit = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // ---------------------------------------------------------------------------
  // Cobro terminado

  if (done) {
    const data = ticketFor(done.payments, done.discount, done.reason);
    const t = ticketTotals(data);
    return (
      <Overlay onBackdrop={onFinished} busy={busy}>
        <div className="p-6 sm:p-8 space-y-5">
          <div className="h-14 w-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center">
            <Check size={28} aria-hidden="true" />
          </div>
          <div>
            <h2 id="payment-title" className="font-display text-3xl font-extrabold tracking-tight text-slate-900">
              Cobro registrado
            </h2>
            <p className="mt-1 text-slate-600">{tableName} · la mesa quedó libre</p>
          </div>

          <dl className="rounded-2xl border bg-white p-4 grid grid-cols-[1fr_auto] gap-y-1 text-sm">
            <dt className="text-slate-600">Subtotal</dt>
            <dd className="text-right tabular-nums">{money(t.subtotal)}</dd>
            {done.discount > 0 && (
              <>
                <dt className="text-slate-600">Descuento{done.reason ? ` · ${done.reason}` : ''}</dt>
                <dd className="text-right tabular-nums">− {money(done.discount)}</dd>
              </>
            )}
            {t.adjustments !== 0 && (
              <>
                <dt className="text-slate-600">{t.adjustments > 0 ? 'Recargos' : 'Descuentos por medio de pago'}</dt>
                <dd className="text-right tabular-nums">{t.adjustments > 0 ? '' : '− '}{money(Math.abs(t.adjustments))}</dd>
              </>
            )}
            {done.payments.map((p) => (
              <Fragmentless key={p.id}>
                <dt className="text-slate-600">{p.method_name}</dt>
                <dd className="text-right tabular-nums">{money(p.amount)}</dd>
              </Fragmentless>
            ))}
            <dt className="pt-2 mt-1 border-t font-bold text-slate-900">Total cobrado</dt>
            <dd className="pt-2 mt-1 border-t text-right font-display text-2xl font-extrabold text-slate-900 tabular-nums">
              {money(t.total)}
            </dd>
          </dl>

          <div className="space-y-2">
            <p className="text-sm font-bold text-slate-600">¿El cliente quiere su ticket?</p>
            <div className="grid grid-cols-2 gap-2">
              <Button className="h-12" onClick={() => downloadTicket(data)}>
                <Download size={18} aria-hidden="true" />
                Descargar ticket
              </Button>
              <Button variant="outline" className="h-12 border-2 border-blue-600 text-blue-700" onClick={() => share(data)}>
                <Share2 size={18} aria-hidden="true" />
                Compartir
              </Button>
            </div>
            <p className="text-xs text-slate-500">
              Es un archivo HTML: se abre en cualquier celular o computadora y se puede imprimir o guardar como PDF.
            </p>
            {notice && <p className="text-sm text-green-800">{notice}</p>}
          </div>

          <Button className="w-full h-12 bg-slate-900 hover:bg-slate-800" onClick={onFinished}>
            Volver al salón
          </Button>
        </div>
      </Overlay>
    );
  }

  // ---------------------------------------------------------------------------
  // Cobro

  return (
    <Overlay onBackdrop={onClose} busy={busy}>
      <div className="p-5 sm:p-7 space-y-5">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-slate-500">{hasPayments ? 'Cobro en curso' : 'Pidió la cuenta'}</p>
            <h2 id="payment-title" className="font-display text-3xl font-extrabold tracking-tight text-slate-900">
              Cobrar {tableName}
            </h2>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-500">
              {discount > 0 ? `Total con descuento (${money(discount)})` : 'Total'}
            </p>
            <p className="font-display text-3xl font-extrabold text-slate-900 tabular-nums">{money(net)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Cerrar"
            className="-mr-2 -mt-2 h-11 w-11 shrink-0 rounded-xl text-slate-500 hover:bg-slate-100 flex items-center justify-center"
          >
            <X size={20} />
          </button>
        </header>

        {loading ? (
          <p className="text-slate-500">Cargando…</p>
        ) : (
          <>
            {/* Descuento: solo antes del primer pago */}
            {!hasPayments &&
              (!discountOpen ? (
                <Button type="button" variant="outline" size="sm" onClick={() => setDiscountOpen(true)}>
                  Aplicar descuento
                </Button>
              ) : (
                <fieldset className="rounded-xl border bg-white p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <legend className="text-sm font-bold text-slate-700">Descuento</legend>
                    <button
                      type="button"
                      onClick={() => {
                        setDiscountOpen(false);
                        setDiscountValue('');
                        setDiscountReason('');
                      }}
                      className="text-sm text-slate-500 hover:text-slate-800 hover:underline"
                    >
                      Quitar
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <div className="inline-flex rounded-lg bg-slate-100 p-0.5" role="group" aria-label="Tipo de descuento">
                      {(['percent', 'amount'] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          aria-pressed={discountMode === m}
                          onClick={() => {
                            setDiscountMode(m);
                            setDiscountValue('');
                          }}
                          className={cn(
                            'h-10 rounded-md px-4 text-sm font-bold',
                            discountMode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                          )}
                        >
                          {m === 'percent' ? '%' : '$'}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                      placeholder={discountMode === 'percent' ? 'Porcentaje' : 'Monto'}
                      aria-label={discountMode === 'percent' ? 'Porcentaje de descuento' : 'Monto de descuento'}
                      className="h-11 w-32 rounded-lg border px-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {discountMode === 'percent' &&
                      QUICK_PERCENTS.map((p) => (
                        <Button
                          key={p}
                          type="button"
                          size="sm"
                          className="h-11"
                          variant={discountValue === String(p) ? 'default' : 'outline'}
                          onClick={() => setDiscountValue(String(p))}
                        >
                          {p}%
                        </Button>
                      ))}
                  </div>
                  <input
                    type="text"
                    value={discountReason}
                    onChange={(e) => setDiscountReason(e.target.value)}
                    placeholder="Motivo (opcional): cliente frecuente, cortesía…"
                    aria-label="Motivo del descuento"
                    className="h-11 w-full rounded-lg border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {discountError && <p className="text-sm text-red-700">{discountError}</p>}
                </fieldset>
              ))}

            {/* Forma de cobro */}
            <div role="tablist" aria-label="Forma de cobro" className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="tab"
                  aria-selected={mode === m.id}
                  onClick={() => {
                    setMode(m.id);
                    setSelected(new Set());
                  }}
                  className={cn(
                    'h-11 rounded-lg text-sm font-bold transition-colors',
                    mode === m.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Progreso */}
            {(hasPayments || mode !== 'all') && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span>
                    Cobrado <strong className="tabular-nums">{money(paidBase)}</strong> de {money(net)}
                  </span>
                  <strong className="text-slate-900">Falta {money(due)}</strong>
                </div>
                <div
                  role="progressbar"
                  aria-label="Cobrado de la cuenta"
                  aria-valuemin={0}
                  aria-valuemax={net}
                  aria-valuenow={paidBase}
                  className="h-2.5 rounded-full bg-slate-200 overflow-hidden"
                >
                  <div className="h-full rounded-full bg-blue-600" style={{ width: `${net > 0 ? (paidBase / net) * 100 : 0}%` }} />
                </div>
              </div>
            )}

            {mode === 'equal' && (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-bold text-slate-900">Dividir entre</span>
                <button
                  type="button"
                  aria-label="Una persona menos"
                  onClick={() => setParts((n) => Math.max(Math.max(2, payments.length + 1), n - 1))}
                  className="h-11 w-11 rounded-xl border bg-white text-xl"
                >
                  −
                </button>
                <span className="font-display text-2xl font-extrabold w-8 text-center">{parts}</span>
                <button
                  type="button"
                  aria-label="Una persona más"
                  onClick={() => setParts((n) => Math.min(20, n + 1))}
                  className="h-11 w-11 rounded-xl border bg-white text-xl"
                >
                  +
                </button>
                <span className="text-sm text-slate-600">
                  personas · {partsLeft === 1 ? 'última parte' : `${partsLeft} partes por cobrar`}
                </span>
              </div>
            )}

            {mode === 'items' && (
              <fieldset className="rounded-xl border bg-white px-4 py-2 max-h-56 overflow-y-auto">
                <legend className="px-1 text-sm font-bold text-slate-600">Marca lo que paga esta persona</legend>
                {units.map((u) => (
                  <label
                    key={u.key}
                    className={cn('flex items-center gap-3 min-h-[48px] border-b last:border-0', u.paid && 'opacity-50')}
                  >
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-blue-600"
                      checked={u.paid || selected.has(u.key)}
                      disabled={u.paid}
                      onChange={() => toggleUnit(u.key)}
                    />
                    <span className="flex-1 text-sm font-bold text-slate-900">
                      {u.name}
                      {u.paid && <span className="ml-2 font-normal text-slate-500">ya cobrado</span>}
                    </span>
                    <span className="text-sm tabular-nums">{money(u.price)}</span>
                  </label>
                ))}
              </fieldset>
            )}

            {/* Pagos registrados */}
            {hasPayments && (
              <ul className="space-y-2">
                {payments.map((p, i) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-white px-4 py-2.5">
                    <span className="h-8 w-8 rounded-lg bg-blue-100 text-slate-900 flex items-center justify-center">
                      <Check size={16} aria-hidden="true" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <strong className="text-sm text-slate-900">
                        Pago {i + 1} · {money(p.amount)}
                      </strong>
                      <span className="block text-xs text-slate-600">
                        {p.method_name}
                        {p.adjustment > 0 ? ` · recargo ${money(p.adjustment)}` : ''}
                        {p.cash_given != null && p.cash_given > p.amount
                          ? ` · pagó con ${money(p.cash_given)}, vuelto ${money(round2(p.cash_given - p.amount))}`
                          : ''}
                      </span>
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => share(ticketFor(payments.slice(0, i + 1), discount, order.discount_reason))}
                    >
                      Ticket
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-700 hover:bg-red-50"
                      disabled={busy}
                      onClick={() => cancelPayment(p)}
                    >
                      Anular
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {/* Medio de pago */}
            <div className="space-y-2">
              <p className="text-sm font-bold text-slate-600">
                {mode === 'equal' ? `Parte ${payments.length + 1}: ¿cómo paga?` : '¿Cómo paga?'}
              </p>
              {methods.length === 0 ? (
                <p className="text-sm text-red-700">
                  No hay medios de pago activos. El administrador puede cargarlos en Ajustes › Medios de pago.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {methods.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      aria-pressed={methodId === m.id}
                      onClick={() => setMethodId(m.id)}
                      className={cn(
                        'h-11 rounded-xl px-4 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                        methodId === m.id
                          ? 'border-2 border-blue-600 bg-blue-50 text-slate-900'
                          : 'border bg-white text-slate-800 hover:bg-slate-50'
                      )}
                    >
                      {m.name}
                      {adjustmentLabel(m) && <span className="ml-1 font-semibold text-slate-500">{adjustmentLabel(m)}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {isCash && base > 0 && (
              <div className="flex flex-wrap items-end gap-2">
                <label className="block">
                  <span className="text-sm font-bold text-slate-600">Paga con</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={cashGiven}
                    onChange={(e) => setCashGiven(e.target.value.replace(/[^\d,]/g, ''))}
                    placeholder={String(charged)}
                    className="mt-1 h-11 w-36 rounded-lg border px-3 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
                <Button type="button" variant="outline" className="h-11" onClick={() => setCashGiven(String(charged).replace('.', ','))}>
                  Justo
                </Button>
                {suggestions.map((v) => (
                  <Button key={v} type="button" variant="outline" className="h-11" onClick={() => setCashGiven(String(v))}>
                    {money(v)}
                  </Button>
                ))}
                {cashGiven !== '' && (
                  <p className={cn('w-full text-lg font-bold', cashTooLow ? 'text-red-700' : 'text-green-800')}>
                    {cashTooLow ? `Faltan ${money(round2(charged - given))}` : `Vuelto: ${money(round2(given - charged))}`}
                  </p>
                )}
              </div>
            )}

            {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            {notice && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{notice}</p>}

            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="button" variant="outline" className="h-12" onClick={onClose} disabled={busy}>
                {hasPayments ? 'Seguir después' : 'Cancelar'}
              </Button>
              <Button type="button" className="h-12 flex-1 text-base" onClick={pay} disabled={!canPay}>
                {busy
                  ? 'Cobrando…'
                  : base <= 0
                    ? mode === 'items'
                      ? 'Marca qué productos paga'
                      : 'Nada por cobrar'
                    : `${mode === 'all' || base >= due ? 'Cobrar' : `Cobrar parte ${payments.length + 1}`} · ${money(charged)}`}
              </Button>
            </div>
            {hasPayments && (
              <p className="text-xs text-slate-500">
                La mesa sigue en "Por pagar" hasta completar el total. Puedes cerrar y seguir cobrando después.
              </p>
            )}
          </>
        )}
      </div>
    </Overlay>
  );
}

// Fondo oscuro + ventana
function Overlay({ children, onBackdrop, busy }: { children: React.ReactNode; onBackdrop: () => void; busy: boolean }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/50 p-3 sm:p-6"
      onClick={() => !busy && onBackdrop()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-title"
        className="w-full max-w-3xl max-h-[calc(100vh-1.5rem)] overflow-y-auto rounded-3xl bg-slate-50 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

// Agrupa dt/dd sin agregar elementos al DOM
function Fragmentless({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
