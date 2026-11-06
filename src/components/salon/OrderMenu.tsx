'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Minus, Plus, Receipt, Search, Send, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import PaymentPanel from '@/components/salon/PaymentPanel';
import { isStaffSessionError, useStaff } from '@/components/auth/StaffProvider';
import { shareTicket } from '@/lib/ticket';
import { createClient } from '@/lib/supabase/browser';
import { useResync } from '@/hooks/useResync';
import {
  cancelBillRequest,
  getCachedMenu,
  getMenu,
  getOpenOrder,
  getTable,
  requestBill,
  sendOrder,
  type Category,
  type OpenOrder,
  type Product,
  type TableInfo,
} from '@/actions/order-actions';

type CartItem = Product & { quantity: number; notes: string };

// Estado de cada producto enviado (la pantalla de cocina lo irá cambiando)
const ITEM_STATUS: Record<string, { label: string; className: string } | undefined> = {
  pending: undefined, // recién enviado: no hace falta etiqueta
  preparing: { label: 'Preparando', className: 'bg-cuenta/20 text-warn' },
  ready: { label: 'Listo', className: 'bg-ok-bg text-ok-fg' },
  served: { label: 'Servido', className: 'bg-slate-100 text-slate-500' },
};

// Color de cada categoría según su orden (hasta que se puedan elegir en Productos)
const CATEGORY_COLORS = ['#C99A6E', '#E09AAE', '#DDB86A', '#9CC38F', '#B7A6E8', '#7FC6B8', '#E8A27A', '#8FB4D9'];

