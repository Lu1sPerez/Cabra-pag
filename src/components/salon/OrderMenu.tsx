'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Minus, Plus, Receipt, Search, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import PaymentPanel from '@/components/salon/PaymentPanel';
import { isStaffSessionError, useStaff } from '@/components/auth/StaffProvider';
import { shareTicket } from '@/lib/ticket';
import {
  cancelBillRequest,
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

const ITEM_STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pendiente', className: 'bg-slate-200 text-slate-900' },
  preparing: { label: 'Preparando', className: 'bg-[#F2C14E] text-[#2B2108]' },
  ready: { label: 'Listo', className: 'bg-[#BFD9B9] text-[#1F3A24]' },
  served: { label: 'Servido', className: 'bg-slate-200 text-slate-900' },
};

const money = (n: number) => `$ ${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;

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

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
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

  const refreshOrder = useCallback(async () => {
    setOpenOrder(await getOpenOrder(tableId));
  }, [tableId]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [menu, t, order] = await Promise.all([getMenu(), getTable(tableId), getOpenOrder(tableId)]);
        if (!active) return;
        setCategories(menu.categories);
        setProducts(menu.products);
        setActiveCategory(menu.categories[0]?.id ?? null);
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

  // Actualiza los minutos abiertos
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const isPaying = table?.status === 'paying';
  const sentItems = openOrder?.order_items ?? [];
  const hasSentItems = sentItems.length > 0;

  const visibleProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q) return products.filter((p) => p.name.toLowerCase().includes(q));
    return products.filter((p) => p.category_id === activeCategory);
  }, [products, activeCategory, search]);

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
    if (working) return;
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

  return (
    <div className="flex flex-col lg:flex-row lg:h-screen lg:overflow-hidden">
      {/* Menú */}
      <section className="flex-1 min-w-0 flex flex-col gap-4 p-4 sm:p-6 lg:overflow-hidden">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link href="/" className="inline-flex items-center gap-1 text-sm font-bold text-blue-600 hover:text-slate-900">
              <ChevronLeft size={16} aria-hidden="true" />
              Volver al salón
            </Link>
            <h1 className="font-display text-4xl font-extrabold tracking-tight text-slate-900 leading-none">{table.name}</h1>
          </div>
          <label className="flex h-11 w-full sm:w-64 items-center gap-2 rounded-xl border bg-white px-3">
            <Search size={18} className="text-slate-500" aria-hidden="true" />
            <span className="sr-only">Buscar producto</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar producto"
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>
        </header>

        {isPaying && (
          <p className="rounded-xl border border-[#D9A62E] bg-[#FBEFCF] px-4 py-3 text-sm text-[#3A2A05]">
            La cuenta ya fue pedida. Para agregar productos, reabre la mesa.
          </p>
        )}

        {categories.length === 0 ? (
          <p className="text-slate-600">No hay categorías cargadas. Agrégalas en Menú.</p>
        ) : (
          <div className={cn('flex-1 min-h-0 flex flex-col gap-4', isPaying && 'opacity-50 pointer-events-none')}>
            {!search && (
              <div role="tablist" aria-label="Categorías" className="flex gap-1 overflow-x-auto rounded-2xl bg-slate-100 p-1">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    role="tab"
                    aria-selected={activeCategory === cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={cn(
                      'h-10 shrink-0 rounded-xl px-4 text-sm font-bold transition-colors',
                      activeCategory === cat.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    )}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            )}

            <div className="flex-1 min-h-0 lg:overflow-y-auto pr-1">
              {visibleProducts.length === 0 ? (
                <p className="text-slate-500">{search ? 'Ningún producto coincide.' : 'No hay productos activos en esta categoría.'}</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                  {visibleProducts.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => addToCart(product)}
                      tabIndex={isPaying ? -1 : 0}
                      aria-label={`Agregar ${product.name}, ${money(product.price)}`}
                      className="h-28 rounded-2xl border bg-white p-3.5 text-left flex flex-col justify-between transition-colors hover:border-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <span className="text-[15px] font-bold leading-tight text-slate-900 line-clamp-2">{product.name}</span>
                      <span className="flex w-full items-end justify-between">
                        <span className="font-display text-xl font-bold text-blue-600 tabular-nums">{money(product.price)}</span>
                        <span className="h-8 w-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center" aria-hidden="true">
                          <Plus size={16} strokeWidth={2.6} />
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Comanda como ticket */}
      <aside
        aria-label={`Comanda de ${table.name}`}
        className="w-full lg:w-[372px] shrink-0 bg-slate-900 text-slate-50 flex flex-col p-5 lg:p-6 lg:overflow-hidden"
      >
        <div className="flex items-baseline justify-between gap-2 text-xs font-bold text-blue-200">
          <span>{isPaying ? 'cuenta pedida' : 'comanda'}{openOrder ? ` · ${elapsed(openOrder.created_at)} abierta` : ''}</span>
          {staff?.name && <span>Mozo: {staff.name}</span>}
        </div>
        <h2 className="mt-1 font-display text-3xl font-extrabold">{table.name}</h2>

        <div className="flex-1 min-h-0 lg:overflow-y-auto">
          {hasSentItems && (
            <>
              <hr className="my-4 border-0 border-t-2 border-dashed border-slate-50/25" />
              <p className="text-xs font-bold text-blue-200">En cocina</p>
              <ul className="mt-2 space-y-2.5">
                {sentItems.map((item) => {
                  const st = ITEM_STATUS[item.status] ?? { label: item.status, className: 'bg-slate-200 text-slate-900' };
                  return (
                    <li key={item.id} className="flex justify-between gap-3 text-sm">
                      <span className="min-w-0">
                        <strong>{item.quantity} ×</strong> {item.products?.name ?? 'Producto'}
                        {item.notes && <span className="block text-xs italic text-blue-200">{item.notes}</span>}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold', st.className)}>{st.label}</span>
                        <span className="tabular-nums">{money(item.quantity * Number(item.unit_price ?? 0))}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {!isPaying && (
            <>
              <hr className="my-4 border-0 border-t-2 border-dashed border-slate-50/25" />
              <p className="text-xs font-bold text-blue-200">Nuevo pedido</p>
              {cart.length === 0 ? (
                <p className="mt-2 text-sm text-blue-200">Toca un producto para agregarlo.</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {cart.map((item) => (
                    <div key={item.id} className="rounded-xl bg-slate-50/[0.07] p-3 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[15px] font-bold">{item.name}</span>
                        <span className="text-sm tabular-nums">{money(item.price * item.quantity)}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          aria-label={item.quantity === 1 ? `Quitar ${item.name}` : `Restar ${item.name}`}
                          onClick={() => updateQuantity(item.id, -1)}
                          className="h-10 w-10 rounded-xl border border-slate-50/30 flex items-center justify-center"
                        >
                          {item.quantity === 1 ? <Trash2 size={16} /> : <Minus size={16} />}
                        </button>
                        <span className="w-5 text-center font-display text-lg font-bold">{item.quantity}</span>
                        <button
                          type="button"
                          aria-label={`Sumar ${item.name}`}
                          onClick={() => updateQuantity(item.id, 1)}
                          className="h-10 w-10 rounded-xl border border-slate-50/30 flex items-center justify-center"
                        >
                          <Plus size={16} />
                        </button>
                        <input
                          type="text"
                          value={item.notes}
                          onChange={(e) => updateNotes(item.id, e.target.value)}
                          placeholder="Nota"
                          aria-label={`Nota para ${item.name}`}
                          className="h-10 min-w-0 flex-1 rounded-xl bg-slate-50/10 px-3 text-sm text-slate-50 placeholder:text-blue-200 outline-none focus:ring-2 focus:ring-blue-300"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="pt-3">
          {feedback && (
            <p
              className={cn(
                'mb-3 rounded-lg px-3 py-2 text-sm',
                feedback.type === 'ok' ? 'bg-[#BFD9B9] text-[#1F3A24]' : 'bg-red-100 text-red-800'
              )}
            >
              {feedback.text}
            </p>
          )}

          <hr className="mb-3 border-0 border-t-2 border-dashed border-slate-50/25" />
          {!isPaying && cart.length > 0 && (
            <div className="flex justify-between text-sm text-blue-200">
              <span>Nuevo pedido</span>
              <span className="tabular-nums">{money(cartTotal)}</span>
            </div>
          )}
          {orderDiscount > 0 && (
            <div className="flex justify-between text-sm text-blue-200">
              <span>Descuento</span>
              <span className="tabular-nums">− {money(orderDiscount)}</span>
            </div>
          )}
          <div className="flex items-baseline justify-between">
            <span className="text-[15px] font-bold">Total mesa</span>
            <span className="font-display text-3xl font-extrabold tabular-nums">
              {money(orderTotal + (isPaying ? 0 : cartTotal))}
            </span>
          </div>

          {isPaying ? (
            <div className="mt-3 space-y-2">
              <button
                type="button"
                onClick={() => setPayOpen(true)}
                disabled={working}
                className="h-14 w-full rounded-2xl bg-slate-50 text-lg font-extrabold text-slate-900 disabled:opacity-50"
              >
                Cobrar
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleReopen}
                  disabled={working}
                  className="h-11 rounded-xl border border-slate-50/35 text-sm font-bold disabled:opacity-50"
                >
                  Reabrir mesa
                </button>
                <button
                  type="button"
                  onClick={handlePrecuenta}
                  className="h-11 rounded-xl border border-slate-50/35 text-sm font-bold flex items-center justify-center gap-1.5"
                >
                  <Receipt size={16} aria-hidden="true" />
                  Ticket parcial
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              <button
                type="button"
                onClick={handleSend}
                disabled={cart.length === 0 || working}
                className="h-14 w-full rounded-2xl bg-slate-50 text-lg font-extrabold text-slate-900 flex items-center justify-center gap-2 disabled:opacity-40"
              >
                <Send size={20} aria-hidden="true" />
                {working && cart.length > 0 ? 'Enviando…' : 'Enviar comanda'}
              </button>
              {hasSentItems && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleRequestBill}
                    disabled={working || cart.length > 0}
                    title={cart.length > 0 ? 'Envía o quita el nuevo pedido primero' : undefined}
                    className="h-11 rounded-xl border border-slate-50/35 text-sm font-bold disabled:opacity-40"
                  >
                    Pedir cuenta
                  </button>
                  <button
                    type="button"
                    onClick={handlePrecuenta}
                    className="h-11 rounded-xl border border-slate-50/35 text-sm font-bold flex items-center justify-center gap-1.5"
                  >
                    <Receipt size={16} aria-hidden="true" />
                    Ticket parcial
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
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
