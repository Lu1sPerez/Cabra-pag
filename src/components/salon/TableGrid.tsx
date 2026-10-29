'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/browser';
import { useRealTimeTables } from '@/hooks/UseRealTimeTables';
import { useAuth } from '@/components/auth/AuthProvider';
import { getOpenOrdersSummary, type OpenOrderSummary } from '@/actions/order-actions';
import { CANVAS_GRID_STYLE, STATUS_LABELS, tableStyle, type FloorTable, type TableStatus } from '@/lib/floor';

const STYLES: Record<TableStatus, string> = {
  free: 'bg-[#E3E9DF] border-[#8FA58B] text-[#2F4732] hover:bg-[#D9E2D4]',
  occupied: 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700',
  paying: 'bg-[#F2C14E] border-[#D9A62E] text-[#2B2108] hover:bg-[#EDB937]',
};

const SWATCH: Record<TableStatus, string> = {
  occupied: 'bg-blue-600',
  paying: 'bg-[#F2C14E]',
  free: 'bg-[#E3E9DF] border-2 border-[#8FA58B]',
};

const ORDER: TableStatus[] = ['occupied', 'paying', 'free'];

const money = (n: number) => `$ ${Math.round(n).toLocaleString('es-AR')}`;

function elapsed(fromIso: string, now: number) {
  const min = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 60000));
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}

