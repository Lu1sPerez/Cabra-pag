'use client';

import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useRealTimeTables, type TableStatus } from '@/hooks/UseRealTimeTables';

const STATUS_STYLES: Record<TableStatus, string> = {
  free: 'bg-green-100 border-green-500 hover:bg-green-200 text-green-900',
  occupied: 'bg-red-100 border-red-500 hover:bg-red-200 text-red-900',
  paying: 'bg-yellow-100 border-yellow-500 hover:bg-yellow-200 text-yellow-900',
};

const STATUS_LABELS: Record<TableStatus, string> = {
  free: 'Libre',
  occupied: 'Ocupada',
  paying: 'Por pagar',
};

export default function TableGrid() {
  const { zones, loading, error, connected } = useRealTimeTables();

  if (loading) {
    return <div className="p-6 max-w-7xl mx-auto text-slate-500">Cargando mesas…</div>;
  }

  if (error) {
    return <div className="p-6 max-w-7xl mx-auto text-red-600">{error}</div>;
  }

  if (zones.length === 0) {
    return (
      <div className="p-6 max-w-7xl mx-auto text-slate-600">
        No hay zonas cargadas. Crea una zona y sus mesas en Supabase para empezar.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 p-6 w-full max-w-7xl mx-auto">
      {!connected && (
        <div className="rounded-md border border-yellow-400 bg-yellow-50 px-4 py-2 text-sm text-yellow-900">
          Reconectando… los cambios de otras pantallas pueden tardar en aparecer.
        </div>
      )}

      {zones.map((zone) => (
        <section key={zone.id} className="space-y-4">
          <h2 className="text-2xl font-semibold text-slate-800 border-b pb-2">{zone.name}</h2>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {zone.tables.map((table) => (
              <Link key={table.id} href={`/salon/${table.id}`}>
                <Card
                  className={cn(
                    'cursor-pointer transition-colors duration-300 border-2 shadow-sm flex flex-col items-center justify-center h-32',
                    STATUS_STYLES[table.status] ?? 'bg-gray-100 border-gray-500 text-gray-900'
                  )}
                >
                  <CardHeader className="p-2 pb-0 items-center">
                    <CardTitle className="text-xl font-bold">{table.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-2 flex flex-col items-center gap-1">
                    <Badge variant="outline" className="bg-white/80 font-medium">
                      {STATUS_LABELS[table.status] ?? 'Desconocido'}
                    </Badge>
                    {table.capacity != null && (
                      <span className="text-xs opacity-75">{table.capacity} personas</span>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}