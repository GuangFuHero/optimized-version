import { describe, expect, it } from 'vitest';

import { ticketExportFilename } from './ticket-export';
import { NEED_TYPES } from './ticket-row';

describe('ticketExportFilename', () => {
  it('names the export by type and Taipei date', () => {
    expect(
      ticketExportFilename('supply', 'csv', new Date('2026-10-27T17:00:00Z')),
    ).toBe('任務單-物資-20261028.csv');
  });

  it('uses the format as the extension', () => {
    expect(
      ticketExportFilename('rescue', 'xlsx', new Date('2026-10-27T15:59:00Z')),
    ).toBe('任務單-救援-20261027.xlsx');
  });

  it('exports the four task types', () => {
    expect(NEED_TYPES).toEqual(['rescue', 'supply', 'medical', 'hr']);
  });
});
