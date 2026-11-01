// Historial de ventas: mesas cobradas en un rango de días (hora local).
// Reutiliza get_cash_report, que ya devuelve productos, descuento, pagos y mozo.
import { createClient } from '@/lib/supabase/browser';
import type { ClosedOrder } from '@/actions/report-actions';

export type { ClosedOrder };

// El admin consulta sin token; el encargado envía el de su PIN
export async function getSalesHistory(from: string, to: string, staffToken: string | null = null) {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const start = new Date(fy, fm - 1, fd);
  const end = new Date(ty, tm - 1, td + 1);

  const supabase = createClient();
  const { data, error } = await supabase.rpc('get_cash_report', {
    p_start: start.toISOString(),
    p_end: end.toISOString(),
    p_staff_token: staffToken,
  });

  if (error) throw error;
  return (data ?? []) as unknown as ClosedOrder[];
}
