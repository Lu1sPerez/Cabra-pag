'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  createTable,
  createZone,
  deactivateTable,
  deactivateZone,
  getFloor,
  renameZone,
  updateTable,
} from '@/actions/floor-actions';
import {
  CANVAS_GRID_STYLE,
  CANVAS_H,
  CANVAS_W,
  GRID,
  SHAPE_LABELS,
  SIZE_LABELS,
  SIZE_PRESETS,
  STATUS_LABELS,
  clamp,
  sizeOf,
  snap,
  tableStyle,
  type FloorTable,
  type FloorZone,
  type Shape,
  type SizeKey,
} from '@/lib/floor';

type DragState = {
  id: string;
  startX: number;
  startY: number;
  origX: number;
  origY: number;
  x: number;
  y: number;
  moved: boolean;
};

export default function FloorEditor() {
  const [zones, setZones] = useState<FloorZone[]>([]);
  const [activeZoneId, setActiveZoneId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newZoneName, setNewZoneName] = useState('');

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const keySaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeZone = zones.find((z) => z.id === activeZoneId) ?? null;
  const selected = activeZone?.tables.find((t) => t.id === selectedId) ?? null;

  // --- Carga ---
  const reload = useCallback(async () => {
    const data = await getFloor();
    setZones(data);
    setActiveZoneId((current) =>
      current && data.some((z) => z.id === current) ? current : data[0]?.id ?? null
    );
  }, []);

  useEffect(() => {
    reload()
      .catch((e) => {
        console.error(e);
        setError('No se pudo cargar el plano. Revisa que hayas ejecutado plano.sql.');
      })
      .finally(() => setLoading(false));
  }, [reload]);

  // --- Helpers de estado ---
  const patchLocal = (id: string, patch: Partial<FloorTable>) => {
    setZones((prev) =>
      prev.map((z) => ({
        ...z,
        tables: z.tables.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      }))
    );
  };

  const persist = async (id: string, patch: Partial<FloorTable>) => {
    setSaving(true);
    setError(null);
    try {
      await updateTable(id, patch);
    } catch (e: any) {
      console.error(e);
      setError(`No se pudo guardar el cambio: ${e?.message ?? 'error desconocido'}`);
      await reload();
    } finally {
      setSaving(false);
    }
  };

  const saveTable = (id: string, patch: Partial<FloorTable>) => {
    patchLocal(id, patch);
    persist(id, patch);
  };

  const run = async (action: () => Promise<void>) => {
    setSaving(true);
    setError(null);
    try {
      await action();
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? 'Ocurrió un error inesperado.');
      await reload();
    } finally {
      setSaving(false);
    }
  };

  // --- Arrastre ---
  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>, table: FloorTable) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setSelectedId(table.id);
    dragRef.current = {
      id: table.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: table.pos_x,
      origY: table.pos_y,
      x: table.pos_x,
      y: table.pos_y,
      moved: false,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>, table: FloorTable) => {
    const d = dragRef.current;
    const canvas = canvasRef.current;
    if (!d || d.id !== table.id || !canvas) return;

    const distance = Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY);
    if (!d.moved && distance < 4) return;
    d.moved = true;

    const rect = canvas.getBoundingClientRect();
    const dx = ((e.clientX - d.startX) / rect.width) * CANVAS_W;
    const dy = ((e.clientY - d.startY) / rect.height) * CANVAS_H;

    d.x = clamp(snap(d.origX + dx), 0, CANVAS_W - table.width);
    d.y = clamp(snap(d.origY + dy), 0, CANVAS_H - table.height);
    patchLocal(table.id, { pos_x: d.x, pos_y: d.y });
  };

  const onPointerUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || !d.moved) return;
    if (d.x !== d.origX || d.y !== d.origY) {
      persist(d.id, { pos_x: d.x, pos_y: d.y });
    }
  };

  // --- Teclado: flechas mueven la mesa seleccionada (Shift = paso grande) ---
  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, table: FloorTable) => {
    const step = e.shiftKey ? GRID * 5 : GRID;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();

    const x = clamp(table.pos_x + move[0], 0, CANVAS_W - table.width);
    const y = clamp(table.pos_y + move[1], 0, CANVAS_H - table.height);
    patchLocal(table.id, { pos_x: x, pos_y: y });

    if (keySaveRef.current) clearTimeout(keySaveRef.current);
    keySaveRef.current = setTimeout(() => persist(table.id, { pos_x: x, pos_y: y }), 400);
  };

  // --- Zonas ---
  const handleAddZone = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newZoneName.trim();
    if (!name) return;
    run(async () => {
      const zone = await createZone(name);
      setZones((prev) => [...prev, zone].sort((a, b) => a.name.localeCompare(b.name)));
      setActiveZoneId(zone.id);
      setSelectedId(null);
      setNewZoneName('');
    });
  };

  const handleRenameZone = (zone: FloorZone, name: string) => {
    const clean = name.trim();
    if (!clean || clean === zone.name) return;
    run(async () => {
      await renameZone(zone.id, clean);
      setZones((prev) => prev.map((z) => (z.id === zone.id ? { ...z, name: clean } : z)));
    });
  };

  const handleDeleteZone = (zone: FloorZone) => {
    if (zone.tables.length > 0) return;
    if (!window.confirm(`¿Quitar la zona "${zone.name}"?`)) return;
    run(async () => {
      await deactivateZone(zone.id);
      const rest = zones.filter((z) => z.id !== zone.id);
      setZones(rest);
      setActiveZoneId(rest[0]?.id ?? null);
      setSelectedId(null);
    });
  };

  // --- Mesas ---
  const nextTableName = (zone: FloorZone) => {
    const prefix = (zone.name.trim()[0] ?? 'M').toUpperCase();
    const names = new Set(zone.tables.map((t) => t.name));
    let n = zone.tables.length + 1;
    while (names.has(`${prefix}${n}`)) n++;
    return `${prefix}${n}`;
  };

  const findFreeSpot = (zone: FloorZone, w: number, h: number) => {
    for (let y = 40; y <= CANVAS_H - h; y += 20) {
      for (let x = 40; x <= CANVAS_W - w; x += 20) {
        const overlaps = zone.tables.some(
          (t) =>
            x < t.pos_x + t.width + 20 &&
            x + w + 20 > t.pos_x &&
            y < t.pos_y + t.height + 20 &&
            y + h + 20 > t.pos_y
        );
        if (!overlaps) return { x, y };
      }
    }
    return { x: 0, y: 0 };
  };

  const handleAddTable = () => {
    if (!activeZone) return;
    const [w, h] = SIZE_PRESETS.square.M;
    const spot = findFreeSpot(activeZone, w, h);
    run(async () => {
      const table = await createTable({
        zone_id: activeZone.id,
        name: nextTableName(activeZone),
        capacity: 4,
        pos_x: spot.x,
        pos_y: spot.y,
        width: w,
        height: h,
        shape: 'square',
      });
      setZones((prev) =>
        prev.map((z) => (z.id === activeZone.id ? { ...z, tables: [...z.tables, table] } : z))
      );
      setSelectedId(table.id);
    });
  };

  const handleShapeOrSize = (table: FloorTable, shape: Shape, size: SizeKey) => {
    const [width, height] = SIZE_PRESETS[shape][size];
    saveTable(table.id, {
      shape,
      width,
      height,
      pos_x: clamp(table.pos_x, 0, CANVAS_W - width),
      pos_y: clamp(table.pos_y, 0, CANVAS_H - height),
    });
  };

  const handleMoveToZone = (table: FloorTable, zoneId: string) => {
    if (zoneId === table.zone_id) return;
    run(async () => {
      await updateTable(table.id, { zone_id: zoneId });
      setZones((prev) =>
        prev.map((z) => {
          if (z.id === table.zone_id) return { ...z, tables: z.tables.filter((t) => t.id !== table.id) };
          if (z.id === zoneId) return { ...z, tables: [...z.tables, { ...table, zone_id: zoneId }] };
          return z;
        })
      );
      setSelectedId(null);
    });
  };

  const handleDeleteTable = (table: FloorTable) => {
    if (table.status !== 'free') return;
    if (!window.confirm(`¿Quitar la mesa ${table.name} del plano?`)) return;
    run(async () => {
      await deactivateTable(table.id);
      setZones((prev) =>
        prev.map((z) => ({ ...z, tables: z.tables.filter((t) => t.id !== table.id) }))
      );
      setSelectedId(null);
    });
  };

  // --- Render ---
  if (loading) return <div className="p-6 text-slate-500">Cargando plano…</div>;

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Plano del salón</h1>
          <p className="text-sm text-slate-500">
            Arrastra las mesas a su lugar. Con una mesa seleccionada, las flechas la mueven.
          </p>
        </div>
        <span className="text-sm text-slate-500" aria-live="polite">
          {saving ? 'Guardando…' : 'Cambios guardados'}
        </span>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {/* Zonas */}
      <div className="flex flex-wrap items-center gap-2">
        {zones.map((z) => (
          <Button
            key={z.id}
            variant={z.id === activeZoneId ? 'default' : 'outline'}
            className="rounded-full"
            onClick={() => {
              setActiveZoneId(z.id);
              setSelectedId(null);
            }}
          >
            {z.name}
          </Button>
        ))}

        <form onSubmit={handleAddZone} className="flex items-center gap-2">
          <input
            value={newZoneName}
            onChange={(e) => setNewZoneName(e.target.value)}
            placeholder="Nueva zona"
            aria-label="Nombre de la nueva zona"
            className="h-10 w-36 rounded-md border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <Button type="submit" variant="outline" disabled={!newZoneName.trim() || saving}>
            <Plus size={16} />
            Agregar
          </Button>
        </form>
      </div>

      {!activeZone ? (
        <p className="text-slate-600">Crea una zona para empezar a ubicar mesas.</p>
      ) : (
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Lienzo */}
          <div className="flex-1 space-y-3 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <input
                key={activeZone.id}
                defaultValue={activeZone.name}
                aria-label="Nombre de la zona"
                onBlur={(e) => handleRenameZone(activeZone, e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                className="h-10 rounded-md border bg-white px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <Button onClick={handleAddTable} disabled={saving}>
                <Plus size={16} />
                Agregar mesa
              </Button>
              <Button
                variant="ghost"
                className="text-red-600 hover:bg-red-50"
                disabled={activeZone.tables.length > 0 || saving}
                title={activeZone.tables.length > 0 ? 'Quita o mueve sus mesas primero' : undefined}
                onClick={() => handleDeleteZone(activeZone)}
              >
                <Trash2 size={16} />
                Quitar zona
              </Button>
            </div>

            <div className="overflow-x-auto rounded-xl border bg-white">
              <div
                ref={canvasRef}
                className="relative w-full min-w-[640px] aspect-[5/3] select-none"
                style={CANVAS_GRID_STYLE}
                onPointerDown={(e) => e.target === e.currentTarget && setSelectedId(null)}
              >
                {activeZone.tables.length === 0 && (
                  <p className="absolute inset-0 flex items-center justify-center text-slate-400 pointer-events-none">
                    Usa “Agregar mesa” para empezar.
                  </p>
                )}

                {activeZone.tables.map((table) => (
                  <button
                    key={table.id}
                    type="button"
                    aria-label={`Mesa ${table.name}`}
                    aria-pressed={table.id === selectedId}
                    style={{ ...tableStyle(table), touchAction: 'none' }}
                    onPointerDown={(e) => onPointerDown(e, table)}
                    onPointerMove={(e) => onPointerMove(e, table)}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                    onKeyDown={(e) => onKeyDown(e, table)}
                    onFocus={() => setSelectedId(table.id)}
                    className={cn(
                      'absolute flex flex-col items-center justify-center border-2 bg-slate-100 text-slate-800 cursor-grab active:cursor-grabbing',
                      'focus-visible:outline-none',
                      table.shape === 'round' ? 'rounded-full' : 'rounded-lg',
                      table.id === selectedId
                        ? 'border-blue-600 ring-2 ring-blue-300 bg-blue-50 z-10'
                        : 'border-slate-400 hover:border-slate-600'
                    )}
                  >
                    <span className="font-bold text-base leading-tight">{table.name}</span>
                    {table.capacity != null && (
                      <span className="text-[11px] leading-tight text-slate-500">
                        {table.capacity} pers.
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Panel de la mesa seleccionada */}
          <aside className="w-full lg:w-80 shrink-0">
            {selected ? (
              <TablePanel
                key={selected.id}
                table={selected}
                zones={zones}
                saving={saving}
                onRename={(name) => saveTable(selected.id, { name })}
                onCapacity={(capacity) => saveTable(selected.id, { capacity })}
                onShapeOrSize={(shape, size) => handleShapeOrSize(selected, shape, size)}
                onMoveZone={(zoneId) => handleMoveToZone(selected, zoneId)}
                onDelete={() => handleDeleteTable(selected)}
              />
            ) : (
              <div className="rounded-xl border bg-white p-5 text-sm text-slate-500">
                Selecciona una mesa para editar su nombre, capacidad, forma, tamaño o zona.
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

interface TablePanelProps {
  table: FloorTable;
  zones: FloorZone[];
  saving: boolean;
  onRename: (name: string) => void;
  onCapacity: (capacity: number) => void;
  onShapeOrSize: (shape: Shape, size: SizeKey) => void;
  onMoveZone: (zoneId: string) => void;
  onDelete: () => void;
}

function TablePanel({
  table,
  zones,
  saving,
  onRename,
  onCapacity,
  onShapeOrSize,
  onMoveZone,
  onDelete,
}: TablePanelProps) {
  const size = sizeOf(table);
  const canDelete = table.status === 'free';

  return (
    <div className="rounded-xl border bg-white p-5 space-y-5">
      <h2 className="font-semibold text-slate-800">Mesa {table.name}</h2>

      <label className="block">
        <span className="text-sm text-slate-600">Nombre</span>
        <input
          defaultValue={table.name}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== table.name) onRename(v);
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          className="mt-1 w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </label>

      <label className="block">
        <span className="text-sm text-slate-600">Capacidad (personas)</span>
        <input
          type="number"
          min={1}
          max={50}
          defaultValue={table.capacity ?? 4}
          onBlur={(e) => {
            const v = clamp(parseInt(e.target.value, 10) || 1, 1, 50);
            if (v !== table.capacity) onCapacity(v);
          }}
          className="mt-1 w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </label>

      <fieldset className="space-y-2">
        <legend className="text-sm text-slate-600">Forma</legend>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(SHAPE_LABELS) as Shape[]).map((s) => (
            <Button
              key={s}
              type="button"
              size="sm"
              variant={table.shape === s ? 'default' : 'outline'}
              aria-pressed={table.shape === s}
              onClick={() => onShapeOrSize(s, size)}
            >
              {SHAPE_LABELS[s]}
            </Button>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm text-slate-600">Tamaño</legend>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(SIZE_LABELS) as SizeKey[]).map((k) => (
            <Button
              key={k}
              type="button"
              size="sm"
              variant={size === k ? 'default' : 'outline'}
              aria-pressed={size === k}
              onClick={() => onShapeOrSize(table.shape, k)}
            >
              {SIZE_LABELS[k]}
            </Button>
          ))}
        </div>
      </fieldset>

      {zones.length > 1 && (
        <label className="block">
          <span className="text-sm text-slate-600">Zona</span>
          <select
            value={table.zone_id}
            onChange={(e) => onMoveZone(e.target.value)}
            disabled={saving}
            className="mt-1 w-full rounded-md border bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="pt-2 border-t space-y-1">
        <Button
          type="button"
          variant="ghost"
          className="w-full text-red-600 hover:bg-red-50"
          disabled={!canDelete || saving}
          onClick={onDelete}
        >
          <Trash2 size={16} />
          Quitar mesa
        </Button>
        {!canDelete && (
          <p className="text-xs text-slate-500 text-center">
            Está {STATUS_LABELS[table.status]?.toLowerCase()}: solo se puede quitar una mesa libre.
          </p>
        )}
      </div>
    </div>
  );
}