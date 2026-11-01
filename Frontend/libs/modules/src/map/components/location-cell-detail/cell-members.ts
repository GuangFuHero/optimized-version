import type { LocationCellMembersPage, RescueMapMarkerItem } from '../../types';

/** A counted cell's tickets as listed so far, read a page at a time. */
export interface CellMembersList {
  members: readonly RescueMapMarkerItem[];
  /** How many tickets the pages read so far held, listed or not: the next page starts there. */
  read: number;
  hasMore: boolean;
}

export const EMPTY_CELL_MEMBERS: CellMembersList = {
  members: [],
  read: 0,
  hasMore: false,
};

/**
 * The list once a page read `skip` tickets in has come back. A first page starts it again, as for a
 * new cell or filter; a later one adds the tickets not listed yet. A ticket filed between two pages
 * pushes the rest down one, so the next page begins with a ticket already listed.
 */
export function withCellMembersPage(
  list: CellMembersList,
  page: LocationCellMembersPage,
  skip: number,
): CellMembersList {
  if (skip === 0) {
    return { members: page.members, read: page.read, hasMore: page.hasMore };
  }

  const listed = new Set(list.members.map((member) => member.id));

  return {
    members: [
      ...list.members,
      ...page.members.filter((member) => !listed.has(member.id)),
    ],
    read: skip + page.read,
    hasMore: page.hasMore,
  };
}

/**
 * Where the next page starts, for 再顯示 and a retry alike: after every ticket read so far. A page
 * that failed changed nothing, so its retry asks from the same place.
 */
export function nextCellMembersSkip(list: CellMembersList): number {
  return list.read;
}
