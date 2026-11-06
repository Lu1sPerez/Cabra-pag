'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Receipt, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import PaymentPanel from '@/components/salon/PaymentPanel';
import { CartLines, MenuBoard, elapsed, money, useCart, useMenu } from '@/components/salon/MenuBoard';
import { isStaffSessionError, useStaff } from '@/components/auth/StaffProvider';
import { shareTicket } from '@/lib/ticket';
import { createClient } from '@/lib/supabase/browser';
import { useResync } from '@/hooks/useResync';
import {
  cancelBillRequest,
  getOpenOrder,
  getTable,
  requestBill,
  sendOrder,
  type OpenOrder,
  type Product,
  type TableInfo,
} from '@/actions/order-actions';

// Estado de cada producto enviado (la pantalla de cocina lo irá cambiando)
export const ITEM_STATUS: Record<string, { label: string; className: string } | undefined> = {
  pending: undefined, // recién enviado: no hace falta etiqueta
  preparing: { label: 'Preparando', className: 'bg-cuenta/20 text-warn' },
  ready: { label: 'Listo', className: 'bg-ok-bg text-ok-fg' },
  served: { label: 'Servido', className: 'bg-slate-100 text-slate-500' },
};

export default function OrderMenu({ tableId }: { tableId: string }) {
  const router = useRouter();
  const { staff, lock } = useStaff();
  const staffToken = staff?.token ?? null;

  const menu = useMenu();
  const cart = useCart();
  const [table, setTable] = useState<TableInfo | null>(null);
  const [openOrder, setOpenOrder] = useState<OpenOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [, setTick] = useState(0);

  // Evita que un doble toque envíe la comanda o cobre dos veces
  const busyRef = useRef(false);
  const payOpenRef = useRef(false);
  useEffect(() => {
    payOpenRef.current = payOpen;
  }, [payOpen]);

  const refreshOrder = useCallback(async () => {
    setOpenOrder(await getOpenOrder(tableId));
  }, [tableId]);

  // Mesa y comanda actualizadas (cambios hechos desde otro dispositivo)
  const refreshTableAndOrder = useCallback(async () => {
    // Durante el cobro no se toca: el panel muestra el resultado aunque la mesa ya se haya cerrado
    if (payOpenRef.current || busyRef.current) return;
    try {
      const [t, order] = await Promise.all([getTable(tableId), getOpenOrder(tableId)]);
      if (payOpenRef.current || busyRef.current) return;
      setTable(t);
      setOpenOrder(order);
    } catch (e) {
      console.error(e);
    }
  }, [tableId]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [t, order] = await Promise.all([getTable(tableId), getOpenOrder(tableId)]);
        if (!active) return;
        setTable(t);
        setOpenOrder(order);
      } catch (e) {
        console.error(e);
        if (active) setLoadError('No se pudo cargar el menú o la mesa. Revisa la conexión.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [tableId]);

  // Tiempo real de esta mesa: estado y comanda
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(refreshTableAndOrder, 300);
    };
    let subscribedOnce = false;
    const channel = supabase
      .channel(`mesa-${tableId}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tables', filter: `id=eq.${tableId}` }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `table_id=eq.${tableId}` }, schedule)
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return;
        if (subscribedOnce) schedule();
        subscribedOnce = true;
      });
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [tableId, refreshTableAndOrder]);

  useResync(refreshTableAndOrder);

  // Actualiza los minutos abiertos
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const isPaying = table?.status === 'paying';
  const sentItems = openOrder?.order_items ?? [];
  const hasSentItems = sentItems.length > 0;

  const addToCart = (product: Product) => {
    if (isPaying) return;
    setFeedback(null);
    cart.add(product);
  };

  const sentSubtotal = sentItems.reduce((acc, i) => acc + i.quantity * Number(i.unit_price ?? 0), 0);
  const orderDiscount = Number(openOrder?.discount ?? 0);
  const orderTotal = sentSubtotal - orderDiscount;

  // --- Acciones ---
  const sessionError = (e: unknown) => {
    if (isStaffSessionError(e)) {
      lock();
      return true;
    }
    return false;
  };

  const run = async (action: () => Promise<void>, okText?: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setWorking(true);
    setFeedback(null);
    try {
      await action();
      if (okText) setFeedback({ type: 'ok', text: okText });
    } catch (e: any) {
      console.error(e);
      if (sessionError(e)) return;
      setFeedback({ type: 'error', text: e?.message ?? 'Ocurrió un error inesperado.' });
    } finally {
      busyRef.current = false;
      setWorking(false);
    }
  };

  const handleSend = () =>
    run(async () => {
      if (cart.cart.length === 0) return;
      await sendOrder(tableId, cart.toItems(), staffToken);
      cart.clear();
      setTable((t) => (t && t.status === 'free' ? { ...t, status: 'occupied' } : t));
      await refreshOrder();
    }, 'Comanda enviada.');

  const handleRequestBill = () =>
    run(async () => {
      await requestBill(tableId, staffToken);
      setTable((t) => (t ? { ...t, status: 'paying' } : t));
    }, 'Cuenta pedida. La mesa quedó en "Por pagar".');

  const handleReopen = () =>
    run(async () => {
      await cancelBillRequest(tableId, staffToken);
      setTable((t) => (t ? { ...t, status: 'occupied' } : t));
    }, 'Mesa reabierta.');

  const handlePrecuenta = () => {
    if (!openOrder || !table) return;
    shareTicket({
      kind: 'precuenta',
      orderId: openOrder.id,
      tableName: table.name,
      date: new Date(),
      staffNames: staff?.name ? [staff.name] : [],
      items: sentItems.map((i) => ({ name: i.products?.name ?? 'Producto', qty: i.quantity, unitPrice: Number(i.unit_price ?? 0) })),
      discount: orderDiscount,
      discountReason: openOrder.discount_reason,
      payments: [],
    }).catch((e) => console.error(e));
  };

  if (loading || menu.loading) return <div className="p-6 text-slate-500">Cargando menú…</div>;
  if (loadError || menu.error) return <div className="p-6 text-red-700">{loadError ?? menu.error}</div>;
  if (!table) return <div className="p-6 text-slate-600">Esta mesa no existe. Vuelve al salón y elige otra.</div>;

  const statusBadge = isPaying
    ? { label: 'Cuenta pedida', className: 'bg-cuenta text-cuenta-fg' }
    : openOrder
      ? { label: 'Ocupada', className: 'bg-blue-600 text-white' }
      : { label: 'Libre', className: 'border border-slate-300 text-slate-600' };

  return (
    <div className="flex flex-col lg:h-[calc(100vh-4rem)] lg:flex-row lg:overflow-hidden">
      <MenuBoard
        categories={menu.categories}
        products={menu.products}
        quantities={cart.quantities}
        onAdd={addToCart}
        disabled={isPaying}
        notice={
          isPaying && (
            <p className="rounded-xl bg-cuenta/15 px-4 py-3 text-sm font-semibold text-slate-900">
              La cuenta ya fue pedida. Para agregar productos, reabre la mesa.
            </p>
          )
        }
      />

      {/* Comanda */}
      <aside aria-label={`Comanda de ${table.name}`} className="flex w-full shrink-0 flex-col border-t bg-surface lg:w-[380px] lg:border-l lg:border-t-0">
        <header className="flex flex-col gap-1.5 border-b px-5 pb-3.5 pt-4">
          <Link href="/" className="inline-flex items-center gap-1 self-start text-xs font-bold text-slate-500 hover:text-slate-900">
            <ChevronLeft size={14} aria-hidden="true" />
            Salón
          </Link>
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-3xl font-extrabold leading-none tracking-tight text-slate-900">{table.name}</h2>
            <span className={cn('rounded-md px-2.5 py-1 text-xs font-extrabold', statusBadge.className)}>{statusBadge.label}</span>
          </div>
          <p className="text-[13px] text-slate-500">
            {openOrder ? `Abierta hace ${elapsed(openOrder.created_at)}` : 'Sin pedidos todavía'}
            {staff?.name ? ` · ${staff.name}` : ''}
          </p>
        </header>

        <div className="min-h-0 flex-1 space-y-5 px-5 py-4 lg:overflow-y-auto">
          {hasSentItems && <SentItems items={sentItems} />}

          {!isPaying && (
            <section aria-label="Nuevo pedido">
              <p className="text-[11px] font-extrabold tracking-[0.08em] text-blue-600">NUEVO · SIN ENVIAR</p>
              <CartLines cart={cart.cart} onQuantity={cart.changeQuantity} onNotes={cart.changeNotes} />
            </section>
          )}
        </div>

        <footer className="space-y-3 border-t px-5 pb-5 pt-3.5">
          {feedback && <Feedback {...feedback} />}

          <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-[13px] text-slate-500">
            {hasSentItems && (
              <>
                <dt>Enviado</dt>
                <dd className="text-right tabular-nums">{money(sentSubtotal)}</dd>
              </>
            )}
            {!isPaying && cart.cart.length > 0 && (
              <>
                <dt>Nuevo</dt>
                <dd className="text-right tabular-nums">{money(cart.total)}</dd>
              </>
            )}
            {orderDiscount > 0 && (
              <>
                <dt>Descuento</dt>
                <dd className="text-right tabular-nums">− {money(orderDiscount)}</dd>
              </>
            )}
            <dt className="pt-1.5 text-[15px] font-extrabold text-slate-900">Total</dt>
            <dd className="text-right font-display text-[28px] font-extrabold leading-tight tabular-nums text-slate-900">
              {money(orderTotal + (isPaying ? 0 : cart.total))}
            </dd>
          </dl>

          {isPaying ? (
            <>
              <button
                type="button"
                onClick={() => setPayOpen(true)}
                disabled={working}
                className="flex h-14 w-full items-center justify-center rounded-xl bg-blue-600 text-base font-extrabold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Cobrar {money(orderTotal)}
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleReopen}
                  disabled={working}
                  className="h-12 rounded-xl border text-sm font-bold text-slate-900 hover:bg-slate-100 disabled:opacity-50"
                >
                  Reabrir mesa
                </button>
                <button
                  type="button"
                  onClick={handlePrecuenta}
                  className="flex h-12 items-center justify-center gap-1.5 rounded-xl border text-sm font-bold text-slate-900 hover:bg-slate-100"
                >
                  <Receipt size={16} aria-hidden="true" />
                  Ticket parcial
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleSend}
                disabled={cart.cart.length === 0 || working}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-base font-extrabold text-white hover:bg-blue-700 disabled:opacity-40"
              >
                <Send size={19} aria-hidden="true" />
                {working && cart.cart.length > 0
                  ? 'Enviando…'
                  : cart.cart.length > 0
                    ? `Enviar ${cart.units} a barra y cocina`
                    : 'Enviar comanda'}
              </button>
              {hasSentItems && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleRequestBill}
                    disabled={working || cart.cart.length > 0}
                    title={cart.cart.length > 0 ? 'Envía o quita el nuevo pedido primero' : undefined}
                    className="h-12 rounded-xl border text-sm font-bold text-slate-900 hover:bg-slate-100 disabled:opacity-40"
                  >
                    Pedir cuenta
                  </button>
                  <button
                    type="button"
                    onClick={handlePrecuenta}
                    className="flex h-12 items-center justify-center gap-1.5 rounded-xl border text-sm font-bold text-slate-900 hover:bg-slate-100"
                  >
                    <Receipt size={16} aria-hidden="true" />
                    Ticket parcial
                  </button>
                </div>
              )}
            </>
          )}
        </footer>
      </aside>

      {payOpen && openOrder && (
        <PaymentPanel
          tableId={tableId}
          tableName={table.name}
          order={openOrder}
          staffToken={staffToken}
          staffName={staff?.name ?? null}
          onClose={() => {
            setPayOpen(false);
            refreshOrder().catch(() => {});
          }}
          onFinished={() => router.push('/')}
          onSessionError={sessionError}
        />
      )}
    </div>
  );
}

// --- Piezas que también usa el mostrador ---------------------------------------

export function SentItems({ items }: { items: OpenOrder['order_items'] }) {
  return (
    <section aria-label="Enviado">
      <p className="text-[11px] font-extrabold tracking-[0.08em] text-slate-500">ENVIADO</p>
      <ul className="mt-2 space-y-2.5">
        {items.map((item) => {
          const st = ITEM_STATUS[item.status];
          return (
            <li key={item.id} className="flex justify-between gap-3 text-sm">
              <span className="min-w-0 text-slate-700">
                <strong className="text-slate-900">{item.quantity} ×</strong> {item.products?.name ?? 'Producto'}
                {item.notes && <span className="block text-xs italic text-slate-500">{item.notes}</span>}
                {st && <span className={cn('mt-1 inline-block rounded-md px-2 py-0.5 text-[11px] font-extrabold', st.className)}>{st.label}</span>}
              </span>
              <span className="shrink-0 tabular-nums text-slate-700">{money(item.quantity * Number(item.unit_price ?? 0))}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function Feedback({ type, text }: { type: 'ok' | 'error'; text: string }) {
  return (
    <p
      role={type === 'error' ? 'alert' : 'status'}
      className={cn('rounded-lg px-3 py-2 text-sm font-semibold', type === 'ok' ? 'bg-ok-bg text-ok-fg' : 'bg-red-50 text-red-700')}
    >
      {text}
    </p>
  );
}
