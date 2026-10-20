// Funciones de cliente para mozos y sesiones por PIN.
import { createClient } from '@/lib/supabase/browser';

export type StaffOption = { id: string; name: string };
export type StaffSession = { id: string; name: string; token: string; is_manager: boolean };
export type AdminStaff = { id: string; name: string; is_active: boolean; is_manager: boolean };

export async function listActiveStaff() {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('list_active_staff');
  if (error) throw error;
  return (data ?? []) as StaffOption[];
}

export async function startStaffSession(staffId: string, pin: string) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('start_staff_session', {
    p_staff_id: staffId,
    p_pin: pin,
  });
  if (error) throw error;

  const result = data as {
    ok: boolean;
    error?: string;
    token?: string;
    id?: string;
    name?: string;
    is_manager?: boolean;
  };
  if (!result.ok) return { ok: false as const, error: result.error ?? 'No se pudo validar el PIN.' };
  return {
    ok: true as const,
    session: {
      id: result.id!,
      name: result.name!,
      token: result.token!,
      is_manager: Boolean(result.is_manager),
    } as StaffSession,
  };
}

export async function endStaffSession(token: string) {
  const supabase = createClient();
  await supabase.rpc('end_staff_session', { p_token: token });
}

// --- Administración ---
export async function getStaffAdmin() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('staff')
    .select('id, name, is_active, is_manager')
    .order('name');
  if (error) throw error;
  return (data ?? []) as AdminStaff[];
}

export async function saveStaff(id: string | null, name: string, pin: string | null) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('admin_save_staff', {
    p_id: id,
    p_name: name,
    p_pin: pin,
  });
  if (error) throw error;
  return data as string;
}

export async function setStaffManager(id: string, value: boolean) {
  const supabase = createClient();
  const { error } = await supabase.rpc('admin_set_staff_manager', { p_id: id, p_value: value });
  if (error) throw error;
}

export async function setStaffActive(id: string, active: boolean) {
  const supabase = createClient();
  const { error } = await supabase.rpc('admin_set_staff_active', { p_id: id, p_active: active });
  if (error) throw error;
}
