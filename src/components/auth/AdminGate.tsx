'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { useStaff } from '@/components/auth/StaffProvider';

// Secciones de Ajustes que también puede abrir el encargado con su PIN.
// La base vuelve a controlar el permiso en cada consulta.
export const MANAGER_SECTIONS = ['/admin/ventas', '/admin/gastos'];

export function isManagerSection(pathname: string) {
  return MANAGER_SECTIONS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export default function AdminGate({ children }: { children: React.ReactNode }) {
  const { role } = useAuth();
  const { staff } = useStaff();
  const pathname = usePathname() ?? '';

  if (role === 'admin') return <>{children}</>;
  if (role === 'terminal' && staff?.is_manager && isManagerSection(pathname)) return <>{children}</>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-sm text-center space-y-4">
        <p className="text-slate-700">
          {role === 'terminal' && isManagerSection(pathname)
            ? 'Esta sección es solo para encargados. Ingresa con el PIN de un encargado.'
            : 'Esta sección es solo para administradores.'}
        </p>
        <Link href="/" className="text-sm font-medium text-blue-600 hover:underline">
          Volver al salón
        </Link>
      </div>
    </div>
  );
}
