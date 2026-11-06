'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, Clock, Receipt, UtensilsCrossed } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/browser';
import { useRealTimeTables } from '@/hooks/UseRealTimeTables';
import { useAuth } from '@/components/auth/AuthProvider';
import { getCachedMenu, getMenu, getOpenOrdersSummary, type OpenOrderSummary } from '@/actions/order-actions';
import { listActiveStaff } from '@/actions/staff-actions';
import { useResync } from '@/hooks/useResync';
import { tableStyle, type FloorTable, type TableStatus } from '@/lib/floor';

// Puntos del plano (siguen el tema)
const FLOOR_DOTS = { backgroundImage: 'radial-gradient(circle, rgb(var(--dot)) 1px, transparent 1px)', backgroundSize: '22px 22px' };

type Metric = 'total' | 'time' | 'staff';

const METRICS: { id: Metric; label: string }[] = [
  { id: 'total', label: 'Total' },
  { id: 'time', label: 'Tiempo' },
  { id: 'staff', label: 'Mozo' },
];

// Colores planos, sin brillo: libre (contorno), ocupada (azul de la marca), cuenta (ámbar)
const STYLES: Record<TableStatus, string> = {
  free: 'bg-surface border-slate-300 text-slate-900 hover:border-slate-500',
  occupied: 'bg-blue-600 border-transparent text-white hover:bg-blue-700',
  paying: 'bg-cuenta border-transparent text-cuenta-fg hover:brightness-95',
};

const LEGEND: { status: TableStatus; label: string; swatch: string }[] = [
  { status: 'free', label: 'Libre', swatch: 'border-[1.5px] border-slate-400 bg-surface' },
  { status: 'occupied', label: 'Ocupada', swatch: 'bg-blue-600' },
  { status: 'paying', label: 'Pidió la cuenta', swatch: 'bg-cuenta' },
];

// Avisos del panel "Ahora"
const NO_ORDER_MIN = 10; // sentados sin pedir nada
const IDLE_MIN = 40; // sin pedir nada nuevo

const money = (n: number) => `$ ${Math.round(n).toLocaleString('es-AR')}`;

const minutesSince = (iso: string | null | undefined, now: number) =>
  iso ? Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000)) : 0;

