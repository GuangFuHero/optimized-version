import type { AdminStationReviewQuery } from '@rescue-frontend/data-access/admin';
import type { TimelineItem } from '@rescue-frontend/ui';
import { describe, expect, it } from 'vitest';

import { buildDecisions, buildReviewFields, hasChangedSince } from './review';

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
] as unknown as TimelineItem[];

describe('hasChangedSince', () => {
  it('flags a station field changed after the first suggestion', () => {
    expect(
      hasChangedSince(history, 'station', 'op_hour', '2026-10-19T00:00:00Z'),
    ).toBe(true);
    expect(
      hasChangedSince(history, 'station', 'op_hour', '2026-10-21T00:00:00Z'),
    ).toBe(false);
    expect(
      hasChangedSince(history, 'station', 'name', '2026-10-01T00:00:00Z'),
    ).toBe(false);
  });

  it('flags property fields conservatively (history has no property uuid)', () => {
    expect(
      hasChangedSince(
        history,
        'station_property',
        'quantity',
        '2026-10-17T00:00:00Z',
      ),
    ).toBe(true);
  });

  it('treats a missing timestamp as no conflict', () => {
    expect(hasChangedSince(history, 'station', 'op_hour', null)).toBe(false);
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
    expect(buildReviewFields(review, history)).toEqual([
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

  it('returns nothing for a missing station', () => {
    expect(buildReviewFields({ station: null } as never, history)).toEqual([]);
  });
});

describe('buildDecisions', () => {
  const field = (key: string) => {
    const [targetUuid, fieldName] = key.split(':');
    return { key, targetUuid, fieldName };
  };

  it('sends only decided fields and drops approvals without a value', () => {
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
});
