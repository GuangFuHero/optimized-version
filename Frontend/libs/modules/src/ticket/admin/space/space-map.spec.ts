import { describe, expect, it } from 'vitest';

import { TICKET_PRIORITY_PIN_COLORS } from '../ticket-board/model/ticket-marker';
import type { SpaceListRow } from './space-analysis';
import {
  SPACE_PIN_EMPTY,
  spaceIdOfMarker,
  spacePinColor,
  toSpaceMarker,
} from './space-map';

const row = (patch: Partial<SpaceListRow> = {}): SpaceListRow => ({
  kind: 'space',
  id: 's1',
  name: '林森61',
  address: '花蓮縣光復鄉林森路61號',
  summary: '8 層 · 2 張任務單 · 1 層還需要幫忙',
  status: 'need',
  priority: 'critical',
  openNeeds: 1,
  volunteerGap: 2,
  updatedAt: '2026-10-29T08:00:00Z',
  lngLat: [121.425, 23.668],
  ...patch,
});

describe('spacePinColor', () => {
  it('colours a space as a ticket of its priority, and grey with no tickets', () => {
    expect(spacePinColor('critical')).toBe(TICKET_PRIORITY_PIN_COLORS.critical);
    expect(spacePinColor('low')).toBe(TICKET_PRIORITY_PIN_COLORS.low);
    expect(spacePinColor(null)).toBe('#64748B');
    expect(SPACE_PIN_EMPTY).toBe('#64748B');
  });
});

describe('toSpaceMarker', () => {
  it('is a square pin at the building, named on hover', () => {
    const marker = toSpaceMarker(row());

    expect(marker?.position).toEqual([23.668, 121.425]);
    expect(marker?.pin).toMatchObject({
      shape: 'square',
      color: TICKET_PRIORITY_PIN_COLORS.critical,
      dimmed: false,
    });
    expect(marker?.tooltip).toEqual({
      title: '林森61',
      subtitle: '花蓮縣光復鄉林森路61號',
    });
  });

  it('is grey when the space has no ticket that counts, and faded when all are done', () => {
    expect(
      toSpaceMarker(row({ priority: null, status: 'empty' }))?.pin?.color,
    ).toBe('#64748B');
    expect(toSpaceMarker(row({ status: 'done' }))?.pin?.dimmed).toBe(true);
  });

  it('is not drawn without a point', () => {
    expect(toSpaceMarker(row({ lngLat: null }))).toBeNull();
  });

  it('has an id no ticket uuid can share, read back to the space', () => {
    const marker = toSpaceMarker(row());

    expect(marker?.id).not.toBe('s1');
    expect(spaceIdOfMarker(marker?.id ?? '')).toBe('s1');
    expect(spaceIdOfMarker('s1')).toBeNull();
  });
});
