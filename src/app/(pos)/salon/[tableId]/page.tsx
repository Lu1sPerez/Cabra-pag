import Link from 'next/link';

export default function MesaPage({ params }: { params: { tableId: string } }) {
  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <Link href="/" className="text-sm text-slate-600 hover:underline">
          Volver al salón
        </Link>
        <h1 className="text-2xl font-bold text-slate-800">Mesa</h1>
        <p className="text-slate-600">ID: {params.tableId}</p>
      </div>
    </main>
  );
}