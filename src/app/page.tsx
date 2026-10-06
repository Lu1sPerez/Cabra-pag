import Link from 'next/link';
import TableGrid from '@/components/salon/TableGrid';

export default function SalonPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-white shadow-sm border-b p-4 mb-6">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-slate-800">Control de Salón</h1>

          <div className="flex items-center gap-6">
            <nav className="flex items-center gap-4 text-sm font-medium">
              <Link href="/caja" className="text-slate-600 hover:text-slate-900 hover:underline">
                Cierre de caja
              </Link>
              <Link href="/admin" className="text-slate-600 hover:text-slate-900 hover:underline">
                Administración
              </Link>
            </nav>

            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
              <span className="text-sm font-medium text-slate-600">Sistema Online</span>
            </div>
          </div>
        </div>
      </header>

      <TableGrid />
    </main>
  );
}
