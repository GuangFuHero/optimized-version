import { describe, expect, it } from 'vitest';

import {
  countExportableByType,
  errorsOutsideSample,
  exportFilename,
  importSummary,
  mergeMapping,
  previewRows,
  STATION_IMPORT_FIELDS,
  stationImportTemplate,
} from './import';
import type { StationRow } from './station-row';

describe('importSummary', () => {
  it('counts distinct failed lines and blocks commit when nothing is importable', () => {
    expect(
      importSummary({
        to_create: 0,
        to_update: 0,
        errors: [
          { line: 3, column: 'name', message: 'x' },
          { line: 3, column: 'latitude', message: 'y' },
        ],
      }),
    ).toEqual({ create: 0, update: 0, failedLines: 1, canCommit: false });
  });

  it('allows commit when some rows are importable despite errors', () => {
    expect(
      importSummary({
        to_create: 2,
        to_update: 1,
        errors: [{ line: 5, column: 'latitude', message: 'bad' }],
      }),
    ).toEqual({ create: 2, update: 1, failedLines: 1, canCommit: true });
  });
});

describe('mergeMapping', () => {
  it('applies overrides and drops nulls', () => {
    expect(
      JSON.parse(
        mergeMapping(
          { 站名: 'name', 備註: 'description' },
          { 備註: null, 緯: 'latitude' },
        ),
      ),
    ).toEqual({ 站名: 'name', 緯: 'latitude' });
  });
});

describe('exportFilename', () => {
  it('formats in Asia/Taipei time', () => {
    expect(
      exportFilename('加水', 'xlsx', new Date('2026-10-21T01:05:00Z')),
    ).toBe('資源站點_加水_20261021-0905.xlsx');
  });
});

describe('stationImportTemplate', () => {
  it('names every import field and marks the example row official', () => {
    const [header = '', row = '', rest] =
      stationImportTemplate('shelter').split('\r\n');
    const values = row.split(',');
    const cells = Object.fromEntries(
      header.split(',').map((h, i) => [h, values[i]]),
    );

    expect(header.split(',')).toEqual(
      STATION_IMPORT_FIELDS.map((f) => f.value),
    );
    expect(cells['source']).toBe('official');
    expect(cells['type']).toBe('shelter');
    expect(rest).toBe('');
  });
});

describe('STATION_IMPORT_FIELDS', () => {
  it('flags the fields a new station needs instead of marking the label', () => {
    expect(
      STATION_IMPORT_FIELDS.filter((f) => f.required).map((f) => f.value),
    ).toEqual(['name', 'latitude', 'longitude']);
    expect(STATION_IMPORT_FIELDS.some((f) => f.label.includes('*'))).toBe(
      false,
    );
  });
});

describe('previewRows', () => {
  const preview = {
    sample_rows: [
      {
        站名: ' 甲站 ',
        種類: 'water',
        縣市: '花蓮縣',
        鄉鎮: '光復鄉',
        備註: 'x',
      },
      { 站名: '', 種類: 'shelter', 縣市: '', 鄉鎮: '', 備註: '' },
    ],
    errors: [
      { line: 3, column: 'name', message: '必填' },
      { line: 3, column: '', message: '整列錯誤' },
      { line: 9, column: 'latitude', message: '格式錯誤' },
    ],
  };
  const mapping = { 站名: 'name', 種類: 'type', 縣市: 'county', 鄉鎮: 'city' };

  it('reads sample rows through the mapping and attaches their line errors', () => {
    expect(previewRows(preview, mapping)).toEqual([
      {
        line: 2,
        name: '甲站',
        type: 'water',
        address: '花蓮縣光復鄉',
        errors: [],
      },
      {
        line: 3,
        name: '',
        type: 'shelter',
        address: '',
        errors: ['name：必填', '整列錯誤'],
      },
    ]);
  });

  it('keeps only the errors past the sample for a separate list', () => {
    expect(errorsOutsideSample(preview).map((e) => e.line)).toEqual([9]);
  });
});

describe('countExportableByType', () => {
  const rows = [
    { type: 'shelter', teamUuid: 'mine' },
    { type: 'shelter', teamUuid: 'other' },
    { type: 'Shelter ', teamUuid: 'mine' },
    { type: 'water', teamUuid: null },
  ] as StationRow[];

  it("counts only the team's stations for an identity on a team", () => {
    const counts = countExportableByType(rows, 'mine');
    expect(counts.get('shelter')).toBe(2);
    expect(counts.get('water')).toBeUndefined();
  });

  it('counts every station for an identity without a team', () => {
    const counts = countExportableByType(rows, null);
    expect(counts.get('shelter')).toBe(3);
    expect(counts.get('water')).toBe(1);
  });
});
