'use client';

import Link from 'next/link';
import { useAuth } from '@/components/auth/AuthProvider';
import { useStaff } from '@/components/auth/StaffProvider';

// Deja pasar al admin, o al encargado que ingresó con su PIN en la tablet.
export default function RequireManager({ children }: { children: React.ReactNode }) {
  const { role } = useAuth();
  const { staff } = useStaff();

  if (role === 'admin' || (role === 'terminal' && staff?.is_manager)) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-sm text-center space-y-4">
        <p className="text-slate-700">El cierre de caja es solo para encargados y administradores.</p>
        <Link href="/" className="text-sm font-medium text-blue-600 hover:underline">
          Volver al salón
        </Link>
      </div>
    </div>
  );
}
