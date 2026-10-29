import { describe, expect, it } from 'vitest';

import { clearContactDraft, readSavedContactDraft } from './use-contact-draft';

/** Just enough of `sessionStorage` for the draft. */
function memoryStorage(entries: Record<string, string>) {
  const items = new Map(Object.entries(entries));

  return {
    items,
    removeItem: (key: string) => {
      items.delete(key);
    },
  };
}

describe('readSavedContactDraft', () => {
  it('reads a draft back with the account that left it, and one of another shape as none', () => {
    const draft = { type: 'email', value: 'wang@gmail.com' };

    expect(
      readSavedContactDraft(JSON.stringify({ userId: 'u-1', draft })),
    ).toEqual({ userId: 'u-1', draft });
    expect(readSavedContactDraft(JSON.stringify({ draft }))).toBeNull();
  });
});

describe('clearContactDraft', () => {
  it('takes the contact typed out of the tab on signing out, and nothing else', () => {
    const storage = memoryStorage({
      'wg:account-contact-draft': '{"userId":"u-1"}',
      'wg:other': 'kept',
    });

    clearContactDraft(storage);

    expect([...storage.items.keys()]).toEqual(['wg:other']);
  });

  it('does nothing without storage, or when the browser refuses it', () => {
    expect(() => clearContactDraft(null)).not.toThrow();
    expect(() =>
      clearContactDraft({
        removeItem: () => {
          throw new Error('blocked');
        },
      }),
    ).not.toThrow();
  });
});
