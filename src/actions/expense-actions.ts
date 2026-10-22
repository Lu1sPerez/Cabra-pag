// Gastos del local (solo admin; lo controla la base con RLS).
import { createClient } from '@/lib/supabase/browser';
import { dayRange } from '@/actions/report-actions';

export type Expense = {
  id: string;
  spent_at: string;
  concept: string;
  category: string;
  amount: number;
  payment_method: string | null;
};

export type ExpenseInput = Omit<Expense, 'id'>;

const FIELDS = 'id, spent_at, concept, category, amount, payment_method';

const normalize = (e: any): Expense => ({ ...e, amount: Number(e.amount) });

export async function getExpenses(from: string, to: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('expenses')
    .select(FIELDS)
    .gte('spent_at', dayRange(from).start)
    .lt('spent_at', dayRange(to).end)
    .order('spent_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(normalize);
}

// Todas las categorías usadas alguna vez, para sugerirlas al cargar
export async function getExpenseCategories() {
  const supabase = createClient();
  const { data, error } = await supabase.from('expenses').select('category');
  if (error) throw error;
  return Array.from(new Set<string>((data ?? []).map((r: { category: string }) => r.category))).sort((a, b) =>
    a.localeCompare(b)
  );
}

export async function createExpense(input: ExpenseInput) {
  const supabase = createClient();
  const { data, error } = await supabase.from('expenses').insert(input).select(FIELDS).single();
  if (error) throw error;
  return normalize(data);
}

export async function updateExpense(id: string, patch: Partial<ExpenseInput>) {
  const supabase = createClient();
  const { error } = await supabase.from('expenses').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteExpense(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from('expenses').delete().eq('id', id);
  if (error) throw error;
}
