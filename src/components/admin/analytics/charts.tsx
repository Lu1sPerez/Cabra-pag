'use client';

import { cn } from '@/lib/utils';

// Color de la serie única de cada gráfico y su versión clara para el fondo de las barras
const SERIES = '#2a78d6';

export const money = (n: number) =>
  `$${Math.round(n).toLocaleString('es-AR')}`;

export const compactMoney = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M`;
  if (n >= 1_000) return `$${(n / 1_000).toLocaleString('es-AR', { maximumFractionDigits: 0 })} mil`;
  return money(n);
};

// ---------------------------------------------------------------------------
// Indicador con comparación contra el período anterior

export function KpiTile({
  label,
  value,
  current,
  previous,
  higherIsBetter = true,
}: {
  label: string;
  value: string;
  current: number;
  previous: number;
  higherIsBetter?: boolean | null;
}) {
  let delta: React.ReactNode = <span className="text-slate-400">Sin datos del período anterior</span>;

  if (previous > 0) {
    const pct = ((current - previous) / previous) * 100;
    const rounded = Math.round(pct);
    if (rounded === 0) {
      delta = <span className="text-slate-500">Igual que el período anterior</span>;
    } else {
      const up = rounded > 0;
      const good = higherIsBetter === null ? null : up === higherIsBetter;
      delta = (
        <span
          className={cn(
            'font-medium',
            good === null && 'text-slate-600',
            good === true && 'text-green-700',
            good === false && 'text-red-700'
          )}
        >
          <span aria-hidden="true">{up ? '▲' : '▼'}</span> {up ? '+' : ''}
          {rounded}% vs. período anterior
        </span>
      );
    }
  }

  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
      <p className="mt-1 text-xs">{delta}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Columnas verticales (una serie) con tooltip al pasar el mouse o enfocar

export type ColumnDatum = { key: string; label: string; tooltipTitle: string; value: number; detail?: string };

export function ColumnChart({
  title,
  data,
  labelEvery = 1,
  formatValue = money,
}: {
  title: string;
  data: ColumnDatum[];
  labelEvery?: number;
  formatValue?: (n: number) => string;
}) {
  const max = Math.max(...data.map((d) => d.value), 0);
  const total = data.reduce((acc, d) => acc + d.value, 0);
  const gridValues = max > 0 ? [max, max / 2] : [];

  return (
    <figure className="rounded-xl border bg-white p-5 space-y-3">
      <figcaption className="font-semibold text-slate-800">{title}</figcaption>

      {total === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">No hubo ventas en este período.</p>
      ) : (
        <>
          <div className="flex gap-2">
            {/* Eje Y */}
            <div className="relative w-14 shrink-0 h-48 text-[11px] text-slate-500 tabular-nums" aria-hidden="true">
              {gridValues.map((v) => (
                <span key={v} className="absolute right-0 -translate-y-1/2" style={{ top: `${100 - (v / max) * 100}%` }}>
                  {compactMoney(v)}
                </span>
              ))}
              <span className="absolute right-0 bottom-0 translate-y-1/2">$0</span>
            </div>

            <div className="relative flex-1 h-48">
              {/* Grilla */}
              {gridValues.map((v) => (
                <div
                  key={v}
                  className="absolute inset-x-0 border-t border-slate-100"
                  style={{ top: `${100 - (v / max) * 100}%` }}
                  aria-hidden="true"
                />
              ))}
              <div className="absolute inset-x-0 bottom-0 border-t border-slate-300" aria-hidden="true" />

              <ul className="relative flex h-full items-end gap-[2px]">
                {data.map((d) => (
                  <li key={d.key} className="group relative flex h-full flex-1 items-end justify-center">
                    <button
                      type="button"
                      aria-label={`${d.tooltipTitle}: ${formatValue(d.value)}${d.detail ? `, ${d.detail}` : ''}`}
                      className="flex h-full w-full items-end justify-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <span
                        className="w-full max-w-[28px] rounded-t transition-opacity group-hover:opacity-80"
                        style={{
                          height: d.value > 0 ? `max(${(d.value / max) * 100}%, 2px)` : 0,
                          backgroundColor: SERIES,
                        }}
                      />
                    </button>

                    {/* Tooltip */}
                    <div
                      role="presentation"
                      className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow-lg group-hover:block group-focus-within:block"
                    >
                      <p className="font-semibold">{d.tooltipTitle}</p>
                      <p className="tabular-nums">{formatValue(d.value)}</p>
                      {d.detail && <p className="text-slate-300">{d.detail}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Eje X */}
          <div className="flex gap-2" aria-hidden="true">
            <div className="w-14 shrink-0" />
            <div className="flex flex-1 gap-[2px] text-[11px] text-slate-500">
              {data.map((d, i) => (
                <span key={d.key} className="flex-1 text-center truncate">
                  {i % labelEvery === 0 ? d.label : ''}
                </span>
              ))}
            </div>
          </div>

          <details className="text-sm">
            <summary className="cursor-pointer text-slate-500 hover:text-slate-800">Ver datos en tabla</summary>
            <div className="mt-2 max-h-64 overflow-y-auto">
              <table className="w-full">
                <tbody>
                  {data.map((d) => (
                    <tr key={d.key} className="border-b last:border-0">
                      <td className="py-1 text-slate-700">{d.tooltipTitle}</td>
                      <td className="py-1 text-right tabular-nums">{formatValue(d.value)}</td>
                      <td className="py-1 pl-3 text-right text-slate-500">{d.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Barras horizontales con etiqueta y valor (para rankings y repartos)

export function BarList({
  title,
  items,
  emptyText = 'Sin datos en este período.',
}: {
  title: string;
  items: { key: string; label: string; sublabel?: string; value: number; valueText: string }[];
  emptyText?: string;
}) {
  const max = Math.max(...items.map((i) => i.value), 0);

  return (
    <section className="rounded-xl border bg-white p-5 space-y-4">
      <h2 className="font-semibold text-slate-800">{title}</h2>
      {items.length === 0 || max === 0 ? (
        <p className="text-sm text-slate-500">{emptyText}</p>
      ) : (
        <ul className="space-y-3">
          {items.map((i) => (
            <li key={i.key} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-slate-800">
                  {i.label}
                  {i.sublabel && <span className="ml-1 text-slate-500">{i.sublabel}</span>}
                </span>
                <span className="shrink-0 font-medium text-slate-900 tabular-nums">{i.valueText}</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100" aria-hidden="true">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(i.value / max) * 100}%`, backgroundColor: SERIES }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
