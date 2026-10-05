'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/browser';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type TableStatus = 'free' | 'occupied' | 'paying';

export interface TableType {
  id: string;
  name: string;
  status: TableStatus;
  capacity: number | null;
}

export interface ZoneType {
  id: string;
  name: string;
  tables: TableType[];
}

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
  const [zones, setZones] = useState<ZoneType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      const { data, error } = await supabase
        .from('zones')
        .select('id, name, tables ( id, name, status, capacity )')
        .order('name')
        .order('name', { referencedTable: 'tables' });

      if (error) {
        console.error('Error cargando zonas:', error);
        setError(
          'No se pudo cargar el salón. Revisa la conexión con Supabase y las políticas RLS.'
        );
      } else {
        setZones((data ?? []) as ZoneType[]);
      }
      setLoading(false);
    }

    load();
  }, []);

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto text-slate-500">
        Cargando mesas…
      </div>
    );
  }

  if (error) {
    return <div className="p-6 max-w-7xl mx-auto text-red-600">{error}</div>;
  }

  if (zones.length === 0) {
    return (
      <div className="p-6 max-w-7xl mx-auto text-slate-600">
        No hay zonas cargadas. Crea una zona y sus mesas en Supabase para
        empezar.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 p-6 w-full max-w-7xl mx-auto">
      {zones.map((zone) => (
        <section key={zone.id} className="space-y-4">
          <h2 className="text-2xl font-semibold text-slate-800 border-b pb-2">
            {zone.name}
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {zone.tables.map((table) => (
              <Link key={table.id} href={`/salon/${table.id}`}>
                <Card
                  className={cn(
                    'cursor-pointer transition-colors border-2 shadow-sm flex flex-col items-center justify-center h-32',
                    STATUS_STYLES[table.status] ??
                      'bg-gray-100 border-gray-500 text-gray-900'
                  )}
                >
                  <CardHeader className="p-2 pb-0 items-center">
                    <CardTitle className="text-xl font-bold">
                      {table.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-2 flex flex-col items-center gap-1">
                    <Badge
                      variant="outline"
                      className="bg-white/80 font-medium"
                    >
                      {STATUS_LABELS[table.status] ?? 'Desconocido'}
                    </Badge>
                    {table.capacity != null && (
                      <span className="text-xs opacity-75">
                        {table.capacity} personas
                      </span>
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
