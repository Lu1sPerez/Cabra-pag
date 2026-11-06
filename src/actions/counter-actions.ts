// Mostrador: ventas para llevar, sin mesa. Cada pedido tiene un número del día (#1, #2…).
// Necesita mostrador.sql (columnas channel / ticket_number / customer_name y sus funciones).
import { createClient } from '@/lib/supabase/browser';
import type { NewItem, OpenOrder } from '@/actions/order-actions';

export type CounterOrder = OpenOrder & {
  ticket_number: number | null;
  customer_name: string | null;
};

// Lo que muestra la fila de pedidos abiertos
export type CounterSummary = {
  id: string;
  ticket_number: number | null;
  customer_name: string | null;
  created_at: string;
  total: number; // consumo menos descuento
  paid: number; // lo cobrado hasta ahora (sin recargos)
  units: number;
};

export function counterLabel(o: { ticket_number: number | null; customer_name: string | null }) {
  return `Mostrador #${o.ticket_number ?? '–'}${o.customer_name ? ` · ${o.customer_name}` : ''}`;
}

export async function listOpenCounterOrders() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('orders')
    .select('id, ticket_number, customer_name, created_at, discount, order_items ( quantity, unit_price ), payments ( base_amount )')
    .eq('channel', 'mostrador')
    .eq('status', 'open')
    .order('created_at');
  if (error) throw error;
  return (data ?? []).map((o: any) => {
    const items = (o.order_items ?? []) as { quantity: number; unit_price: number | null }[];
    const subtotal = items.reduce((acc, i) => acc + i.quantity * Number(i.unit_price ?? 0), 0);
    return {
      id: o.id,
      ticket_number: o.ticket_number,
      customer_name: o.customer_name,
      created_at: o.created_at,
      total: subtotal - Number(o.discount ?? 0),
      paid: ((o.payments ?? []) as { base_amount: number }[]).reduce((acc, p) => acc + Number(p.base_amount), 0),
      units: items.reduce((acc, i) => acc + i.quantity, 0),
    };
  }) as CounterSummary[];
}

export async function getCounterOrder(orderId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('orders')
    .select(
      'id, total, discount, discount_reason, created_at, ticket_number, customer_name, order_items ( id, quantity, notes, status, unit_price, products ( name ) )'
    )
    .eq('id', orderId)
    .eq('status', 'open')
    .order('created_at', { referencedTable: 'order_items' })
    .maybeSingle();
  if (error) throw error;
  return data as unknown as CounterOrder | null;
}

// Sin orderId crea un pedido nuevo; con orderId le agrega productos (o solo cambia el nombre)
export async function sendCounterOrder(input: {
  orderId: string | null;
  items: NewItem[];
  customerName: string | null;
  staffToken: string | null;
}) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('send_counter_order', {
    p_order_id: input.orderId,
    p_items: input.items,
    p_customer_name: input.customerName,
    p_staff_token: input.staffToken,
  });
  if (error) throw error;
  return data as { order_id: string; ticket_number: number | null };
}

// Solo encargado o admin, y solo si no tiene pagos
export async function cancelCounterOrder(orderId: string, staffToken: string | null) {
  const supabase = createClient();
  const { error } = await supabase.rpc('cancel_counter_order', { p_order_id: orderId, p_staff_token: staffToken });
  if (error) throw error;
}
