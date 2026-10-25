import type { AdminStationReviewQuery } from '@rescue-frontend/data-access/admin';
import type { components } from '@rescue-frontend/data-access/openapi';
import { describe, expect, it } from 'vitest';

import {
  approvesConflict,
  buildDecisions,
  buildReviewFields,
  hasChangedSince,
  hasConflict,
  pendingFieldsLabel,
  reviewValueLabel,
  suggestionVersions,
} from './review';

const history = [
  {
    event_type: 'UPDATED',
    at: '2026-10-20T10:00:00Z',
    entity: 'station',
    changes: [{ field: 'op_hour', before: '8-17', after: '24h' }],
  },
  {
    event_type: 'UPDATED',
    at: '2026-10-18T10:00:00Z',
    entity: 'station_property',
    changes: [{ field: 'quantity', before: 1, after: 2 }],
  },
] as unknown as components['schemas']['HistoryEventResponse'][];

describe('hasChangedSince', () => {
  const station = { type: 'station', uuid: 's1' };
  const property = { type: 'station_property', uuid: 'p1' };

  it('flags a station field changed after the first suggestion', () => {
    expect(
      hasChangedSince(history, station, 'op_hour', '2026-10-19T00:00:00Z'),
    ).toBe(true);
    expect(
      hasChangedSince(history, station, 'op_hour', '2026-10-21T00:00:00Z'),
    ).toBe(false);
    expect(
      hasChangedSince(history, station, 'name', '2026-10-01T00:00:00Z'),
    ).toBe(false);
  });

  it('flags property fields conservatively when the event has no raw rows', () => {
    expect(
      hasChangedSince(history, property, 'quantity', '2026-10-17T00:00:00Z'),
    ).toBe(true);
  });

  it('matches the raw rows to the suggested resource when they are there', () => {
    const withRaw = (uuid: string) =>
      [
        {
          ...history[1],
          raw: [
            {
              old_values: { uuid, quantity: 1 },
              new_values: { uuid, quantity: 2 },
            },
          ],
        },
      ] as unknown as components['schemas']['HistoryEventResponse'][];
    const since = '2026-10-17T00:00:00Z';
    expect(hasChangedSince(withRaw('p1'), property, 'quantity', since)).toBe(
      true,
    );
    expect(hasChangedSince(withRaw('p2'), property, 'quantity', since)).toBe(
      false,
    );
  });

  it('treats a missing timestamp as no conflict', () => {
    expect(hasChangedSince(history, station, 'op_hour', null)).toBe(false);
  });
});

