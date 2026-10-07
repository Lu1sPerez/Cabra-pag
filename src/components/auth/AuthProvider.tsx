'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/browser';

export type Role = 'admin' | 'terminal';

interface AuthState {
  session: Session | null;
  role: Role | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  // Recuerda de qué usuario es el rol cargado, para no volver a pedirlo
  // en cada renovación del token (pasa cada hora).
  const loadedUserRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    async function apply(next: Session | null) {
      if (!active) return;

      if (!next) {
        loadedUserRef.current = null;
        setSession(null);
        setRole(null);
        setLoading(false);
        return;
      }

      // Mismo usuario con rol ya cargado: solo se actualiza la sesión
      if (loadedUserRef.current === next.user.id) {
        setSession(next);
        return;
      }

      // Usuario nuevo: se muestra "Verificando sesión…" hasta tener el rol,
      // así nunca aparece una sesión sin rol por un instante.
      setLoading(true);

      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', next.user.id)
        .maybeSingle();

      if (!active) return;
      if (error) console.error('Error leyendo el perfil:', error);

      loadedUserRef.current = next.user.id;
      setSession(next);
      setRole((data?.role as Role) ?? null);
      setLoading(false);
    }

    supabase.auth.getSession().then(({ data }) => apply(data.session));

    // Supabase recomienda no hacer consultas dentro del callback: se difiere con setTimeout
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setTimeout(() => apply(next), 0);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  const value = useMemo<AuthState>(
    () => ({
      session,
      role,
      loading,
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, role, loading, supabase]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}