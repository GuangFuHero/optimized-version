import { describe, expect, it } from 'vitest';

import { formatTicketAddress } from './address';

describe('formatTicketAddress', () => {
  it('runs the street address together, road from `lane` and 巷弄 from `alley`, as they are stored', () => {
    expect(
      formatTicketAddress({
        county: '花蓮縣',
        city: '光復鄉',
        lane: '中正路一段',
        alley: '12巷',
        no: '31號',
      }),
    ).toBe('花蓮縣光復鄉中正路一段12巷31號');
  });

  it('adds the building, floor and room after it, spaced, as spoken — no 樓 or 室 is invented', () => {
    expect(
      formatTicketAddress({
        city: '光復鄉',
        lane: '中正路一段',
        no: '31號',
        buildingSection: 'A棟',
        floor: 'B1',
        room: '樓梯間',
      }),
    ).toBe('光復鄉中正路一段31號 A棟 B1 樓梯間');
  });

  it('has nothing to say when there is no address, or none this viewer may see', () => {
    // `secondaryLocation` is null without one, and to a caller without ticket.view_detail.
    expect(formatTicketAddress(null)).toBeNull();
    expect(formatTicketAddress({ city: '  ', floor: '' })).toBeNull();
  });

  it('drops the stray spaces a hand-typed part carries', () => {
    expect(formatTicketAddress({ city: ' 光復鄉 ', lane: '中正路 ', floor: ' 2F ' })).toBe(
      '光復鄉中正路 2F',
    );
  });
});
