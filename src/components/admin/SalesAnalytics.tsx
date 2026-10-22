'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { todayLocal } from '@/actions/report-actions';
import { parseDate, presetRange, PRESETS, type PresetId } from '@/lib/date-range';
import { getSalesAnalytics, type Analytics } from '@/actions/analytics-actions';
import { BarList, ColumnChart, KpiTile, money } from '@/components/admin/analytics/charts';

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  mercadopago: 'MercadoPago',
  transfer: 'Transferencia',
  debit: 'Débito',
  credit: 'Crédito',
  unknown: 'Sin dato',
};

const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

const parse = parseDate;

const shortDate = (s: string) =>
  parse(s).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });

const longDate = (s: string) =>
  parse(s).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

const signedMoney = (n: number) => (n < 0 ? `−${money(-n)}` : money(n));

const pct = (part: number, total: number) =>
  total > 0 ? `${Math.round((part / total) * 100)}%` : '0%';

export default function SalesAnalytics() {
  const [preset, setPreset] = useState<PresetId | null>('7d');
  const [[from, to], setRange] = useState<[string, string]>(() => presetRange('7d'));
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    getSalesAnalytics(from, to)
      .then((d) => active && setData(d))
      .catch((e) => {
        console.error(e);
        if (active) setError(e?.message ?? 'No se pudieron cargar las estadísticas.');
      })
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, [from, to]);

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

  const singleDay = from === to;

  const charts = useMemo(() => {
    if (!data) return null;
    const total = data.kpis.sales;
    const days = data.daily ?? [];

    return {
      daily: days.map((d) => ({
        key: d.day,
        label: shortDate(d.day),
        tooltipTitle: longDate(d.day),
        value: Number(d.sales),
        detail: `${d.orders} ${Number(d.orders) === 1 ? 'mesa' : 'mesas'}`,
      })),
      dailyLabelEvery: Math.max(1, Math.ceil(days.length / 10)),
      hourly: (data.hourly ?? []).map((h) => ({
        key: String(h.hour),
        label: `${h.hour}h`,
        tooltipTitle: `De ${h.hour}:00 a ${h.hour}:59`,
        value: Number(h.sales),
        detail: `${h.orders} ${Number(h.orders) === 1 ? 'mesa' : 'mesas'}`,
      })),
      weekday: (data.weekday ?? []).map((w) => ({
        key: String(w.dow),
        label: WEEKDAYS[w.dow - 1].slice(0, 3),
        tooltipTitle: WEEKDAYS[w.dow - 1],
        value: Number(w.sales),
        detail: `${w.orders} ${Number(w.orders) === 1 ? 'mesa' : 'mesas'}`,
      })),
      products: data.products.map((p, i) => ({
        key: `${p.name}-${i}`,
        label: p.name,
        sublabel: `· ${Number(p.qty)} u.`,
        value: Number(p.amount),
        valueText: money(Number(p.amount)),
      })),
      categories: data.categories.map((c) => ({
        key: c.name,
        label: c.name,
        value: Number(c.amount),
        valueText: `${money(Number(c.amount))} (${pct(Number(c.amount), total)})`,
      })),
      payments: data.payments.map((p) => ({
        key: p.method,
        label: PAYMENT_LABELS[p.method] ?? p.method,
        sublabel: `· ${p.orders} ${Number(p.orders) === 1 ? 'cobro' : 'cobros'}`,
        value: Number(p.sales),
        valueText: `${money(Number(p.sales))} (${pct(Number(p.sales), total)})`,
      })),
    };
  }, [data]);

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Encabezado y filtros */}
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Análisis de ventas</h1>
          <p className="text-sm text-slate-500">
            Solo incluye mesas cobradas. Cada indicador se compara con un período anterior de la misma duración.
            El tiempo por mesa no cuenta las ventas importadas, porque no tienen hora de apertura.
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
                onChange={(e) => setFrom(e.target.value)}
                className="mt-1 block rounded-md border bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Hasta</span>
              <input
                type="date"
                value={to}
                max={todayLocal()}
                onChange={(e) => setTo(e.target.value)}
                className="mt-1 block rounded-md border bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
          </div>
        </div>
      </div>

      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {!data && loading && <p className="text-slate-500">Cargando estadísticas…</p>}

      {data && charts && (
        <div className={cn('space-y-6 transition-opacity', loading && 'opacity-50')} aria-busy={loading}>
          {/* Indicadores */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <KpiTile
              label="Ventas"
              value={money(Number(data.kpis.sales))}
              current={Number(data.kpis.sales)}
              previous={Number(data.previous.sales)}
            />
            <KpiTile
              label="Mesas cobradas"
              value={String(data.kpis.orders)}
              current={Number(data.kpis.orders)}
              previous={Number(data.previous.orders)}
            />
            <KpiTile
              label="Ticket promedio"
              value={money(Number(data.kpis.avg_ticket))}
              current={Number(data.kpis.avg_ticket)}
              previous={Number(data.previous.avg_ticket)}
            />
            <KpiTile
              label="Productos vendidos"
              value={Number(data.kpis.items).toLocaleString('es-AR')}
              current={Number(data.kpis.items)}
              previous={Number(data.previous.items)}
            />
            <KpiTile
              label="Tiempo promedio por mesa"
              value={data.kpis.avg_minutes == null ? 'Sin datos' : `${Math.round(Number(data.kpis.avg_minutes))} min`}
              current={Number(data.kpis.avg_minutes)}
              previous={Number(data.previous.avg_minutes)}
              higherIsBetter={null}
            />
          </div>

          {/* Resultado */}
          <ResultSection data={data} />

          {Number(data.kpis.orders) === 0 ? (
            <p className="rounded-xl border bg-white p-6 text-center text-slate-600">
              No hay mesas cobradas en este período. Prueba con un rango más amplio.
            </p>
          ) : (
            <>
              {!singleDay && (
                <ColumnChart title="Ventas por día" data={charts.daily} labelEvery={charts.dailyLabelEvery} />
              )}

              <div className="grid gap-6 lg:grid-cols-2">
                <ColumnChart title="Ventas por hora del día" data={charts.hourly} labelEvery={3} />
                <ColumnChart title="Ventas por día de la semana" data={charts.weekday} />
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <BarList title="Productos que más facturan" items={charts.products} />
                <div className="space-y-6">
                  <BarList title="Ventas por categoría" items={charts.categories} />
                  <BarList title="Medios de pago" items={charts.payments} />
                </div>
              </div>

              {/* Mozos */}
              <section className="rounded-xl border bg-white p-5 space-y-3">
                <h2 className="font-semibold text-slate-800">Cobros por mozo</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500 border-b">
                        <th className="py-2 font-medium">Mozo</th>
                        <th className="py-2 font-medium text-right">Mesas</th>
                        <th className="py-2 font-medium text-right">Ventas</th>
                        <th className="py-2 font-medium text-right">Ticket promedio</th>
                        <th className="py-2 font-medium text-right">% del total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.staff.map((s) => (
                        <tr key={s.name} className="border-b last:border-0">
                          <td className="py-2 text-slate-800">{s.name}</td>
                          <td className="py-2 text-right tabular-nums">{s.orders}</td>
                          <td className="py-2 text-right tabular-nums">{money(Number(s.sales))}</td>
                          <td className="py-2 text-right tabular-nums">{money(Number(s.avg_ticket))}</td>
                          <td className="py-2 text-right tabular-nums">
                            {pct(Number(s.sales), Number(data.kpis.sales))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          {/* Accesos de encargados */}
          <section className="rounded-xl border bg-white p-5 space-y-3">
            <h2 className="font-semibold text-slate-800">Accesos de encargados a la caja</h2>
            {data.manager_access.length === 0 ? (
              <p className="text-sm text-slate-500">Ningún encargado abrió la caja en este período.</p>
            ) : (
              <ul className="divide-y text-sm">
                {data.manager_access.map((a) => (
                  <li key={a.name} className="flex flex-wrap justify-between gap-2 py-2">
                    <span className="text-slate-800">{a.name}</span>
                    <span className="text-slate-500">
                      {a.count} {Number(a.count) === 1 ? 'consulta' : 'consultas'} · última:{' '}
                      {new Date(a.last).toLocaleString('es-AR', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resultado: ventas menos gastos, y margen por producto según su costo

function ResultSection({ data }: { data: Analytics }) {
  const sales = Number(data.kpis.sales);
  const prevSales = Number(data.previous.sales);
  const expenses = Number(data.expenses?.total ?? 0);
  const prevExpenses = Number(data.expenses?.previous ?? 0);
  const result = sales - expenses;
  const prevResult = prevSales - prevExpenses;
  const marginOnSales = sales > 0 ? (result / sales) * 100 : 0;
  const prevMarginOnSales = prevSales > 0 ? (prevResult / prevSales) * 100 : 0;
  const coverage = data.cost_coverage == null ? null : Math.round(Number(data.cost_coverage) * 100);
  const margins = data.margins ?? [];

  const categories = (data.expenses?.by_category ?? []).map((c) => ({
    key: c.category,
    label: c.category,
    sublabel: `· ${c.count} ${Number(c.count) === 1 ? 'gasto' : 'gastos'}`,
    value: Number(c.total),
    valueText: `${money(Number(c.total))} (${pct(Number(c.total), expenses)})`,
  }));

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">Resultado del período</h2>
        <p className="text-sm text-slate-500">
          Ventas cobradas menos los gastos registrados en el mismo período.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiTile
          label="Gastos"
          value={money(expenses)}
          current={expenses}
          previous={prevExpenses}
          higherIsBetter={false}
        />
        <KpiTile
          label="Resultado (ventas − gastos)"
          value={signedMoney(result)}
          current={result}
          previous={prevResult}
        />
        <KpiTile
          label="Resultado sobre ventas"
          value={sales > 0 ? `${Math.round(marginOnSales)}%` : 'Sin ventas'}
          current={marginOnSales}
          previous={prevMarginOnSales}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <BarList title="Gastos por categoría" items={categories} emptyText="No hay gastos cargados en este período." />

        <section className="rounded-xl border bg-white p-5 space-y-3">
          <h2 className="font-semibold text-slate-800">Margen por producto</h2>
          {margins.length === 0 ? (
            <p className="text-sm text-slate-500">
              Todavía no hay productos vendidos con costo cargado. Cárgalo en Administración › Productos y
              categorías, con el botón “Editar” de cada producto.
            </p>
          ) : (
            <>
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="text-left text-slate-500 border-b">
                      <th className="py-2 font-medium">Producto</th>
                      <th className="py-2 font-medium text-right">Unid.</th>
                      <th className="py-2 font-medium text-right">Ventas</th>
                      <th className="py-2 font-medium text-right">Costo</th>
                      <th className="py-2 font-medium text-right">Ganancia</th>
                      <th className="py-2 font-medium text-right">Margen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {margins.map((m, i) => {
                      const revenue = Number(m.revenue);
                      const margin = Number(m.margin);
                      return (
                        <tr key={`${m.name}-${i}`} className="border-b last:border-0">
                          <td className="py-2 text-slate-800">{m.name}</td>
                          <td className="py-2 text-right tabular-nums">{Number(m.qty)}</td>
                          <td className="py-2 text-right tabular-nums">{money(revenue)}</td>
                          <td className="py-2 text-right tabular-nums">{money(Number(m.cost))}</td>
                          <td className="py-2 text-right tabular-nums">{signedMoney(margin)}</td>
                          <td className="py-2 text-right tabular-nums">
                            {revenue > 0 ? `${Math.round((margin / revenue) * 100)}%` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {coverage != null && (
                <p className="text-xs text-slate-500">
                  {coverage}% de lo vendido tiene costo cargado. El margen usa el costo actual de cada producto.
                </p>
              )}
            </>
          )}
          <p className="text-xs text-slate-500">
            Este margen es informativo y no se resta del resultado, porque las compras de insumos ya figuran en
            los gastos.
          </p>
        </section>
      </div>
    </section>
  );
}
