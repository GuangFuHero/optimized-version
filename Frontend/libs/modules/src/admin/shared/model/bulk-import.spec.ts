import { describe, expect, it } from 'vitest';

import { importFailures, importSummary } from './bulk-import';

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

describe('importFailures', () => {
  it('splits partial rows out of the failed count, in line order', () => {
    expect(importFailures({ failed: 4, partial_rows: [7, 3] })).toEqual({
      partialLines: [3, 7],
      unwritten: 2,
    });
  });

  it('treats every failed row as unwritten when the response has no partial rows', () => {
    expect(importFailures({ failed: 2 })).toEqual({
      partialLines: [],
      unwritten: 2,
    });
  });

  it('counts a repeated partial line once', () => {
    expect(importFailures({ failed: 1, partial_rows: [5, 5] })).toEqual({
      partialLines: [5],
      unwritten: 0,
    });
  });
});
