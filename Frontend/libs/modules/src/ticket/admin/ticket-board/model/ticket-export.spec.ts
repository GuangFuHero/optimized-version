import { describe, expect, it } from 'vitest';

import {
  exportCapLabel,
  exportTypeCount,
  ticketExportFilename,
  ticketImportTemplateFilename,
} from './ticket-export';
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
    ).toBe('任務單-搜救-20261027.xlsx');
  });

  it('exports the four task types', () => {
    expect(NEED_TYPES).toEqual(['rescue', 'supply', 'medical', 'hr']);
  });
});

describe('ticketImportTemplateFilename', () => {
  it('names the blank template by type, as the station one is named', () => {
    expect(ticketImportTemplateFilename('hr')).toBe('任務單匯入範本_人力.csv');
  });
});

describe('exportTypeCount', () => {
  const answer = { counts: { rescue: 15, supply: 54036 }, max_rows: 10000 };

  it('reads a type’s rows, and none for a type the counts leave out', () => {
    expect(exportTypeCount(answer, 'rescue')).toEqual({
      count: 15,
      overCap: false,
    });
    expect(exportTypeCount(answer, 'hr')).toEqual({
      count: 0,
      overCap: false,
    });
  });

  it('flags a type past the cap, whose export the backend refuses', () => {
    expect(exportTypeCount(answer, 'supply')).toEqual({
      count: 54036,
      overCap: true,
    });
    expect(
      exportTypeCount({ counts: { rescue: 10000 }, max_rows: 10000 }, 'rescue')
        .overCap,
    ).toBe(false);
  });

  it('knows nothing before the counts arrive', () => {
    expect(exportTypeCount(undefined, 'rescue')).toEqual({
      count: null,
      overCap: false,
    });
  });
});

describe('exportCapLabel', () => {
  it('says the cap with its thousands marked', () => {
    expect(exportCapLabel(10000)).toBe('超過 10,000 筆，無法匯出');
  });
});
