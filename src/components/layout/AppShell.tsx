'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  ChevronRight,
  Coffee,
  CreditCard,
  History,
  LayoutGrid,
  Lock,
  LogOut,
  Map as MapIcon,
  MessageCircle,
  Moon,
  ReceiptText,
  Settings,
  Sun,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Logo from '@/components/brand/Logo';
import { useAuth } from '@/components/auth/AuthProvider';
import { useStaff } from '@/components/auth/StaffProvider';
import { getTheme, setTheme, type Theme } from '@/lib/theme';

type MenuItem = { href: string; label: string; hint?: string; icon: typeof LayoutGrid };

// Operación diaria: encargados y admin
const OPERATION: MenuItem[] = [
  { href: '/caja', label: 'Caja y arqueo', hint: 'Cierre del día y efectivo', icon: Wallet },
  { href: '/admin/ventas', label: 'Ventas', hint: 'Historial de mesas y tickets', icon: History },
  { href: '/admin/gastos', label: 'Gastos', hint: 'Compras y pagos del local', icon: ReceiptText },
];

// Administración: solo admin
const ADMIN: MenuItem[] = [
  { href: '/admin/productos', label: 'Productos y precios', icon: Coffee },
  { href: '/admin/plano', label: 'Plano del salón', icon: MapIcon },
  { href: '/admin/medios-pago', label: 'Medios de pago', icon: CreditCard },
  { href: '/admin/mozos', label: 'Mozos y PIN', icon: Users },
  { href: '/admin/analisis', label: 'Análisis', icon: BarChart3 },
  { href: '/admin/asistente', label: 'Asistente', icon: MessageCircle },
  { href: '/admin', label: 'Ajustes', icon: Settings },
];

const matches = (pathname: string, href: string) =>
  href === '/admin' ? pathname === '/admin' : pathname === href || pathname.startsWith(`${href}/`);

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const { role, signOut } = useAuth();
  const { staff, lock } = useStaff();
  const now = useClock();
  const [menuOpen, setMenuOpen] = useState(false);

  const isAdmin = role === 'admin';
  const isManager = isAdmin || (role === 'terminal' && !!staff?.is_manager);
  const operation = isManager ? OPERATION : [];
  const admin = isAdmin ? ADMIN : [];

  const salonActive = pathname === '/' || pathname.startsWith('/salon');
  const mostradorActive = pathname.startsWith('/mostrador');
  const section = [...operation, ...admin].find((i) => matches(pathname, i.href));

  const personName = isAdmin ? 'Administración' : staff?.name ?? 'Sin mozo';
  const personRole = isAdmin ? 'Admin' : staff?.is_manager ? 'Encargado' : 'Mozo';
  const initial = (isAdmin ? 'A' : staff?.name?.trim()[0] ?? '·').toUpperCase();

  // Al cambiar de pantalla se cierra el menú
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const handleSignOut = async () => {
    await signOut();
    router.replace('/login');
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b bg-bar px-3 sm:gap-3 sm:px-5">
        <Link href="/" aria-label="Ir al salón" className="flex shrink-0 items-center gap-2.5 rounded-lg pr-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          <Logo className="h-8 w-9 text-slate-900" />
          <span className="hidden flex-col leading-tight md:flex">
            <strong className="font-display text-base font-extrabold tracking-wide text-slate-900">Cabra Austral</strong>
            <span className="text-[11px] font-semibold text-slate-500">Perito Moreno</span>
          </span>
        </Link>

        <nav aria-label="Secciones" className="flex min-w-0 items-center gap-1 rounded-xl bg-slate-100 p-1">
          <Link
            href="/"
            aria-current={salonActive ? 'page' : undefined}
            className={cn(
              'flex h-10 items-center rounded-lg px-4 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
              salonActive ? 'bg-surface text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
            )}
          >
            Salón
          </Link>
          <Link
            href="/mostrador"
            aria-current={mostradorActive ? 'page' : undefined}
            className={cn(
              'flex h-10 items-center rounded-lg px-4 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
              mostradorActive ? 'bg-surface text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
            )}
          >
            Mostrador
          </Link>
          {section && (
            <span aria-current="page" className="flex h-10 min-w-0 items-center gap-2 rounded-lg bg-surface px-3 text-sm font-bold text-slate-900 shadow-sm">
              <section.icon size={16} aria-hidden="true" className="shrink-0 text-slate-500" />
              <span className="truncate">{section.label}</span>
            </span>
          )}
        </nav>

        <div className="flex-1" />

        {now && (
          <span className="hidden font-display text-xl font-bold tabular-nums text-slate-900 sm:block" aria-label={`Hora ${now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`}>
            {now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })}
          </span>
        )}

        {role === 'terminal' ? (
          <button
            type="button"
            onClick={lock}
            aria-label={`${personName}, ${personRole}. Cambiar de mozo`}
            className="flex h-11 items-center gap-2 rounded-xl border bg-surface pl-1.5 pr-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-sm font-extrabold text-white">{initial}</span>
            <span className="hidden flex-col leading-tight md:flex">
              <strong className="max-w-[120px] truncate text-sm text-slate-900">{personName}</strong>
              <span className="text-[11px] font-semibold text-slate-500">{personRole}</span>
            </span>
            <Lock size={14} aria-hidden="true" className="text-slate-500 md:ml-1" />
          </button>
        ) : (
          <span className="hidden h-11 items-center gap-2 rounded-xl border bg-surface pl-1.5 pr-3 md:flex">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-sm font-extrabold text-white">{initial}</span>
            <strong className="text-sm text-slate-900">{personName}</strong>
          </span>
        )}

        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          className="flex h-11 items-center gap-2 rounded-xl bg-slate-900 px-3.5 text-sm font-extrabold text-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          <LayoutGrid size={18} aria-hidden="true" />
          Más
        </button>
      </header>

      <div className="min-w-0 flex-1">{children}</div>

      {menuOpen && (
        <MoreMenu
          onClose={() => setMenuOpen(false)}
          pathname={pathname}
          personName={personName}
          personRole={personRole}
          initial={initial}
          operation={operation}
          admin={admin}
          isTerminal={role === 'terminal'}
          onLock={() => {
            setMenuOpen(false);
            lock();
          }}
          onSignOut={isAdmin ? handleSignOut : undefined}
        />
      )}
    </div>
  );
}

