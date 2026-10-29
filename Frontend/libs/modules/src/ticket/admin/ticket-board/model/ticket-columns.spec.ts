import { describe, expect, it } from 'vitest';

import { TICKET_COLUMNS, visibleTicketColumns } from './ticket-columns';

describe('ticket columns', () => {
  it('fixes one global column order', () => {
    expect(visibleTicketColumns().map((c) => c.id)).toEqual([
      'priority',
      'ticket',
      'needs',
      'updated',
      'status',
      'team',
      'menu',
    ]);
  });

  it('labels the columns as the design does', () => {
    const labels = Object.fromEntries(
      visibleTicketColumns().map((c) => [c.id, c.label]),
    );
    expect(labels).toMatchObject({
      priority: '優先級',
      ticket: '任務',
      needs: '需求 · 承接進度',
      updated: '更新時間',
      status: '狀態',
      team: '指派 Team',
    });
  });

  it('never scrolls sideways: every flexible track can shrink to nothing', () => {
    for (const column of TICKET_COLUMNS) {
      if (column.width.includes('fr')) {
        expect(column.width).toMatch(/^minmax\(0, /);
      }
    }
  });

  it('has unique ids', () => {
    const ids = TICKET_COLUMNS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