describe('buildReviewFields', () => {
  const review = {
    station: {
      uuid: 's1',
      opHour: '24h',
      name: '加水站',
      properties: [
        { uuid: 'p1', propertyName: '飲用水', quantity: 3, comment: null },
      ],
      suggestedFields: [
        {
          targetType: 'station',
          targetUuid: 's1',
          fieldName: 'op_hour',
          proposedValues: ['8-20'],
          suggestionCount: 2,
          comments: ['晚上有開'],
          firstSuggestedAt: '2026-10-19T00:00:00Z',
        },
        {
          targetType: 'station_property',
          targetUuid: 'p1',
          fieldName: 'quantity',
          proposedValues: ['0'],
          suggestionCount: 1,
          comments: [],
          firstSuggestedAt: '2026-10-19T00:00:00Z',
        },
      ],
    },
    suggestableFields: [],
  } as unknown as AdminStationReviewQuery;

  it('pairs each suggestion with the live value and its conflict flag', () => {
    expect(
      buildReviewFields(review, { events: history, total: history.length }),
    ).toEqual([
      expect.objectContaining({
        key: 's1:op_hour',
        label: '開放時間',
        currentValue: '24h',
        proposedValues: ['8-20'],
        conflict: true,
      }),
      expect.objectContaining({
        key: 'p1:quantity',
        label: '飲用水・數量',
        currentValue: '3',
        conflict: false,
      }),
    ]);
  });

  it('marks no conflict unknown when the page stops short of the suggestion', () => {
    // Only the op_hour change (10-20) was read, newer than the suggestions (10-19), and more are left.
    const page = { events: history.slice(0, 1), total: 150 };
    expect(buildReviewFields(review, page).map((f) => f.conflict)).toEqual([
      true,
      null,
    ]);
  });

  it('marks no conflict known when the page reaches past the suggestion', () => {
    // The oldest event read (10-18) is older than the suggestions (10-19), so nothing newer is missing.
    expect(
      buildReviewFields(review, { events: history, total: 150 }).map(
        (f) => f.conflict,
      ),
    ).toEqual([true, false]);
  });

  it('marks conflicts unknown when history could not be read', () => {
    const fields = buildReviewFields(review, null);
    expect(fields.map((f) => f.conflict)).toEqual([null, null]);
  });

  it('reads the value at suggestion time from the first change after it', () => {
    // op_hour was 8-17 when suggested and changed to 24h later; quantity is unchanged since.
    expect(
      buildReviewFields(review, { events: history, total: history.length }).map(
        (f) => f.baseValue,
      ),
    ).toEqual(['8-17', '3']);
  });

  it('takes the earliest of several changes after the suggestion', () => {
    const events = [
      {
        event_type: 'UPDATED',
        at: '2026-10-21T10:00:00Z',
        entity: 'station',
        changes: [{ field: 'op_hour', before: '24h', after: '9-18' }],
      },
      ...history,
    ] as unknown as components['schemas']['HistoryEventResponse'][];
    expect(
      buildReviewFields(review, { events, total: events.length })[0]?.baseValue,
    ).toBe('8-17');
  });

  it('calls a field changed and changed back no conflict, as the prototype does', () => {
    // op_hour went 8-17 → 24h → 8-17 after the suggestion: adopting it overwrites nobody's edit.
    const roundTrip = {
      ...review,
      station: { ...review.station, opHour: '8-17' },
    } as unknown as AdminStationReviewQuery;
    const events = [
      {
        event_type: 'UPDATED',
        at: '2026-10-21T10:00:00Z',
        entity: 'station',
        changes: [{ field: 'op_hour', before: '24h', after: '8-17' }],
      },
      ...history,
    ] as unknown as components['schemas']['HistoryEventResponse'][];
    expect(
      buildReviewFields(roundTrip, { events, total: events.length })[0],
    ).toMatchObject({
      conflict: false,
      baseValue: '8-17',
      currentValue: '8-17',
    });
  });

  it('keeps a change that hides its values a conflict', () => {
    const hidden = [
      { ...history[0], changes: [{ field: 'op_hour', changed: true }] },
    ] as unknown as components['schemas']['HistoryEventResponse'][];
    expect(
      buildReviewFields(review, { events: hidden, total: 1 })[0]?.conflict,
    ).toBe(true);
  });

  it('leaves the value at suggestion time unknown when the change hides it', () => {
    const hidden = [
      {
        ...history[0],
        changes: [{ field: 'op_hour', changed: true }],
      },
    ] as unknown as components['schemas']['HistoryEventResponse'][];
    expect(
      buildReviewFields(review, { events: hidden, total: 1 })[0]?.baseValue,
    ).toBeNull();
  });

  it('leaves the value at suggestion time unknown without history', () => {
    expect(buildReviewFields(review, null).map((f) => f.baseValue)).toEqual([
      null,
      null,
    ]);
  });

  it('returns nothing for a missing station', () => {
    expect(
      buildReviewFields({ station: null } as never, {
        events: history,
        total: history.length,
      }),
    ).toEqual([]);
  });
});

