'use client';

// Piezas compartidas por la comanda de una mesa y por el mostrador:
// el menú (categorías + productos), el carrito sin enviar y la carga del menú.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Minus, Plus, Search, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getCachedMenu, getMenu, type Category, type NewItem, type Product } from '@/actions/order-actions';

// Color de cada categoría según su orden (hasta que se puedan elegir en Productos)
export const CATEGORY_COLORS = ['#C99A6E', '#E09AAE', '#DDB86A', '#9CC38F', '#B7A6E8', '#7FC6B8', '#E8A27A', '#8FB4D9'];

export const money = (n: number) => `$ ${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;

// Búsqueda sin importar mayúsculas ni tildes ("cafe" encuentra "Café")
const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

export function elapsed(fromIso: string | undefined | null) {
  if (!fromIso) return '';
  const min = Math.max(0, Math.floor((Date.now() - new Date(fromIso).getTime()) / 60000));
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}

// --- Menú --------------------------------------------------------------------
// Sale de la memoria al instante y se vuelve a pedir en segundo plano (por si cambió un precio)
export function useMenu() {
  const [categories, setCategories] = useState<Category[]>(() => getCachedMenu()?.categories ?? []);
  const [products, setProducts] = useState<Product[]>(() => getCachedMenu()?.products ?? []);
  const [loading, setLoading] = useState(() => !getCachedMenu());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getMenu()
      .then((menu) => {
        if (!active) return;
        setCategories(menu.categories);
        setProducts(menu.products);
      })
      .catch((e) => {
        console.error(e);
        if (active && !getCachedMenu()) setError('No se pudo cargar el menú. Revisa la conexión.');
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  return { categories, products, loading, error };
}

// --- Carrito (lo que todavía no se envió) -------------------------------------
export type CartItem = Product & { quantity: number; notes: string };

export function useCart() {
  const [cart, setCart] = useState<CartItem[]>([]);

  const add = (product: Product) =>
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) return prev.map((item) => (item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item));
      return [...prev, { ...product, quantity: 1, notes: '' }];
    });

  const changeQuantity = (id: string, delta: number) =>
    setCart((prev) =>
      prev
        .map((item) => (item.id === id ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item))
        .filter((item) => item.quantity > 0)
    );

  const changeNotes = (id: string, notes: string) =>
    setCart((prev) => prev.map((item) => (item.id === id ? { ...item, notes } : item)));

  const clear = () => setCart([]);

  const total = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const units = cart.reduce((acc, item) => acc + item.quantity, 0);
  const quantities = useMemo(() => new Map(cart.map((i) => [i.id, i.quantity])), [cart]);
  const toItems = (): NewItem[] =>
    cart.map((item) => ({ product_id: item.id, quantity: item.quantity, notes: item.notes.trim() || null }));

  return { cart, add, changeQuantity, changeNotes, clear, total, units, quantities, toItems };
}

// --- Categorías y productos ---------------------------------------------------
// Devuelve dos columnas (categorías y productos) para ubicar dentro de un contenedor flex
export function MenuBoard({
  categories,
  products,
  quantities,
  onAdd,
  disabled = false,
  notice,
}: {
  categories: Category[];
  products: Product[];
  quantities: Map<string, number>;
  onAdd: (product: Product) => void;
  disabled?: boolean;
  notice?: ReactNode;
}) {
  const [activeCategory, setActiveCategory] = useState<string | null>(() => categories[0]?.id ?? null);
  const [search, setSearch] = useState('');

  // Si cambia el menú (o llega por primera vez), la categoría elegida sigue siendo válida
  useEffect(() => {
    setActiveCategory((current) => (current && categories.some((c) => c.id === current) ? current : categories[0]?.id ?? null));
  }, [categories]);

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
  const activeCat = categories.find((c) => c.id === activeCategory) ?? null;

  return (
    <>
      {/* Categorías */}
      <nav
        aria-label="Categorías"
        className={cn(
          'shrink-0 border-b bg-surface lg:w-[200px] lg:overflow-y-auto lg:border-b-0 lg:border-r',
          disabled && 'pointer-events-none opacity-50'
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

        {notice}

        <div className={cn('min-h-0 flex-1 pr-1 lg:overflow-y-auto', disabled && 'pointer-events-none opacity-50')}>
          {visibleProducts.length === 0 ? (
            <p className="text-slate-500">{search ? 'Ningún producto coincide.' : 'No hay productos activos en esta categoría.'}</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {visibleProducts.map((product) => {
                const qty = quantities.get(product.id) ?? 0;
                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => onAdd(product)}
                    tabIndex={disabled ? -1 : 0}
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
    </>
  );
}

// --- Líneas del carrito (cantidad y nota) -------------------------------------
export function CartLines({
  cart,
  onQuantity,
  onNotes,
}: {
  cart: CartItem[];
  onQuantity: (id: string, delta: number) => void;
  onNotes: (id: string, notes: string) => void;
}) {
  if (cart.length === 0) return <p className="mt-2 text-sm text-slate-500">Toca un producto para agregarlo.</p>;
  return (
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
              onClick={() => onQuantity(item.id, -1)}
              className="flex h-10 w-10 items-center justify-center rounded-lg border text-slate-900 hover:bg-slate-100"
            >
              {item.quantity === 1 ? <Trash2 size={16} /> : <Minus size={16} />}
            </button>
            <span className="w-6 text-center font-display text-lg font-bold text-slate-900">{item.quantity}</span>
            <button
              type="button"
              aria-label={`Sumar ${item.name}`}
              onClick={() => onQuantity(item.id, 1)}
              className="flex h-10 w-10 items-center justify-center rounded-lg border text-slate-900 hover:bg-slate-100"
            >
              <Plus size={16} />
            </button>
            <input
              type="text"
              value={item.notes}
              onChange={(e) => onNotes(item.id, e.target.value)}
              placeholder="Nota (opcional)"
              aria-label={`Nota para ${item.name}`}
              className="h-10 min-w-0 flex-1 rounded-lg border bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
