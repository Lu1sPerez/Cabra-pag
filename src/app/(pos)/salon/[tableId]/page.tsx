import Link from 'next/link';
import OrderMenu from '@/components/salon/OrderMenu';

export default function MesaPage({ params }: { params: { tableId: string } }) {
  return (
    <main className="min-h-screen bg-slate-50">
      <header className="h-16 bg-white border-b px-4 flex items-center">
        <Link
          href="/"
          className="text-sm font-medium text-slate-600 hover:text-slate-900 hover:underline"
        >
          Volver al salón
        </Link>
      </header>

      <OrderMenu tableId={params.tableId} />
    </main>
  );
}
