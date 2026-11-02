import { describe, expect, it } from 'vitest';

import {
  floorLabelOf,
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

describe('floorLabelOf', () => {
  const LABELS = BUILDING.map((item) => item.label);
  const labelOf = (written: string | null | undefined) =>
    floorLabelOf(written, LABELS);

  it('finds the label as written, in any width or case, spaces aside', () => {
    expect(labelOf('3F')).toBe('3F');
    expect(labelOf(' 3f ')).toBe('3F');
    expect(labelOf('３Ｆ')).toBe('3F');
    expect(labelOf('b1')).toBe('B1');
  });

  it('takes the roof by any of its names: every building has one (backend ADR-310)', () => {
    for (const written of [
      '頂樓',
      '頂',
      '屋頂',
      '頂樓平台',
      'R',
      'r',
      'RF',
      'rf',
    ]) {
      expect(labelOf(written)).toBe('RF');
    }
  });

  it('takes a floor by its number, as a reporter writes it', () => {
    for (const written of [
      '3',
      '3樓',
      '３樓',
      '三樓',
      '三',
      '第3層',
      '第三層',
    ]) {
      expect(labelOf(written)).toBe('3F');
    }
    for (const written of [
      '地下一樓',
      '地下1樓',
      'B1樓',
      'B1F',
      '-1',
      '負一',
    ]) {
      expect(labelOf(written)).toBe('B1');
    }
  });

  it('names no floor when other words follow the number: 2號 is a door, 4-5樓 two floors', () => {
    for (const written of ['2號', '4-5樓', '3樓之1', '二樓301室', '地下1號']) {
      expect(labelOf(written)).toBeNull();
    }
  });

  it('reads 十 as a reporter does', () => {
    const labels = ['RF', '23F', '20F', '12F', '10F', '1F'];

    expect(floorLabelOf('十樓', labels)).toBe('10F');
    expect(floorLabelOf('十二樓', labels)).toBe('12F');
    expect(floorLabelOf('二十樓', labels)).toBe('20F');
    expect(floorLabelOf('二十三樓', labels)).toBe('23F');
  });

  it('names no floor for one the building does not have, nothing written, or no number', () => {
    for (const written of [
      '7F',
      '7樓',
      '0樓',
      '夾層',
      '樓梯間',
      '',
      '  ',
      null,
      undefined,
    ]) {
      expect(labelOf(written)).toBeNull();
    }
  });

  it('matches a label of another form only as written, never by a number in it', () => {
    const labels = ['RF', '第1節車廂', '1F'];

    expect(floorLabelOf('第 1 節車廂', labels)).toBe('第1節車廂');
    expect(floorLabelOf('1', labels)).toBe('1F');
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

  it('leaves unplaced a ticket whose floor says more than a floor, rather than on the wrong one', () => {
    const written = [
      { id: 'j', floor: '2號' },
      { id: 'k', floor: '4-5樓' },
    ];
    const groups = groupByFloor(BUILDING, written, (ticket) => ticket.floor);

    expect(groups.floors.flatMap((group) => group.tickets)).toEqual([]);
    expect(groups.unplaced.map((ticket) => ticket.id)).toEqual(['j', 'k']);
  });

  it('puts a ticket on the floor its words name: 頂樓 on the roof, 三樓 on 3F', () => {
    const written = [
      { id: 'g', floor: '頂樓' },
      { id: 'h', floor: '三樓' },
      { id: 'i', floor: '地下一樓' },
    ];
    const groups = groupByFloor(BUILDING, written, (ticket) => ticket.floor);

    expect(
      groups.floors
        .filter((group) => group.tickets.length)
        .map((group) => [
          group.floor.label,
          group.tickets.map((ticket) => ticket.id),
        ]),
    ).toEqual([
      ['B1', ['i']],
      ['3F', ['h']],
      ['RF', ['g']],
    ]);
    expect(groups.unplaced).toEqual([]);
  });
});
