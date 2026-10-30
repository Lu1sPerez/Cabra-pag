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
  discount: number | null;
  discount_reason: string | null;
  created_at: string;
  order_items: SentItem[];
};

export type OrderPayment = {
  id: string;
  method_name: string;
  base_amount: number;
  adjustment: number;
  amount: number;
  cash_given: number | null;
  items: { id: string; qty: number }[] | null;
  paid_at: string;
};

export type PaymentResult = {
  order_id: string;
  payment_id: string;
  charged: number;
  adjustment: number;
  change: number | null;
  remaining: number;
  closed: boolean;
};

export type NewItem = { product_id: string; quantity: number; notes: string | null };

export type PaymentMethod = 'cash' | 'card' | 'mercadopago' | 'transfer';

// El menú casi no cambia: se guarda en memoria para abrir las mesas al instante.
// Cada vez que se abre una mesa se vuelve a pedir en segundo plano, así un
// cambio de precio aparece enseguida.
export type Menu = { categories: Category[]; products: Product[] };
let menuCache: Menu | null = null;

export function getCachedMenu() {
  return menuCache;
}

export async function getMenu(): Promise<Menu> {
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

  menuCache = {
    categories: (cats.data ?? []) as Category[],
    products: (prods.data ?? []).map((p) => ({ ...p, price: Number(p.price) })) as Product[],
  };
  return menuCache;
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
    .select('id, total, discount, discount_reason, created_at, order_items ( id, quantity, notes, status, unit_price, products ( name ) )')
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

export async function payOrder(
  tableId: string,
  method: PaymentMethod,
  staffToken: string | null,
  discount = 0,
  discountReason: string | null = null
) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('pay_order', {
    p_table_id: tableId,
    p_payment_method: method,
    p_staff_token: staffToken,
    p_discount: discount,
    p_discount_reason: discountReason,
  });

  if (error) throw error;
  return data as string;
}

// --- Cobro en partes -------------------------------------------------------

export async function getOrderPayments(orderId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('payments')
    .select('id, method_name, base_amount, adjustment, amount, cash_given, items, paid_at')
    .eq('order_id', orderId)
    .order('paid_at');
  if (error) throw error;
  return (data ?? []).map((p: any) => ({
    ...p,
    base_amount: Number(p.base_amount),
    adjustment: Number(p.adjustment),
    amount: Number(p.amount),
    cash_given: p.cash_given == null ? null : Number(p.cash_given),
  })) as OrderPayment[];
}

export async function applyDiscount(tableId: string, discount: number, reason: string | null, staffToken: string | null) {
  const supabase = createClient();
  const { error } = await supabase.rpc('apply_discount', {
    p_table_id: tableId,
    p_discount: discount,
    p_reason: reason,
    p_staff_token: staffToken,
  });
  if (error) throw error;
}

export async function registerPayment(input: {
  tableId: string;
  methodId: string;
  baseAmount: number | null;
  staffToken: string | null;
  cashGiven?: number | null;
  items?: { id: string; qty: number }[] | null;
}) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('register_payment', {
    p_table_id: input.tableId,
    p_method_id: input.methodId,
    p_base_amount: input.baseAmount,
    p_staff_token: input.staffToken,
    p_cash_given: input.cashGiven ?? null,
    p_items: input.items && input.items.length ? input.items : null,
  });
  if (error) throw error;
  const r = data as any;
  return {
    ...r,
    charged: Number(r.charged),
    adjustment: Number(r.adjustment),
    change: r.change == null ? null : Number(r.change),
    remaining: Number(r.remaining),
  } as PaymentResult;
}

export async function voidPayment(paymentId: string, staffToken: string | null) {
  const supabase = createClient();
  const { error } = await supabase.rpc('void_payment', { p_payment_id: paymentId, p_staff_token: staffToken });
  if (error) throw error;
}

// Mesas abiertas con su consumo, para el salón
export type OpenOrderSummary = { table_id: string; total: number; created_at: string };

export async function getOpenOrdersSummary() {
  const supabase = createClient();
  const { data, error } = await supabase.from('orders').select('table_id, total, created_at').eq('status', 'open');
  if (error) throw error;
  return (data ?? []).map((o: any) => ({ ...o, total: Number(o.total ?? 0) })) as OpenOrderSummary[];
}
