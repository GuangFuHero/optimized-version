import { describe, expect, it } from 'vitest';

import {
  emptyHelpRequestForm,
  emptyNeed,
  findMissingFields,
  hasRescueNeed,
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
    needs: [{ need: 'cleanup', name: '', quantity: '' }],
    description: '',
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
          needs: [emptyNeed(), { need: 'supplies', name: '', quantity: '' }],
        }),
      ),
    ).toEqual([]);
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
  it('sends the point as GeoJSON, longitude first', () => {
    expect(toHelpRequestInput(filledForm()).geometry).toEqual({
      type: 'Point',
      coordinates: [121.4235, 23.6725],
    });
  });

  it('puts the typed address in landmarkNote with floor and room beside it (Q7)', () => {
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

  it('names a need by its choice when no description was typed (Q9)', () => {
    const input = toHelpRequestInput(
      filledForm({ needs: [{ need: 'care', name: '  ', quantity: '' }] }),
    );

    expect(input.tasks[0].taskName).toBe('陪同／照顧');
  });

  it('leaves an unknown quantity unknown, and never asks for fewer than one', () => {
    const quantities = toHelpRequestInput(
      filledForm({
        needs: [
          { need: 'cleanup', name: '', quantity: ' ' },
          { need: 'cleanup', name: '', quantity: '0' },
          { need: 'cleanup', name: '', quantity: '2.5' },
        ],
      }),
    ).tasks.map((task) => task.quantity);

    expect(quantities).toEqual([null, 1, 2]);
  });
});