export default function TableGrid() {
  const { zones, loading, error, connected } = useRealTimeTables();
  const { role } = useAuth();
  const isAdmin = role === 'admin';

  const [orders, setOrders] = useState<Map<string, OpenOrderSummary>>(new Map());
  const [cobrado, setCobrado] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [pulsing, setPulsing] = useState<Set<string>>(new Set());
  const prevStatus = useRef<Map<string, TableStatus> | null>(null);

  // Consumo de las mesas abiertas y lo cobrado hoy
  const loadLive = useCallback(async () => {
    try {
      const list = await getOpenOrdersSummary();
      setOrders(new Map(list.filter((o) => o.table_id).map((o) => [o.table_id, o])));
      if (isAdmin) {
        const supabase = createClient();
        const { data } = await supabase.rpc('get_live_status', {
          p_tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
        setCobrado(data?.cobrado_hoy?.total != null ? Number(data.cobrado_hoy.total) : null);
      }
    } catch (e) {
      console.error(e);
    }
  }, [isAdmin]);

  useEffect(() => {
    loadLive();
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel(`salon-orders-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(loadLive, 400);
      })
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [loadLive]);

  // Reloj y minutos
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  // Mesas que cambiaron de estado desde otra pantalla: laten un momento
  useEffect(() => {
    const current = new Map<string, TableStatus>();
    for (const z of zones) for (const t of z.tables) current.set(t.id, t.status);
    const prev = prevStatus.current;
    prevStatus.current = current;
    if (!prev) return;
    const changed = Array.from(current).filter(([id, st]) => prev.has(id) && prev.get(id) !== st).map(([id]) => id);
    if (changed.length === 0) return;
    setPulsing(new Set(changed));
    loadLive();
    const id = setTimeout(() => setPulsing(new Set()), 3300);
    return () => clearTimeout(id);
  }, [zones, loadLive]);

  const counts = useMemo(() => {
    const c: Record<TableStatus, number> = { free: 0, occupied: 0, paying: 0 };
    for (const z of zones) for (const t of z.tables) c[t.status] = (c[t.status] ?? 0) + 1;
    return c;
  }, [zones]);

  const openTotal = Array.from(orders.values()).reduce((acc, o) => acc + o.total, 0);
  const today = new Date(now);

  if (loading) return <div className="p-6 text-slate-500">Cargando salón…</div>;
  if (error) return <div className="p-6 text-red-700">{error}</div>;

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 w-full max-w-[1400px] mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-500">
            {today.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-slate-900 leading-none">Salón</h1>
        </div>
        <div className="flex gap-3">
          {isAdmin && cobrado != null && (
            <div className="rounded-2xl border bg-white px-4 py-2 text-right">
              <p className="text-xs font-semibold text-slate-500">Cobrado hoy</p>
              <p className="font-display text-2xl font-bold text-slate-900 tabular-nums">{money(cobrado)}</p>
            </div>
          )}
          <div className="rounded-2xl border bg-white px-4 py-2 text-right">
            <p className="text-xs font-semibold text-slate-500">Hora</p>
            <p className="font-display text-2xl font-bold text-slate-900 tabular-nums">
              {today.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-2">
          {ORDER.map((s) => (
            <li key={s} className="flex items-center gap-2 rounded-full border bg-white px-3 py-1.5 text-sm font-semibold">
              <span className={cn('h-3 w-3 rounded', SWATCH[s])} />
              {STATUS_LABELS[s]} · {counts[s]}
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-3">
          {!connected && (
            <span className="rounded-full border border-[#D9A62E] bg-[#FBEFCF] px-3 py-1 text-xs font-semibold text-[#3A2A05]">
              Reconectando…
            </span>
          )}
          {orders.size > 0 && (
            <span className="text-sm text-slate-600">
              Consumo abierto <strong className="text-slate-900 tabular-nums">{money(openTotal)}</strong>
            </span>
          )}
        </div>
      </div>

      {zones.length === 0 ? (
        <p className="text-slate-600">
          No hay zonas cargadas. Créalas en{' '}
          <Link href="/admin/plano" className="underline">
            Plano
          </Link>
          .
        </p>
      ) : (
        zones.map((zone) => (
          <section key={zone.id} className="space-y-2">
            {zones.length > 1 && <h2 className="font-display text-xl font-bold text-slate-900">{zone.name}</h2>}
            <div className="overflow-x-auto rounded-3xl border bg-white">
              <div className="relative w-full min-w-[640px] aspect-[5/3]" style={CANVAS_GRID_STYLE}>
                {zone.tables.length === 0 && (
                  <p className="absolute inset-0 flex items-center justify-center text-slate-400">Sin mesas en esta zona.</p>
                )}
                {zone.tables.map((table) => (
                  <TableTile
                    key={table.id}
                    table={table}
                    order={orders.get(table.id)}
                    now={now}
                    pulse={pulsing.has(table.id)}
                  />
                ))}
              </div>
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function TableTile({
  table,
  order,
  now,
  pulse,
}: {
  table: FloorTable;
  order?: OpenOrderSummary;
  now: number;
  pulse: boolean;
}) {
  const round = table.shape === 'round';
  const status: TableStatus = (STYLES[table.status] ? table.status : 'free') as TableStatus;
  const time = order ? elapsed(order.created_at, now) : '';

  const label =
    status === 'free'
      ? `${table.name}, libre${table.capacity ? `, ${table.capacity} personas` : ''}`
      : `${table.name}, ${status === 'paying' ? 'pidió la cuenta' : 'ocupada'}${time ? ` hace ${time}` : ''}${
          order ? `, consumo ${money(order.total)}` : ''
        }`;

  return (
    <Link
      href={`/salon/${table.id}`}
      aria-label={label}
      style={tableStyle(table)}
      className={cn(
        'absolute flex flex-col border-2 p-1.5 sm:p-2 transition-colors duration-300 overflow-hidden',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2',
        round ? 'rounded-full items-center justify-center text-center' : 'rounded-2xl justify-between',
        STYLES[status],
        pulse && 'mesa-pulso'
      )}
    >
      <span className={cn('flex w-full items-baseline gap-1', round ? 'justify-center' : 'justify-between')}>
        <span className="font-display text-sm sm:text-base lg:text-lg font-bold leading-tight truncate">{table.name}</span>
        {!round && time && <span className="text-[10px] sm:text-xs font-bold opacity-90 shrink-0">{time}</span>}
      </span>
      <span className="flex flex-col leading-tight">
        {status === 'free' ? (
          <span className="text-[10px] sm:text-xs font-semibold">Libre{table.capacity ? ` · ${table.capacity}` : ''}</span>
        ) : (
          <>
            <span className="text-[10px] sm:text-xs font-semibold opacity-90">
              {status === 'paying' ? 'Cuenta' : round && time ? time : 'Ocupada'}
            </span>
            {order && (
              <span className="font-display text-xs sm:text-sm lg:text-base font-bold tabular-nums">{money(order.total)}</span>
            )}
          </>
        )}
      </span>
    </Link>
  );
}
