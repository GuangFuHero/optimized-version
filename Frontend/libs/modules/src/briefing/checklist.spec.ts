import { describe, expect, it } from 'vitest';

import {
  BRIEFING_CHECKLIST_KEY,
  dismissUpdates,
  NO_MARKS,
  readChecklist,
  toggleItem,
  writeChecklist,
  type ChecklistStorage,
} from './checklist';

/** localStorage as far as the checklist uses it. */
function memoryStorage(): ChecklistStorage & { items: Map<string, string> } {
  const items = new Map<string, string>();

  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
}

/** One that refuses everything, as a private window or blocked site data can. */
const brokenStorage: ChecklistStorage = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

const LIST = ['雨鞋', '手套', '頭燈'];

/** Ticks the items one after another and saves after each, as the page does. */
function tick(storage: ChecklistStorage, items: string[], ...ticked: string[]) {
  let marks = readChecklist(storage, items);
  for (const item of ticked) {
    marks = toggleItem(marks, item);
    writeChecklist(storage, items, marks);
  }
  return marks;
}

describe('readChecklist', () => {
  it('starts with nothing ticked and nothing marked on a first visit', () => {
    expect(readChecklist(memoryStorage(), LIST)).toEqual(NO_MARKS);
  });

  it('keeps the ticks across a reload while the list stays the same', () => {
    const storage = memoryStorage();
    tick(storage, LIST, '雨鞋', '手套');

    expect(readChecklist(storage, LIST)).toEqual({
      checked: ['雨鞋', '手套'],
      updated: [],
    });
  });

  it('keeps what did not change and marks what did, as H-1 asks (雨鞋 → 長筒雨鞋)', () => {
    const storage = memoryStorage();
    tick(storage, LIST, '雨鞋', '手套');

    expect(readChecklist(storage, ['長筒雨鞋', '手套', '頭燈'])).toEqual({
      checked: ['手套'],
      updated: ['長筒雨鞋'],
    });
  });

  it('marks an added item, and lets a removed one go without a word', () => {
    const storage = memoryStorage();
    tick(storage, LIST, '頭燈');

    expect(readChecklist(storage, ['手套', '頭燈', '口罩'])).toEqual({
      checked: ['頭燈'],
      updated: ['口罩'],
    });
  });

  it('marks nothing for someone who never ticked anything here', () => {
    const storage = memoryStorage();

    expect(readChecklist(storage, ['長筒雨鞋', '手套']).updated).toEqual([]);
  });

  it('only reads: reading twice gives the same marks and leaves the record alone', () => {
    const storage = memoryStorage();
    tick(storage, LIST, '雨鞋');
    const before = storage.items.get(BRIEFING_CHECKLIST_KEY);
    const changed = ['長筒雨鞋', '手套', '頭燈'];

    expect(readChecklist(storage, changed)).toEqual(
      readChecklist(storage, changed),
    );
    expect(storage.items.get(BRIEFING_CHECKLIST_KEY)).toBe(before);
  });

  it('reads a broken record as nothing ticked', () => {
    const storage = memoryStorage();

    storage.setItem(BRIEFING_CHECKLIST_KEY, '{not json');
    expect(readChecklist(storage, LIST)).toEqual(NO_MARKS);

    storage.setItem(BRIEFING_CHECKLIST_KEY, '"雨鞋"');
    expect(readChecklist(storage, LIST)).toEqual(NO_MARKS);

    storage.setItem(
      BRIEFING_CHECKLIST_KEY,
      JSON.stringify({ checked: [1, '手套'], seen: 'all' }),
    );
    expect(readChecklist(storage, LIST)).toEqual({
      checked: ['手套'],
      updated: [],
    });
  });

  it('shows the list unticked rather than throw when the storage refuses, or there is none', () => {
    expect(readChecklist(brokenStorage, LIST)).toEqual(NO_MARKS);
    expect(readChecklist(null, LIST)).toEqual(NO_MARKS);
    expect(() =>
      writeChecklist(brokenStorage, LIST, toggleItem(NO_MARKS, '雨鞋')),
    ).not.toThrow();
    expect(() =>
      writeChecklist(null, LIST, toggleItem(NO_MARKS, '雨鞋')),
    ).not.toThrow();
  });
});

describe('toggleItem', () => {
  it('ticks and unticks', () => {
    const ticked = toggleItem(NO_MARKS, '手套');

    expect(ticked.checked).toEqual(['手套']);
    expect(toggleItem(ticked, '手套').checked).toEqual([]);
  });

  it('clears the item’s 已更新, and only its own, and that holds after a reload', () => {
    const storage = memoryStorage();
    tick(storage, LIST, '手套');
    const changed = ['長筒雨鞋', '手套', '頭燈', '口罩'];

    const marks = toggleItem(readChecklist(storage, changed), '長筒雨鞋');
    writeChecklist(storage, changed, marks);

    expect(marks).toEqual({
      checked: ['手套', '長筒雨鞋'],
      updated: ['口罩'],
    });
    expect(readChecklist(storage, changed)).toEqual(marks);
  });

  it('clears the mark on unticking too: touching the item is reading it', () => {
    const storage = memoryStorage();
    tick(storage, LIST, '手套');
    const changed = ['長筒雨鞋', '手套', '頭燈'];

    const once = toggleItem(readChecklist(storage, changed), '長筒雨鞋');
    const twice = toggleItem(once, '長筒雨鞋');

    expect(twice).toEqual({ checked: ['手套'], updated: [] });
  });
});

describe('dismissUpdates', () => {
  it('clears every 已更新 at once, keeps the ticks, and holds after a reload', () => {
    const storage = memoryStorage();
    tick(storage, LIST, '手套');
    const changed = ['長筒雨鞋', '手套', '頭燈', '口罩'];

    const marks = dismissUpdates(readChecklist(storage, changed));
    writeChecklist(storage, changed, marks);

    expect(marks).toEqual({ checked: ['手套'], updated: [] });
    expect(readChecklist(storage, changed)).toEqual(marks);
  });
});

describe('全部清除', () => {
  it('leaves nothing ticked and nothing marked, and the list counts as read', () => {
    const storage = memoryStorage();
    tick(storage, LIST, '雨鞋', '手套');
    const changed = ['長筒雨鞋', '手套', '頭燈'];

    writeChecklist(storage, changed, NO_MARKS);

    expect(readChecklist(storage, changed)).toEqual(NO_MARKS);
  });
});

describe('the record', () => {
  it('holds the item words, so it can be read in the browser’s storage panel', () => {
    const storage = memoryStorage();
    tick(storage, LIST, '手套');

    expect(
      JSON.parse(storage.items.get(BRIEFING_CHECKLIST_KEY) ?? ''),
    ).toMatchObject({ checked: ['手套'], seen: LIST });
  });
});
