import { describe, expect, it } from 'vitest';

import {
  dismissUpdates,
  NO_MARKS,
  NO_RECORD,
  parseChecklistRecord,
  readChecklist,
  recordChecklist,
  toggleItem,
  type ChecklistRecord,
} from './checklist';

const LIST = ['雨鞋', '手套', '頭燈'];

/**
 * Ticks the items one after another, keeping the record after each as the page does, and stores it
 * as `localStorage` would: what the next visit reads is what went through JSON.
 */
function tick(
  record: ChecklistRecord,
  items: string[],
  ...ticked: string[]
): ChecklistRecord {
  let marks = readChecklist(record, items);
  let kept = record;
  for (const item of ticked) {
    marks = toggleItem(marks, item);
    kept = parseChecklistRecord(JSON.stringify(recordChecklist(items, marks)));
  }
  return kept;
}

describe('readChecklist', () => {
  it('starts with nothing ticked and nothing marked on a first visit', () => {
    expect(readChecklist(NO_RECORD, LIST)).toEqual(NO_MARKS);
  });

  it('keeps the ticks across a reload while the list stays the same', () => {
    const record = tick(NO_RECORD, LIST, '雨鞋', '手套');

    expect(readChecklist(record, LIST)).toEqual({
      checked: ['雨鞋', '手套'],
      updated: [],
    });
  });

  it('keeps what did not change and marks what did, as H-1 asks (雨鞋 → 長筒雨鞋)', () => {
    const record = tick(NO_RECORD, LIST, '雨鞋', '手套');

    expect(readChecklist(record, ['長筒雨鞋', '手套', '頭燈'])).toEqual({
      checked: ['手套'],
      updated: ['長筒雨鞋'],
    });
  });

  it('marks an added item, and lets a removed one go without a word', () => {
    const record = tick(NO_RECORD, LIST, '頭燈');

    expect(readChecklist(record, ['手套', '頭燈', '口罩'])).toEqual({
      checked: ['頭燈'],
      updated: ['口罩'],
    });
  });

  it('marks nothing for someone who never ticked anything here', () => {
    expect(readChecklist(NO_RECORD, ['長筒雨鞋', '手套']).updated).toEqual([]);
  });
});

describe('parseChecklistRecord', () => {
  it('reads back what was kept', () => {
    const record = { checked: ['手套'], seen: LIST, at: 1 };

    expect(parseChecklistRecord(JSON.stringify(record))).toEqual(record);
  });

  it('drops a field that will not read and keeps the rest', () => {
    expect(
      parseChecklistRecord(
        JSON.stringify({ checked: ['手套'], seen: 'all', at: 'now' }),
      ),
    ).toEqual({ checked: ['手套'], seen: [], at: 0 });
    expect(
      parseChecklistRecord(JSON.stringify({ checked: [1, '手套'] })),
    ).toEqual(NO_RECORD);
  });

  it('throws on what is not a record at all, for useLocalStorage to start over', () => {
    expect(() => parseChecklistRecord('{not json')).toThrow();
    expect(() => parseChecklistRecord('"雨鞋"')).toThrow();
    expect(() => parseChecklistRecord('null')).toThrow();
  });
});

describe('toggleItem', () => {
  it('ticks and unticks', () => {
    const ticked = toggleItem(NO_MARKS, '手套');

    expect(ticked.checked).toEqual(['手套']);
    expect(toggleItem(ticked, '手套').checked).toEqual([]);
  });

  it('clears the item’s 已更新, and only its own, and that holds after a reload', () => {
    const record = tick(NO_RECORD, LIST, '手套');
    const changed = ['長筒雨鞋', '手套', '頭燈', '口罩'];

    const marks = toggleItem(readChecklist(record, changed), '長筒雨鞋');

    expect(marks).toEqual({
      checked: ['手套', '長筒雨鞋'],
      updated: ['口罩'],
    });
    expect(readChecklist(recordChecklist(changed, marks), changed)).toEqual(
      marks,
    );
  });

  it('clears the mark on unticking too: touching the item is reading it', () => {
    const record = tick(NO_RECORD, LIST, '手套');
    const changed = ['長筒雨鞋', '手套', '頭燈'];

    const once = toggleItem(readChecklist(record, changed), '長筒雨鞋');
    const twice = toggleItem(once, '長筒雨鞋');

    expect(twice).toEqual({ checked: ['手套'], updated: [] });
  });
});

describe('dismissUpdates', () => {
  it('clears every 已更新 at once, keeps the ticks, and holds after a reload', () => {
    const record = tick(NO_RECORD, LIST, '手套');
    const changed = ['長筒雨鞋', '手套', '頭燈', '口罩'];

    const marks = dismissUpdates(readChecklist(record, changed));

    expect(marks).toEqual({ checked: ['手套'], updated: [] });
    expect(readChecklist(recordChecklist(changed, marks), changed)).toEqual(
      marks,
    );
  });
});

describe('全部清除', () => {
  it('leaves nothing ticked and nothing marked, and the list counts as read', () => {
    const changed = ['長筒雨鞋', '手套', '頭燈'];

    expect(readChecklist(recordChecklist(changed, NO_MARKS), changed)).toEqual(
      NO_MARKS,
    );
  });
});

describe('the record', () => {
  it('holds the item words, so it can be read in the browser’s storage panel', () => {
    expect(tick(NO_RECORD, LIST, '手套')).toMatchObject({
      checked: ['手套'],
      seen: LIST,
    });
  });
});
