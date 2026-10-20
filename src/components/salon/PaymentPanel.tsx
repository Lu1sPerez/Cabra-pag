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

const money = (n: number) => `$${n.toLocaleString('es-AR')}`;

interface PaymentPanelProps {
  tableName: string;
  total: number;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (method: PaymentMethod) => void;
}

export default function PaymentPanel({
  tableName,
  total,
  busy,
  error,
  onClose,
  onConfirm,
}: PaymentPanelProps) {
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [cashGiven, setCashGiven] = useState('');

  // Cerrar con Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const given = Number(cashGiven || 0);
  const change = given - total;
  const cashTooLow = method === 'cash' && cashGiven !== '' && given < total;

  // Billetes sugeridos: redondeos hacia arriba del total
  const suggestions = useMemo(() => {
    const rounded = [1000, 5000, 10000, 20000].map((step) => Math.ceil(total / step) * step);
    return Array.from(new Set(rounded)).filter((v) => v > total).slice(0, 3);
  }, [total]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4"
      onClick={() => !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-title"
        className="w-full max-w-md rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b">
          <h2 id="payment-title" className="text-lg font-bold text-slate-800">
            Cobrar mesa {tableName}
          </h2>
          <p className="text-3xl font-bold text-slate-900 mt-1">{money(total)}</p>
        </div>

        <div className="p-5 space-y-5">
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
                  onChange={(e) => setCashGiven(e.target.value.replace(/\D/g, ''))}
                  placeholder={String(total)}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setCashGiven(String(total))}>
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
                  {cashTooLow ? `Faltan ${money(total - given)}` : `Vuelto: ${money(change)}`}
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
            onClick={() => onConfirm(method)}
            disabled={busy || cashTooLow}
          >
            {busy ? 'Cobrando…' : 'Confirmar cobro'}
          </Button>
        </div>
      </div>
    </div>
  );
}
