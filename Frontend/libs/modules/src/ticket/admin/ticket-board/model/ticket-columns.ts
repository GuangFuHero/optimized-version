export type TicketColumnId =
  | 'expand'
  | 'priority'
  | 'title'
  | 'area'
  | 'status'
  | 'needs'
  | 'gap'
  | 'audit'
  | 'updated'
  | 'open';

export interface TicketColumn {
  id: TicketColumnId;
  label: string;
  /** A CSS grid track, as DataTable's `meta.width` takes it. */
  width: string;
  visible: boolean;
}

/** The board's one global column order. No per-viewer columns: every column is always shown. */
export const TICKET_COLUMNS: readonly TicketColumn[] = [
  { id: 'expand', label: '', width: '32px', visible: true },
  { id: 'priority', label: '優先度', width: '96px', visible: true },
  { id: 'title', label: '求助單', width: 'minmax(220px, 2fr)', visible: true },
  { id: 'area', label: '行政區', width: '120px', visible: true },
  { id: 'status', label: '狀態', width: '96px', visible: true },
  { id: 'needs', label: '需求', width: '84px', visible: true },
  { id: 'gap', label: '志工缺口', width: '96px', visible: true },
  { id: 'audit', label: '審核', width: '96px', visible: true },
  { id: 'updated', label: '最後更新', width: '130px', visible: true },
  { id: 'open', label: '', width: '28px', visible: true },
];

export function visibleTicketColumns(): typeof TICKET_COLUMNS {
  return TICKET_COLUMNS.filter((column) => column.visible);
}
