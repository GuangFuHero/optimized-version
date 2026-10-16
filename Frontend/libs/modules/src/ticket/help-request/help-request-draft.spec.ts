import { describe, expect, it } from 'vitest';

import {
  clearAllHelpRequestDrafts,
  clearHelpRequestDraft,
  helpRequestDraftKey,
  readHelpRequestDraft,
  writeHelpRequestDraft,
  type DraftStorage,
} from './help-request-draft';
import {
  emptyHelpRequestForm,
  type HelpRequestForm,
  type PickedPoint,
} from './help-request-form';

/** sessionStorage as far as the draft uses it. */
function memoryStorage(): DraftStorage &
  Pick<Storage, 'length' | 'key'> & { items: Map<string, string> } {
  const items = new Map<string, string>();

  return {
    items,
    get length() {
      return items.size;
    },
    key: (index) => [...items.keys()][index] ?? null,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
    removeItem: (key) => {
      items.delete(key);
    },
  };
}

/** One that refuses everything, as a private window or a full quota can. */
const brokenStorage: DraftStorage & Pick<Storage, 'length' | 'key'> = {
  get length(): number {
    throw new Error('SecurityError');
  },
  key: () => {
    throw new Error('SecurityError');
  },
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
  removeItem: () => {
    throw new Error('SecurityError');
  },
};

const point = (source: PickedPoint['source']): PickedPoint => ({
  lat: 23.67215,
  lng: 121.42339,
  source,
});

function filledForm(): HelpRequestForm {
  return {
    ...emptyHelpRequestForm(point('manual')),
    title: '一樓客廳積泥',
    address: '光復鄉中正路 1 號',
    floor: '1',
    contactName: '王小明',
    contactPhone: '0912345678',
    needs: [
      { need: 'cleanup', name: '清淤人力', quantity: '3' },
      { need: 'supplies', name: '', quantity: '' },
    ],
    description: '巷口很窄',
    photoUrls: ['https://i.duk.tw/a.jpg'],
  };
}

describe('help request draft', () => {
  it('keeps a filled-in form for the person who filled it, and no one else', () => {
    const storage = memoryStorage();

    writeHelpRequestDraft(storage, 'user-1', filledForm());

    expect(readHelpRequestDraft(storage, 'user-1')).toEqual(filledForm());
    expect(readHelpRequestDraft(storage, 'user-2')).toBeNull();
    expect([...storage.items.keys()]).toEqual([helpRequestDraftKey('user-1')]);
  });

  it('keeps nothing for a form only opened, or holding only the point it was opened at', () => {
    const storage = memoryStorage();

    writeHelpRequestDraft(storage, 'user-1', emptyHelpRequestForm());
    writeHelpRequestDraft(
      storage,
      'user-1',
      emptyHelpRequestForm(point('seed')),
    );
    writeHelpRequestDraft(
      storage,
      'user-1',
      emptyHelpRequestForm(point('gps')),
    );

    expect(storage.items.size).toBe(0);
  });

  it('keeps a form with one thing done by hand: a field, a need, a photo or a pin', () => {
    const empty = emptyHelpRequestForm();
    const forms: HelpRequestForm[] = [
      { ...empty, contactPhone: '0912345678' },
      { ...empty, needs: [{ need: 'care', name: '', quantity: '' }] },
      { ...empty, photoUrls: ['https://i.duk.tw/a.jpg'] },
      { ...empty, landmark: point('manual') },
    ];

    for (const form of forms) {
      const storage = memoryStorage();

      writeHelpRequestDraft(storage, 'user-1', form);

      expect(readHelpRequestDraft(storage, 'user-1')).toEqual(form);
    }
  });

  it('drops the draft once the form is blank again, and when cleared', () => {
    const storage = memoryStorage();

    writeHelpRequestDraft(storage, 'user-1', filledForm());
    writeHelpRequestDraft(
      storage,
      'user-1',
      emptyHelpRequestForm(point('gps')),
    );
    expect(readHelpRequestDraft(storage, 'user-1')).toBeNull();

    writeHelpRequestDraft(storage, 'user-1', filledForm());
    clearHelpRequestDraft(storage, 'user-1');
    expect(storage.items.size).toBe(0);
  });

  it("clears every account's draft in the tab at once, and nothing else kept there", () => {
    const storage = memoryStorage();

    writeHelpRequestDraft(storage, 'user-1', filledForm());
    writeHelpRequestDraft(storage, 'user-2', filledForm());
    writeHelpRequestDraft(storage, 'user-3', filledForm());
    storage.setItem('wg.sessionExpired', '1');

    clearAllHelpRequestDrafts(storage);

    expect([...storage.items.keys()]).toEqual(['wg.sessionExpired']);
  });

  it('reads a broken draft, one from another version, or one of another shape as none', () => {
    const storage = memoryStorage();
    const key = helpRequestDraftKey('user-1');
    const stored = (value: unknown) => {
      storage.setItem(key, JSON.stringify(value));
      return readHelpRequestDraft(storage, 'user-1');
    };
    const form = filledForm();

    storage.setItem(key, '{not json');
    expect(readHelpRequestDraft(storage, 'user-1')).toBeNull();

    expect(stored({ v: 2, form })).toBeNull();
    expect(stored(form)).toBeNull();
    expect(
      stored({ v: 1, form: { ...form, photoUrls: undefined } }),
    ).toBeNull();
    expect(stored({ v: 1, form: { ...form, title: 3 } })).toBeNull();
    expect(stored({ v: 1, form: { ...form, needs: [] } })).toBeNull();
    expect(
      stored({
        v: 1,
        form: { ...form, needs: [{ need: 'flying', name: '', quantity: '' }] },
      }),
    ).toBeNull();
    expect(
      stored({ v: 1, form: { ...form, landmark: { lat: '23', lng: 121 } } }),
    ).toBeNull();

    expect(stored({ v: 1, form })).toEqual(form);
  });

  it('never throws when the storage does, or when there is none', () => {
    expect(() => {
      writeHelpRequestDraft(brokenStorage, 'user-1', filledForm());
      clearHelpRequestDraft(brokenStorage, 'user-1');
      clearAllHelpRequestDrafts(brokenStorage);
    }).not.toThrow();
    expect(readHelpRequestDraft(brokenStorage, 'user-1')).toBeNull();

    expect(() => {
      writeHelpRequestDraft(null, 'user-1', filledForm());
      clearHelpRequestDraft(null, 'user-1');
      clearAllHelpRequestDrafts(null);
    }).not.toThrow();
    expect(readHelpRequestDraft(null, 'user-1')).toBeNull();
  });
});