const money = (n: number) => `$ ${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;

// Búsqueda sin importar mayúsculas ni tildes ("cafe" encuentra "Café")
const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

function elapsed(fromIso: string | undefined) {
  if (!fromIso) return '';
  const min = Math.max(0, Math.floor((Date.now() - new Date(fromIso).getTime()) / 60000));
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}

export default function OrderMenu({ tableId }: { tableId: string }) {
  const router = useRouter();
  const { staff, lock } = useStaff();
  const staffToken = staff?.token ?? null;

  const [categories, setCategories] = useState<Category[]>(() => getCachedMenu()?.categories ?? []);
  const [products, setProducts] = useState<Product[]>(() => getCachedMenu()?.products ?? []);
  const [activeCategory, setActiveCategory] = useState<string | null>(() => getCachedMenu()?.categories[0]?.id ?? null);
  const [search, setSearch] = useState('');
  const [table, setTable] = useState<TableInfo | null>(null);
  const [openOrder, setOpenOrder] = useState<OpenOrder | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
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
    const cached = getCachedMenu();

    // El menú se pide siempre (por si cambió un precio); si ya estaba en memoria, la mesa no lo espera
    const menuPromise = getMenu().then((menu) => {
      if (!active) return;
      setCategories(menu.categories);
      setProducts(menu.products);
      setActiveCategory((current) =>
        current && menu.categories.some((c) => c.id === current) ? current : menu.categories[0]?.id ?? null
      );
    });

    (async () => {
      try {
        const [t, order] = await Promise.all([
          getTable(tableId),
          getOpenOrder(tableId),
          cached ? Promise.resolve() : menuPromise,
        ]);
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

    if (cached) menuPromise.catch((e) => console.error(e));

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

  const visibleProducts = useMemo(() => {
    const q = normalize(search.trim());
    if (q) return products.filter((p) => normalize(p.name).includes(q));
    return products.filter((p) => p.category_id === activeCategory);
  }, [products, activeCategory, search]);

  const categoryColor = useMemo(
    () => new Map(categories.map((c, i) => [c.id, CATEGORY_COLORS[i % CATEGORY_COLORS.length]])),
    [categories]
  );
  const categoryCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products) m.set(p.category_id, (m.get(p.category_id) ?? 0) + 1);
    return m;
  }, [products]);
  const inCart = useMemo(() => new Map(cart.map((i) => [i.id, i.quantity])), [cart]);
  const activeCat = categories.find((c) => c.id === activeCategory) ?? null;

  // --- Carrito ---
  const addToCart = (product: Product) => {
    if (isPaying) return;
    setFeedback(null);
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) return prev.map((item) => (item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item));
      return [...prev, { ...product, quantity: 1, notes: '' }];
    });
  };

  const updateQuantity = (id: string, delta: number) =>
    setCart((prev) =>
      prev
        .map((item) => (item.id === id ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item))
        .filter((item) => item.quantity > 0)
    );

  const updateNotes = (id: string, notes: string) =>
    setCart((prev) => prev.map((item) => (item.id === id ? { ...item, notes } : item)));

  const cartTotal = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
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
      if (cart.length === 0) return;
      await sendOrder(
        tableId,
        cart.map((item) => ({ product_id: item.id, quantity: item.quantity, notes: item.notes.trim() || null })),
        staffToken
      );
      setCart([]);
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

  if (loading) return <div className="p-6 text-slate-500">Cargando menú…</div>;
  if (loadError) return <div className="p-6 text-red-700">{loadError}</div>;
  if (!table) return <div className="p-6 text-slate-600">Esta mesa no existe. Vuelve al salón y elige otra.</div>;

  const statusBadge = isPaying
    ? { label: 'Cuenta pedida', className: 'bg-cuenta text-cuenta-fg' }
    : openOrder
      ? { label: 'Ocupada', className: 'bg-blue-600 text-white' }
      : { label: 'Libre', className: 'border border-slate-300 text-slate-600' };

  return (
    <div className="flex flex-col lg:h-[calc(100vh-4rem)] lg:flex-row lg:overflow-hidden">
      {/* Categorías */}
      <nav
        aria-label="Categorías"
        className={cn(
          'shrink-0 border-b bg-surface lg:w-[200px] lg:overflow-y-auto lg:border-b-0 lg:border-r',
          isPaying && 'pointer-events-none opacity-50'
        )}
      >
        {categories.length === 0 ? (
          <p className="p-4 text-sm text-slate-600">No hay categorías con productos activos.</p>
        ) : (
          <ul className="flex gap-1 overflow-x-auto p-2 lg:flex-col lg:p-3">
            {categories.map((cat) => {
              const selected = !search && activeCategory === cat.id;
              return (
                <li key={cat.id} className="shrink-0">
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setSearch('');
                      setActiveCategory(cat.id);
                    }}
                    className={cn(
                      'flex h-12 w-full items-center gap-2.5 rounded-xl px-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 lg:h-[52px]',
                      selected ? 'bg-slate-100 font-extrabold text-slate-900' : 'font-bold text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    )}
                  >
                    <span className="h-7 w-2 shrink-0 rounded-full" style={{ background: categoryColor.get(cat.id) }} aria-hidden="true" />
                    <span className="flex-1 whitespace-nowrap lg:whitespace-normal lg:leading-tight">{cat.name}</span>
                    <span className="hidden text-xs font-semibold text-slate-500 lg:inline">{categoryCount.get(cat.id) ?? 0}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      {/* Productos */}
      <section aria-label="Productos" className="flex min-w-0 flex-1 flex-col gap-4 p-4 sm:p-5 lg:overflow-hidden">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="flex items-center gap-2.5 font-display text-2xl font-extrabold text-slate-900">
            {search ? (
              'Resultados'
            ) : (
              <>
                <span className="h-3 w-3 rounded-full" style={{ background: activeCat ? categoryColor.get(activeCat.id) : undefined }} aria-hidden="true" />
                {activeCat?.name ?? 'Menú'}
              </>
            )}
          </h1>
          <div className="flex-1" />
          <label className="flex h-11 w-full items-center gap-2 rounded-xl border bg-surface px-3 sm:w-72">
            <Search size={18} className="text-slate-500" aria-hidden="true" />
            <span className="sr-only">Buscar producto</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar producto"
              className="w-full bg-transparent text-sm text-slate-900 outline-none"
            />
          </label>
        </div>

        {isPaying && (
          <p className="rounded-xl bg-cuenta/15 px-4 py-3 text-sm font-semibold text-slate-900">
            La cuenta ya fue pedida. Para agregar productos, reabre la mesa.
          </p>
        )}

        <div className={cn('min-h-0 flex-1 pr-1 lg:overflow-y-auto', isPaying && 'pointer-events-none opacity-50')}>
          {visibleProducts.length === 0 ? (
            <p className="text-slate-500">{search ? 'Ningún producto coincide.' : 'No hay productos activos en esta categoría.'}</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {visibleProducts.map((product) => {
                const qty = inCart.get(product.id) ?? 0;
                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => addToCart(product)}
                    tabIndex={isPaying ? -1 : 0}
                    aria-label={`Agregar ${product.name}, ${money(product.price)}${qty ? `, ${qty} en el pedido` : ''}`}
                    className={cn(
                      'relative flex h-[124px] flex-col justify-between overflow-hidden rounded-xl border bg-surface p-3.5 pt-4 text-left transition-colors hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                      qty > 0 && 'border-blue-600 hover:border-blue-600'
                    )}
                  >
                    <span className="absolute inset-x-0 top-0 h-1" style={{ background: categoryColor.get(product.category_id) }} aria-hidden="true" />
                    <span className="line-clamp-2 text-[15px] font-bold leading-tight text-slate-900">{product.name}</span>
                    <span className="flex w-full items-end justify-between">
                      <span className="font-display text-lg font-bold tabular-nums text-slate-900">{money(product.price)}</span>
                      {qty > 0 ? (
                        <span className="flex h-8 min-w-[2rem] items-center justify-center rounded-lg bg-blue-600 px-2 text-sm font-extrabold text-white" aria-hidden="true">
                          {qty}
                        </span>
                      ) : (
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-900" aria-hidden="true">
                          <Plus size={16} strokeWidth={2.6} />
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

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
          {hasSentItems && (
            <section aria-label="Enviado">
              <p className="text-[11px] font-extrabold tracking-[0.08em] text-slate-500">ENVIADO</p>
              <ul className="mt-2 space-y-2.5">
                {sentItems.map((item) => {
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
          )}

          {!isPaying && (
            <section aria-label="Nuevo pedido">
              <p className="text-[11px] font-extrabold tracking-[0.08em] text-blue-600">NUEVO · SIN ENVIAR</p>
              {cart.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">Toca un producto para agregarlo.</p>
              ) : (
                <ul className="mt-2 space-y-3">
                  {cart.map((item) => (
                    <li key={item.id} className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[15px] font-extrabold text-slate-900">{item.name}</span>
                        <span className="text-sm font-bold tabular-nums text-slate-900">{money(item.price * item.quantity)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          aria-label={item.quantity === 1 ? `Quitar ${item.name}` : `Restar ${item.name}`}
                          onClick={() => updateQuantity(item.id, -1)}
                          className="flex h-10 w-10 items-center justify-center rounded-lg border text-slate-900 hover:bg-slate-100"
                        >
                          {item.quantity === 1 ? <Trash2 size={16} /> : <Minus size={16} />}
                        </button>
                        <span className="w-6 text-center font-display text-lg font-bold text-slate-900">{item.quantity}</span>
                        <button
                          type="button"
                          aria-label={`Sumar ${item.name}`}
                          onClick={() => updateQuantity(item.id, 1)}
                          className="flex h-10 w-10 items-center justify-center rounded-lg border text-slate-900 hover:bg-slate-100"
                        >
                          <Plus size={16} />
                        </button>
                        <input
                          type="text"
                          value={item.notes}
                          onChange={(e) => updateNotes(item.id, e.target.value)}
                          placeholder="Nota (opcional)"
                          aria-label={`Nota para ${item.name}`}
                          className="h-10 min-w-0 flex-1 rounded-lg border bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>

        <footer className="space-y-3 border-t px-5 pb-5 pt-3.5">
          {feedback && (
            <p
              role={feedback.type === 'error' ? 'alert' : 'status'}
              className={cn('rounded-lg px-3 py-2 text-sm font-semibold', feedback.type === 'ok' ? 'bg-ok-bg text-ok-fg' : 'bg-red-50 text-red-700')}
            >
              {feedback.text}
            </p>
          )}

          <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-[13px] text-slate-500">
            {hasSentItems && (
              <>
                <dt>Enviado</dt>
                <dd className="text-right tabular-nums">{money(sentSubtotal)}</dd>
              </>
            )}
            {!isPaying && cart.length > 0 && (
              <>
                <dt>Nuevo</dt>
                <dd className="text-right tabular-nums">{money(cartTotal)}</dd>
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
              {money(orderTotal + (isPaying ? 0 : cartTotal))}
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
                disabled={cart.length === 0 || working}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-base font-extrabold text-white hover:bg-blue-700 disabled:opacity-40"
              >
                <Send size={19} aria-hidden="true" />
                {working && cart.length > 0
                  ? 'Enviando…'
                  : cart.length > 0
                    ? `Enviar ${cart.reduce((a, i) => a + i.quantity, 0)} a barra y cocina`
                    : 'Enviar comanda'}
              </button>
              {hasSentItems && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleRequestBill}
                    disabled={working || cart.length > 0}
                    title={cart.length > 0 ? 'Envía o quita el nuevo pedido primero' : undefined}
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
