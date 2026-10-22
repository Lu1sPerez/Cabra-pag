// Utilidades de rangos de fechas en hora local (formato YYYY-MM-DD)

export const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const parseDate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export type PresetId = 'today' | '7d' | '30d' | 'month' | 'prev-month';

export const PRESETS: { id: PresetId; label: string }[] = [
  { id: 'today', label: 'Hoy' },
  { id: '7d', label: 'Últimos 7 días' },
  { id: '30d', label: 'Últimos 30 días' },
  { id: 'month', label: 'Este mes' },
  { id: 'prev-month', label: 'Mes anterior' },
];

export function presetRange(id: PresetId): [string, string] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysAgo = (n: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - n);
  switch (id) {
    case 'today':
      return [isoDate(today), isoDate(today)];
    case '7d':
      return [isoDate(daysAgo(6)), isoDate(today)];
    case '30d':
      return [isoDate(daysAgo(29)), isoDate(today)];
    case 'month':
      return [isoDate(new Date(today.getFullYear(), today.getMonth(), 1)), isoDate(today)];
    case 'prev-month':
      return [
        isoDate(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
        isoDate(new Date(today.getFullYear(), today.getMonth(), 0)),
      ];
  }
}