const fmtMinutes = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`);

type Alert = {
  key: string;
  kind: 'cuenta' | 'sinpedido' | 'demora';
  table: FloorTable;
  title: string;
  detail: string;
  minutes: number;
};

export default function TableGrid() {
  const { zones, loading, error, connected } = useRealTimeTables();
  const { role } = useAuth();
  const isAdmin = role === 'admin';

  const [orders, setOrders] = useState<Map<string, OpenOrderSummary>>(new Map());
  const [staffNames, setStaffNames] = useState<Map<string, string>>(new Map());
  const [cobrado, setCobrado] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>('total');
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

  // Nombres de los mozos, para la inicial de cada mesa
  const loadStaff = useCallback(async () => {
    try {
      const list = await listActiveStaff();
      setStaffNames(new Map(list.map((s) => [s.id, s.name])));
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    loadLive();
    loadStaff();
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let subscribedOnce = false;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(loadLive, 400);
    };
    const channel = supabase
      .channel(`salon-orders-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, schedule)
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return;
        if (subscribedOnce) schedule(); // reconexión: trae lo que cambió durante el corte
        subscribedOnce = true;
      });
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [loadLive, loadStaff]);

  // El iPad se despertó o volvió internet: hora y consumos al día
  const resync = useCallback(() => {
    setNow(Date.now());
    loadLive();
  }, [loadLive]);
  useResync(resync);

  // Deja el menú en memoria para que la primera mesa abra al instante
  useEffect(() => {
    if (!getCachedMenu()) getMenu().catch(() => {});
  }, []);

  // Minutos de cada mesa
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  // Mesas que cambiaron de estado desde otra pantalla: rebotan un momento
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
    const id = setTimeout(() => setPulsing(new Set()), 1600);
    return () => clearTimeout(id);
  }, [zones, loadLive]);

  const allTables = useMemo(() => zones.flatMap((z) => z.tables), [zones]);
  const activeZone = zones.find((z) => z.id === zoneId) ?? zones[0] ?? null;

  const counts = useMemo(() => {
    const c: Record<TableStatus, number> = { free: 0, occupied: 0, paying: 0 };
    for (const t of allTables) c[t.status] = (c[t.status] ?? 0) + 1;
    return c;
  }, [allTables]);

  const openOrders = Array.from(orders.values());
  const openTotal = openOrders.reduce((acc, o) => acc + o.total, 0);
  const avgMinutes = openOrders.length
    ? Math.round(openOrders.reduce((acc, o) => acc + minutesSince(o.created_at, now), 0) / openOrders.length)
    : 0;

  const alerts = useMemo(() => {
    const list: Alert[] = [];
    for (const t of allTables) {
      const o = orders.get(t.id);
      if (t.status === 'paying') {
        list.push({
          key: t.id,
          kind: 'cuenta',
          table: t,
          title: `${t.name} pidió la cuenta`,
          detail: o ? money(o.total) : 'Cuenta pedida',
          minutes: Number.MAX_SAFE_INTEGER,
        });
      } else if (t.status === 'occupied' && o) {
        const open = minutesSince(o.created_at, now);
        const idle = minutesSince(o.last_item_at, now);
        if (o.item_count === 0 && open >= NO_ORDER_MIN) {
          list.push({ key: t.id, kind: 'sinpedido', table: t, title: `${t.name} sin pedido`, detail: `Sentados hace ${fmtMinutes(open)}`, minutes: open });
        } else if (o.item_count > 0 && idle >= IDLE_MIN) {
          list.push({ key: t.id, kind: 'demora', table: t, title: `${t.name} sin pedir hace ${fmtMinutes(idle)}`, detail: `${money(o.total)} · abierta hace ${fmtMinutes(open)}`, minutes: idle });
        }
      }
    }
    return list.sort((a, b) => b.minutes - a.minutes);
  }, [allTables, orders, now]);

  if (loading) return <div className="p-6 text-slate-500">Cargando salón…</div>;
  if (error) return <div className="p-6 text-red-700">{error}</div>;

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 p-4 sm:p-5 lg:min-h-[calc(100vh-4rem)] lg:flex-row lg:gap-5 lg:p-6">
      {/* Plano */}
      <section aria-label="Plano del salón" className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div role="tablist" aria-label="Zonas" className="flex gap-5 border-b">
            {zones.map((z) => {
              const busy = z.tables.filter((t) => t.status !== 'free').length;
              const selected = activeZone?.id === z.id;
              return (
                <button
                  key={z.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setZoneId(z.id)}
                  className={cn(
                    '-mb-px h-11 border-b-2 text-sm font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                    selected ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-900'
                  )}
                >
                  {z.name} <span className="font-bold text-slate-500">{busy}/{z.tables.length}</span>
                </button>
              );
            })}
          </div>

          <div className="flex-1" />

          {!connected && (
            <span className="rounded-lg bg-cuenta px-2.5 py-1 text-xs font-extrabold text-cuenta-fg">Reconectando…</span>
          )}

          <ul className="flex flex-wrap items-center gap-4" aria-label="Referencias">
            {LEGEND.map((l) => (
              <li key={l.status} className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                <span className={cn('h-3.5 w-3.5 rounded', l.swatch)} aria-hidden="true" />
                {l.label} <span className="font-extrabold text-slate-900">{counts[l.status]}</span>
              </li>
            ))}
          </ul>

          <div role="radiogroup" aria-label="Qué mostrar en las mesas" className="flex gap-0.5 rounded-xl border bg-surface p-[3px]">
            {METRICS.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={metric === m.id}
                onClick={() => setMetric(m.id)}
                className={cn(
                  'h-9 rounded-lg px-3 text-xs font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                  metric === m.id ? 'bg-slate-900 text-slate-50' : 'text-slate-500 hover:text-slate-900'
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {!activeZone ? (
          <p className="rounded-2xl border bg-surface p-6 text-slate-600">
            No hay zonas cargadas.{' '}
            {isAdmin && (
              <>
                Créalas en{' '}
                <Link href="/admin/plano" className="font-bold underline">
                  Plano del salón
                </Link>
                .
              </>
            )}
          </p>
        ) : (
          <div className="flex-1 overflow-x-auto rounded-2xl border bg-canvas" style={FLOOR_DOTS}>
            <div className="relative aspect-[5/3] w-full min-w-[640px]">
              {activeZone.tables.length === 0 && (
                <p className="absolute inset-0 flex items-center justify-center text-slate-500">Sin mesas en esta zona.</p>
              )}
              {activeZone.tables.map((table) => (
                <TableTile
                  key={table.id}
                  table={table}
                  order={orders.get(table.id)}
                  staffName={orders.get(table.id)?.opened_by ? staffNames.get(orders.get(table.id)!.opened_by!) ?? null : null}
                  metric={metric}
                  now={now}
                  pulse={pulsing.has(table.id)}
                />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Resumen y avisos */}
      <aside aria-label="Resumen y avisos" className="flex w-full shrink-0 flex-col gap-3 lg:w-[300px]">
        <dl className="grid grid-cols-2 overflow-hidden rounded-2xl border bg-surface">
          <Stat label="Ocupadas" value={`${counts.occupied + counts.paying}/${allTables.length}`} className="border-b border-r" />
          <Stat label="Consumo abierto" value={money(openTotal)} className="border-b" />
          <Stat label="Pidieron la cuenta" value={String(counts.paying)} className="border-r" />
          {isAdmin && cobrado != null ? (
            <Stat label="Cobrado hoy" value={money(cobrado)} />
          ) : (
            <Stat label="Tiempo promedio" value={openOrders.length ? fmtMinutes(avgMinutes) : '—'} />
          )}
        </dl>

        <section aria-labelledby="ahora-titulo" className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-surface">
          <h2 id="ahora-titulo" className="px-4 pb-2.5 pt-3.5 text-xs font-extrabold tracking-[0.06em] text-slate-500">
            AHORA
          </h2>
          {alerts.length === 0 ? (
            <p className="flex items-center gap-3 border-t px-4 py-4 text-sm text-slate-600">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ok-bg text-ok-fg">
                <Check size={18} aria-hidden="true" />
              </span>
              Todo en orden. Acá aparecen las cuentas pedidas y las mesas que esperan.
            </p>
          ) : (
            <ul className="overflow-y-auto">
              {alerts.map((a) => (
                <li key={a.key} className="flex items-center gap-3 border-t px-4 py-3">
                  <span
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                      a.kind === 'cuenta' ? 'bg-cuenta text-cuenta-fg' : 'bg-slate-100 text-slate-900'
                    )}
                  >
                    {a.kind === 'cuenta' ? (
                      <Receipt size={18} aria-hidden="true" />
                    ) : a.kind === 'sinpedido' ? (
                      <UtensilsCrossed size={18} aria-hidden="true" />
                    ) : (
                      <Clock size={18} aria-hidden="true" />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <strong className="text-sm text-slate-900">{a.title}</strong>
                    <span className="text-xs text-slate-500">{a.detail}</span>
                  </span>
                  <Link
                    href={`/salon/${a.table.id}`}
                    className={cn(
                      'flex h-9 shrink-0 items-center rounded-lg px-3 text-[13px] font-extrabold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                      a.kind === 'cuenta' ? 'bg-blue-600 text-white hover:bg-blue-700' : 'border text-slate-900 hover:bg-slate-100'
                    )}
                  >
                    {a.kind === 'cuenta' ? 'Cobrar' : 'Abrir'}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn('px-4 py-3', className)}>
      <dt className="text-[11px] font-bold text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-display text-xl font-extrabold tabular-nums text-slate-900">{value}</dd>
    </div>
  );
}

function TableTile({
  table,
  order,
  staffName,
  metric,
  now,
  pulse,
}: {
  table: FloorTable;
  order?: OpenOrderSummary;
  staffName: string | null;
  metric: Metric;
  now: number;
  pulse: boolean;
}) {
  const round = table.shape === 'round';
  const status: TableStatus = (STYLES[table.status] ? table.status : 'free') as TableStatus;
  const open = order ? minutesSince(order.created_at, now) : 0;
  const idle = order ? minutesSince(order.last_item_at, now) : 0;
  const empty = !!order && order.item_count === 0;
  const initial = staffName?.trim()[0]?.toUpperCase() ?? null;

  // Aviso de demora (solo mesas ocupadas, no las que pidieron la cuenta)
  const warn =
    status === 'occupied' && order
      ? empty && open >= NO_ORDER_MIN
        ? `Sin pedido · ${fmtMinutes(open)}`
        : !empty && idle >= IDLE_MIN
          ? `Sin pedir · ${fmtMinutes(idle)}`
          : null
      : null;

  const value =
    status === 'free'
      ? table.capacity
        ? `${table.capacity} ${table.capacity === 1 ? 'lugar' : 'lugares'}`
        : 'Libre'
      : metric === 'time'
        ? order
          ? fmtMinutes(open)
          : '—'
        : metric === 'staff'
          ? staffName ?? (order ? 'Admin' : '—')
          : empty
            ? 'Sin pedido'
            : order
              ? money(order.total)
              : '—';

  const label =
    status === 'free'
      ? `${table.name}, libre${table.capacity ? `, ${table.capacity} lugares` : ''}`
      : `${table.name}, ${status === 'paying' ? 'pidió la cuenta' : 'ocupada'}${order ? `, ${money(order.total)}, hace ${fmtMinutes(open)}` : ''}${
          staffName ? `, atiende ${staffName}` : ''
        }${warn ? `, ${warn}` : ''}`;

  const bigValue = status !== 'free' && metric === 'total' && !empty;

  return (
    <Link
      href={`/salon/${table.id}`}
      aria-label={label}
      style={tableStyle(table)}
      className={cn(
        'absolute flex flex-col overflow-hidden border-[1.5px] p-1.5 transition-colors duration-200 sm:p-2 lg:p-2.5',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
        round ? 'items-center justify-center rounded-full text-center' : 'justify-between rounded-xl',
        STYLES[status],
        pulse && 'mesa-pulso'
      )}
    >
      <span className={cn('flex w-full items-center gap-1', round ? 'justify-center' : 'justify-between')}>
        <span className="truncate font-display text-sm font-extrabold leading-tight sm:text-base lg:text-xl">{table.name}</span>
        {!round && status === 'paying' && <span className="shrink-0 text-[9px] font-extrabold tracking-wide sm:text-[10px]">CUENTA</span>}
        {!round && status === 'occupied' && initial && (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20 text-[10px] font-extrabold lg:h-6 lg:w-6 lg:text-xs" aria-hidden="true">
            {initial}
          </span>
        )}
      </span>

      <span className={cn('flex w-full flex-col leading-tight', round ? 'items-center' : 'items-start')}>
        <span
          className={cn(
            'truncate',
            bigValue
              ? cn('font-display font-bold tabular-nums', round ? 'text-[11px] sm:text-xs lg:text-base' : 'text-xs sm:text-sm lg:text-lg')
              : 'text-[10px] font-semibold sm:text-xs',
            status === 'free' && 'text-slate-500'
          )}
        >
          {value}
        </span>
        {!round && warn && (
          <span className="mt-1 max-w-full truncate rounded-md bg-[#FFFFFF] px-1.5 py-0.5 text-[9px] font-extrabold text-[#8A2E1E] sm:text-[10px]">
            {warn}
          </span>
        )}
      </span>
    </Link>
  );
}
