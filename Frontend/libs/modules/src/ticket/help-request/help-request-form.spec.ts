import { describe, expect, it } from 'vitest';

import {
  canAddNeedRow,
  emptyHelpRequestForm,
  emptyNeed,
  findMissingFields,
  hasRescueNeed,
  isQuantityMissing,
  MAX_NEEDS,
  SITE_NEED_OPTIONS,
  toHelpRequestInput,
  type HelpRequestForm,
} from './help-request-form';

function filledForm(overrides: Partial<HelpRequestForm> = {}): HelpRequestForm {
  return {
    title: '一樓客廳積泥需要幫忙清',
    landmark: { lat: 23.6725, lng: 121.4235, source: 'manual' },
    address: '花蓮縣光復鄉中山路100號',
    floor: '',
    room: '',
    contactName: '王小姐',
    contactPhone: '',
    needs: [{ need: 'cleanup', name: '', quantity: '2' }],
    description: '',
    photoUrls: [],
    ...overrides,
  };
}

describe('SITE_NEED_OPTIONS', () => {
  it('maps each choice to a kind of need the server accepts (backend TASK_TYPES)', () => {
    for (const option of SITE_NEED_OPTIONS) {
      expect(['hr', 'supply', 'rescue', 'medical']).toContain(option.kind);
    }
  });
});

describe('findMissingFields', () => {
  it('lists what a fresh form lacks, top to bottom, so the first is the one to scroll to', () => {
    expect(
      findMissingFields(emptyHelpRequestForm()).map((field) => field.key),
    ).toEqual(['title', 'landmark', 'address', 'contact', 'needs']);
  });

  it('finds nothing missing on a form with everything required', () => {
    expect(findMissingFields(filledForm())).toEqual([]);
  });

  it('takes a field of spaces as empty', () => {
    const keys = findMissingFields(
      filledForm({ title: '  ', address: ' ', contactName: '　' }),
    ).map((field) => field.key);

    expect(keys).toEqual(['title', 'address', 'contact']);
  });

  it('does not count a need row nobody chose a kind for', () => {
    const keys = findMissingFields(
      filledForm({ needs: [emptyNeed(), emptyNeed()] }),
    ).map((field) => field.key);

    expect(keys).toEqual(['needs']);
  });

  it('is content with one chosen need among unchosen rows', () => {
    expect(
      findMissingFields(
        filledForm({
          needs: [emptyNeed(), { need: 'supplies', name: '', quantity: '1' }],
        }),
      ),
    ).toEqual([]);
  });

  it('asks how many for every chosen need but a rescue (backend QUANTITY_REQUIRED_TASK_TYPES)', () => {
    const missing = findMissingFields(
      filledForm({
        needs: [
          { need: 'cleanup', name: '', quantity: '' },
          { need: 'supplies', name: '', quantity: ' ' },
          { need: 'rescue', name: '', quantity: '' },
        ],
      }),
    );

    expect(missing).toEqual([{ key: 'quantity', label: '需求的數量' }]);
  });

  it('asks for the quantity once a kind is chosen, after asking for one at all', () => {
    expect(
      findMissingFields(
        filledForm({
          needs: [{ need: 'rescue', name: '', quantity: '' }, emptyNeed()],
        }),
      ),
    ).toEqual([]);
  });
});

describe('isQuantityMissing', () => {
  it('flags a chosen need left without a quantity, a rescue excepted', () => {
    expect(isQuantityMissing({ need: 'cleanup', name: '', quantity: '' })).toBe(
      true,
    );
    expect(
      isQuantityMissing({ need: 'supplies', name: '', quantity: ' ' }),
    ).toBe(true);
    expect(isQuantityMissing({ need: 'rescue', name: '', quantity: '' })).toBe(
      false,
    );
    expect(isQuantityMissing({ need: 'repair', name: '', quantity: '3' })).toBe(
      false,
    );
  });

  it('leaves a row nobody chose a kind for to the need check', () => {
    expect(isQuantityMissing(emptyNeed())).toBe(false);
  });
});

