import { describe, expect, it } from 'vitest';

import {
  isWithinOpenHours,
  readOpHour,
  resolveStationAvailability,
} from './availability';
import { getOperationalStatusMeta } from './operational-status';

// A moment given in Taiwan's time (UTC+8, no daylight saving), whatever zone the test runs in.
const at = (hours: number, minutes = 0) =>
  new Date(Date.UTC(2026, 9, 18, hours - 8, minutes));

describe('readOpHour', () => {
  it('trims what was typed', () => {
    expect(readOpHour(' 08:00-18:00 ')).toBe('08:00-18:00');
  });

  it('has nothing for an empty value or one that only says it is unknown', () => {
    expect(readOpHour(null)).toBeNull();
    expect(readOpHour('   ')).toBeNull();
    expect(readOpHour('unknown')).toBeNull();
    expect(readOpHour(' Unknown ')).toBeNull();
  });

  it('has nothing for a lone dash, the other way imported data says it is not known', () => {
    expect(readOpHour('—')).toBeNull();
    expect(readOpHour(' - ')).toBeNull();
  });
});

describe('isWithinOpenHours', () => {
  it('reads a from–to range, either dash', () => {
    expect(isWithinOpenHours('08:00-18:00', at(10))).toBe(true);
    expect(isWithinOpenHours('08:00–18:00', at(18))).toBe(false);
    expect(isWithinOpenHours('08:00~18:00', at(7, 59))).toBe(false);
  });

  it("reads the hours in Taiwan's time, not the viewer's", () => {
    // 00:30 in Sydney (AEDT, UTC+11) is 21:30 in Taiwan: a 16:00–22:00 station is open.
    const sydneyHalfPastMidnight = new Date('2026-10-18T00:30:00+11:00');

    expect(isWithinOpenHours('16:00-22:00', sydneyHalfPastMidnight)).toBe(true);
  });

  it('wraps past midnight', () => {
    expect(isWithinOpenHours('20:00-06:00', at(23))).toBe(true);
    expect(isWithinOpenHours('20:00-06:00', at(5, 30))).toBe(true);
    expect(isWithinOpenHours('20:00-06:00', at(12))).toBe(false);
  });

  it('counts round the clock as always open', () => {
    expect(isWithinOpenHours('24 小時', at(3))).toBe(true);
    expect(isWithinOpenHours('24h', at(3))).toBe(true);
    expect(isWithinOpenHours('全日開放', at(3))).toBe(true);
    expect(isWithinOpenHours('24小時營業', at(3))).toBe(true);
  });

  it('cannot tell from anything else, so says nothing', () => {
    // A weekly schedule does not fit the one string the backend keeps (prototype site-route.js:59-64).
    expect(isWithinOpenHours('星期一 9-15', at(10))).toBeNull();
    expect(isWithinOpenHours(null, at(10))).toBeNull();
  });

  it('does not judge the hours by a part of them', () => {
    // 2026-10-18 is a Sunday. Read by their first part, the first and the last would say open, and
    // the second closed at 14:00.
    expect(isWithinOpenHours('星期一 08:00-18:00', at(10))).toBeNull();
    expect(isWithinOpenHours('08:00-12:00、13:00-18:00', at(14))).toBeNull();
    expect(isWithinOpenHours('週一至週五 24小時', at(10))).toBeNull();
  });
});

describe('resolveStationAvailability', () => {
  it('puts a closure first, whatever the hours', () => {
    expect(
      resolveStationAvailability(
        { operationalStatus: 'temporarily_closed', opHour: '00:00-23:59' },
        at(10),
      ),
    ).toEqual({
      headline: '暫停服務',
      tone: 'warning',
      detail: '站點還在，但目前暫停服務',
    });
    expect(
      resolveStationAvailability(
        { operationalStatus: 'permanently_closed' },
        at(10),
      ),
    ).toEqual({
      headline: '已關閉',
      tone: 'neutral',
      detail: '這個站點已經關閉，不再營運',
    });
  });

  it('answers whether it is open right now for a running station', () => {
    const station = { operationalStatus: 'active', opHour: '08:00-18:00' };

    expect(resolveStationAvailability(station, at(10))).toEqual({
      headline: '現在開放',
      tone: 'success',
      detail: '服務時間 08:00-18:00',
    });
    expect(resolveStationAvailability(station, at(20))).toEqual({
      headline: '休息中',
      tone: 'neutral',
      detail: '服務時間 08:00-18:00，此時段沒有服務',
    });
  });

  it('only says it is running when the hours cannot be read, and shows them as typed', () => {
    expect(
      resolveStationAvailability(
        { operationalStatus: 'active', opHour: '星期一 9-15' },
        at(10),
      ),
    ).toEqual({
      headline: '開設中',
      tone: 'success',
      detail: '服務時間 星期一 9-15',
    });
    expect(
      resolveStationAvailability(
        { operationalStatus: 'active', opHour: 'unknown' },
        at(10),
      ),
    ).toEqual({
      headline: '開設中',
      tone: 'success',
      detail: '服務時間未提供',
    });
  });

  it('takes a station with no status as running, as the backend defaults it', () => {
    expect(resolveStationAvailability({}, at(10)).headline).toBe('開設中');
  });

  it('names a running station whose hours cannot be read as the back office does', () => {
    expect(
      resolveStationAvailability({ operationalStatus: 'active' }, at(10))
        .headline,
    ).toBe(getOperationalStatusMeta('active').label);
  });
});
