import Link from 'next/link';

export default function CocinaPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-sm text-center space-y-3">
        <h1 className="text-2xl font-bold text-slate-800">Pantalla de cocina</h1>
        <p className="text-slate-600">Esta sección todavía está en preparación.</p>
        <Link href="/" className="text-sm font-medium text-blue-600 hover:underline">
          Volver al salón
        </Link>
      </div>
    </main>
  );
}


