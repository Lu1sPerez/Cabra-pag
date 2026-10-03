export type TableStatus = 'free' | 'occupied' | 'paying';

export interface Table {
  id: string;
  name: string;
  status: TableStatus;
}

export interface Zone {
  id: string;
  name: string;
  tables: Table[];
}