describe('canAddNeedRow', () => {
  const rows = (count: number) =>
    Array.from({ length: count }, () => ({
      need: 'cleanup' as const,
      name: '',
      quantity: '1',
    }));

  it('offers another row up to the most one request takes (backend HELP_REQUEST_NEED_MAX)', () => {
    expect(MAX_NEEDS).toBe(20);
    expect(canAddNeedRow(rows(MAX_NEEDS - 1))).toBe(true);
    expect(canAddNeedRow(rows(MAX_NEEDS))).toBe(false);
  });
});

describe('hasRescueNeed', () => {
  it('is true once someone is trapped or hurt, for the 119 notice at the top', () => {
    expect(
      hasRescueNeed([
        { need: 'cleanup', name: '', quantity: '' },
        { need: 'rescue', name: '', quantity: '' },
      ]),
    ).toBe(true);
  });

  it('is false for other needs and rows not chosen yet', () => {
    expect(
      hasRescueNeed([emptyNeed(), { need: 'repair', name: '', quantity: '' }]),
    ).toBe(false);
  });
});

describe('toHelpRequestInput', () => {
  it('sends the photo links in the order they were added', () => {
    const photoUrls = ['https://duk.tw/b.jpg', 'https://duk.tw/a.jpg'];

    expect(toHelpRequestInput(filledForm({ photoUrls })).photoUrls).toEqual(
      photoUrls,
    );
  });

  it('starts a form with no photos: they are optional', () => {
    expect(emptyHelpRequestForm().photoUrls).toEqual([]);
  });

  it('sends the point as GeoJSON, longitude first', () => {
    expect(toHelpRequestInput(filledForm()).geometry).toEqual({
      type: 'Point',
      coordinates: [121.4235, 23.6725],
    });
  });

  it('puts the typed address in landmarkNote with floor and room beside it', () => {
    expect(
      toHelpRequestInput(
        filledForm({ address: ' 中山路100號 ', floor: ' 3樓 ', room: '302室' }),
      ).secondaryLocation,
    ).toEqual({ landmarkNote: '中山路100號', floor: '3樓', room: '302室' });
  });

  it('sends what was left blank as null rather than empty text', () => {
    const input = toHelpRequestInput(
      filledForm({ contactPhone: ' ', description: '' }),
    );

    expect(input.contactPhone).toBeNull();
    expect(input.description).toBeNull();
    expect(input.secondaryLocation).toEqual({
      landmarkNote: '花蓮縣光復鄉中山路100號',
      floor: null,
      room: null,
    });
  });

  it('trims what was typed', () => {
    const input = toHelpRequestInput(
      filledForm({
        title: ' 積泥 ',
        contactName: ' 王小姐 ',
        contactPhone: ' line: wang ',
        description: ' 巷子窄 ',
      }),
    );

    expect(input).toMatchObject({
      title: '積泥',
      contactName: '王小姐',
      contactPhone: 'line: wang',
      description: '巷子窄',
    });
  });

  it('sends only the chosen needs, each as its kind', () => {
    const input = toHelpRequestInput(
      filledForm({
        needs: [
          { need: 'supplies', name: '晚餐便當', quantity: '3' },
          emptyNeed(),
          { need: 'rescue', name: '', quantity: '' },
        ],
      }),
    );

    expect(input.tasks).toEqual([
      { taskType: 'supply', taskName: '晚餐便當', quantity: 3 },
      { taskType: 'rescue', taskName: '人員受困／急難', quantity: null },
    ]);
  });

  it('names a need by its choice when no description was typed', () => {
    const input = toHelpRequestInput(
      filledForm({ needs: [{ need: 'care', name: '  ', quantity: '1' }] }),
    );

    expect(input.tasks[0].taskName).toBe('陪同／照顧');
  });

  it("leaves a rescue's unknown quantity unknown, and never asks for fewer than one", () => {
    const quantities = toHelpRequestInput(
      filledForm({
        needs: [
          { need: 'rescue', name: '', quantity: ' ' },
          { need: 'cleanup', name: '', quantity: '0' },
          { need: 'cleanup', name: '', quantity: '2.5' },
        ],
      }),
    ).tasks.map((task) => task.quantity);

    expect(quantities).toEqual([null, 1, 2]);
  });
});
