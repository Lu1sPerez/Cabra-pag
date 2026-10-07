'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/auth/AuthProvider';

export default function SalonHeaderActions() {
  const { session, role, signOut } = useAuth();
  const router = useRouter();
  const isAdmin = role === 'admin';

  const handleSignOut = async () => {
    await signOut();
    router.replace('/login');
  };

  return (
    <div className="flex flex-wrap items-center gap-4">
      {isAdmin && (
        <nav className="flex items-center gap-4 text-sm font-medium">
          <Link href="/caja" className="text-slate-600 hover:text-slate-900 hover:underline">
            Cierre de caja
          </Link>
          <Link href="/admin" className="text-slate-600 hover:text-slate-900 hover:underline">
            Administración
          </Link>
        </nav>
      )}

      <div className="flex items-center gap-2 border-l pl-4">
        <span className="text-sm text-slate-600 max-w-[12rem] truncate" title={session?.user.email}>
          {session?.user.email}
        </span>
        <Button variant="ghost" size="sm" onClick={handleSignOut}>
          <LogOut size={16} />
          Salir
        </Button>
      </div>
    </div>
  );
}