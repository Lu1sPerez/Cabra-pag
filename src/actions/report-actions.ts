// Funciones de cliente para el cierre de caja (lectura con el cliente de navegador).
import { createClient } from '@/lib/supabase/browser';

export type ClosedOrder = {
  id: string;
  total: number | null;
  payment_method: string | null;
  paid_at: string;
  tables: { name: string } | null;
  closer: { name: string } | null;
  order_items: {
    quantity: number;
    unit_price: number | null;
    products: { name: string } | null;
  }[];
};

// Rango del día en la hora local del dispositivo, convertido a UTC para la consulta
export function dayRange(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const start = new Date(y, m - 1, d);
  const end = new Date(y, m - 1, d + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function todayLocal() {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${mm}-${dd}`;
}

// El admin consulta sin token; el encargado de la tablet envía el token de su PIN
export async function getClosedOrders(dateStr: string, staffToken: string | null) {
  const supabase = createClient();
  const { start, end } = dayRange(dateStr);

  const { data, error } = await supabase.rpc('get_cash_report', {
    p_start: start,
    p_end: end,
    p_staff_token: staffToken,
  });

  if (error) throw error;
  return (data ?? []) as unknown as ClosedOrder[];
}

export async function countOpenOrders() {
  const supabase = createClient();
  const { count, error } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'open');

  if (error) throw error;
  return count ?? 0;
}
