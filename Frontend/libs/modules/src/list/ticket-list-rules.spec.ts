import { describe, expect, it } from 'vitest';

import type { RescueMapMarkerItem } from '../map/types';
import type { TicketNeed } from '../ticket/needs';
import {
  listTickets,
  resolveTicketSearch,
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

describe('resolveTicketSearch', () => {
  it('searches nothing without a term', () => {
    expect(resolveTicketSearch(undefined)).toEqual({ kind: 'none' });
    expect(resolveTicketSearch('   ')).toEqual({ kind: 'none' });
  });

  it('asks for a second character: the backend takes 2 to 50', () => {
    expect(resolveTicketSearch('醫')).toEqual({ kind: 'too-short' });
    expect(resolveTicketSearch(' 水 ')).toEqual({ kind: 'too-short' });
  });

  it('sends a term of 2 to 50 characters as it is, trimmed', () => {
    expect(resolveTicketSearch(' 清淤 ')).toEqual({ kind: 'query', q: '清淤' });
    expect(resolveTicketSearch('醫'.repeat(50))).toEqual({
      kind: 'query',
      q: '醫'.repeat(50),
    });
  });

  it('sends the first 50 characters of a longer term, which the backend would refuse whole', () => {
    expect(resolveTicketSearch('醫'.repeat(51))).toEqual({
      kind: 'query',
      q: '醫'.repeat(50),
    });
  });

  it('counts a character outside the BMP as one, as the backend does', () => {
    expect(resolveTicketSearch('🚑')).toEqual({ kind: 'too-short' });
  });
});

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
});
