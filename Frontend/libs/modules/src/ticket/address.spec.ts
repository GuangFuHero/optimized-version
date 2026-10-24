import { describe, expect, it } from 'vitest';

import {
  formatTicketAddress,
  formatTicketStreet,
  formatTicketUnit,
} from './address';

describe('formatTicketStreet and formatTicketUnit', () => {
  // The ticket's 位置資訊 puts which floor and room on a line of its own: someone going there needs
  // it before anything else (prototype site-detail.jsx:415-417).
  it('splits the address into the street and the building, floor and room', () => {
    const location = {
      fullAddress: '花蓮縣光復鄉中正路一段31號',
      buildingSection: 'A棟',
      floor: 'B1',
      room: '樓梯間',
    };

    expect(formatTicketStreet(location)).toBe('花蓮縣光復鄉中正路一段31號');
    expect(formatTicketUnit(location)).toBe('A棟 B1 樓梯間');
  });

  it('reads the street as typed on the site when none of it was split out', () => {
    expect(
      formatTicketStreet({ landmarkNote: ' 中山路100號 ', floor: '3樓' }),
    ).toBe('中山路100號');
  });

  it('has nothing to say for a part that is missing or blank', () => {
    expect(formatTicketStreet({ floor: '3樓' })).toBeNull();
    expect(formatTicketUnit({ fullAddress: '花蓮縣光復鄉', room: '  ' })).toBeNull();
    expect(formatTicketStreet(null)).toBeNull();
    expect(formatTicketUnit(undefined)).toBeNull();
  });
});

describe('formatTicketAddress', () => {
  it('reads the street address from the line the backend stored', () => {
    expect(
      formatTicketAddress({ fullAddress: '花蓮縣光復鄉大進村3鄰糖廠街19號' }),
    ).toBe('花蓮縣光復鄉大進村3鄰糖廠街19號');
  });

  it('adds the building, floor and room after it, spaced, as spoken — no 樓 or 室 is invented', () => {
    expect(
      formatTicketAddress({
        fullAddress: '光復鄉中正路一段31號',
        buildingSection: 'A棟',
        floor: 'B1',
        room: '樓梯間',
      }),
    ).toBe('光復鄉中正路一段31號 A棟 B1 樓梯間');
  });

  it('has nothing to say when there is no address, or none this viewer may see', () => {
    // `secondaryLocation` is null without one, and to a caller without ticket.view_detail.
    expect(formatTicketAddress(null)).toBeNull();
    expect(formatTicketAddress({ fullAddress: '  ', floor: '' })).toBeNull();
  });

  it('drops the stray spaces a hand-typed part carries', () => {
    expect(formatTicketAddress({ fullAddress: ' 光復鄉中正路 ', floor: ' 2F ' })).toBe(
      '光復鄉中正路 2F',
    );
  });

  it('reads the address as typed on the site when none of the street was split out', () => {
    // 請求協助 takes the address as one line, into `landmarkNote`.
    expect(
      formatTicketAddress({
        landmarkNote: ' 花蓮縣光復鄉中山路100號 ',
        floor: '3樓',
        room: '302室',
      }),
    ).toBe('花蓮縣光復鄉中山路100號 3樓 302室');
  });

  it('keeps to the split street when there is one, the note being only a hint for the way in', () => {
    expect(
      formatTicketAddress({
        fullAddress: '光復鄉中正路31號',
        landmarkNote: '廟的右邊',
      }),
    ).toBe('光復鄉中正路31號');
  });

  it('has nothing to say for a note of only spaces', () => {
    expect(formatTicketAddress({ landmarkNote: '  ' })).toBeNull();
  });
});
