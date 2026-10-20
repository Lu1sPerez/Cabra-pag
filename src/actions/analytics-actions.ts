// Lectura de estadísticas de ventas (solo admin). Los cálculos se hacen en Supabase.
import { createClient } from '@/lib/supabase/browser';
import { dayRange } from '@/actions/report-actions';

export type Kpis = {
  sales: number;
  orders: number;
  avg_ticket: number;
  avg_minutes: number;
  items: number;
};

export type Analytics = {
  kpis: Kpis;
  previous: Kpis;
  daily: { day: string; sales: number; orders: number }[];
  hourly: { hour: number; sales: number; orders: number }[];
  weekday: { dow: number; sales: number; orders: number }[];
  products: { name: string; category: string; qty: number; amount: number }[];
  categories: { name: string; qty: number; amount: number }[];
  staff: { name: string; orders: number; sales: number; avg_ticket: number }[];
  payments: { method: string; orders: number; sales: number }[];
  manager_access: { name: string; count: number; last: string }[];
};

export async function getSalesAnalytics(from: string, to: string) {
  const supabase = createClient();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const { data, error } = await supabase.rpc('get_sales_analytics', {
    p_start: dayRange(from).start,
    p_end: dayRange(to).end,
    p_tz: tz,
  });

  if (error) throw error;
  return data as Analytics;
}
