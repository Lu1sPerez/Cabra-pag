'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  createCategory,
  createProduct,
  deleteCategory,
  getCatalog,
  renameCategory,
  saveCategoryOrder,
  updateProduct,
  type AdminCategory,
  type AdminProduct,
} from '@/actions/menu-actions';

const money = (n: number) => `$${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;

// Acepta "8500", "8.500" o "8500,50"
function parsePrice(raw: string) {
  const clean = raw.trim().replace(/\./g, '').replace(',', '.');
  const n = Number(clean);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

// Costo opcional: vacío = sin cargar; acepta cero
function parseCost(raw: string): number | null | 'invalid' {
  if (!raw.trim()) return null;
  const clean = raw.trim().replace(/\./g, '').replace(',', '.');
  const n = Number(clean);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 'invalid';
}

const marginPct = (price: number, cost: number) => Math.round(((price - cost) / price) * 100);

const inputClass =
  'rounded-md border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

export default function MenuEditor() {
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newCatName, setNewCatName] = useState('');
  const [newProdName, setNewProdName] = useState('');
  const [newProdPrice, setNewProdPrice] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const data = await getCatalog();
    setCategories(data.categories);
    setProducts(data.products);
    setSelectedCat((current) =>
      current && data.categories.some((c) => c.id === current) ? current : data.categories[0]?.id ?? null
    );
  }, []);

  useEffect(() => {
    reload()
      .catch((e) => {
        console.error(e);
        setError('No se pudo cargar el menú. Revisa que hayas ejecutado productos.sql.');
      })
      .finally(() => setLoading(false));
  }, [reload]);

  const run = async (action: () => Promise<void>) => {
    setSaving(true);
    setError(null);
    try {
      await action();
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? 'Ocurrió un error inesperado.');
      await reload();
    } finally {
      setSaving(false);
    }
  };

  const countByCat = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products) map.set(p.category_id, (map.get(p.category_id) ?? 0) + 1);
    return map;
  }, [products]);

  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? 'Sin categoría';
  const selected = categories.find((c) => c.id === selectedCat) ?? null;
  const searching = search.trim().length > 0;

  const visibleProducts = useMemo(() => {
    if (searching) {
      const q = search.trim().toLowerCase();
      return products.filter((p) => p.name.toLowerCase().includes(q));
    }
    return products.filter((p) => p.category_id === selectedCat);
  }, [products, search, searching, selectedCat]);

  // --- Categorías ---
  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newCatName.trim();
    if (!name) return;
    const nextOrder = (categories.at(-1)?.sort_order ?? 0) + 10;
    run(async () => {
      const cat = await createCategory(name, nextOrder);
      setCategories((prev) => [...prev, cat]);
      setSelectedCat(cat.id);
      setSearch('');
      setNewCatName('');
    });
  };

  const handleRenameCategory = (cat: AdminCategory, name: string) => {
    const clean = name.trim();
    if (!clean || clean === cat.name) return;
    run(async () => {
      await renameCategory(cat.id, clean);
      setCategories((prev) => prev.map((c) => (c.id === cat.id ? { ...c, name: clean } : c)));
    });
  };

  const handleMoveCategory = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= categories.length) return;
    const reordered = [...categories];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    const withOrder = reordered.map((c, i) => ({ ...c, sort_order: (i + 1) * 10 }));
    setCategories(withOrder);
    run(() => saveCategoryOrder(withOrder.map(({ id, sort_order }) => ({ id, sort_order }))));
  };

  const handleDeleteCategory = (cat: AdminCategory) => {
    if ((countByCat.get(cat.id) ?? 0) > 0) return;
    if (!window.confirm(`¿Eliminar la categoría "${cat.name}"?`)) return;
    run(async () => {
      await deleteCategory(cat.id);
      const rest = categories.filter((c) => c.id !== cat.id);
      setCategories(rest);
      setSelectedCat(rest[0]?.id ?? null);
    });
  };

  // --- Productos ---
  const handleAddProduct = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newProdName.trim();
    const price = parsePrice(newProdPrice);
    if (!selected || !name) return;
    if (price === null) {
      setError('Ingresa un precio válido, mayor a cero.');
      return;
    }
    run(async () => {
      const product = await createProduct({ category_id: selected.id, name, price });
      setProducts((prev) => [...prev, product].sort((a, b) => a.name.localeCompare(b.name)));
      setNewProdName('');
      setNewProdPrice('');
    });
  };

  const handleToggleActive = (p: AdminProduct) => {
    setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, is_active: !p.is_active } : x)));
    run(() => updateProduct(p.id, { is_active: !p.is_active }));
  };

  const handleSaveEdit = (
    p: AdminProduct,
    draft: { name: string; price: string; cost: string; category_id: string }
  ) => {
    const name = draft.name.trim();
    const price = parsePrice(draft.price);
    const cost = parseCost(draft.cost);
    if (!name) return setError('El nombre no puede quedar vacío.');
    if (price === null) return setError('Ingresa un precio válido, mayor a cero.');
    if (cost === 'invalid') return setError('Ingresa un costo válido, o déjalo vacío.');

    const patch = { name, price, cost, category_id: draft.category_id };
    run(async () => {
      await updateProduct(p.id, patch);
      setProducts((prev) =>
        prev
          .map((x) => (x.id === p.id ? { ...x, ...patch } : x))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      setEditingId(null);
    });
  };

  if (loading) return <div className="p-6 text-slate-500">Cargando menú…</div>;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Productos y categorías</h1>
          <p className="text-sm text-slate-500">
            Los productos desactivados no aparecen al tomar pedidos, pero siguen en el historial.
            Carga el costo de cada producto con “Editar” para ver su margen en el análisis.
          </p>
        </div>
        <span className="text-sm text-slate-500" aria-live="polite">
          {saving ? 'Guardando…' : 'Cambios guardados'}
        </span>
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Categorías */}
        <aside className="w-full lg:w-72 shrink-0 space-y-3">
          <h2 className="font-semibold text-slate-800">Categorías</h2>

          <ul className="space-y-1">
            {categories.map((cat, i) => {
              const count = countByCat.get(cat.id) ?? 0;
              const active = cat.id === selectedCat && !searching;
              return (
                <li
                  key={cat.id}
                  className={cn(
                    'flex items-center gap-1 rounded-lg border bg-white pr-1',
                    active && 'border-blue-600 bg-blue-50'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCat(cat.id);
                      setSearch('');
                      setEditingId(null);
                    }}
                    aria-current={active ? 'true' : undefined}
                    className="flex-1 text-left px-3 py-2 text-sm font-medium text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg"
                  >
                    {cat.name} <span className="text-slate-400 font-normal">({count})</span>
                  </button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    aria-label={`Subir ${cat.name}`}
                    disabled={i === 0 || saving}
                    onClick={() => handleMoveCategory(i, -1)}
                  >
                    <ArrowUp size={14} />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    aria-label={`Bajar ${cat.name}`}
                    disabled={i === categories.length - 1 || saving}
                    onClick={() => handleMoveCategory(i, 1)}
                  >
                    <ArrowDown size={14} />
                  </Button>
                </li>
              );
            })}
          </ul>

          <form onSubmit={handleAddCategory} className="flex gap-2">
            <input
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="Nueva categoría"
              aria-label="Nombre de la nueva categoría"
              className={cn(inputClass, 'flex-1 min-w-0')}
            />
            <Button type="submit" variant="outline" disabled={!newCatName.trim() || saving}>
              <Plus size={16} />
              Agregar
            </Button>
          </form>

          <p className="text-xs text-slate-500">
            El orden de esta lista es el que ve el mozo al tomar pedidos.
          </p>
        </aside>

        {/* Productos */}
        <section className="flex-1 min-w-0 space-y-4">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setEditingId(null);
              }}
              placeholder="Buscar en todo el menú"
              aria-label="Buscar productos"
              className={cn(inputClass, 'w-full pl-9')}
            />
          </div>

          {!searching && selected && (
            <div className="rounded-xl border bg-white p-4 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  key={selected.id}
                  defaultValue={selected.name}
                  aria-label="Nombre de la categoría"
                  onBlur={(e) => handleRenameCategory(selected, e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  className={cn(inputClass, 'font-semibold')}
                />
                <Button
                  variant="ghost"
                  className="text-red-600 hover:bg-red-50"
                  disabled={(countByCat.get(selected.id) ?? 0) > 0 || saving}
                  title={
                    (countByCat.get(selected.id) ?? 0) > 0
                      ? 'Mueve sus productos a otra categoría primero'
                      : undefined
                  }
                  onClick={() => handleDeleteCategory(selected)}
                >
                  <Trash2 size={16} />
                  Eliminar categoría
                </Button>
              </div>

              <form onSubmit={handleAddProduct} className="flex flex-wrap gap-2">
                <input
                  value={newProdName}
                  onChange={(e) => setNewProdName(e.target.value)}
                  placeholder={`Nuevo producto en ${selected.name}`}
                  aria-label="Nombre del nuevo producto"
                  className={cn(inputClass, 'flex-1 min-w-[12rem]')}
                />
                <input
                  value={newProdPrice}
                  onChange={(e) => setNewProdPrice(e.target.value)}
                  inputMode="decimal"
                  placeholder="Precio"
                  aria-label="Precio del nuevo producto"
                  className={cn(inputClass, 'w-32')}
                />
                <Button type="submit" disabled={!newProdName.trim() || !newProdPrice.trim() || saving}>
                  <Plus size={16} />
                  Agregar
                </Button>
              </form>
            </div>
          )}

          {categories.length === 0 ? (
            <p className="text-slate-600">Crea una categoría para empezar a cargar productos.</p>
          ) : visibleProducts.length === 0 ? (
            <p className="text-slate-500">
              {searching ? 'Ningún producto coincide con la búsqueda.' : 'Esta categoría todavía no tiene productos.'}
            </p>
          ) : (
            <ul className="rounded-xl border bg-white divide-y">
              {visibleProducts.map((p) =>
                editingId === p.id ? (
                  <EditRow
                    key={p.id}
                    product={p}
                    categories={categories}
                    saving={saving}
                    onCancel={() => setEditingId(null)}
                    onSave={(draft) => handleSaveEdit(p, draft)}
                  />
                ) : (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className={cn('flex-1 min-w-[10rem]', !p.is_active && 'opacity-50')}>
                      <p className="font-medium text-slate-800">{p.name}</p>
                      {searching && <p className="text-xs text-slate-500">{catName(p.category_id)}</p>}
                    </div>

                    <div className={cn('w-36 text-right', !p.is_active && 'opacity-50')}>
                      <p className="font-semibold text-slate-900">{money(p.price)}</p>
                      <p className="text-xs text-slate-500">
                        {p.cost == null
                          ? 'Sin costo cargado'
                          : `Costo ${money(p.cost)} · margen ${marginPct(p.price, p.cost)}%`}
                      </p>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={p.is_active}
                      aria-label={`${p.name}: ${p.is_active ? 'activo' : 'desactivado'}`}
                      onClick={() => handleToggleActive(p)}
                      disabled={saving}
                      className="flex items-center gap-2 text-sm text-slate-600 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-full"
                    >
                      <span
                        className={cn(
                          'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                          p.is_active ? 'bg-green-600' : 'bg-slate-300'
                        )}
                      >
                        <span
                          className={cn(
                            'inline-block h-5 w-5 rounded-full bg-white shadow transition-transform',
                            p.is_active ? 'translate-x-5' : 'translate-x-0.5'
                          )}
                        />
                      </span>
                      <span className="w-20 text-left">{p.is_active ? 'Activo' : 'Desactivado'}</span>
                    </button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingId(p.id)}
                      aria-label={`Editar ${p.name}`}
                    >
                      <Pencil size={14} />
                      Editar
                    </Button>
                  </li>
                )
              )}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function EditRow({
  product,
  categories,
  saving,
  onCancel,
  onSave,
}: {
  product: AdminProduct;
  categories: AdminCategory[];
  saving: boolean;
  onCancel: () => void;
  onSave: (draft: { name: string; price: string; cost: string; category_id: string }) => void;
}) {
  const [name, setName] = useState(product.name);
  const [price, setPrice] = useState(String(product.price).replace('.', ','));
  const [cost, setCost] = useState(product.cost == null ? '' : String(product.cost).replace('.', ','));
  const [categoryId, setCategoryId] = useState(product.category_id);

  return (
    <li className="px-4 py-3 bg-blue-50/50">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ name, price, cost, category_id: categoryId });
        }}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        className="flex flex-wrap items-center gap-2"
      >
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Nombre"
          className={cn(inputClass, 'flex-1 min-w-[10rem]')}
        />
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          inputMode="decimal"
          aria-label="Precio"
          className={cn(inputClass, 'w-28')}
        />
        <input
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          inputMode="decimal"
          placeholder="Costo"
          aria-label="Costo unitario (opcional)"
          className={cn(inputClass, 'w-28')}
        />
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          aria-label="Categoría"
          className={inputClass}
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" disabled={saving}>
          Guardar
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </form>
    </li>
  );
}