function MoreMenu({
  onClose,
  pathname,
  personName,
  personRole,
  initial,
  operation,
  admin,
  isTerminal,
  onLock,
  onSignOut,
}: {
  onClose: () => void;
  pathname: string;
  personName: string;
  personRole: string;
  initial: string;
  operation: MenuItem[];
  admin: MenuItem[];
  isTerminal: boolean;
  onLock: () => void;
  onSignOut?: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [theme, setThemeState] = useState<Theme>('dark');

  useEffect(() => {
    setThemeState(getTheme());
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const chooseTheme = (t: Theme) => {
    setTheme(t);
    setThemeState(t);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="menu-mas-titulo"
        className="flex h-full w-full max-w-[420px] flex-col border-l bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b px-5 py-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-600 text-base font-extrabold text-white">{initial}</span>
          <span className="flex min-w-0 flex-1 flex-col">
            <strong id="menu-mas-titulo" className="truncate text-base text-slate-900">{personName}</strong>
            <span className="text-xs font-semibold text-slate-500">{personRole}</span>
          </span>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar menú"
            className="flex h-11 w-11 items-center justify-center rounded-xl border text-slate-900 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {operation.length > 0 && (
            <>
              <p className="px-3 pb-1.5 pt-3 text-[11px] font-extrabold tracking-[0.08em] text-slate-500">OPERACIÓN</p>
              <ul>
                {operation.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={matches(pathname, item.href) ? 'page' : undefined}
                      className={cn(
                        'flex min-h-[56px] items-center gap-3.5 rounded-xl px-3 text-slate-900 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                        matches(pathname, item.href) && 'bg-slate-100'
                      )}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                        <item.icon size={19} aria-hidden="true" />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <strong className="text-[15px]">{item.label}</strong>
                        {item.hint && <span className="text-xs text-slate-500">{item.hint}</span>}
                      </span>
                      <ChevronRight size={18} aria-hidden="true" className="text-slate-400" />
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}

          {admin.length > 0 && (
            <>
              <p className="px-3 pb-2 pt-5 text-[11px] font-extrabold tracking-[0.08em] text-slate-500">ADMINISTRACIÓN</p>
              <ul className="grid grid-cols-2 gap-2 px-1">
                {admin.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={matches(pathname, item.href) ? 'page' : undefined}
                      className={cn(
                        'flex h-16 items-center gap-2.5 rounded-xl border px-3 text-sm font-bold text-slate-900 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                        matches(pathname, item.href) && 'border-blue-600'
                      )}
                    >
                      <item.icon size={19} aria-hidden="true" className="shrink-0" />
                      <span className="leading-tight">{item.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}

          {operation.length === 0 && admin.length === 0 && (
            <p className="px-3 py-4 text-sm text-slate-500">
              Las secciones de caja, ventas y gastos las ve el encargado. Ingresa con su PIN para abrirlas.
            </p>
          )}

          <p className="px-3 pb-2 pt-5 text-[11px] font-extrabold tracking-[0.08em] text-slate-500">PANTALLA</p>
          <div role="radiogroup" aria-label="Tema" className="mx-1 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
            {(
              [
                { id: 'dark', label: 'Oscuro', icon: Moon },
                { id: 'light', label: 'Claro', icon: Sun },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={theme === opt.id}
                onClick={() => chooseTheme(opt.id)}
                className={cn(
                  'flex h-11 items-center justify-center gap-2 rounded-lg text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                  theme === opt.id ? 'bg-surface text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                )}
              >
                <opt.icon size={16} aria-hidden="true" />
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <footer className="grid gap-2 border-t px-5 py-4">
          {isTerminal && (
            <button
              type="button"
              onClick={onLock}
              className="flex h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 text-[15px] font-extrabold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              <Lock size={18} aria-hidden="true" />
              Cambiar de mozo
            </button>
          )}
          {onSignOut && (
            <button
              type="button"
              onClick={onSignOut}
              className="flex h-12 items-center justify-center gap-2 rounded-xl border text-[15px] font-bold text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <LogOut size={18} aria-hidden="true" />
              Cerrar sesión
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
