'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Minus, Send, Trash2, Receipt } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import PaymentPanel from '@/components/salon/PaymentPanel';
import { isStaffSessionError, useStaff } from '@/components/auth/StaffProvider';
import {
  cancelBillRequest,
  getMenu,
  getOpenOrder,
  getTable,
  payOrder,
  requestBill,
  sendOrder,
  type Category,
  type OpenOrder,
  type PaymentMethod,
  type Product,
  type TableInfo,
} from '@/actions/order-actions';

type CartItem = Product & { quantity: number; notes: string };

const ITEM_STATUS: Record<string, string> = {
  pending: 'Pendiente',
  preparing: 'Preparando',
  ready: 'Listo',
  served: 'Servido',
};

const money = (n: number) => `$${n.toLocaleString('es-AR')}`;

export default function OrderMenu({ tableId }: { tableId: string }) {
  const router = useRouter();
  const { staff, lock } = useStaff();
  const staffToken = staff?.token ?? null;

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [table, setTable] = useState<TableInfo | null>(null);
  const [openOrder, setOpenOrder] = useState<OpenOrder | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const refreshOrder = useCallback(async () => {
    setOpenOrder(await getOpenOrder(tableId));
  }, [tableId]);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const [menu, t, order] = await Promise.all([
          getMenu(),
          getTable(tableId),
          getOpenOrder(tableId),
        ]);
        if (!active) return;
        setCategories(menu.categories);
        setProducts(menu.products);
        setActiveCategory(menu.categories[0]?.id ?? null);
        setTable(t);
        setOpenOrder(order);
      } catch (e) {
        console.error(e);
        if (active) {
          setLoadError(
            'No se pudo cargar el menú o la mesa. Revisa las políticas de lectura de categories, products, orders y order_items.'
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [tableId]);

  const isPaying = table?.status === 'paying';
  const hasSentItems = (openOrder?.order_items.length ?? 0) > 0;

  const filteredProducts = useMemo(
    () => products.filter((p) => p.category_id === activeCategory),
    [products, activeCategory]
  );

  // --- Carrito ---
  const addToCart = (product: Product) => {
    if (isPaying) return;
    setFeedback(null);
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { ...product, quantity: 1, notes: '' }];
    });
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.id === id ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const updateNotes = (id: string, notes: string) => {
    setCart((prev) => prev.map((item) => (item.id === id ? { ...item, notes } : item)));
  };

  const cartTotal = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const orderTotal = Number(openOrder?.total ?? 0);

  // --- Acciones ---
  const run = async (action: () => Promise<void>, okText?: string) => {
    if (working) return;
    setWorking(true);
    setFeedback(null);
    try {
      await action();
      if (okText) setFeedback({ type: 'ok', text: okText });
    } catch (e: any) {
      console.error(e);
      if (isStaffSessionError(e)) return lock();
      setFeedback({ type: 'error', text: e?.message ?? 'Ocurrió un error inesperado.' });
    } finally {
      setWorking(false);
    }
  };

  const handleSendToKitchen = () =>
    run(async () => {
      if (cart.length === 0) return;
      await sendOrder(
        tableId,
        cart.map((item) => ({
          product_id: item.id,
          quantity: item.quantity,
          notes: item.notes.trim() || null,
        })),
        staffToken
      );
      setCart([]);
      setTable((t) => (t && t.status === 'free' ? { ...t, status: 'occupied' } : t));
      await refreshOrder();
    }, 'Comanda enviada a cocina.');

  const handleRequestBill = () =>
    run(async () => {
      await requestBill(tableId, staffToken);
      setTable((t) => (t ? { ...t, status: 'paying' } : t));
    }, 'Cuenta pedida. La mesa quedó en "Por pagar".');

  const handleCancelBill = () =>
    run(async () => {
      await cancelBillRequest(tableId, staffToken);
      setTable((t) => (t ? { ...t, status: 'occupied' } : t));
    }, 'Mesa reabierta. Ya puedes agregar productos.');

  const handlePay = async (method: PaymentMethod) => {
    setWorking(true);
    setPayError(null);
    try {
      await payOrder(tableId, method, staffToken);
      router.push('/');
    } catch (e: any) {
      console.error(e);
      if (isStaffSessionError(e)) return lock();
      setPayError(e?.message ?? 'No se pudo registrar el cobro.');
      setWorking(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-slate-500">Cargando menú…</div>;
  }

  if (loadError) {
    return <div className="p-6 text-red-600">{loadError}</div>;
  }

  if (!table) {
    return <div className="p-6 text-slate-600">Esta mesa no existe. Vuelve al salón y elige otra.</div>;
  }

  return (
    <div className="flex flex-col lg:flex-row lg:h-[calc(100vh-4rem)] bg-slate-50 lg:overflow-hidden">
      {/* Catálogo */}
      <div className="flex-1 flex flex-col p-4 lg:overflow-hidden">
        {isPaying && (
          <div className="mb-4 rounded-lg border border-yellow-400 bg-yellow-50 px-4 py-3 text-sm text-yellow-900">
            La cuenta ya fue pedida. Para agregar productos, reabre la mesa.
          </div>
        )}

        {categories.length === 0 ? (
          <p className="text-slate-600">
            No hay categorías cargadas. Agrega categorías y productos en Supabase.
          </p>
        ) : (
          <div className={cn('flex-1 flex flex-col lg:overflow-hidden', isPaying && 'opacity-50 pointer-events-none')}>
            <div className="flex gap-2 overflow-x-auto pb-4">
              {categories.map((cat) => (
                <Button
                  key={cat.id}
                  variant={activeCategory === cat.id ? 'default' : 'outline'}
                  onClick={() => setActiveCategory(cat.id)}
                  className="rounded-full px-6"
                >
                  {cat.name}
                </Button>
              ))}
            </div>

            <div className="flex-1 lg:overflow-y-auto pr-2">
              {filteredProducts.length === 0 ? (
                <p className="text-slate-500">No hay productos activos en esta categoría.</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filteredProducts.map((product) => (
                    <Card
                      key={product.id}
                      role="button"
                      tabIndex={isPaying ? -1 : 0}
                      onClick={() => addToCart(product)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          addToCart(product);
                        }
                      }}
                      className="cursor-pointer hover:border-blue-500 hover:shadow-md transition-colors h-32 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <CardContent className="p-4 flex flex-col justify-between h-full">
                        <span className="font-semibold text-slate-800 line-clamp-2">
                          {product.name}
                        </span>
                        <span className="text-blue-600 font-bold">{money(product.price)}</span>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Panel de la comanda */}
      <div className="w-full lg:w-96 bg-white border-l shadow-xl flex flex-col lg:h-full">
        <div
          className={cn(
            'p-4 text-white flex justify-between items-center',
            isPaying ? 'bg-yellow-600' : 'bg-slate-800'
          )}
        >
          <h2 className="text-lg font-bold">{isPaying ? 'Cuenta pedida' : 'Comanda'}</h2>
          <Badge variant="secondary" className="bg-white/20 text-white">
            Mesa {table.name}
          </Badge>
        </div>

        <div className="flex-1 lg:overflow-y-auto p-4 space-y-6">
          {/* Ya enviado */}
          {hasSentItems && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-500">Ya enviado a cocina</h3>
              <ul className="space-y-2">
                {openOrder!.order_items.map((item) => (
                  <li key={item.id} className="flex justify-between gap-3 text-sm border-b pb-2">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800">
                        {item.quantity} × {item.products?.name ?? 'Producto'}
                      </p>
                      {item.notes && <p className="text-slate-500 italic">{item.notes}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-slate-700">
                        {money(item.quantity * Number(item.unit_price ?? 0))}
                      </p>
                      <Badge variant="outline" className="mt-1">
                        {ITEM_STATUS[item.status] ?? item.status}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Nuevo pedido */}
          {!isPaying && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-500">Nuevo pedido</h3>

              {cart.length === 0 ? (
                <p className="text-slate-400 text-sm">Toca un producto para agregarlo.</p>
              ) : (
                cart.map((item) => (
                  <div key={item.id} className="bg-slate-50 p-3 rounded-lg border space-y-2">
                    <div className="flex justify-between items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800">{item.name}</p>
                        <p className="text-sm text-slate-500">{money(item.price)}</p>
                      </div>

                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          aria-label={item.quantity === 1 ? `Quitar ${item.name}` : `Restar ${item.name}`}
                          onClick={() => updateQuantity(item.id, -1)}
                          className="p-1 rounded-md bg-white border shadow-sm hover:bg-slate-100 text-slate-600"
                        >
                          {item.quantity === 1 ? (
                            <Trash2 size={16} className="text-red-500" />
                          ) : (
                            <Minus size={16} />
                          )}
                        </button>
                        <span className="font-bold w-6 text-center">{item.quantity}</span>
                        <button
                          type="button"
                          aria-label={`Sumar ${item.name}`}
                          onClick={() => updateQuantity(item.id, 1)}
                          className="p-1 rounded-md bg-white border shadow-sm hover:bg-slate-100 text-slate-600"
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    </div>

                    <input
                      type="text"
                      value={item.notes}
                      onChange={(e) => updateNotes(item.id, e.target.value)}
                      placeholder="Nota para cocina (opcional)"
                      className="w-full rounded-md border bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                ))
              )}
            </section>
          )}
        </div>

        <div className="p-4 bg-slate-50 border-t space-y-3">
          {feedback && (
            <p
              className={cn(
                'text-sm rounded-md px-3 py-2',
                feedback.type === 'ok' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'
              )}
            >
              {feedback.text}
            </p>
          )}

          <div className="space-y-1">
            {!isPaying && cart.length > 0 && (
              <div className="flex justify-between text-sm text-slate-600">
                <span>Nuevo pedido</span>
                <span>{money(cartTotal)}</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="font-semibold text-slate-600">Total mesa</span>
              <span className="font-bold text-2xl text-slate-900">
                {money(orderTotal + (isPaying ? 0 : cartTotal))}
              </span>
            </div>
          </div>

          {isPaying ? (
            <div className="space-y-2">
              <Button
                className="w-full h-14 text-lg bg-green-600 hover:bg-green-700 text-white"
                disabled={working}
                onClick={() => {
                  setPayError(null);
                  setPayOpen(true);
                }}
              >
                Cobrar {money(orderTotal)}
              </Button>
              <Button variant="outline" className="w-full" disabled={working} onClick={handleCancelBill}>
                Reabrir mesa
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Button
                className="w-full h-14 text-lg bg-blue-600 hover:bg-blue-700 text-white"
                disabled={cart.length === 0 || working}
                onClick={handleSendToKitchen}
              >
                <Send size={20} />
                {working && cart.length > 0 ? 'Enviando…' : 'Enviar a cocina'}
              </Button>

              {hasSentItems && cart.length === 0 && (
                <Button variant="outline" className="w-full" disabled={working} onClick={handleRequestBill}>
                  <Receipt size={18} />
                  Pedir cuenta
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {payOpen && (
        <PaymentPanel
          tableName={table.name}
          total={orderTotal}
          busy={working}
          error={payError}
          onClose={() => setPayOpen(false)}
          onConfirm={handlePay}
        />
      )}
    </div>
  );
}