describe('buildDecisions', () => {
  const field = (key: string) => {
    const [targetUuid, fieldName] = key.split(':');
    return { key, targetUuid, fieldName };
  };

  it('sends only decided fields and drops a blank number or choice', () => {
    expect(
      buildDecisions(
        [field('s1:name'), field('s1:op_hour'), field('p1:quantity')],
        {
          's1:name': { approve: true, value: '新站名' },
          's1:op_hour': { approve: false, value: '' },
          'p1:quantity': { approve: true, value: '  ' },
        },
      ),
    ).toEqual([
      { targetUuid: 's1', fieldName: 'name', approve: true, value: '新站名' },
      { targetUuid: 's1', fieldName: 'op_hour', approve: false },
    ]);
  });

  it('approves a blank text field, which clears it', () => {
    expect(
      buildDecisions([field('s1:supply_status'), field('p1:comment')], {
        's1:supply_status': { approve: true, value: '' },
        'p1:comment': { approve: true, value: '  ' },
      }),
    ).toEqual([
      {
        targetUuid: 's1',
        fieldName: 'supply_status',
        approve: true,
        value: '',
      },
      { targetUuid: 'p1', fieldName: 'comment', approve: true, value: '' },
    ]);
  });
});

describe('pendingFieldsLabel', () => {
  it('counts station fields, and never claims zero for a station in the queue', () => {
    expect(pendingFieldsLabel(2)).toBe('2 欄');
    // Only its resources have suggestions: pendingSuggestedFields covers station fields only.
    expect(pendingFieldsLabel(0)).toBe('資源待審');
  });
});

describe('hasConflict', () => {
  it('is true only when a field is known to conflict', () => {
    expect(hasConflict([{ conflict: false }, { conflict: true }])).toBe(true);
    expect(hasConflict([{ conflict: false }, { conflict: null }])).toBe(false);
    expect(hasConflict([])).toBe(false);
  });
});

describe('approvesConflict', () => {
  const fields = [
    { key: 'a', conflict: true },
    { key: 'b', conflict: false },
    { key: 'c', conflict: null },
  ];

  it('is true when a conflicting field is to be adopted', () => {
    expect(approvesConflict(fields, { a: { approve: true, value: 'x' } })).toBe(
      true,
    );
  });

  it('lets a conflicting field be declined or left for later', () => {
    expect(approvesConflict(fields, { a: { approve: false, value: '' } })).toBe(
      false,
    );
    expect(approvesConflict(fields, { a: undefined })).toBe(false);
  });

  it('ignores adopting a field without a known conflict', () => {
    expect(
      approvesConflict(fields, {
        b: { approve: true, value: 'x' },
        c: { approve: true, value: 'y' },
      }),
    ).toBe(false);
  });
});

describe('suggestionVersions', () => {
  const fields = [
    { firstSuggestedAt: '2026-10-21T00:00:00Z' },
    { firstSuggestedAt: '2026-10-19T00:00:00Z' },
  ];

  it('counts the station version now and when the earliest suggestion came in', () => {
    // Two events, one (10-20) after the earliest suggestion (10-19): v3 now, v2 then.
    expect(
      suggestionVersions({ events: history, total: history.length }, fields),
    ).toEqual({
      current: 3,
      base: 2,
      firstSuggestedAt: '2026-10-19T00:00:00Z',
    });
  });

  it('leaves the base unknown when the page stops short of the suggestion', () => {
    expect(
      suggestionVersions({ events: history.slice(0, 1), total: 150 }, fields),
    ).toEqual({
      current: 151,
      base: null,
      firstSuggestedAt: '2026-10-19T00:00:00Z',
    });
  });

  it('knows nothing without history', () => {
    expect(suggestionVersions(null, fields)).toEqual({
      current: null,
      base: null,
      firstSuggestedAt: '2026-10-19T00:00:00Z',
    });
  });
});

describe('reviewValueLabel', () => {
  it('names an operational status the way the page does', () => {
    expect(reviewValueLabel('operational_status', 'temporarily_closed')).toBe(
      '暫時關閉',
    );
  });

  it('shows any other value as it is', () => {
    expect(reviewValueLabel('op_hour', '8-20')).toBe('8-20');
  });
});
