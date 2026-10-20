'use client';

import { useEffect, useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { isStaffSessionError, useStaff } from '@/components/auth/StaffProvider';
import {
  countOpenOrders,
  getClosedOrders,
  todayLocal,
  type ClosedOrder,
} from '@/actions/report-actions';

const METHODS: { id: string; label: string }[] = [
  { id: 'cash', label: 'Efectivo' },
  { id: 'card', label: 'Tarjeta' },
  { id: 'mercadopago', label: 'MercadoPago' },
  { id: 'transfer', label: 'Transferencia' },
];

const money = (n: number) =>
  `$${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;

const onlyDigits = (v: string) => v.replace(/\D/g, '');

export default function CashReport() {
  const [date, setDate] = useState(todayLocal());
  const [orders, setOrders] = useState<ClosedOrder[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const { staff, lock } = useStaff();
  const staffToken = staff?.token ?? null;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Arqueo (no se guarda: se calcula en pantalla)
  const [initialCash, setInitialCash] = useState('');
  const [countedCash, setCountedCash] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    Promise.all([getClosedOrders(date, staffToken), countOpenOrders()])
      .then(([rows, open]) => {
        if (!active) return;
        setOrders(rows);
        setOpenCount(open);
      })
      .catch((e) => {
        console.error(e);
        if (isStaffSessionError(e)) return lock();
        if (active) setError('No se pudo cargar el resumen. Revisa la conexión con Supabase.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [date, staffToken, lock]);

  const summary = useMemo(() => {
    const total = orders.reduce((acc, o) => acc + Number(o.total ?? 0), 0);

    const byMethod = METHODS.map((m) => {
      const list = orders.filter((o) => o.payment_method === m.id);
      return {
        ...m,
        count: list.length,
        amount: list.reduce((acc, o) => acc + Number(o.total ?? 0), 0),
      };
    });

    const products = new Map<string, { qty: number; amount: number }>();
    for (const o of orders) {
      for (const it of o.order_items) {
        const name = it.products?.name ?? 'Producto eliminado';
        const prev = products.get(name) ?? { qty: 0, amount: 0 };
        products.set(name, {
          qty: prev.qty + it.quantity,
          amount: prev.amount + it.quantity * Number(it.unit_price ?? 0),
        });
      }
    }
    const topProducts = Array.from(products.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10);

    return {
      total,
      count: orders.length,
      average: orders.length ? total / orders.length : 0,
      byMethod,
      topProducts,
    };
  }, [orders]);

  const cashSales = summary.byMethod.find((m) => m.id === 'cash')?.amount ?? 0;
  const expectedCash = Number(initialCash || 0) + cashSales;
  const difference = Number(countedCash || 0) - expectedCash;
  const isToday = date === todayLocal();

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Encabezado */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Cierre de caja</h1>
          <p className="text-slate-500 text-sm">
            Órdenes cobradas el{' '}
            {new Date(`${date}T00:00:00`).toLocaleDateString('es-AR', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        </div>

        <div className="flex items-end gap-2 print:hidden">
          <label className="block">
            <span className="text-sm font-medium text-slate-600">Fecha</span>
            <input
              type="date"
              value={date}
              max={todayLocal()}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="mt-1 block rounded-md border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <Button variant="outline" onClick={() => window.print()} disabled={loading}>
            <Printer size={16} />
            Imprimir
          </Button>
        </div>
      </div>

      {isToday && openCount > 0 && (
        <div className="rounded-lg border border-yellow-400 bg-yellow-50 px-4 py-3 text-sm text-yellow-900 print:hidden">
          {openCount === 1
            ? 'Hay 1 mesa abierta sin cobrar. No se incluye en este resumen.'
            : `Hay ${openCount} mesas abiertas sin cobrar. No se incluyen en este resumen.`}
        </div>
      )}

      {loading ? (
        <p className="text-slate-500">Cargando resumen…</p>
      ) : error ? (
        <p className="text-red-600">{error}</p>
      ) : (
        <>
          {/* Totales */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-slate-500">Total vendido</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">{money(summary.total)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-slate-500">Mesas cobradas</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">{summary.count}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-slate-500">Ticket promedio</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">{money(summary.average)}</p>
              </CardContent>
            </Card>
          </div>

          {summary.count === 0 ? (
            <p className="text-slate-600">No hay órdenes cobradas en esta fecha.</p>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Medios de pago */}
                <Card>
                  <CardContent className="p-5 space-y-4">
                    <h2 className="font-semibold text-slate-800">Por medio de pago</h2>
                    {summary.byMethod.map((m) => {
                      const pct = summary.total ? (m.amount / summary.total) * 100 : 0;
                      return (
                        <div key={m.id} className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-700">
                              {m.label}{' '}
                              <span className="text-slate-400">({m.count})</span>
                            </span>
                            <span className="font-semibold text-slate-900">{money(m.amount)}</span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                            <div className="h-full bg-blue-600" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>

                {/* Arqueo */}
                <Card>
                  <CardContent className="p-5 space-y-4">
                    <h2 className="font-semibold text-slate-800">Arqueo de efectivo</h2>

                    <div className="grid grid-cols-2 gap-3">
                      <label className="block">
                        <span className="text-sm text-slate-600">Fondo inicial</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={initialCash}
                          onChange={(e) => setInitialCash(onlyDigits(e.target.value))}
                          placeholder="0"
                          className="mt-1 w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </label>
                      <label className="block">
                        <span className="text-sm text-slate-600">Efectivo contado</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={countedCash}
                          onChange={(e) => setCountedCash(onlyDigits(e.target.value))}
                          placeholder="0"
                          className="mt-1 w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </label>
                    </div>

                    <dl className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <dt className="text-slate-600">Ventas en efectivo</dt>
                        <dd>{money(cashSales)}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-600">Efectivo esperado en caja</dt>
                        <dd className="font-semibold">{money(expectedCash)}</dd>
                      </div>
                    </dl>

                    {countedCash !== '' && (
                      <p
                        className={cn(
                          'rounded-md px-3 py-2 font-semibold',
                          difference === 0 && 'bg-green-50 text-green-800',
                          difference < 0 && 'bg-red-50 text-red-700',
                          difference > 0 && 'bg-yellow-50 text-yellow-900'
                        )}
                      >
                        {difference === 0
                          ? 'La caja cuadra.'
                          : difference < 0
                            ? `Faltante: ${money(Math.abs(difference))}`
                            : `Sobrante: ${money(difference)}`}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Productos */}
              <Card>
                <CardContent className="p-5 space-y-3">
                  <h2 className="font-semibold text-slate-800">Productos más vendidos</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-slate-500 border-b">
                          <th className="py-2 font-medium">Producto</th>
                          <th className="py-2 font-medium text-right">Cantidad</th>
                          <th className="py-2 font-medium text-right">Importe</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.topProducts.map((p) => (
                          <tr key={p.name} className="border-b last:border-0">
                            <td className="py-2 text-slate-800">{p.name}</td>
                            <td className="py-2 text-right">{p.qty}</td>
                            <td className="py-2 text-right">{money(p.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Detalle */}
              <Card>
                <CardContent className="p-5 space-y-3">
                  <h2 className="font-semibold text-slate-800">Detalle de cobros</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-slate-500 border-b">
                          <th className="py-2 font-medium">Hora</th>
                          <th className="py-2 font-medium">Mesa</th>
                          <th className="py-2 font-medium">Cobró</th>
                          <th className="py-2 font-medium">Medio de pago</th>
                          <th className="py-2 font-medium text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orders.map((o) => (
                          <tr key={o.id} className="border-b last:border-0">
                            <td className="py-2">
                              {new Date(o.paid_at).toLocaleTimeString('es-AR', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </td>
                            <td className="py-2">{o.tables?.name ?? '—'}</td>
                            <td className="py-2">{o.closer?.name ?? 'Admin'}</td>
                            <td className="py-2">
                              {METHODS.find((m) => m.id === o.payment_method)?.label ?? 'Sin dato'}
                            </td>
                            <td className="py-2 text-right font-medium">
                              {money(Number(o.total ?? 0))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
