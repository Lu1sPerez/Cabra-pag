import Link from 'next/link';
import SalesAnalytics from '@/components/admin/SalesAnalytics';

export default function AnalisisPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <header className="h-16 bg-white border-b px-4 flex items-center gap-4 text-sm font-medium">
        <Link href="/" className="text-slate-600 hover:text-slate-900 hover:underline">
          Volver al salón
        </Link>
        <Link href="/admin" className="text-slate-600 hover:text-slate-900 hover:underline">
          Administración
        </Link>
      </header>

      <SalesAnalytics />
    </main>
  );
}
