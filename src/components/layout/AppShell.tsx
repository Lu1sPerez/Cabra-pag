'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  Coffee,
  History,
  LayoutGrid,
  Lock,
  LogOut,
  Map as MapIcon,
  MessageCircle,
  ReceiptText,
  Settings,
  Users,
  Wallet,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Logo from '@/components/brand/Logo';
import { useAuth } from '@/components/auth/AuthProvider';
import { useStaff } from '@/components/auth/StaffProvider';

type NavItem = { href: string; label: string; icon: typeof LayoutGrid; show: 'all' | 'manager' | 'admin' };

const NAV: NavItem[] = [
  { href: '/', label: 'Salón', icon: LayoutGrid, show: 'all' },
  { href: '/caja', label: 'Caja', icon: Wallet, show: 'manager' },
  { href: '/admin/ventas', label: 'Ventas', icon: History, show: 'admin' },
  { href: '/admin/analisis', label: 'Análisis', icon: BarChart3, show: 'admin' },
  { href: '/admin/asistente', label: 'Asistente', icon: MessageCircle, show: 'admin' },
  { href: '/admin/gastos', label: 'Gastos', icon: ReceiptText, show: 'admin' },
  { href: '/admin/productos', label: 'Menú', icon: Coffee, show: 'admin' },
  { href: '/admin/plano', label: 'Plano', icon: MapIcon, show: 'admin' },
  { href: '/admin/mozos', label: 'Mozos', icon: Users, show: 'admin' },
  { href: '/admin', label: 'Ajustes', icon: Settings, show: 'admin' },
];

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/' || pathname.startsWith('/salon');
  if (href === '/admin') return pathname === '/admin' || pathname.startsWith('/admin/medios-pago');
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const { role, signOut } = useAuth();
  const { staff, lock } = useStaff();

  const isAdmin = role === 'admin';
  const isManager = isAdmin || (role === 'terminal' && !!staff?.is_manager);
  const items = NAV.filter((i) => i.show === 'all' || (i.show === 'manager' ? isManager : isAdmin));

  const handleSignOut = async () => {
    await signOut();
    router.replace('/login');
  };

  return (
    <div className="flex min-h-screen flex-col sm:flex-row">
      <nav
        aria-label="Secciones"
        className="z-30 flex shrink-0 items-center gap-1 overflow-x-auto bg-slate-900 px-2 py-2 sm:sticky sm:top-0 sm:h-screen sm:w-[88px] sm:flex-col sm:overflow-y-auto sm:overflow-x-visible sm:px-0 sm:py-4"
      >
        <Link href="/" className="mx-2 shrink-0 text-slate-50 sm:mx-0 sm:mb-3" aria-label="Ir al salón">
          <Logo className="h-9 w-10 sm:h-12 sm:w-[56px]" />
        </Link>

        {items.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex w-[72px] shrink-0 flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-semibold transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300',
                active ? 'bg-slate-50 text-slate-900' : 'text-blue-200 hover:bg-slate-50/10 hover:text-slate-50'
              )}
            >
              <Icon size={22} aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}

        <div className="flex-1" />

        {role === 'terminal' ? (
          <button
            type="button"
            onClick={lock}
            className="flex w-[72px] shrink-0 flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-semibold text-blue-200 hover:bg-slate-50/10 hover:text-slate-50"
          >
            <Lock size={20} aria-hidden="true" />
            <span className="max-w-[64px] truncate">{staff?.name ?? 'Bloquear'}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSignOut}
            className="flex w-[72px] shrink-0 flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-semibold text-blue-200 hover:bg-slate-50/10 hover:text-slate-50"
          >
            <LogOut size={20} aria-hidden="true" />
            Salir
          </button>
        )}
      </nav>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
