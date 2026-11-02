import { describe, expect, it } from 'vitest';

import { helpRequestDraftKey } from '../../ticket/help-request/help-request-draft';
import { clearDraftsOnSignOut } from './sign-out-drafts';

/** Just enough of `sessionStorage` for the drafts. */
function memoryStorage(entries: Record<string, string>) {
  const items = new Map(Object.entries(entries));

  return {
    items,
    get length() {
      return items.size;
    },
    key: (index: number) => [...items.keys()][index] ?? null,
    removeItem: (key: string) => {
      items.delete(key);
    },
  };
}

describe('clearDraftsOnSignOut', () => {
  it('takes 請求協助, 申請管理權限 and the contact being added out of the tab, and nothing else', () => {
    const storage = memoryStorage({
      [helpRequestDraftKey('u-1')]: '{}',
      'wg:role-request-draft': '{}',
      'wg:account-contact-draft': '{}',
      'wg:other': 'kept',
    });

    clearDraftsOnSignOut(storage);

    expect([...storage.items.keys()]).toEqual(['wg:other']);
  });

  it('does nothing without storage', () => {
    expect(() => clearDraftsOnSignOut(null)).not.toThrow();
  });
});
