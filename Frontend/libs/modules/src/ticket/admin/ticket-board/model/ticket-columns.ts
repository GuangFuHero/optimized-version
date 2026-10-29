export type TicketColumnId =
  | 'priority'
  | 'ticket'
  | 'needs'
  | 'updated'
  | 'status'
  | 'team'
  | 'menu';

export interface TicketColumn {
  id: TicketColumnId;
  label: string;
  /** A CSS grid track, as DataTable's `meta.width` takes it. */
  width: string;
  visible: boolean;
}

/**
 * The board's one global column order, as the prototype's `TK_COLUMNS` (tk-data.js). No
 * per-viewer columns: every column is always shown. The flexible tracks are `minmax(0, …)` so the
 * table never scrolls sideways (TM-FS-102): a value too wide is cut, with the whole on hover.
 */
export const TICKET_COLUMNS: readonly TicketColumn[] = [
  { id: 'priority', label: '優先級', width: '104px', visible: true },
  { id: 'ticket', label: '任務', width: 'minmax(0, 2.4fr)', visible: true },
  {
    id: 'needs',
    label: '需求 · 承接進度',
    width: 'minmax(0, 2fr)',
    visible: true,
  },
  { id: 'updated', label: '更新時間', width: '92px', visible: true },
  { id: 'status', label: '狀態', width: '92px', visible: true },
  { id: 'team', label: '指派 Team', width: 'minmax(0, 1fr)', visible: true },
  { id: 'menu', label: '', width: '44px', visible: true },
];

export function visibleTicketColumns(): typeof TICKET_COLUMNS {
  return TICKET_COLUMNS.filter((column) => column.visible);
}
