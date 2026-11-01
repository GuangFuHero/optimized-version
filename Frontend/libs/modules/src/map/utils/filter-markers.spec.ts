import { describe, expect, it } from 'vitest';

import type { RescueMapMarkerItem } from '../types';
import { filterRescueMapMarkers } from './filter-markers';

function marker(overrides: Partial<RescueMapMarkerItem>): RescueMapMarkerItem {
  return {
    id: 'ticket-1',
    title: '光復路 28 號清淤',
    subtitle: '',
    position: [23.67, 121.43],
    label: '待處理',
    variant: 'urgent-ticket',
    detailType: 'ticket',
    ...overrides,
  };
}

const pending = marker({ ticketMeta: { status: 'pending' } });
const completed = marker({
  id: 'ticket-2',
  ticketMeta: { status: 'completed' },
});
const building = marker({
  id: 'building:b-1',
  title: '大進國小',
  label: '大進國小',
  variant: 'in-progress',
  building: { uuid: 'b-1' },
});

describe('filterRescueMapMarkers', () => {
  it('keeps the tickets of the statuses chosen and drops the rest', () => {
    expect(
      filterRescueMapMarkers([pending, completed], {
        dataType: 'ticket',
        subDataTypes: ['pending'],
      }).map(({ id }) => id),
    ).toEqual(['ticket-1']);
  });

  it('keeps a building under any status: it has none, and its tickets are not drawn beside it', () => {
    expect(
      filterRescueMapMarkers([building, completed], {
        dataType: 'ticket',
        subDataTypes: ['pending'],
      }).map(({ id }) => id),
    ).toEqual(['building:b-1']);
  });
});
