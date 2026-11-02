import { describe, expect, it } from 'vitest';

import {
  PAGE_HELP_SEEN_KEY,
  hasSeenPageHelp,
  helpTextRuns,
  markPageHelpSeen,
  pageHelpKey,
  pageHelpWidth,
  type PageHelp,
  type SeenStorage,
} from './page-help';

/** localStorage as far as the seen marks use it. */
function memoryStorage(): SeenStorage & { items: Map<string, string> } {
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
const brokenStorage: SeenStorage = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

describe('pageHelpKey', () => {
  it('finds the map and the list, wherever in them the address points', () => {
    expect(pageHelpKey('/map')).toBe('site:map');
    expect(pageHelpKey('/map/osm-direct/ticket/@23.67,121.42,16z')).toBe(
      'site:map',
    );
    expect(pageHelpKey('/list')).toBe('site:list');
    expect(pageHelpKey('/list/ticket/pending')).toBe('site:list');
  });

  it('finds the briefing', () => {
    expect(pageHelpKey('/briefing')).toBe('site:briefing');
  });

  it('has nothing for a page without words of its own, nor for one only named alike', () => {
    expect(pageHelpKey('/briefings')).toBeNull();
    expect(pageHelpKey('/account/security')).toBeNull();
    expect(pageHelpKey('/mapping')).toBeNull();
    expect(pageHelpKey('/listings')).toBeNull();
    expect(pageHelpKey('/')).toBeNull();
  });
});

describe('helpTextRuns', () => {
  it('sets in bold what ** marks, as the prototype does', () => {
    expect(helpTextRuns('以橘白斜紋**顯示於前後台所有地圖**，提醒')).toEqual([
      { text: '以橘白斜紋', bold: false },
      { text: '顯示於前後台所有地圖', bold: true },
      { text: '，提醒', bold: false },
    ]);
  });

  it('keeps text without marks as one plain run', () => {
    expect(helpTextRuns('點一筆看詳細資訊')).toEqual([
      { text: '點一筆看詳細資訊', bold: false },
    ]);
  });

  it('leaves out the empty runs a mark at either end makes', () => {
    expect(helpTextRuns('**可選擇「前台可見」**決定')).toEqual([
      { text: '可選擇「前台可見」', bold: true },
      { text: '決定', bold: false },
    ]);
  });

  it('runs a mark left open to the end in bold, as the prototype does', () => {
    expect(helpTextRuns('前面**後面')).toEqual([
      { text: '前面', bold: false },
      { text: '後面', bold: true },
    ]);
  });
});

describe('pageHelpWidth', () => {
  const help: PageHelp = { title: '地圖', what: '看附近', can: [] };

  it("is the prototype's 340 for a page of sentences", () => {
    expect(pageHelpWidth(help)).toBe(340);
    expect(
      pageHelpWidth({ ...help, sections: [{ title: '說明', body: '一段話' }] }),
    ).toBe(340);
  });

  it('widens to 400 when a section holds a list, as the prototype does', () => {
    expect(
      pageHelpWidth({
        ...help,
        sections: [{ title: '區域標示定義', items: ['危險區', '責任區'] }],
      }),
    ).toBe(400);
  });
});

describe('page help seen marks', () => {
  it('remembers each page on its own', () => {
    const storage = memoryStorage();

    expect(hasSeenPageHelp(storage, 'site:map')).toBe(false);

    markPageHelpSeen(storage, 'site:map');

    expect(hasSeenPageHelp(storage, 'site:map')).toBe(true);
    expect(hasSeenPageHelp(storage, 'site:list')).toBe(false);

    markPageHelpSeen(storage, 'site:list');

    expect(JSON.parse(storage.items.get(PAGE_HELP_SEEN_KEY) ?? '')).toEqual({
      'site:map': 1,
      'site:list': 1,
    });
  });

  it('reads a broken mark as nothing seen, and writes over it', () => {
    const storage = memoryStorage();

    storage.setItem(PAGE_HELP_SEEN_KEY, '{not json');
    expect(hasSeenPageHelp(storage, 'site:map')).toBe(false);

    storage.setItem(PAGE_HELP_SEEN_KEY, '"site:map"');
    expect(hasSeenPageHelp(storage, 'site:map')).toBe(false);

    markPageHelpSeen(storage, 'site:map');
    expect(hasSeenPageHelp(storage, 'site:map')).toBe(true);
  });

  it('shows the dot rather than throw when the storage refuses, or there is none', () => {
    expect(() => markPageHelpSeen(brokenStorage, 'site:map')).not.toThrow();
    expect(hasSeenPageHelp(brokenStorage, 'site:map')).toBe(false);

    expect(() => markPageHelpSeen(null, 'site:map')).not.toThrow();
    expect(hasSeenPageHelp(null, 'site:map')).toBe(false);
  });
});
