import { describe, expect, it } from 'vitest';

import { exportFilename, importSummary, mergeMapping } from './import';

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
