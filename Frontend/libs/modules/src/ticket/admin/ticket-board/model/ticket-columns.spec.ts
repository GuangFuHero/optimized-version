import { describe, expect, it } from 'vitest';

import { TICKET_COLUMNS, visibleTicketColumns } from './ticket-columns';

describe('ticket columns', () => {
  it('fixes one global column order', () => {
    expect(visibleTicketColumns().map((c) => c.id)).toEqual([
      'expand',
      'priority',
      'title',
      'area',
      'status',
      'needs',
      'gap',
      'audit',
      'updated',
      'open',
    ]);
  });

  it('labels the columns', () => {
    const labels = Object.fromEntries(
      visibleTicketColumns().map((c) => [c.id, c.label]),
    );
    expect(labels).toMatchObject({
      priority: '優先度',
      title: '求助單',
      area: '行政區',
      status: '狀態',
      needs: '需求',
      gap: '志工缺口',
      audit: '審核',
      updated: '最後更新',
    });
  });

  it('has unique ids', () => {
    const ids = TICKET_COLUMNS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
