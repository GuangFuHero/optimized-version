import { describe, expect, it } from 'vitest';

import {
  IMPORT_NEED_TYPES,
  pastedCsvFile,
  ticketImportCaption,
} from './ticket-import';
import { NEED_TYPES } from './ticket-row';

describe('IMPORT_NEED_TYPES', () => {
  it("offers the design's 搜救／人力／物資 first, and every type the backend imports", () => {
    expect(IMPORT_NEED_TYPES.slice(0, 3)).toEqual(['rescue', 'hr', 'supply']);
    expect([...IMPORT_NEED_TYPES].sort()).toEqual([...NEED_TYPES].sort());
  });
});

describe('ticketImportCaption', () => {
  it("names a rescue file's required columns, with no head count", () => {
    expect(ticketImportCaption('rescue')).toBe(
      '從「匯出」下載的「搜救」檔案就是範本。新的單必填：標題、聯絡人、緯度、經度、需求名稱。位置用經緯度，沒有地址欄。',
    );
  });

  it('asks any other need for its head count', () => {
    expect(ticketImportCaption('supply')).toContain(
      '新的單必填：標題、聯絡人、緯度、經度、需求名稱、需求數量。',
    );
  });

  it('reads without a type picked', () => {
    expect(ticketImportCaption(null)).toBe(
      '從「匯出」下載的檔案就是範本。新的單必填：標題、聯絡人、緯度、經度、需求名稱。位置用經緯度，沒有地址欄。',
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
