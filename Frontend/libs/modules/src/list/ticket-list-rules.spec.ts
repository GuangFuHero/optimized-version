import { describe, expect, it } from 'vitest';

import type { RescueMapMarkerItem } from '../map/types';
import type { TicketNeed } from '../ticket/needs';
import {
  countFloor,
  listCountLabel,
  listPaging,
  listTickets,
  pageFoldedAway,
  showsClosedTickets,
} from './ticket-list-rules';

function need(overrides: Partial<TicketNeed> = {}): TicketNeed {
  return {
    uuid: 'need-1',
    taskName: '清淤',
    taskType: 'hr',
    quantity: 3,
    status: 'pending',
    assignedCount: 0,
    myAssignment: null,
    ...overrides,
  };
}

const OPEN = need({ uuid: 'open' });
const FILLED = need({ uuid: 'filled', status: 'fulfilled', assignedCount: 3 });

function ticket(
  id: string,
  needs: readonly TicketNeed[] | undefined,
  status = 'pending',
): RescueMapMarkerItem {
  return {
    id,
    detailType: 'ticket',
    title: `單 ${id}`,
    subtitle: '',
    label: '',
    position: [23.65, 121.42],
    ticketMeta: { status },
    needs,
  } as RescueMapMarkerItem;
}

const ids = (markers: { marker: RescueMapMarkerItem }[]) =>
  markers.map(({ marker }) => marker.id);
const needIds = (listed: { needs: readonly TicketNeed[] }) =>
  listed.needs.map(({ uuid }) => uuid);

describe('showsClosedTickets', () => {
  it('is set by a status filter that asks for finished or cancelled tickets', () => {
    expect(showsClosedTickets(['completed'])).toBe(true);
    expect(showsClosedTickets(['pending', 'cancelled'])).toBe(true);
  });

  it('is not set by the open statuses or by no filter', () => {
    expect(showsClosedTickets(undefined)).toBe(false);
    expect(showsClosedTickets(['pending', 'in_progress'])).toBe(false);
  });
});

