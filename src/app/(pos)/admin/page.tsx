import Link from 'next/link';

const SECTIONS = [
  {
    href: '/admin/plano',
    title: 'Plano del salón',
    description: 'Zonas, mesas y su ubicación en el local.',
  },
  {
    href: '/admin/productos',
    title: 'Productos y categorías',
    description: 'Menú, precios y productos activos.',
  },
];

export default function AdminPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <header className="h-16 bg-white border-b px-4 flex items-center">
        <Link href="/" className="text-sm font-medium text-slate-600 hover:text-slate-900 hover:underline">
          Volver al salón
        </Link>
      </header>

      <div className="max-w-3xl mx-auto p-6 space-y-4">
        <h1 className="text-2xl font-bold text-slate-800">Administración</h1>

        <div className="grid gap-4 sm:grid-cols-2">
          {SECTIONS.map((s) => (
            <Link
              key={s.title}
              href={s.href}
              className="rounded-xl border bg-white p-5 hover:border-blue-500 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <h2 className="font-semibold text-slate-800">{s.title}</h2>
              <p className="text-sm text-slate-500 mt-1">{s.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
