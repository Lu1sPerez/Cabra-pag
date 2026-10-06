'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useRealTimeTables } from '@/hooks/UseRealTimeTables';
import {
  CANVAS_GRID_STYLE,
  STATUS_DOTS,
  STATUS_LABELS,
  STATUS_STYLES,
  tableStyle,
  type TableStatus,
} from '@/lib/floor';

export default function TableGrid() {
  const { zones, loading, error, connected } = useRealTimeTables();

  if (loading) {
    return <div className="p-6 max-w-7xl mx-auto text-slate-500">Cargando salón…</div>;
  }

  if (error) {
    return <div className="p-6 max-w-7xl mx-auto text-red-600">{error}</div>;
  }

  if (zones.length === 0) {
    return (
      <div className="p-6 max-w-7xl mx-auto text-slate-600">
        No hay zonas cargadas. Créalas desde{' '}
        <Link href="/admin/plano" className="underline">
          Administración › Plano del salón
        </Link>
        .
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 p-6 w-full max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Leyenda: el estado no depende solo del color */}
        <ul className="flex flex-wrap gap-4 text-sm text-slate-600">
          {(Object.keys(STATUS_LABELS) as TableStatus[]).map((s) => (
            <li key={s} className="flex items-center gap-2">
              <span className={cn('h-3 w-3 rounded-full', STATUS_DOTS[s])} />
              {STATUS_LABELS[s]}
            </li>
          ))}
        </ul>

        {!connected && (
          <p className="rounded-md border border-yellow-400 bg-yellow-50 px-3 py-1 text-sm text-yellow-900">
            Reconectando… los cambios de otras pantallas pueden tardar en aparecer.
          </p>
        )}
      </div>

      {zones.map((zone) => (
        <section key={zone.id} className="space-y-3">
          <h2 className="text-2xl font-semibold text-slate-800">{zone.name}</h2>

          <div className="overflow-x-auto rounded-xl border bg-white">
            <div
              className="relative w-full min-w-[640px] aspect-[5/3]"
              style={CANVAS_GRID_STYLE}
            >
              {zone.tables.length === 0 && (
                <p className="absolute inset-0 flex items-center justify-center text-slate-400">
                  Sin mesas en esta zona.
                </p>
              )}

              {zone.tables.map((table) => (
                <Link
                  key={table.id}
                  href={`/salon/${table.id}`}
                  aria-label={`Mesa ${table.name}, ${STATUS_LABELS[table.status] ?? 'estado desconocido'}`}
                  style={tableStyle(table)}
                  className={cn(
                    'absolute flex flex-col items-center justify-center border-2 shadow-sm transition-colors duration-300',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2',
                    table.shape === 'round' ? 'rounded-full' : 'rounded-lg',
                    STATUS_STYLES[table.status] ?? 'bg-gray-100 border-gray-500 text-gray-900'
                  )}
                >
                  <span className="font-bold text-base leading-tight">{table.name}</span>
                  <span className="text-[11px] leading-tight opacity-80">
                    {STATUS_LABELS[table.status] ?? 'Desconocido'}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}