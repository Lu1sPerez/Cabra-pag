'use client';

import { useEffect, useMemo, useState } from 'react';
import { Banknote, CreditCard, Landmark, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PaymentMethod } from '@/actions/order-actions';

const METHODS: { id: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { id: 'cash', label: 'Efectivo', icon: Banknote },
  { id: 'card', label: 'Tarjeta', icon: CreditCard },
  { id: 'mercadopago', label: 'MercadoPago', icon: QrCode },
  { id: 'transfer', label: 'Transferencia', icon: Landmark },
];

const QUICK_PERCENTS = [5, 10, 15, 20];

const money = (n: number) => `$${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;

// Acepta "10", "10,5" o "1.500"
const parseNumber = (raw: string) => {
  const n = Number(raw.trim().replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

interface PaymentPanelProps {
  tableName: string;
  total: number;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (method: PaymentMethod, discount: number, discountReason: string | null) => void;
}

export default function PaymentPanel({
  tableName,
  total: subtotal,
  busy,
  error,
  onClose,
  onConfirm,
}: PaymentPanelProps) {
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [cashGiven, setCashGiven] = useState('');

  // Descuento
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountMode, setDiscountMode] = useState<'percent' | 'amount'>('percent');
  const [discountValue, setDiscountValue] = useState('');
  const [discountReason, setDiscountReason] = useState('');

  // Cerrar con Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const { discount, discountError } = useMemo(() => {
    if (!discountOpen || discountValue.trim() === '') return { discount: 0, discountError: null };
    const v = parseNumber(discountValue);
    if (Number.isNaN(v) || v < 0) return { discount: 0, discountError: 'Ingresa un número válido.' };
    if (discountMode === 'percent') {
      if (v > 100) return { discount: 0, discountError: 'El porcentaje no puede superar 100%.' };
      return { discount: round2((subtotal * v) / 100), discountError: null };
    }
    if (v > subtotal) return { discount: 0, discountError: 'El descuento no puede superar la cuenta.' };
    return { discount: round2(v), discountError: null };
  }, [discountOpen, discountValue, discountMode, subtotal]);

  const total = round2(subtotal - discount);

  const given = parseNumber(cashGiven || '0');
  const change = given - total;
  const cashTooLow = method === 'cash' && cashGiven !== '' && given < total;

  // Billetes sugeridos: redondeos hacia arriba del total a cobrar
  const suggestions = useMemo(() => {
    const rounded = [1000, 5000, 10000, 20000].map((step) => Math.ceil(total / step) * step);
    return Array.from(new Set(rounded)).filter((v) => v > total).slice(0, 3);
  }, [total]);

  const clearDiscount = () => {
    setDiscountOpen(false);
    setDiscountValue('');
    setDiscountReason('');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4"
      onClick={() => !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-title"
        className="w-full max-w-md max-h-[calc(100vh-2rem)] overflow-y-auto rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b">
          <h2 id="payment-title" className="text-lg font-bold text-slate-800">
            Cobrar mesa {tableName}
          </h2>
          {discount > 0 && (
            <p className="mt-1 text-sm text-slate-500">
              <span className="line-through">{money(subtotal)}</span> · descuento {money(discount)}
            </p>
          )}
          <p className="text-3xl font-bold text-slate-900 mt-1 tabular-nums">{money(total)}</p>
        </div>

        <div className="p-5 space-y-5">
          {/* Descuento */}
          {!discountOpen ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setDiscountOpen(true)}>
              Aplicar descuento
            </Button>
          ) : (
            <fieldset className="rounded-lg border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <legend className="text-sm font-medium text-slate-700">Descuento</legend>
                <button
                  type="button"
                  onClick={clearDiscount}
                  className="text-sm text-slate-500 hover:text-slate-800 hover:underline"
                >
                  Quitar
                </button>
              </div>

              <div className="flex gap-2">
                <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Tipo de descuento">
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
                        'rounded px-3 py-1 text-sm font-medium',
                        discountMode === m ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                      )}
                    >
                      {m === 'percent' ? '%' : '$'}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  inputMode="decimal"
                  autoFocus
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  placeholder={discountMode === 'percent' ? 'Porcentaje' : 'Monto'}
                  aria-label={discountMode === 'percent' ? 'Porcentaje de descuento' : 'Monto de descuento'}
                  className="flex-1 min-w-0 rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {discountMode === 'percent' && (
                <div className="flex flex-wrap gap-2">
                  {QUICK_PERCENTS.map((p) => (
                    <Button
                      key={p}
                      type="button"
                      size="sm"
                      variant={discountValue === String(p) ? 'default' : 'outline'}
                      onClick={() => setDiscountValue(String(p))}
                    >
                      {p}%
                    </Button>
                  ))}
                </div>
              )}

              <input
                type="text"
                value={discountReason}
                onChange={(e) => setDiscountReason(e.target.value)}
                placeholder="Motivo (opcional): cliente frecuente, cortesía…"
                aria-label="Motivo del descuento"
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              {discountError && <p className="text-sm text-red-600">{discountError}</p>}
            </fieldset>
          )}

          {/* Medio de pago */}
          <div className="grid grid-cols-2 gap-2">
            {METHODS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                aria-pressed={method === id}
                onClick={() => setMethod(id)}
                className={cn(
                  'flex items-center gap-2 rounded-lg border-2 p-3 text-left text-sm font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                  method === id
                    ? 'border-blue-600 bg-blue-50 text-blue-900'
                    : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                )}
              >
                <Icon size={18} />
                {label}
              </button>
            ))}
          </div>

          {method === 'cash' && (
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm font-medium text-slate-600">Paga con</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={cashGiven}
                  onChange={(e) => setCashGiven(e.target.value.replace(/[^\d,]/g, ''))}
                  placeholder={String(total)}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setCashGiven(String(total).replace('.', ','))}>
                  Justo
                </Button>
                {suggestions.map((v) => (
                  <Button key={v} type="button" variant="outline" size="sm" onClick={() => setCashGiven(String(v))}>
                    {money(v)}
                  </Button>
                ))}
              </div>

              {cashGiven !== '' && (
                <p className={cn('text-lg font-semibold', cashTooLow ? 'text-red-600' : 'text-green-700')}>
                  {cashTooLow ? `Faltan ${money(round2(total - given))}` : `Vuelto: ${money(round2(change))}`}
                </p>
              )}
            </div>
          )}

          {error && <p className="text-sm rounded-md bg-red-50 px-3 py-2 text-red-700">{error}</p>}
        </div>

        <div className="p-5 border-t flex gap-2">
          <Button type="button" variant="outline" className="flex-1 h-12" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button
            type="button"
            className="flex-1 h-12 bg-green-600 hover:bg-green-700 text-white"
            onClick={() => onConfirm(method, discount, discount > 0 ? discountReason.trim() || null : null)}
            disabled={busy || cashTooLow || Boolean(discountError)}
          >
            {busy ? 'Cobrando…' : `Cobrar ${money(total)}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
