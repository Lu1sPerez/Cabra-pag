import Link from 'next/link';

const SECTIONS = [
  {
    href: '/admin/ventas',
    title: 'Historial de ventas',
    description: 'Cada mesa cobrada: qué consumió, quién atendió, cómo pagó y su ticket.',
  },
  {
    href: '/admin/medios-pago',
    title: 'Medios de pago',
    description: 'Efectivo, tarjetas, billeteras y transferencias, con recargos o descuentos.',
  },
  {
    href: '/admin/asistente',
    title: 'Asistente',
    description: 'Pregúntale a la IA por ventas, gastos y el estado del salón.',
  },
  {
    href: '/admin/analisis',
    title: 'Análisis de ventas',
    description: 'Ventas, horarios, productos, mozos y medios de pago.',
  },
  {
    href: '/admin/gastos',
    title: 'Gastos',
    description: 'Compras, alquiler y demás salidas de dinero, por categoría.',
  },
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
  {
    href: '/admin/mozos',
    title: 'Mozos',
    description: 'Personal del salón y sus PIN de ingreso.',
  },
];

export default function AdminPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-4">
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-slate-900 leading-none">Ajustes</h1>

        <div className="grid gap-4 sm:grid-cols-2">
          {SECTIONS.map((s) => (
            <Link
              key={s.title}
              href={s.href}
              className="rounded-xl border bg-white p-5 hover:border-blue-500 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <h2 className="font-display text-lg font-bold text-slate-900">{s.title}</h2>
              <p className="text-sm text-slate-500 mt-1">{s.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
