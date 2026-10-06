// Funciones de cliente para administrar categorías y productos.
import { createClient } from '@/lib/supabase/browser';

export type AdminCategory = { id: string; name: string; sort_order: number };
export type AdminProduct = {
  id: string;
  category_id: string;
  name: string;
  price: number;
  is_active: boolean;
};

export async function getCatalog() {
  const supabase = createClient();
  const [cats, prods] = await Promise.all([
    supabase.from('categories').select('id, name, sort_order').order('sort_order').order('name'),
    supabase.from('products').select('id, category_id, name, price, is_active').order('name'),
  ]);

  if (cats.error) throw cats.error;
  if (prods.error) throw prods.error;

  return {
    categories: (cats.data ?? []) as AdminCategory[],
    products: (prods.data ?? []).map((p) => ({
      ...p,
      price: Number(p.price),
      is_active: p.is_active ?? true,
    })) as AdminProduct[],
  };
}

export async function createCategory(name: string, sort_order: number) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('categories')
    .insert({ name, sort_order })
    .select('id, name, sort_order')
    .single();
  if (error) throw error;
  return data as AdminCategory;
}

export async function renameCategory(id: string, name: string) {
  const supabase = createClient();
  const { error } = await supabase.from('categories').update({ name }).eq('id', id);
  if (error) throw error;
}

export async function deleteCategory(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) throw error;
}

export async function saveCategoryOrder(items: { id: string; sort_order: number }[]) {
  const supabase = createClient();
  const results = await Promise.all(
    items.map((i) => supabase.from('categories').update({ sort_order: i.sort_order }).eq('id', i.id))
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}

export async function createProduct(input: { category_id: string; name: string; price: number }) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('products')
    .insert({ ...input, is_active: true })
    .select('id, category_id, name, price, is_active')
    .single();
  if (error) throw error;
  return { ...data, price: Number(data.price) } as AdminProduct;
}

export async function updateProduct(id: string, patch: Partial<Omit<AdminProduct, 'id'>>) {
  const supabase = createClient();
  const { error } = await supabase.from('products').update(patch).eq('id', id);
  if (error) throw error;
}
