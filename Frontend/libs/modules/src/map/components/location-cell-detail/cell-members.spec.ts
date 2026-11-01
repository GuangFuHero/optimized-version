import { describe, expect, it } from 'vitest';

import type { RescueMapMarkerItem } from '../../types';
import {
  EMPTY_CELL_MEMBERS,
  nextCellMembersSkip,
  withCellMembersPage,
} from './cell-members';

function ticket(id: string): RescueMapMarkerItem {
  return {
    id,
    title: id,
    subtitle: '',
    position: [23.66, 121.43],
    label: '待處理',
    variant: 'in-progress',
    detailType: 'ticket',
  };
}

const ids = (list: { members: readonly RescueMapMarkerItem[] }) =>
  list.members.map((member) => member.id);

describe('withCellMembersPage', () => {
  it('lists the first page and starts the next after every ticket it held', () => {
    const list = withCellMembersPage(
      EMPTY_CELL_MEMBERS,
      { members: [ticket('a'), ticket('b')], read: 2, hasMore: true },
      0,
    );

    expect(ids(list)).toEqual(['a', 'b']);
    expect(list.hasMore).toBe(true);
    expect(nextCellMembersSkip(list)).toBe(2);
  });

  it('adds a later page under the tickets already listed', () => {
    const first = withCellMembersPage(
      EMPTY_CELL_MEMBERS,
      { members: [ticket('a'), ticket('b')], read: 2, hasMore: true },
      0,
    );
    const list = withCellMembersPage(
      first,
      { members: [ticket('c')], read: 1, hasMore: false },
      nextCellMembersSkip(first),
    );

    expect(ids(list)).toEqual(['a', 'b', 'c']);
    expect(list.hasMore).toBe(false);
    expect(nextCellMembersSkip(list)).toBe(3);
  });

  it('skips a ticket already listed: one filed between two pages repeats the last row', () => {
    const first = withCellMembersPage(
      EMPTY_CELL_MEMBERS,
      { members: [ticket('a'), ticket('b')], read: 2, hasMore: true },
      0,
    );
    // A new ticket went in on top, so the page from 2 begins with b again.
    const list = withCellMembersPage(
      first,
      { members: [ticket('b'), ticket('c')], read: 2, hasMore: false },
      2,
    );

    expect(ids(list)).toEqual(['a', 'b', 'c']);
  });

  it('counts the tickets a page held, not the members drawn from them', () => {
    // Three tickets came back and one had no place to draw: the next page starts at 3, not 2.
    const list = withCellMembersPage(
      EMPTY_CELL_MEMBERS,
      { members: [ticket('a'), ticket('c')], read: 3, hasMore: true },
      0,
    );

    expect(nextCellMembersSkip(list)).toBe(3);
  });

  it('starts again from a first page, as when the cell or the filter changes', () => {
    const old = withCellMembersPage(
      EMPTY_CELL_MEMBERS,
      { members: [ticket('a'), ticket('b')], read: 2, hasMore: true },
      0,
    );
    const list = withCellMembersPage(
      old,
      { members: [ticket('x')], read: 1, hasMore: false },
      0,
    );

    expect(ids(list)).toEqual(['x']);
    expect(nextCellMembersSkip(list)).toBe(1);
  });

  it('retries from where the list ends: a failed page leaves it as it was', () => {
    expect(nextCellMembersSkip(EMPTY_CELL_MEMBERS)).toBe(0);

    const first = withCellMembersPage(
      EMPTY_CELL_MEMBERS,
      { members: [ticket('a')], read: 200, hasMore: true },
      0,
    );

    expect(nextCellMembersSkip(first)).toBe(200);
  });
});
