export type StationListStatus = 'active' | 'limited' | 'offline';

export interface StationListMetric {
  id: string;
  label: string;
  value: string;
  tone?: 'default' | 'warning' | 'critical';
}

export interface StationListRow {
  id: string;
  code: string;
  name: string;
  type: string;
  address: string;
  status: StationListStatus;
  currentOccupancy: number;
  capacity: number;
  suppliesLabel: string;
  commander: string;
  updatedAt: string;
}
