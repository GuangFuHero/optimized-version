import { describe, expect, it } from 'vitest';

import {
  countExportableByType,
  exportFilename,
  importFieldLabel,
  importSummary,
  mergeMapping,
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
  it('names every import field and fills the example row', () => {
    const [header = '', row = '', rest] =
      stationImportTemplate('shelter').split('\r\n');
    const values = row.split(',');
    const cells = Object.fromEntries(
      header.split(',').map((h, i) => [h, values[i]]),
    );

    expect(header.split(',')).toEqual(
      STATION_IMPORT_FIELDS.map((f) => f.value),
    );
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

describe('importFieldLabel', () => {
  it('names a system field the way the mapping does', () => {
    expect(importFieldLabel('type')).toBe('類型');
    expect(importFieldLabel('latitude')).toBe('緯度');
  });

  it('shows a whole-row error and an unknown column as they come', () => {
    expect(importFieldLabel('')).toBe('整列');
    expect(importFieldLabel('容納人數')).toBe('容納人數');
  });
});

describe('countExportableByType', () => {
  const rows = [
    { type: 'shelter', canExport: true },
    { type: 'shelter', canExport: false },
    { type: 'Shelter ', canExport: true },
    { type: 'water', canExport: false },
  ] as StationRow[];

  it('counts only the stations the export will include, per type', () => {
    const counts = countExportableByType(rows);
    expect(counts.get('shelter')).toBe(2);
    expect(counts.get('water')).toBeUndefined();
  });
});
