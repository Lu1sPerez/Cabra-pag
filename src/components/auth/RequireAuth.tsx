'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useAuth, type Role } from '@/components/auth/AuthProvider';

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-sm text-center space-y-4">{children}</div>
    </div>
  );
}

export default function RequireAuth({
  role: requiredRole,
  children,
}: {
  role?: Role;
  children: React.ReactNode;
}) {
  const { session, role, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !session) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [loading, session, pathname, router]);

  if (loading || !session) {
    return (
      <Screen>
        <p className="text-slate-500">Verificando sesión…</p>
      </Screen>
    );
  }

  if (!role) {
    return (
      <Screen>
        <p className="text-slate-700">
          Tu usuario no tiene un rol asignado. Pide al administrador que te habilite.
        </p>
        <Button variant="outline" onClick={signOut}>
          Cerrar sesión
        </Button>
      </Screen>
    );
  }

  if (requiredRole && role !== requiredRole) {
    return (
      <Screen>
        <p className="text-slate-700">Esta sección es solo para administradores.</p>
        <Link href="/" className="text-sm font-medium text-blue-600 hover:underline">
          Volver al salón
        </Link>
      </Screen>
    );
  }

  return <>{children}</>;
}