'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { TABLE_FIELDS, type FloorTable, type FloorZone } from '@/lib/floor';

export type { FloorTable, FloorZone, TableStatus } from '@/lib/floor';

export function useRealTimeTables() {
  const [zones, setZones] = useState<FloorZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const zonesRef = useRef<FloorZone[]>([]);

  useEffect(() => {
    zonesRef.current = zones;
  }, [zones]);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    async function load() {
      const { data, error } = await supabase
        .from('zones')
        .select(`id, name, tables ( ${TABLE_FIELDS} )`)
        .eq('is_active', true)
        .eq('tables.is_active', true)
        .order('name')
        .order('name', { referencedTable: 'tables' });

      if (!active) return;

      if (error) {
        console.error('Error cargando zonas:', error);
        setError('No se pudo cargar el salón. Revisa la conexión con Supabase y las políticas RLS.');
      } else {
        setError(null);
        setZones((data ?? []) as unknown as FloorZone[]);
      }
      setLoading(false);
    }

    load();

    const channel = supabase
      .channel(`salon-tables-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables' }, (payload) => {
        if (payload.eventType !== 'UPDATE') {
          load();
          return;
        }

        const updated = payload.new as FloorTable;
        const inSameZone = zonesRef.current.some(
          (z) => z.id === updated.zone_id && z.tables.some((t) => t.id === updated.id)
        );

        // Mesa nueva para esta vista, movida de zona o dada de baja: recarga completa
        if (!inSameZone || updated.is_active === false) {
          load();
          return;
        }

        // Cambio de estado, nombre, posición o tamaño: actualiza solo esa mesa
        setZones((prev) =>
          prev.map((z) => ({
            ...z,
            tables: z.tables.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)),
          }))
        );
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'zones' }, () => {
        load();
      })
      .subscribe((status) => {
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
