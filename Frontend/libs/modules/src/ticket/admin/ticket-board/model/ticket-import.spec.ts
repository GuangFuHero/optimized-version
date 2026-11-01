import { describe, expect, it } from 'vitest';

import {
  IMPORT_NEED_TYPES,
  pastedCsvFile,
  ticketImportCaption,
  ticketImportSummaryLine,
} from './ticket-import';
import { NEED_TYPES } from './ticket-row';

describe('IMPORT_NEED_TYPES', () => {
  it("offers the design's 搜救／人力／物資 first, and every type the backend imports", () => {
    expect(IMPORT_NEED_TYPES.slice(0, 3)).toEqual(['rescue', 'hr', 'supply']);
    expect([...IMPORT_NEED_TYPES].sort()).toEqual([...NEED_TYPES].sort());
  });
});

describe('ticketImportCaption', () => {
  it("names a rescue file's required columns, its head count included", () => {
    expect(ticketImportCaption('rescue')).toBe(
      '從「匯出」下載的「搜救」檔案就是範本。新的單必填：標題、聯絡人、緯度、經度、需求名稱、需求數量。位置用經緯度，沒有地址欄。',
    );
  });

  it('asks any other need for its head count', () => {
    expect(ticketImportCaption('supply')).toContain(
      '新的單必填：標題、聯絡人、緯度、經度、需求名稱、需求數量。',
    );
  });

  it('reads without a type picked', () => {
    expect(ticketImportCaption(null)).toBe(
      '從「匯出」下載的檔案就是範本。新的單必填：標題、聯絡人、緯度、經度、需求名稱、需求數量。位置用經緯度，沒有地址欄。',
    );
  });
});

describe('pastedCsvFile', () => {
  it('wraps pasted text as a CSV file the backend reads by its extension', async () => {
    const file = pastedCsvFile('title,contact_name\n淹水,王先生\n');
    expect(file?.name).toBe('pasted.csv');
    expect(file?.type).toBe('text/csv');
    expect(await file?.text()).toBe('title,contact_name\n淹水,王先生\n');
  });

  it('is nothing for blank text', () => {
    expect(pastedCsvFile('  \n ')).toBeNull();
  });
});

describe('ticketImportSummaryLine', () => {
  const summary = { create: 2, update: 0, suspected: 0, failedLines: 1 };

  it('adds up the preview under the dialog', () => {
    expect(ticketImportSummaryLine(summary, 3)).toBe(
      '新增 2 列・更新 0 列・失敗 1 列（共 3 列）',
    );
  });

  it('counts the rows held as suspected duplicates apart, as they are not created', () => {
    expect(
      ticketImportSummaryLine({ ...summary, create: 1, suspected: 2 }, 4),
    ).toBe('新增 1 列・更新 0 列・疑似重複 2 列・失敗 1 列（共 4 列）');
  });
});
