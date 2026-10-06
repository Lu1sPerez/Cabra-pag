// Funciones de cliente para el editor del plano.
import { createClient } from '@/lib/supabase/browser';
import { TABLE_FIELDS, type FloorTable, type FloorZone } from '@/lib/floor';

export async function getFloor() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('zones')
    .select(`id, name, tables ( ${TABLE_FIELDS} )`)
    .eq('is_active', true)
    .eq('tables.is_active', true)
    .order('name')
    .order('name', { referencedTable: 'tables' });

  if (error) throw error;
  return (data ?? []) as unknown as FloorZone[];
}

export async function createZone(name: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('zones')
    .insert({ name })
    .select('id, name')
    .single();

  if (error) throw error;
  return { ...(data as { id: string; name: string }), tables: [] } as FloorZone;
}

export async function renameZone(id: string, name: string) {
  const supabase = createClient();
  const { error } = await supabase.from('zones').update({ name }).eq('id', id);
  if (error) throw error;
}

export async function deactivateZone(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from('zones').update({ is_active: false }).eq('id', id);
  if (error) throw error;
}

export type NewTable = Pick<
  FloorTable,
  'zone_id' | 'name' | 'capacity' | 'pos_x' | 'pos_y' | 'width' | 'height' | 'shape'
>;

export async function createTable(input: NewTable) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('tables')
    .insert({ ...input, status: 'free' })
    .select(TABLE_FIELDS)
    .single();

  if (error) throw error;
  return data as unknown as FloorTable;
}

export async function updateTable(id: string, patch: Partial<FloorTable>) {
  const supabase = createClient();
  const { error } = await supabase.from('tables').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deactivateTable(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from('tables').update({ is_active: false }).eq('id', id);
  if (error) throw error;
}
