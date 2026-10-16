'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { endStaffSession, type StaffSession } from '@/actions/staff-actions';

// Minutos sin tocar la pantalla antes de pedir el PIN de nuevo
const LOCK_AFTER_MS = 3 * 60 * 1000;

interface StaffState {
  staff: StaffSession | null;
  setStaff: (s: StaffSession) => void;
  lock: () => void;
}

const StaffContext = createContext<StaffState | null>(null);

// Errores del servidor que indican que el mozo debe volver a ingresar el PIN
export function isStaffSessionError(e: unknown) {
  const msg = (e as { message?: string })?.message ?? '';
  return msg.includes('Sesión de mozo') || msg.includes('Ingresa tu PIN');
}

export function StaffProvider({ children }: { children: React.ReactNode }) {
  const { role } = useAuth();
  const [staff, setStaffState] = useState<StaffSession | null>(null);
  const staffRef = useRef<StaffSession | null>(null);

  const setStaff = useCallback((s: StaffSession) => {
    staffRef.current = s;
    setStaffState(s);
  }, []);

  const lock = useCallback(() => {
    const current = staffRef.current;
    staffRef.current = null;
    setStaffState(null);
    if (current) endStaffSession(current.token).catch(() => {});
  }, []);

  // Bloqueo automático por inactividad (solo en la tablet)
  useEffect(() => {
    if (role !== 'terminal' || !staff) return;

    let timer = setTimeout(lock, LOCK_AFTER_MS);
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(lock, LOCK_AFTER_MS);
    };

    const events = ['pointerdown', 'keydown', 'scroll'] as const;
    events.forEach((ev) => window.addEventListener(ev, reset, { passive: true }));
    return () => {
      clearTimeout(timer);
      events.forEach((ev) => window.removeEventListener(ev, reset));
    };
  }, [role, staff, lock]);

  const value = useMemo(() => ({ staff, setStaff, lock }), [staff, setStaff, lock]);
  return <StaffContext.Provider value={value}>{children}</StaffContext.Provider>;
}

export function useStaff() {
  const ctx = useContext(StaffContext);
  if (!ctx) throw new Error('useStaff debe usarse dentro de <StaffProvider>');
  return ctx;
}
