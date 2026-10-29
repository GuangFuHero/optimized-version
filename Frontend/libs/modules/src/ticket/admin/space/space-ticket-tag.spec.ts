import { describe, expect, it } from 'vitest';

import { spaceTicketTag } from './space-ticket-tag';

const spaces = new Map([
  ['s1', { name: '林森61', floorLabels: ['RF', '1F', '2F', '3F', 'B1'] }],
]);

const filed = (
  floor: string | null,
  buildingMapUuid: string | null = 's1',
) => ({
  buildingMapUuid,
  secondaryLocation: { floor },
});

describe('spaceTicketTag', () => {
  it('names the space and the floor, in the building’s own spelling', () => {
    expect(spaceTicketTag(filed('3'), spaces)).toBe('🏢 林森61 · 3F');
    expect(spaceTicketTag(filed('頂樓'), spaces)).toBe('🏢 林森61 · RF');
  });

  it('names the space alone when the floor is unknown', () => {
    expect(spaceTicketTag(filed(null), spaces)).toBe('🏢 林森61');
    expect(spaceTicketTag(filed('  '), spaces)).toBe('🏢 林森61');
    expect(
      spaceTicketTag(
        { buildingMapUuid: 's1', secondaryLocation: null },
        spaces,
      ),
    ).toBe('🏢 林森61');
  });

  it('keeps a floor the building no longer has, as written', () => {
    expect(spaceTicketTag(filed(' 9F '), spaces)).toBe('🏢 林森61 · 9F');
  });

  it('tags nothing outside a space, or in one not loaded', () => {
    expect(spaceTicketTag(filed('3F', null), spaces)).toBeNull();
    expect(spaceTicketTag(filed('3F', 's2'), spaces)).toBeNull();
    expect(spaceTicketTag({}, spaces)).toBeNull();
  });
});