describe('listTickets', () => {
  it('leaves out the needs that have their people, and counts them for 含已滿額（N）', () => {
    const list = listTickets([ticket('a', [OPEN, FILLED])], {
      showFull: false,
    });

    expect(list.tickets.map(needIds)).toEqual([['open']]);
    expect(list.fullNeedCount).toBe(1);
    expect(list.needCount).toBe(1);
  });

  it('counts a need at its cap, and one stopped by its requester, as full', () => {
    const atCap = need({ uuid: 'at-cap', quantity: 2, assignedCount: 2 });
    const stopped = need({
      uuid: 'stopped',
      status: 'fulfilled',
      quantity: 1,
      assignedCount: 1,
    });
    const list = listTickets([ticket('a', [OPEN, atCap, stopped])], {
      showFull: false,
    });

    expect(list.tickets.map(needIds)).toEqual([['open']]);
    expect(list.fullNeedCount).toBe(2);
  });

  it('shows every need with 含已滿額 on, and still counts the full ones', () => {
    const list = listTickets([ticket('a', [OPEN, FILLED])], { showFull: true });

    expect(list.tickets.map(needIds)).toEqual([['open', 'filled']]);
    expect(list.fullNeedCount).toBe(1);
    expect(list.needCount).toBe(2);
  });

  it('leaves out a ticket none of whose needs is open, finished tickets included', () => {
    const list = listTickets(
      [ticket('open', [OPEN]), ticket('full', [FILLED], 'completed')],
      { showFull: false },
    );

    expect(ids(list.tickets)).toEqual(['open']);
    expect(list.fullNeedCount).toBe(1);
  });

  it('leaves out a cancelled ticket even if its needs read open', () => {
    // Cancelled by hand before statuses were derived; the backend refuses a claim on it.
    const list = listTickets([ticket('x', [OPEN], 'cancelled')], {
      showFull: false,
    });

    expect(list.tickets).toEqual([]);
    expect(list.fullNeedCount).toBe(1);
  });

  it('keeps the viewer’s own claim in view after it fills, ticket and all', () => {
    // Taking the last place must not make the line vanish from under the volunteer's finger.
    const mine = need({
      uuid: 'mine',
      status: 'fulfilled',
      assignedCount: 3,
      myAssignment: { uuid: 'assignment-1' },
    });
    const list = listTickets([ticket('a', [mine, FILLED], 'completed')], {
      showFull: false,
    });

    expect(list.tickets.map(needIds)).toEqual([['mine']]);
    expect(list.fullNeedCount).toBe(1);
  });

  it('keeps a ticket that has no needs, unless it is finished', () => {
    const list = listTickets(
      [
        ticket('bare', []),
        ticket('done', [], 'completed'),
        ticket('unknown', undefined),
      ],
      { showFull: false },
    );

    expect(ids(list.tickets)).toEqual(['bare', 'unknown']);
    expect(
      ids(
        listTickets([ticket('done', [], 'completed')], { showFull: true })
          .tickets,
      ),
    ).toEqual(['done']);
  });

  it('shows only the needs whose name the search names, or every need when it names none', () => {
    const clearing = need({ uuid: 'clearing', taskName: '清淤人力' });
    const meals = need({ uuid: 'meals', taskName: '晚餐便當' });
    const markers = [ticket('a', [clearing, meals]), ticket('b', [meals])];

    // `b` came back for its title or description: all of its needs stay.
    expect(
      listTickets(markers, { showFull: false, q: '清淤' }).tickets.map(needIds),
    ).toEqual([['clearing'], ['meals']]);
  });

  it('matches a need name whatever its case', () => {
    const emt = need({ uuid: 'emt', taskName: '隨行醫護（EMT）' });

    expect(
      listTickets([ticket('a', [OPEN, emt])], {
        showFull: false,
        q: 'emt',
      }).tickets.map(needIds),
    ).toEqual([['emt']]);
  });

  it('counts only the full needs among those the search picked out', () => {
    const fullClearing = need({
      uuid: 'c',
      taskName: '清淤',
      status: 'fulfilled',
      assignedCount: 3,
    });
    const fullMeals = need({
      uuid: 'm',
      taskName: '便當',
      status: 'fulfilled',
      assignedCount: 3,
    });
    const list = listTickets([ticket('a', [OPEN, fullClearing, fullMeals])], {
      showFull: false,
      q: '清淤',
    });

    expect(list.tickets.map(needIds)).toEqual([['open']]);
    expect(list.fullNeedCount).toBe(1);
  });

  it('puts tickets still short of people before the ones that have them all', () => {
    const list = listTickets(
      [ticket('full', [FILLED], 'completed'), ticket('short', [OPEN])],
      { showFull: true },
    );

    expect(ids(list.tickets)).toEqual(['short', 'full']);
  });

  it('puts an open rescue need first among tickets short of people, then keeps the server order', () => {
    const rescue = need({ uuid: 'rescue', taskType: 'rescue' });
    const filledRescue = need({
      uuid: 'r2',
      taskType: 'rescue',
      status: 'fulfilled',
      assignedCount: 3,
    });
    const list = listTickets(
      [
        ticket('newest', [OPEN]),
        ticket('rescue-filled', [OPEN, filledRescue]),
        ticket('rescue-old', [rescue]),
        ticket('oldest', [OPEN]),
      ],
      { showFull: false },
    );

    expect(ids(list.tickets)).toEqual([
      'rescue-old',
      'newest',
      'rescue-filled',
      'oldest',
    ]);
  });

  it('keeps a ticket where it was once the viewer takes its last place', () => {
    // Claiming must not send the card the volunteer just used to the bottom of the list.
    const mineRescue = need({
      uuid: 'mine',
      taskType: 'rescue',
      status: 'fulfilled',
      assignedCount: 3,
      myAssignment: { uuid: 'assignment-1' },
    });
    const list = listTickets(
      [ticket('other', [OPEN]), ticket('claimed', [mineRescue], 'completed')],
      { showFull: false },
    );

    expect(ids(list.tickets)).toEqual(['claimed', 'other']);
  });

  it('keeps a ticket cancelled by hand last, even for the viewer who claimed on it', () => {
    // Nobody works a cancelled ticket; the backend's NEEDS_FIRST keeps it last too (ADR-419).
    const mineRescue = need({
      uuid: 'mine',
      taskType: 'rescue',
      myAssignment: { uuid: 'assignment-1' },
    });
    const list = listTickets(
      [ticket('cancelled', [mineRescue], 'cancelled'), ticket('other', [OPEN])],
      { showFull: false },
    );

    expect(ids(list.tickets)).toEqual(['other', 'cancelled']);
  });
});

