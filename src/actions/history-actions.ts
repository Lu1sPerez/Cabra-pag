// Gastos del local.
// La pantalla de Gastos usa funciones de la base que aceptan al admin y al
// encargado con su PIN. Las de acceso directo a la tabla (solo admin) las usa el Asistente.
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

// --- Pantalla de Gastos: admin y encargado -----------------------------------

export type ExpenseRow = Expense & { created_by_name: string | null; editable: boolean };

export async function listExpenses(from: string, to: string, staffToken: string | null) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('staff_list_expenses', {
    p_start: dayRange(from).start,
    p_end: dayRange(to).end,
    p_staff_token: staffToken,
  });
  if (error) throw error;
  return ((data ?? []) as any[]).map((e) => ({ ...normalize(e), editable: Boolean(e.editable) })) as ExpenseRow[];
}

export async function listExpenseCategories(staffToken: string | null) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('staff_expense_categories', { p_staff_token: staffToken });
  if (error) throw error;
  return (data ?? []) as string[];
}

// id null: gasto nuevo
export async function saveExpense(id: string | null, input: ExpenseInput, staffToken: string | null) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('staff_save_expense', {
    p_id: id,
    p_spent_at: input.spent_at,
    p_concept: input.concept,
    p_category: input.category,
    p_amount: input.amount,
    p_payment_method: input.payment_method,
    p_staff_token: staffToken,
  });
  if (error) throw error;
  return data as string;
}

export async function removeExpense(id: string, staffToken: string | null) {
  const supabase = createClient();
  const { error } = await supabase.rpc('staff_delete_expense', { p_id: id, p_staff_token: staffToken });
  if (error) throw error;
}
