// Funciones de cliente (no son Server Actions): usan el cliente de navegador
// para evitar los problemas de cookies()/AsyncLocalStorage en StackBlitz.
// Las escrituras pasan por funciones de Postgres, que son atómicas.
import { createClient } from '@/lib/supabase/browser';

export type Category = { id: string; name: string };
export type Product = { id: string; category_id: string; name: string; price: number };
export type TableInfo = { id: string; name: string; status: string };

export type SentItem = {
  id: string;
  quantity: number;
  notes: string | null;
  status: string;
  unit_price: number | null;
  products: { name: string } | null;
};

export type OpenOrder = {
  id: string;
  total: number | null;
  order_items: SentItem[];
};

export type NewItem = { product_id: string; quantity: number; notes: string | null };

export type PaymentMethod = 'cash' | 'card' | 'mercadopago' | 'transfer';

export async function getMenu() {
  const supabase = createClient();

  const [cats, prods] = await Promise.all([
    supabase.from('categories').select('id, name').order('sort_order').order('name'),
    supabase
      .from('products')
      .select('id, category_id, name, price')
      .or('is_active.is.null,is_active.eq.true')
      .order('name'),
  ]);

  if (cats.error) throw cats.error;
  if (prods.error) throw prods.error;

  return {
    categories: (cats.data ?? []) as Category[],
    products: (prods.data ?? []).map((p) => ({ ...p, price: Number(p.price) })) as Product[],
  };
}

export async function getTable(tableId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('tables')
    .select('id, name, status')
    .eq('id', tableId)
    .maybeSingle();

  if (error) throw error;
  return data as TableInfo | null;
}

export async function getOpenOrder(tableId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('orders')
    .select('id, total, order_items ( id, quantity, notes, status, unit_price, products ( name ) )')
    .eq('table_id', tableId)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .order('created_at', { referencedTable: 'order_items' })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as unknown as OpenOrder | null;
}

export async function sendOrder(tableId: string, items: NewItem[], staffToken: string | null) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('send_order', {
    p_table_id: tableId,
    p_items: items,
    p_staff_token: staffToken,
  });

  if (error) throw error;
  return data as string;
}

export async function requestBill(tableId: string, staffToken: string | null) {
  const supabase = createClient();
  const { error } = await supabase.rpc('request_bill', {
    p_table_id: tableId,
    p_staff_token: staffToken,
  });
  if (error) throw error;
}

export async function cancelBillRequest(tableId: string, staffToken: string | null) {
  const supabase = createClient();
  const { error } = await supabase.rpc('cancel_bill_request', {
    p_table_id: tableId,
    p_staff_token: staffToken,
  });
  if (error) throw error;
}

export async function payOrder(tableId: string, method: PaymentMethod, staffToken: string | null) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('pay_order', {
    p_table_id: tableId,
    p_payment_method: method,
    p_staff_token: staffToken,
  });

  if (error) throw error;
  return data as string;
}
