import { describe, expect, it } from 'vitest';

import {
  ALL_NEED_TYPES,
  ALL_TEAMS,
  exportCapLabel,
  exportNote,
  exportOrgLabel,
  exportOrgOf,
  exportOrgOptions,
  exportScopeParams,
  exportToast,
  exportTypeCount,
  exportTypeLabel,
  exportTypeOrder,
  ticketExportFilename,
  ticketImportTemplateFilename,
} from './ticket-export';
import { UNASSIGNED_TEAM } from './ticket-filters';
import { NEED_TYPES } from './ticket-row';

const TEAM = '5b0c6a2e-0c1f-4f7a-9a51-0f4b8f1f2c3d';
const teams = [{ uuid: TEAM, name: '光復救援隊' }];

describe('ticketExportFilename', () => {
  // 2026-10-28 01:05 in Taipei.
  const now = new Date('2026-10-27T17:05:00Z');

  it('names the export as the prototype does: type, Taipei time, rows', () => {
    expect(ticketExportFilename('supply', 'csv', now, null, 5)).toBe(
      '任務單_物資_20261028-0105_5筆.csv',
    );
  });

  it('uses the format as the extension', () => {
    expect(ticketExportFilename('rescue', 'xlsx', now, null, 3)).toBe(
      '任務單_搜救_20261028-0105_3筆.xlsx',
    );
  });

  it('says 全部種類 for every type', () => {
    expect(ticketExportFilename(ALL_NEED_TYPES, 'csv', now, null, 12)).toBe(
      '任務單_全部種類_20261028-0105_12筆.csv',
    );
  });

  it('names the organisation after the type, when it is not 全部組織', () => {
    expect(ticketExportFilename('hr', 'xlsx', now, '光復救援隊', 4)).toBe(
      '任務單_人力_光復救援隊_20261028-0105_4筆.xlsx',
    );
    expect(ticketExportFilename(ALL_NEED_TYPES, 'csv', now, '未指派', 0)).toBe(
      '任務單_全部種類_未指派_20261028-0105_0筆.csv',
    );
  });

  it('keeps a team name from breaking the file name', () => {
    expect(ticketExportFilename('rescue', 'csv', now, 'A/B隊', 1)).toBe(
      '任務單_搜救_A_B隊_20261028-0105_1筆.csv',
    );
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

  it('counts 全部種類 as every type together, against the same cap', () => {
    expect(exportTypeCount(answer, ALL_NEED_TYPES)).toEqual({
      count: 54051,
      overCap: true,
    });
    expect(
      exportTypeCount({ counts: {}, max_rows: 10000 }, ALL_NEED_TYPES),
    ).toEqual({ count: 0, overCap: false });
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

describe('exportTypeOrder', () => {
  it('leads with 全部種類 when the board has no 需求 filter', () => {
    expect(exportTypeOrder(null)).toEqual([
      'all',
      'rescue',
      'hr',
      'supply',
      'medical',
    ]);
  });

  it('leads with the board’s type, and puts 全部種類 last', () => {
    expect(exportTypeOrder('supply')).toEqual([
      'supply',
      'rescue',
      'hr',
      'medical',
      'all',
    ]);
    expect(exportTypeOrder('medical')).toEqual([
      'medical',
      'rescue',
      'hr',
      'supply',
      'all',
    ]);
  });

  it('ignores a 需求 value it does not know', () => {
    expect(exportTypeOrder('unknown')[0]).toBe('all');
  });

  it('labels 全部種類', () => {
    expect(exportTypeLabel(ALL_NEED_TYPES)).toBe('全部種類');
    expect(exportTypeLabel('rescue')).toBe('搜救');
  });
});

describe('哪個組織', () => {
  it('lists 全部組織, the teams, then 未指派', () => {
    expect(exportOrgOptions(teams)).toEqual([
      [ALL_TEAMS, '全部組織'],
      [TEAM, '光復救援隊'],
      [UNASSIGNED_TEAM, '未指派'],
    ]);
  });

  it('defaults to the board’s 組織分配', () => {
    expect(exportOrgOf(null)).toBe(ALL_TEAMS);
    expect(exportOrgOf(TEAM)).toBe(TEAM);
    expect(exportOrgOf(UNASSIGNED_TEAM)).toBe(UNASSIGNED_TEAM);
  });

  it('names the organisation, and no team before the teams load', () => {
    expect(exportOrgLabel(ALL_TEAMS, teams)).toBe('全部組織');
    expect(exportOrgLabel(UNASSIGNED_TEAM, teams)).toBe('未指派');
    expect(exportOrgLabel(TEAM, teams)).toBe('光復救援隊');
    expect(exportOrgLabel(TEAM, [])).toBeNull();
  });

  it('asks the export for one team param at most', () => {
    expect(exportScopeParams(ALL_TEAMS)).toEqual({});
    expect(exportScopeParams(UNASSIGNED_TEAM)).toEqual({
      unassigned_only: true,
    });
    expect(exportScopeParams(TEAM)).toEqual({ responsible_team_uuid: TEAM });
  });
});

describe('exportNote and exportToast', () => {
  it('says what one type’s file holds, and that it imports back', () => {
    expect(exportNote('光復救援隊', 'rescue')).toBe(
      '匯出「光復救援隊」的「搜救」需求。一列＝一筆需求，表頭第一列中文、第二列欄位代號。聯絡資料依權限可能遮罩。這個檔案改完可以直接匯入：標題＋電話相同的會更新原本的單。',
    );
  });

  it('says 全部種類 leaves out each type’s fields', () => {
    expect(exportNote('全部組織', ALL_NEED_TYPES)).toMatch(
      /^匯出「全部組織」的「全部種類」需求。.*全部種類的檔案不含各種需求的細項欄位。$/,
    );
  });

  it('toasts the organisation, the type and the rows', () => {
    expect(exportToast('未指派', 'hr', 12)).toBe(
      '已匯出「未指派」的「人力」需求 12 筆',
    );
  });
});
