import TableGrid from '@/components/salon/TableGrid';
import SalonHeaderActions from '@/components/auth/SalonHeaderActions';

export default function SalonPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-white shadow-sm border-b p-4 mb-6">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-slate-800">Control de Salón</h1>
          <SalonHeaderActions />
        </div>
      </header>

      <TableGrid />
    </main>
  );
}
