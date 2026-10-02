import { describe, expect, it } from 'vitest';

import { returnHint, signedInMessage } from './return-hint';

const MAP_HINT = '登入完成後會回到你剛剛那一頁，地圖的位置與篩選都會保留。';
const LIST_HINT = '登入完成後會回到你剛剛那一頁，篩選都會保留。';
const OTHER_HINT = '登入完成後會回到你剛剛那一頁。';

describe('returnHint', () => {
  it('says nothing when no page is waiting for the sign-in', () => {
    expect(returnHint(null)).toBeNull();
    expect(returnHint('')).toBeNull();
  });

  it('promises the map as it was — its place and filters ride in the address', () => {
    expect(
      returnHint('/map/osm-direct/station/@23.8690420,121.0305405,13z?id=1b2c'),
    ).toBe(MAP_HINT);
    expect(returnHint('/map')).toBe(MAP_HINT);
  });

  it('promises the list its filters, and no map', () => {
    expect(returnHint('/list/station')).toBe(LIST_HINT);
  });

  it('promises only the page for anywhere else', () => {
    expect(returnHint('/account/security')).toBe(OTHER_HINT);
  });

  it('does not take a path that merely starts like one for the map', () => {
    expect(returnHint('/mapping')).toBe(OTHER_HINT);
  });

  it('reads a whole address, as next-auth sometimes hands one on', () => {
    expect(returnHint('http://localhost:3002/list/station?q=1')).toBe(
      LIST_HINT,
    );
  });
});

describe('signedInMessage', () => {
  it('says the person is on the way back, when there is a page to go back to', () => {
    expect(signedInMessage('/list/station')).toBe(
      '登入成功，正在回到你剛剛那一頁⋯',
    );
  });

  it('says the map, when there is none: that is where a sign-in from /login ends', () => {
    expect(signedInMessage(null)).toBe('登入成功，正在前往地圖⋯');
  });
});
