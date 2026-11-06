'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, Banknote, Check, ChevronLeft, CreditCard, Delete, Download, QrCode, Share2, Wallet } from 'lucide-react';
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
  type MethodKind,
  type PaymentMethodRow,
} from '@/actions/payment-methods-actions';
import { downloadTicket, shareTicket, ticketTotals, type TicketData } from '@/lib/ticket';

type Mode = 'all' | 'equal' | 'items' | 'amount';

const MODES: { id: Mode; label: string }[] = [
  { id: 'all', label: 'Todo junto' },
  { id: 'equal', label: 'Partes iguales' },
  { id: 'items', label: 'Por productos' },
  { id: 'amount', label: 'Por monto' },
];

// Montos redondos que se ofrecen como atajo en "Por monto"
const ROUND_AMOUNTS = [5000, 10000, 20000, 50000];

const QUICK_PERCENTS = [5, 10, 15, 20];

const round2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => `$ ${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;
// "26600,5" -> "26.600,5" (lo que se ve en los campos de monto)
const groupThousands = (raw: string) => {
  const [int, dec] = raw.split(',');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return dec !== undefined ? `${grouped},${dec}` : grouped;
};
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
  // "Por monto": cuánto de la cuenta cubre este pago (antes de recargos del medio)
  const [amountRaw, setAmountRaw] = useState('');

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
  let amountError: string | null = null;
  if (mode === 'equal') base = partsLeft === 1 ? due : round2(due / partsLeft);
  if (mode === 'amount') {
    const a = amountRaw.trim() === '' ? 0 : parseNumber(amountRaw);
    if (Number.isNaN(a) || a < 0) {
      base = 0;
      amountError = 'Ingresa un monto válido.';
    } else if (a > due + 0.01) {
      base = 0;
      amountError = `Supera lo que falta cobrar (${money(due)}).`;
    } else {
      // Si queda un resto de centavos, se cobra todo lo que falta
      base = due - a < 0.01 ? due : round2(a);
    }
  }
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

  const canPay = !busy && !loading && !!method && base > 0 && !cashTooLow && !discountError && !amountError && due > 0;

  // Atajos de "Por monto": todo lo que falta, la mitad y montos redondos menores
  const amountShortcuts = useMemo(() => {
    if (due <= 0) return [] as { label: string; value: number }[];
    const list: { label: string; value: number }[] = [{ label: `Todo lo que falta · ${money(due)}`, value: due }];
    const half = round2(due / 2);
    if (half >= 1) list.push({ label: `La mitad · ${money(half)}`, value: half });
    for (const v of ROUND_AMOUNTS) if (v < due && v !== half) list.push({ label: money(v), value: v });
    return list.slice(0, 5);
  }, [due]);

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
      setAmountRaw('');

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

  // Teclado numérico: en "Por monto" escribe el monto; si no, lo que entrega en efectivo
  const keypadTarget: 'amount' | 'cash' | null = mode === 'amount' ? 'amount' : isCash ? 'cash' : null;
  const pressKey = (key: string) => {
    const setter = keypadTarget === 'amount' ? setAmountRaw : keypadTarget === 'cash' ? setCashGiven : null;
    if (!setter) return;
    setter((prev) => {
      if (key === 'back') return prev.slice(0, -1);
      const next = (prev + key).replace(/^0+(?=\d)/, '');
      return next.length > 9 ? prev : next;
    });
  };

  // ---------------------------------------------------------------------------
  // Cobro terminado

  if (done) {
    const data = ticketFor(done.payments, done.discount, done.reason);
    const t = ticketTotals(data);
    return (
      <Overlay>
        <div className="mx-auto flex w-full max-w-xl flex-col gap-5 p-5 sm:p-8">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ok-bg text-ok-fg">
            <Check size={28} aria-hidden="true" />
          </div>
          <div>
            <h2 id="payment-title" className="font-display text-3xl font-extrabold tracking-tight text-slate-900">
              Cobro registrado
            </h2>
            <p className="mt-1 text-slate-600">{tableName} · la mesa quedó libre</p>
          </div>

          <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 rounded-2xl border bg-surface p-4 text-sm">
            <dt className="text-slate-600">Subtotal</dt>
            <dd className="text-right tabular-nums text-slate-900">{money(t.subtotal)}</dd>
            {done.discount > 0 && (
              <>
                <dt className="text-slate-600">Descuento{done.reason ? ` · ${done.reason}` : ''}</dt>
                <dd className="text-right tabular-nums text-slate-900">− {money(done.discount)}</dd>
              </>
            )}
            {t.adjustments !== 0 && (
              <>
                <dt className="text-slate-600">{t.adjustments > 0 ? 'Recargos' : 'Descuentos por medio de pago'}</dt>
                <dd className="text-right tabular-nums text-slate-900">{t.adjustments > 0 ? '' : '− '}{money(Math.abs(t.adjustments))}</dd>
              </>
            )}
            {done.payments.map((p) => (
              <Fragmentless key={p.id}>
                <dt className="text-slate-600">{p.method_name}</dt>
                <dd className="text-right tabular-nums text-slate-900">{money(p.amount)}</dd>
              </Fragmentless>
            ))}
            <dt className="mt-1 border-t pt-2 font-bold text-slate-900">Total cobrado</dt>
            <dd className="mt-1 border-t pt-2 text-right font-display text-2xl font-extrabold tabular-nums text-slate-900">
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
              <Button variant="outline" className="h-12" onClick={() => share(data)}>
                <Share2 size={18} aria-hidden="true" />
                Compartir
              </Button>
            </div>
            <p className="text-xs text-slate-500">
              Es un archivo HTML: se abre en cualquier celular o computadora y se puede imprimir o guardar como PDF.
            </p>
            {notice && <p className="text-sm text-green-800">{notice}</p>}
          </div>

          <button
            type="button"
            onClick={onFinished}
            className="h-12 w-full rounded-xl bg-slate-900 text-[15px] font-extrabold text-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            Volver al salón
          </button>
        </div>
      </Overlay>
    );
  }

  // ---------------------------------------------------------------------------
  // Cobro

  const progress = net > 0 ? Math.min(100, (paidBase / net) * 100) : 0;
  const payLabel = busy
    ? 'Cobrando…'
    : base <= 0
      ? mode === 'items'
        ? 'Marca qué productos paga'
        : mode === 'amount'
          ? 'Ingresa el monto'
          : 'Nada por cobrar'
      : `${mode === 'all' || base >= due ? 'Cobrar' : `Cobrar parte ${payments.length + 1}`} ${money(charged)}${method ? ` · ${method.name}` : ''}`;

  return (
    <Overlay>
      {/* Barra superior del cobro */}
      <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-3 border-b bg-bar px-3 sm:px-5">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="flex h-11 items-center gap-1.5 rounded-xl border pl-2.5 pr-3.5 text-sm font-bold text-slate-900 hover:bg-slate-100 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <ChevronLeft size={18} aria-hidden="true" />
          {hasPayments ? 'Seguir después' : tableName}
        </button>
        <h2 id="payment-title" className="font-display text-2xl font-extrabold tracking-tight text-slate-900">
          Cobrar {tableName}
        </h2>
        <div className="flex-1" />
        {staffName && <span className="hidden text-sm font-semibold text-slate-500 sm:inline">{staffName}</span>}
      </header>

      {loading ? (
        <p className="p-6 text-slate-500">Cargando…</p>
      ) : (
        <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 p-4 sm:p-6 lg:flex-row">
          {/* Columna izquierda: cuenta, forma de cobro y medio de pago */}
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <section aria-label="Estado de la cuenta" className="space-y-3 rounded-2xl border bg-surface p-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-[11px] font-extrabold tracking-[0.06em] text-slate-500">
                    {discount > 0 ? `TOTAL CON DESCUENTO (${money(discount)})` : 'TOTAL DE LA CUENTA'}
                  </p>
                  <p className="font-display text-[44px] font-extrabold leading-none tracking-tight tabular-nums text-slate-900">{money(net)}</p>
                </div>
                {hasPayments && (
                  <div className="text-right">
                    <p className="text-[11px] font-extrabold tracking-[0.06em] text-slate-500">FALTA COBRAR</p>
                    <p className="font-display text-3xl font-extrabold tabular-nums text-warn">{money(due)}</p>
                  </div>
                )}
              </div>
              {(hasPayments || mode !== 'all') && (
                <>
                  <div
                    role="progressbar"
                    aria-label="Cobrado de la cuenta"
                    aria-valuemin={0}
                    aria-valuemax={net}
                    aria-valuenow={paidBase}
                    className="h-2 overflow-hidden rounded-full bg-slate-100"
                  >
                    <div className="h-full rounded-full bg-blue-600" style={{ width: `${progress}%` }} />
                  </div>
                  <p className="text-[13px] text-slate-500">
                    Cobrado <strong className="tabular-nums text-slate-900">{money(paidBase)}</strong> de {money(net)}
                    {hasPayments ? ` · ${payments.length} ${payments.length === 1 ? 'pago' : 'pagos'}` : ''}
                  </p>
                </>
              )}
            </section>

            {/* Descuento: solo antes del primer pago */}
            {!hasPayments &&
              (!discountOpen ? (
                <button
                  type="button"
                  onClick={() => setDiscountOpen(true)}
                  className="self-start rounded-lg px-1 text-sm font-bold text-blue-600 underline-offset-4 hover:underline"
                >
                  + Aplicar descuento
                </button>
              ) : (
                <fieldset className="space-y-3 rounded-2xl border bg-surface p-4">
                  <div className="flex items-center justify-between">
                    <legend className="text-sm font-extrabold text-slate-900">Descuento</legend>
                    <button
                      type="button"
                      onClick={() => {
                        setDiscountOpen(false);
                        setDiscountValue('');
                        setDiscountReason('');
                      }}
                      className="text-sm font-semibold text-slate-500 hover:text-slate-900 hover:underline"
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
                            discountMode === m ? 'bg-surface text-slate-900 shadow-sm' : 'text-slate-500'
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
                      className="h-11 w-32 rounded-lg border bg-slate-50 px-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    className="h-11 w-full rounded-lg border bg-slate-50 px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {discountError && <p className="text-sm text-red-700">{discountError}</p>}
                </fieldset>
              ))}

            {/* Forma de cobro */}
            <div role="tablist" aria-label="Forma de cobro" className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 sm:grid-cols-4">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="tab"
                  aria-selected={mode === m.id}
                  onClick={() => {
                    setMode(m.id);
                    setSelected(new Set());
                    setAmountRaw('');
                  }}
                  className={cn(
                    'h-11 rounded-lg text-sm font-bold transition-colors',
                    mode === m.id ? 'bg-surface text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {mode === 'equal' && (
              <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-surface p-4">
                <span className="text-sm font-bold text-slate-900">Dividir entre</span>
                <button
                  type="button"
                  aria-label="Una persona menos"
                  onClick={() => setParts((n) => Math.max(Math.max(2, payments.length + 1), n - 1))}
                  className="h-11 w-11 rounded-xl border text-xl text-slate-900 hover:bg-slate-100"
                >
                  −
                </button>
                <span className="w-8 text-center font-display text-2xl font-extrabold text-slate-900">{parts}</span>
                <button
                  type="button"
                  aria-label="Una persona más"
                  onClick={() => setParts((n) => Math.min(20, n + 1))}
                  className="h-11 w-11 rounded-xl border text-xl text-slate-900 hover:bg-slate-100"
                >
                  +
                </button>
                <span className="text-sm text-slate-500">
                  personas · {partsLeft === 1 ? 'última parte' : `${partsLeft} partes por cobrar`}
                </span>
              </div>
            )}

            {mode === 'items' && (
              <fieldset className="max-h-64 overflow-y-auto rounded-2xl border bg-surface px-4 py-2">
                <legend className="px-1 text-sm font-bold text-slate-500">Marca lo que paga esta persona</legend>
                {units.map((u) => (
                  <label
                    key={u.key}
                    className={cn('flex min-h-[48px] items-center gap-3 border-b last:border-0', u.paid && 'opacity-50')}
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
                    <span className="text-sm tabular-nums text-slate-900">{money(u.price)}</span>
                  </label>
                ))}
              </fieldset>
            )}

            {/* Pagos registrados */}
            {hasPayments && (
              <ul className="space-y-2">
                {payments.map((p, i) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-surface px-4 py-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ok-bg text-ok-fg">
                      <Check size={16} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="text-sm text-slate-900">
                        Pago {i + 1} · {p.method_name} · {money(p.amount)}
                      </strong>
                      <span className="block text-xs text-slate-500">
                        {p.adjustment > 0 ? `Recargo ${money(p.adjustment)}` : 'Sin recargo'}
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
                    <Button size="sm" variant="ghost" className="text-red-700 hover:bg-red-50" disabled={busy} onClick={() => cancelPayment(p)}>
                      Anular
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {/* Medio de pago */}
            <section aria-labelledby="medio-titulo" className="space-y-2.5">
              <h3 id="medio-titulo" className="text-[11px] font-extrabold tracking-[0.06em] text-slate-500">
                {mode === 'equal'
                  ? `PARTE ${payments.length + 1}: ¿CÓMO PAGA?`
                  : mode === 'amount'
                    ? '¿CON QUÉ MEDIO PAGA ESE MONTO?'
                    : '¿CÓMO PAGA?'}
              </h3>
              {methods.length === 0 ? (
                <p className="text-sm text-red-700">
                  No hay medios de pago activos. El administrador puede cargarlos en Más › Medios de pago.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {methods.map((m) => {
                    const Icon = METHOD_ICONS[m.kind] ?? Wallet;
                    const selectedMethod = methodId === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        aria-pressed={selectedMethod}
                        onClick={() => setMethodId(m.id)}
                        className={cn(
                          'flex h-[72px] items-center gap-3 rounded-xl px-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                          selectedMethod ? 'border-2 border-blue-600 bg-blue-50 px-[13px]' : 'border bg-surface hover:bg-slate-100'
                        )}
                      >
                        <Icon size={22} aria-hidden="true" className="shrink-0 text-slate-900" />
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-[15px] font-extrabold text-slate-900">{m.name}</span>
                          <span className="text-xs text-slate-500">{adjustmentLabel(m) ? `Ajuste ${adjustmentLabel(m)}` : 'Sin recargo'}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          {/* Columna derecha: monto, efectivo y cobrar */}
          <section aria-label="Este pago" className="flex w-full shrink-0 flex-col gap-3 rounded-2xl border bg-surface p-5 lg:sticky lg:top-[88px] lg:w-[420px] lg:self-start">
            {mode === 'amount' ? (
              <label className="flex flex-col gap-2">
                <span className="text-[11px] font-extrabold tracking-[0.06em] text-slate-500">MONTO DE ESTE PAGO</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={groupThousands(amountRaw)}
                  onChange={(e) => setAmountRaw(e.target.value.replace(/[^\d,]/g, ''))}
                  placeholder={`Hasta ${money(due)}`}
                  aria-invalid={!!amountError}
                  className="h-[72px] rounded-xl border-2 border-blue-600 bg-slate-50 px-4 text-right font-display text-[40px] font-extrabold tabular-nums text-slate-900 placeholder:text-xl placeholder:font-bold focus:outline-none"
                />
              </label>
            ) : (
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-extrabold tracking-[0.06em] text-slate-500">
                  {mode === 'all' ? 'A COBRAR' : 'ESTE PAGO'}
                </span>
                <span className="font-display text-[40px] font-extrabold leading-tight tabular-nums text-slate-900">{money(charged)}</span>
                {adjustment !== 0 && method && (
                  <span className="text-[13px] text-slate-500">
                    Incluye {adjustment > 0 ? 'recargo' : 'descuento'} de {money(Math.abs(adjustment))} por {method.name}
                  </span>
                )}
              </div>
            )}

            {mode === 'amount' && (
              <>
                <div className="flex flex-wrap gap-2">
                  {amountShortcuts.map((sc) => (
                    <button
                      key={sc.label}
                      type="button"
                      onClick={() => setAmountRaw(String(sc.value).replace('.', ','))}
                      className="h-10 rounded-lg border px-3 text-[13px] font-bold text-slate-900 hover:bg-slate-100"
                    >
                      {sc.label}
                    </button>
                  ))}
                </div>
                {amountError ? (
                  <p className="text-sm text-red-700">{amountError}</p>
                ) : base > 0 && base < due ? (
                  <p className="text-sm text-slate-500">
                    Después quedan <strong className="text-slate-900">{money(round2(due - base))}</strong> por cobrar.
                  </p>
                ) : null}
                {base > 0 && adjustment !== 0 && method && (
                  <p className="text-sm text-slate-500">
                    Con {method.name} se cobran <strong className="text-slate-900">{money(charged)}</strong>.
                  </p>
                )}
              </>
            )}

            {isCash && base > 0 && (
              <div className="space-y-2 rounded-xl bg-slate-100 p-3">
                <label className="flex items-center justify-between gap-3">
                  <span className="text-sm font-bold text-slate-900">Paga con</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={groupThousands(cashGiven)}
                    onChange={(e) => setCashGiven(e.target.value.replace(/[^\d,]/g, ''))}
                    placeholder={money(charged)}
                    className="h-11 w-40 rounded-lg border bg-surface px-3 text-right text-lg font-bold tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setCashGiven(String(charged).replace('.', ','))}
                    className="h-9 rounded-lg border bg-surface px-3 text-[13px] font-bold text-slate-900"
                  >
                    Justo
                  </button>
                  {suggestions.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setCashGiven(String(v))}
                      className="h-9 rounded-lg border bg-surface px-3 text-[13px] font-bold text-slate-900"
                    >
                      {money(v)}
                    </button>
                  ))}
                </div>
                {cashGiven !== '' && (
                  <p className={cn('text-lg font-extrabold', cashTooLow ? 'text-red-700' : 'text-green-800')}>
                    {cashTooLow ? `Faltan ${money(round2(charged - given))}` : `Vuelto: ${money(round2(given - charged))}`}
                  </p>
                )}
              </div>
            )}

            {keypadTarget && (
              <div className="grid grid-cols-3 gap-2" aria-label={keypadTarget === 'amount' ? 'Teclado del monto' : 'Teclado del efectivo'}>
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0'].map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => pressKey(k)}
                    className="h-14 rounded-xl bg-slate-100 font-display text-2xl font-bold text-slate-900 hover:bg-slate-200 active:bg-slate-300"
                  >
                    {k}
                  </button>
                ))}
                <button
                  type="button"
                  aria-label="Borrar"
                  onClick={() => pressKey('back')}
                  className="flex h-14 items-center justify-center rounded-xl bg-slate-100 text-slate-900 hover:bg-slate-200 active:bg-slate-300"
                >
                  <Delete size={24} aria-hidden="true" />
                </button>
              </div>
            )}

            {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            {notice && <p role="status" className="rounded-lg bg-ok-bg px-3 py-2 text-sm font-semibold text-ok-fg">{notice}</p>}

            <button
              type="button"
              onClick={pay}
              disabled={!canPay}
              className="mt-1 h-14 w-full rounded-xl bg-blue-600 px-3 text-base font-extrabold text-white hover:bg-blue-700 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              {payLabel}
            </button>
            {hasPayments && (
              <p className="text-xs text-slate-500">
                La mesa sigue en "Por pagar" hasta completar el total. Puedes salir y seguir cobrando después.
              </p>
            )}
          </section>
        </div>
      )}
    </Overlay>
  );
}

const METHOD_ICONS: Record<MethodKind, typeof Wallet> = {
  cash: Banknote,
  card: CreditCard,
  wallet: QrCode,
  transfer: ArrowLeftRight,
  other: Wallet,
};

// Pantalla completa del cobro
function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-title"
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-slate-50"
    >
      {children}
    </div>
  );
}

// Agrupa dt/dd sin agregar elementos al DOM
function Fragmentless({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
