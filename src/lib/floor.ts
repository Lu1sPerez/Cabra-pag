// Constantes y tipos compartidos del plano del salón.
// El plano usa un lienzo lógico de 1000 × 600 unidades que se escala a cualquier pantalla.

export const CANVAS_W = 1000;
export const CANVAS_H = 600;
export const GRID = 10;

export type TableStatus = 'free' | 'occupied' | 'paying';
export type Shape = 'square' | 'round' | 'rect';
export type SizeKey = 'S' | 'M' | 'L';

export interface FloorTable {
  id: string;
  zone_id: string;
  name: string;
  status: TableStatus;
  capacity: number | null;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
  shape: Shape;
  is_active?: boolean;
}

export interface FloorZone {
  id: string;
  name: string;
  tables: FloorTable[];
}

export const TABLE_FIELDS =
  'id, zone_id, name, status, capacity, pos_x, pos_y, width, height, shape, is_active';

export const SHAPE_LABELS: Record<Shape, string> = {
  square: 'Cuadrada',
  round: 'Redonda',
  rect: 'Rectangular',
};

export const SIZE_LABELS: Record<SizeKey, string> = {
  S: 'Chica',
  M: 'Mediana',
  L: 'Grande',
};

export const SIZE_PRESETS: Record<Shape, Record<SizeKey, [number, number]>> = {
  square: { S: [70, 70], M: [90, 90], L: [120, 120] },
  round: { S: [70, 70], M: [90, 90], L: [120, 120] },
  rect: { S: [130, 70], M: [170, 80], L: [220, 90] },
};

export const STATUS_LABELS: Record<TableStatus, string> = {
  free: 'Libre',
  occupied: 'Ocupada',
  paying: 'Por pagar',
};

export const STATUS_STYLES: Record<TableStatus, string> = {
  free: 'bg-green-100 border-green-500 text-green-900 hover:bg-green-200',
  occupied: 'bg-red-100 border-red-500 text-red-900 hover:bg-red-200',
  paying: 'bg-yellow-100 border-yellow-500 text-yellow-900 hover:bg-yellow-200',
};

export const STATUS_DOTS: Record<TableStatus, string> = {
  free: 'bg-green-500',
  occupied: 'bg-red-500',
  paying: 'bg-yellow-500',
};

export const snap = (v: number) => Math.round(v / GRID) * GRID;
export const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

export function sizeOf(t: Pick<FloorTable, 'shape' | 'width' | 'height'>): SizeKey {
  const presets = SIZE_PRESETS[t.shape] ?? SIZE_PRESETS.square;
  const found = (Object.keys(presets) as SizeKey[]).find(
    (k) => presets[k][0] === t.width && presets[k][1] === t.height
  );
  return found ?? 'M';
}

// Convierte coordenadas lógicas en porcentajes para posicionar en pantalla
export function tableStyle(t: Pick<FloorTable, 'pos_x' | 'pos_y' | 'width' | 'height'>) {
  return {
    left: `${(t.pos_x / CANVAS_W) * 100}%`,
    top: `${(t.pos_y / CANVAS_H) * 100}%`,
    width: `${(t.width / CANVAS_W) * 100}%`,
    height: `${(t.height / CANVAS_H) * 100}%`,
  };
}

export const CANVAS_GRID_STYLE = {
  backgroundImage: 'radial-gradient(circle, #cbd5e1 1px, transparent 1px)',
  backgroundSize: `${(20 / CANVAS_W) * 100}% ${(20 / CANVAS_H) * 100}%`,
};