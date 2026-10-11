import { describe, expect, it } from 'vitest';

import {
  PAGE_HELP_SEEN_KEY,
  hasSeenPageHelp,
  markPageHelpSeen,
  pageHelpKey,
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

  it('has nothing for a page without words of its own, nor for one only named alike', () => {
    expect(pageHelpKey('/briefing')).toBeNull();
    expect(pageHelpKey('/account/security')).toBeNull();
    expect(pageHelpKey('/mapping')).toBeNull();
    expect(pageHelpKey('/listings')).toBeNull();
    expect(pageHelpKey('/')).toBeNull();
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
