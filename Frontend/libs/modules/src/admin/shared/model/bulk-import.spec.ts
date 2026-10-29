import { describe, expect, it } from 'vitest';

import { importFailures, importSummary } from './bulk-import';

describe('importSummary', () => {
  it('counts distinct failed lines and blocks commit when nothing is importable', () => {
    expect(
      importSummary(
        {
          to_create: 0,
          to_update: 0,
          errors: [
            { line: 3, column: 'name', message: 'x' },
            { line: 3, column: 'latitude', message: 'y' },
          ],
          suspected: 0,
        },
        0,
      ),
    ).toEqual({
      create: 0,
      update: 0,
      suspected: 0,
      filed: 0,
      failedLines: 1,
      importable: 0,
      canCommit: false,
    });
  });

  it('counts suspected rows apart, and only those filed anyway as importable', () => {
    const preview = { to_create: 0, to_update: 0, errors: [], suspected: 2 };

    expect(importSummary(preview, 0)).toMatchObject({
      suspected: 2,
      filed: 0,
      importable: 0,
      canCommit: false,
    });
    expect(importSummary(preview, 1)).toMatchObject({
      suspected: 2,
      filed: 1,
      importable: 1,
      canCommit: true,
    });
  });

  it('allows commit when some rows are importable despite errors', () => {
    expect(
      importSummary(
        {
          to_create: 2,
          to_update: 1,
          errors: [{ line: 5, column: 'latitude', message: 'bad' }],
          suspected: 0,
        },
        0,
      ),
    ).toEqual({
      create: 2,
      update: 1,
      suspected: 0,
      filed: 0,
      failedLines: 1,
      importable: 3,
      canCommit: true,
    });
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
