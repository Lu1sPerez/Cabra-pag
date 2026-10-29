// Medios de pago configurables (lectura: personal; escritura: admin, lo controla RLS).
import { createClient } from '@/lib/supabase/browser';

export type MethodKind = 'cash' | 'card' | 'wallet' | 'transfer' | 'other';
export type AdjustmentType = 'none' | 'surcharge' | 'discount';

export type PaymentMethodRow = {
  id: string;
  name: string;
  kind: MethodKind;
  adjustment_type: AdjustmentType;
  adjustment_pct: number;
  counts_as_cash: boolean;
  is_active: boolean;
  sort_order: number;
  ticket_note: string | null;
};

export type PaymentMethodInput = Omit<PaymentMethodRow, 'id'>;

export const KIND_LABELS: Record<MethodKind, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  wallet: 'Billetera digital / QR',
  transfer: 'Transferencia',
  other: 'Otro',
};

const FIELDS = 'id, name, kind, adjustment_type, adjustment_pct, counts_as_cash, is_active, sort_order, ticket_note';

const normalize = (r: any): PaymentMethodRow => ({ ...r, adjustment_pct: Number(r.adjustment_pct ?? 0) });

export function adjustmentFor(method: Pick<PaymentMethodRow, 'adjustment_type' | 'adjustment_pct'>, base: number) {
  const value = Math.round(base * (method.adjustment_pct / 100) * 100) / 100;
  if (method.adjustment_type === 'surcharge') return value;
  if (method.adjustment_type === 'discount') return -value;
  return 0;
}

export function adjustmentLabel(m: Pick<PaymentMethodRow, 'adjustment_type' | 'adjustment_pct'>) {
  if (m.adjustment_type === 'surcharge' && m.adjustment_pct > 0) return `+${m.adjustment_pct}%`;
  if (m.adjustment_type === 'discount' && m.adjustment_pct > 0) return `−${m.adjustment_pct}%`;
  return '';
}

export async function getPaymentMethods(activeOnly = false) {
  const supabase = createClient();
  let q = supabase.from('payment_methods').select(FIELDS).order('sort_order').order('name');
  if (activeOnly) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(normalize);
}

export async function createPaymentMethod(input: PaymentMethodInput) {
  const supabase = createClient();
  const { data, error } = await supabase.from('payment_methods').insert(input).select(FIELDS).single();
  if (error) throw error;
  return normalize(data);
}

export async function updatePaymentMethod(id: string, patch: Partial<PaymentMethodInput>) {
  const supabase = createClient();
  const { error } = await supabase.from('payment_methods').update(patch).eq('id', id);
  if (error) throw error;
}

export async function savePaymentMethodOrder(items: { id: string; sort_order: number }[]) {
  const supabase = createClient();
  const results = await Promise.all(
    items.map((i) => supabase.from('payment_methods').update({ sort_order: i.sort_order }).eq('id', i.id))
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}
