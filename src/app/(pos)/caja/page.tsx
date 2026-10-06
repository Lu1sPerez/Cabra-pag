import Link from 'next/link';
import CashReport from '@/components/caja/CashReport';

export default function CajaPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <header className="h-16 bg-white border-b px-4 flex items-center print:hidden">
        <Link
          href="/"
          className="text-sm font-medium text-slate-600 hover:text-slate-900 hover:underline"
        >
          Volver al salón
        </Link>
      </header>

      <CashReport />
    </main>
  );
}
