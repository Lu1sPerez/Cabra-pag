'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/browser';

export type TableStatus = 'free' | 'occupied' | 'paying';

export interface TableType {
  id: string;
  zone_id: string;
  name: string;
  status: TableStatus;
  capacity?: number | null;
}

export interface ZoneType {
  id: string;
  name: string;
  tables: TableType[];
}

export function useRealTimeTables() {
  const [zones, setZones] = useState<ZoneType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    async function load() {
      const { data, error } = await supabase
        .from('zones')
        .select('id, name, tables ( * )')
        .order('name')
        .order('name', { referencedTable: 'tables' });

      if (!active) return;

      if (error) {
        console.error('Error cargando zonas:', error);
        setError('No se pudo cargar el salón. Revisa la conexión con Supabase y las políticas RLS.');
      } else {
        setError(null);
        setZones((data ?? []) as ZoneType[]);
      }
      setLoading(false);
    }

    load();

    const channel = supabase
      .channel(`salon-tables-${Math.random().toString(36).slice(2)}`)
      // Cambios en mesas
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables' }, (payload) => {
        if (payload.eventType === 'UPDATE') {
          const updated = payload.new as TableType;

          setZones((prev) => {
            const found = prev.some((z) => z.tables.some((t) => t.id === updated.id));
            const sameZone = prev.some(
              (z) => z.id === updated.zone_id && z.tables.some((t) => t.id === updated.id)
            );

            // Si la mesa cambió de zona o no la teníamos, recargamos todo
            if (!found || !sameZone) {
              load();
              return prev;
            }

            // Cambio de estado o nombre: actualizamos solo esa mesa
            return prev.map((z) => ({
              ...z,
              tables: z.tables.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)),
            }));
          });
        } else {
          // INSERT o DELETE: recargamos para mantener el orden correcto
          load();
        }
      })
      // Cambios en zonas (nueva zona, renombre, borrado)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'zones' }, () => {
        load();
      })
      .subscribe((status, err) => {
        console.log('Realtime:', status, err ?? '');
        if (!active) return;
        setConnected(status === 'SUBSCRIBED');
      });

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, []);

  return { zones, loading, error, connected };
}