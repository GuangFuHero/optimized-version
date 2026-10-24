import { describe, expect, it } from 'vitest';

import {
  floorName,
  groupByFloor,
  orderFloors,
  type BuildingFloor,
} from './floors';

const floor = (label: string, areas: string[] = []): BuildingFloor => ({
  label,
  areas,
});

// As the backend returns a 5-storey building with one basement: the roof first, in the building's order.
const BUILDING = ['RF', '5F', '4F', '3F', '2F', '1F', 'B1'].map((label) =>
  floor(label),
);

describe('orderFloors', () => {
  it('puts the basements above 1F, smallest number first, and the roof last', () => {
    const floors = ['RF', '3F', '2F', '1F', 'B1', 'B2'].map((label) =>
      floor(label),
    );

    expect(orderFloors(floors).map((item) => item.label)).toEqual([
      'B2',
      'B1',
      '1F',
      '2F',
      '3F',
      'RF',
    ]);
  });

  it('counts floors as numbers, not as text', () => {
    const floors = ['12F', '11F', '10F', '9F', '2F', '1F'].map((label) =>
      floor(label),
    );

    expect(orderFloors(floors).map((item) => item.label)).toEqual([
      '1F',
      '2F',
      '9F',
      '10F',
      '11F',
      '12F',
    ]);
  });

  it('keeps a label of no known form, last', () => {
    const floors = ['2F', '夾層', '1F'].map((label) => floor(label));

    expect(orderFloors(floors).map((item) => item.label)).toEqual([
      '1F',
      '2F',
      '夾層',
    ]);
  });

  it('leaves the floors it was given as they were', () => {
    const floors = ['2F', '1F'].map((label) => floor(label));

    orderFloors(floors);

    expect(floors.map((item) => item.label)).toEqual(['2F', '1F']);
  });
});

describe('floorName', () => {
  it('spells the roof out and leaves the rest as labelled', () => {
    expect(floorName('RF')).toBe('頂樓');
    expect(floorName('3F')).toBe('3F');
    expect(floorName('B1')).toBe('B1');
  });
});

describe('groupByFloor', () => {
  const tickets = [
    { id: 'a', floor: '3F' },
    { id: 'b', floor: null },
    { id: 'c', floor: 'B1' },
    { id: 'd', floor: '3F' },
    { id: 'e', floor: '7F' },
    { id: 'f', floor: ' ' },
  ];

  it('puts each ticket on its floor, and every floor in the drawer’s order, an empty one too', () => {
    const groups = groupByFloor(BUILDING, tickets, (ticket) => ticket.floor);

    expect(
      groups.floors.map((group) => [
        group.floor.label,
        group.tickets.map((ticket) => ticket.id),
      ]),
    ).toEqual([
      ['B1', ['c']],
      ['1F', []],
      ['2F', []],
      ['3F', ['a', 'd']],
      ['4F', []],
      ['5F', []],
      ['RF', []],
    ]);
  });

  it('leaves unplaced a ticket with no floor, and one on a floor the building no longer has', () => {
    const groups = groupByFloor(BUILDING, tickets, (ticket) => ticket.floor);

    expect(groups.unplaced.map((ticket) => ticket.id)).toEqual(['b', 'e', 'f']);
  });
});
