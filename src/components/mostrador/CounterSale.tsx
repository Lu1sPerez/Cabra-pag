'use client';

// Mostrador: venta rápida para llevar, sin mesa.
// Se cobra en el momento o se guarda abierta (aparece arriba, en "Abiertos") para cobrarla después.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Ban, Plus, Save, ShoppingBag } from 'lucide-react';
import { cn } from '@/lib/utils';
import PaymentPanel from '@/components/salon/PaymentPanel';
import { CartLines, MenuBoard, elapsed, money, useCart, useMenu } from '@/components/salon/MenuBoard';
import { Feedback, SentItems } from '@/components/salon/OrderMenu';
import { useAuth } from '@/components/auth/AuthProvider';
import { isStaffSessionError, useStaff } from '@/components/auth/StaffProvider';
import { createClient } from '@/lib/supabase/browser';
import { useResync } from '@/hooks/useResync';
import type { Product } from '@/actions/order-actions';
import {
  cancelCounterOrder,
  counterLabel,
  getCounterOrder,
  listOpenCounterOrders,
  sendCounterOrder,
  type CounterOrder,
  type CounterSummary,
} from '@/actions/counter-actions';

export default function CounterSale() {
  const { role } = useAuth();
  const { staff, lock } = useStaff();
  const staffToken = staff?.token ?? null;
  const isManager = role === 'admin' || !!staff?.is_manager;

  const menu = useMenu();
  const cart = useCart();
  const [openList, setOpenList] = useState<CounterSummary[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [current, setCurrent] = useState<CounterOrder | null>(null);
  const [customer, setCustomer] = useState('');
  const [working, setWorking] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [, setTick] = useState(0);

  // Evita dobles toques y que un refresco pise el cobro en curso
  const busyRef = useRef(false);
  const payOpenRef = useRef(false);
  const currentIdRef = useRef<string | null>(null);
  useEffect(() => {
    payOpenRef.current = payOpen;
  }, [payOpen]);
  useEffect(() => {
    currentIdRef.current = current?.id ?? null;
  }, [current?.id]);

  const refreshList = useCallback(async () => {
    try {
      setOpenList(await listOpenCounterOrders());
      setListError(null);
    } catch (e) {
      console.error(e);
      setListError('No se pudieron cargar los pedidos abiertos. Revisa la conexión (o que se haya ejecutado mostrador.sql).');
    }
  }, []);

  // El pedido abierto en pantalla, por si otro dispositivo lo cambió o lo cerró
  const refreshCurrent = useCallback(async () => {
    const id = currentIdRef.current;
    if (!id || payOpenRef.current || busyRef.current) return;
    try {
      const o = await getCounterOrder(id);
      if (payOpenRef.current || busyRef.current || currentIdRef.current !== id) return;
      if (o) {
        setCurrent(o);
      } else {
        setCurrent(null);
        setCustomer('');
        setFeedback({ type: 'ok', text: 'Ese pedido se cerró desde otro dispositivo.' });
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const refreshAll = useCallback(() => {
    refreshList();
    refreshCurrent();
  }, [refreshList, refreshCurrent]);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  // Tiempo real (otro mozo guarda o cobra un pedido) y un repaso cada 20 s
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(refreshAll, 300);
    };
    const channel = supabase
      .channel(`mostrador-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: 'channel=eq.mostrador' }, schedule)
      .subscribe();
    const poll = setInterval(() => {
      setTick((n) => n + 1);
      refreshAll();
    }, 20000);
    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [refreshAll]);

  useResync(refreshAll);

  // --- Cálculos ---
  const sentItems = current?.order_items ?? [];
  const sentSubtotal = sentItems.reduce((acc, i) => acc + i.quantity * Number(i.unit_price ?? 0), 0);
  const discount = Number(current?.discount ?? 0);
  const paid = current ? openList.find((o) => o.id === current.id)?.paid ?? 0 : 0;
  const due = Math.max(0, sentSubtotal - discount + cart.total - paid);
  const hasAnything = sentItems.length > 0 || cart.cart.length > 0;

  // --- Acciones ---
  const sessionError = (e: unknown) => {
    if (isStaffSessionError(e)) {
      lock();
      return true;
    }
    return false;
  };

  const run = async (action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setWorking(true);
    setFeedback(null);
    try {
      await action();
    } catch (e: any) {
      console.error(e);
      if (sessionError(e)) return;
      setFeedback({ type: 'error', text: e?.message ?? 'Ocurrió un error inesperado.' });
    } finally {
      busyRef.current = false;
      setWorking(false);
    }
  };

  // Envía lo nuevo (y el nombre) a la base y devuelve el pedido actualizado
  const persist = async () => {
    let orderId = current?.id ?? null;
    const name = customer.trim();
    const nameChanged = !!current && name !== (current.customer_name ?? '');
    if (cart.cart.length > 0 || nameChanged) {
      const r = await sendCounterOrder({ orderId, items: cart.toItems(), customerName: name, staffToken });
      orderId = r.order_id;
      cart.clear();
    }
    if (!orderId) throw new Error('Agrega al menos un producto.');
    const o = await getCounterOrder(orderId);
    if (!o) throw new Error('Ese pedido ya no está abierto.');
    currentIdRef.current = o.id;
    setCurrent(o);
    return o;
  };

  const resetToNew = () => {
    currentIdRef.current = null;
    setCurrent(null);
    setCustomer('');
    cart.clear();
  };

  const confirmDiscard = () => cart.cart.length === 0 || window.confirm('Hay productos sin guardar en esta venta. ¿Descartarlos?');

  const startNew = () => {
    if (!current && cart.cart.length === 0) return;
    if (!confirmDiscard()) return;
    setFeedback(null);
    resetToNew();
  };

  const openExisting = (id: string) => {
    if (current?.id === id || !confirmDiscard()) return;
    run(async () => {
      const o = await getCounterOrder(id);
      if (!o) {
        await refreshList();
        throw new Error('Ese pedido ya no está abierto.');
      }
      cart.clear();
      currentIdRef.current = o.id;
      setCurrent(o);
      setCustomer(o.customer_name ?? '');
    });
  };

  const handlePay = () =>
    run(async () => {
      await persist();
      payOpenRef.current = true;
      setPayOpen(true);
      refreshList();
    });

  const handleSave = () =>
    run(async () => {
      const wasNew = !current;
      const o = await persist();
      await refreshList();
      if (wasNew) {
        resetToNew();
        setFeedback({ type: 'ok', text: `Pedido #${o.ticket_number} guardado. Está arriba, en Abiertos.` });
      } else {
        setFeedback({ type: 'ok', text: 'Agregado al pedido.' });
      }
    });

  const handleCancel = () => {
    if (!current) return;
    if (!window.confirm(`¿Anular el pedido #${current.ticket_number}? Se descartan sus productos.`)) return;
    const n = current.ticket_number;
    run(async () => {
      await cancelCounterOrder(current.id, staffToken);
      resetToNew();
      await refreshList();
      setFeedback({ type: 'ok', text: `Pedido #${n} anulado.` });
    });
  };

  const addToCart = (product: Product) => {
    setFeedback(null);
    cart.add(product);
  };

  if (menu.loading) return <div className="p-6 text-slate-500">Cargando menú…</div>;
  if (menu.error) return <div className="p-6 text-red-700">{menu.error}</div>;

  const badge = current
    ? paid > 0
      ? { label: 'Pagó una parte', className: 'bg-cuenta text-cuenta-fg' }
      : { label: 'Sin cobrar', className: 'bg-blue-600 text-white' }
    : null;

  return (
    <div className="flex flex-col lg:h-[calc(100vh-4rem)] lg:overflow-hidden">
      {/* Pedidos abiertos */}
      <div className="flex h-[64px] shrink-0 items-center gap-2 overflow-x-auto border-b bg-surface px-3 sm:px-4">
        <button
          type="button"
          onClick={startNew}
          aria-pressed={!current}
          className={cn(
            'flex h-11 shrink-0 items-center gap-2 rounded-xl px-3.5 text-sm font-extrabold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
            !current ? 'bg-slate-900 text-slate-50' : 'border bg-surface text-slate-900 hover:bg-slate-100'
          )}
        >
          <Plus size={17} aria-hidden="true" />
          Nueva venta
        </button>
        <span className="mx-1 h-8 w-px shrink-0 bg-slate-200" aria-hidden="true" />
        <span className="shrink-0 text-[11px] font-extrabold tracking-[0.08em] text-slate-500">ABIERTOS · {openList.length}</span>
        {listError ? (
          <span className="shrink-0 text-sm font-semibold text-red-700">{listError}</span>
        ) : openList.length === 0 ? (
          <span className="shrink-0 text-sm text-slate-500">Ninguno. Lo que guardes sin cobrar aparece acá.</span>
        ) : (
          openList.map((o) => {
            const active = current?.id === o.id;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => openExisting(o.id)}
                aria-pressed={active}
                aria-label={`${counterLabel(o)}, ${money(o.total)}${o.paid > 0 ? ', pagó una parte' : ''}`}
                className={cn(
                  'flex h-11 shrink-0 items-center gap-2.5 rounded-xl border pl-2.5 pr-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                  active ? 'border-blue-600 bg-blue-600/10' : 'bg-surface hover:bg-slate-100'
                )}
              >
                <span className="font-display text-lg font-extrabold tabular-nums text-slate-900">#{o.ticket_number}</span>
                <span className="flex flex-col leading-tight">
                  <span className="max-w-[120px] truncate text-[13px] font-bold text-slate-900">{o.customer_name ?? 'Sin nombre'}</span>
                  <span className="text-[11px] font-semibold tabular-nums text-slate-500">
                    {money(o.total)} · {elapsed(o.created_at)}
                  </span>
                </span>
                {o.paid > 0 && <span className="h-2.5 w-2.5 rounded-full bg-cuenta" aria-hidden="true" />}
              </button>
            );
          })
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:overflow-hidden">
        <MenuBoard categories={menu.categories} products={menu.products} quantities={cart.quantities} onAdd={addToCart} />

        {/* Ticket */}
        <aside
          aria-label={current ? `Pedido ${current.ticket_number}` : 'Nueva venta'}
          className="flex w-full shrink-0 flex-col border-t bg-surface lg:w-[380px] lg:border-l lg:border-t-0"
        >
          <header className="flex flex-col gap-1.5 border-b px-5 pb-3.5 pt-4">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold tracking-[0.08em] text-slate-500">
              <ShoppingBag size={13} aria-hidden="true" />
              MOSTRADOR · PARA LLEVAR
            </span>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-3xl font-extrabold leading-none tracking-tight text-slate-900">
                {current ? `#${current.ticket_number}` : 'Nueva venta'}
              </h2>
              {badge && <span className={cn('rounded-md px-2.5 py-1 text-xs font-extrabold', badge.className)}>{badge.label}</span>}
            </div>
            <p className="text-[13px] text-slate-500">
              {current ? `Abierto hace ${elapsed(current.created_at)}` : 'El número se asigna al cobrar o guardar'}
              {staff?.name ? ` · ${staff.name}` : ''}
            </p>
            <label className="mt-2 block">
              <span className="sr-only">Nombre del cliente</span>
              <input
                type="text"
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                maxLength={40}
                placeholder="Nombre del cliente (opcional)"
                className="h-11 w-full rounded-xl border bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
          </header>

          <div className="min-h-0 flex-1 space-y-5 px-5 py-4 lg:overflow-y-auto">
            {sentItems.length > 0 && <SentItems items={sentItems} />}
            <section aria-label="Productos nuevos">
              <p className="text-[11px] font-extrabold tracking-[0.08em] text-blue-600">{current ? 'AGREGAR' : 'PEDIDO'}</p>
              <CartLines cart={cart.cart} onQuantity={cart.changeQuantity} onNotes={cart.changeNotes} />
            </section>
          </div>

          <footer className="space-y-3 border-t px-5 pb-5 pt-3.5">
            {feedback && <Feedback {...feedback} />}

            <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-[13px] text-slate-500">
              {sentItems.length > 0 && (
                <>
                  <dt>Guardado</dt>
                  <dd className="text-right tabular-nums">{money(sentSubtotal)}</dd>
                </>
              )}
              {sentItems.length > 0 && cart.cart.length > 0 && (
                <>
                  <dt>Nuevo</dt>
                  <dd className="text-right tabular-nums">{money(cart.total)}</dd>
                </>
              )}
              {discount > 0 && (
                <>
                  <dt>Descuento</dt>
                  <dd className="text-right tabular-nums">− {money(discount)}</dd>
                </>
              )}
              {paid > 0 && (
                <>
                  <dt>Ya pagó</dt>
                  <dd className="text-right tabular-nums">− {money(paid)}</dd>
                </>
              )}
              <dt className="pt-1.5 text-[15px] font-extrabold text-slate-900">{paid > 0 ? 'Falta cobrar' : 'Total'}</dt>
              <dd className="text-right font-display text-[28px] font-extrabold leading-tight tabular-nums text-slate-900">{money(due)}</dd>
            </dl>

            <button
              type="button"
              onClick={handlePay}
              disabled={!hasAnything || working || due <= 0}
              className="flex h-14 w-full items-center justify-center rounded-xl bg-blue-600 text-base font-extrabold text-white hover:bg-blue-700 disabled:opacity-40"
            >
              {working ? 'Un momento…' : hasAnything ? `Cobrar ${money(due)}` : 'Cobrar'}
            </button>

            <div className={cn('grid gap-2', current && isManager && paid === 0 ? 'grid-cols-2' : 'grid-cols-1')}>
              <button
                type="button"
                onClick={handleSave}
                disabled={working || cart.cart.length === 0}
                className="flex h-12 items-center justify-center gap-1.5 rounded-xl border text-sm font-bold text-slate-900 hover:bg-slate-100 disabled:opacity-40"
              >
                <Save size={16} aria-hidden="true" />
                {current ? 'Agregar al pedido' : 'Guardar sin cobrar'}
              </button>
              {current && isManager && paid === 0 && (
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={working}
                  className="flex h-12 items-center justify-center gap-1.5 rounded-xl border text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-40"
                >
                  <Ban size={16} aria-hidden="true" />
                  Anular pedido
                </button>
              )}
            </div>
          </footer>
        </aside>
      </div>

      {payOpen && current && (
        <PaymentPanel
          tableId={null}
          tableName={counterLabel(current)}
          order={current}
          staffToken={staffToken}
          staffName={staff?.name ?? null}
          doneHint="venta cerrada"
          finishLabel="Nueva venta"
          onClose={() => {
            payOpenRef.current = false;
            setPayOpen(false);
            refreshAll();
          }}
          onFinished={() => {
            payOpenRef.current = false;
            setPayOpen(false);
            resetToNew();
            refreshList();
          }}
          onSessionError={sessionError}
        />
      )}
    </div>
  );
}