describe('pageFoldedAway', () => {
  const markers = [
    ticket('open', [OPEN]),
    ticket('done-1', [FILLED], 'completed'),
    ticket('done-2', [FILLED], 'completed'),
  ];

  it('is set once every ticket of the newest page folds away', () => {
    const { tickets } = listTickets(markers, { showFull: false });

    expect(pageFoldedAway(['done-1', 'done-2'], tickets)).toBe(true);
  });

  it('is not set while a ticket of that page is still listed', () => {
    const { tickets } = listTickets(markers, { showFull: false });

    expect(pageFoldedAway(['open', 'done-1'], tickets)).toBe(false);
  });

  it('is not set with 含已滿額 on, which lists them all', () => {
    const { tickets } = listTickets(markers, { showFull: true });

    expect(pageFoldedAway(['done-1', 'done-2'], tickets)).toBe(false);
  });

  it('is not set before a page is in', () => {
    expect(pageFoldedAway([], [])).toBe(false);
  });
});

describe('countFloor', () => {
  it('writes a count over the loaded pages as a floor while more pages wait', () => {
    expect(countFloor(12, true)).toBe('12+');
    expect(countFloor(12, false)).toBe('12');
  });
});

describe('listCountLabel', () => {
  it('says 共 N once everything is loaded, and N+ while more pages wait', () => {
    expect(listCountLabel(37, { more: false, what: '需求' })).toBe(
      '共 37 筆需求',
    );
    expect(listCountLabel(100, { more: true, what: '需求' })).toBe(
      '100+ 筆需求',
    );
  });

  it('counts stations without naming what', () => {
    expect(listCountLabel(25, { more: false })).toBe('共 25 筆');
    expect(listCountLabel(100, { more: true })).toBe('100+ 筆');
  });
});

describe('listPaging', () => {
  const SCROLLED: Parameters<typeof listPaging>[0] = {
    hasNextPage: true,
    pageFolded: false,
    foldsFullNeeds: true,
    loading: false,
  };

  it('keeps paging, both counts floors, while pages still list something', () => {
    expect(listPaging(SCROLLED)).toEqual({
      canLoadMore: true,
      countMore: true,
      fullMore: true,
    });
  });

  it('stops once a whole page folds away: the needs are all in, the full ones are not', () => {
    // The backend sends tickets still taking people first: past that page, only finished ones.
    expect(listPaging({ ...SCROLLED, pageFolded: true })).toEqual({
      canLoadMore: false,
      countMore: false,
      fullMore: true,
    });
  });

  it('does not stop early while nothing folds: 含已滿額 on, or finished tickets asked for', () => {
    // With two statuses or more the filter runs on the page, so a page can come out empty while
    // the tickets asked for are still to come.
    expect(
      listPaging({ ...SCROLLED, pageFolded: true, foldsFullNeeds: false }),
    ).toEqual({ canLoadMore: true, countMore: true, fullMore: true });
  });

  it('keeps the count a floor while a page is on its way, the first one included', () => {
    expect(
      listPaging({ ...SCROLLED, hasNextPage: false, loading: true }),
    ).toEqual({ canLoadMore: false, countMore: true, fullMore: false });
  });

  it('claims a total once every page is in', () => {
    expect(listPaging({ ...SCROLLED, hasNextPage: false })).toEqual({
      canLoadMore: false,
      countMore: false,
      fullMore: false,
    });
  });
});
