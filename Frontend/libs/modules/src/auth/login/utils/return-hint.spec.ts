// SPDX-License-Identifier: GPL-3.0-only
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

  it('says nothing for a whole address: the sign-in goes to its fallback, not there', () => {
    expect(returnHint('http://localhost:3002/list/station?q=1')).toBeNull();
  });

  it('says nothing for a path to another site, which the sign-in also skips', () => {
    expect(returnHint('//evil.example/map')).toBeNull();
  });

  it('says nothing, and does not throw, for a callbackUrl that is not an address', () => {
    expect(() => returnHint('http://[')).not.toThrow();
    expect(returnHint('http://[')).toBeNull();
  });
});

describe('signedInMessage', () => {
  it('says the person is on the way back, when there is a page to go back to', () => {
    expect(signedInMessage('/list/station', 'site')).toBe(
      '登入成功，正在回到你剛剛那一頁⋯',
    );
  });

  it('does not promise the way back for a callbackUrl the sign-in will not go back to', () => {
    expect(signedInMessage('http://[', 'site')).toBe('登入成功，正在帶你過去⋯');
    expect(signedInMessage('//evil.example/map', 'admin')).toBe(
      '登入成功，正在前往總覽儀表板⋯',
    );
  });

  it('names no place on the site, when there is none: the sign-in goes by who signed in', () => {
    expect(signedInMessage(null, 'site')).toBe('登入成功，正在帶你過去⋯');
  });

  it('says the back office, when there is none in the back office: its /login ends on the dashboard', () => {
    expect(signedInMessage(null, 'admin')).toBe(
      '登入成功，正在前往總覽儀表板⋯',
    );
  });
});
