import { describe, expect, it } from 'vitest';

import {
  afterPinMove,
  applyReverseGeocode,
  updateAddressFields,
  type AddressFillFields,
} from './address-fill';

const blank: AddressFillFields = {
  fullAddress: '',
  addressToken: '',
  floor: '',
  room: '',
};
const found = {
  status: 'found',
  fullAddress: '花蓮縣光復鄉大進村3鄰糖廠街19號',
  floor: null,
  room: null,
  addressToken: 'token-1',
};

describe('applyReverseGeocode', () => {
  it('fills the line and its token from a lookup only while the line is blank', () => {
    expect(applyReverseGeocode(blank, found)).toMatchObject({
      fullAddress: '花蓮縣光復鄉大進村3鄰糖廠街19號',
      addressToken: 'token-1',
    });
    const typed = { ...blank, fullAddress: '我打的地址' };
    expect(applyReverseGeocode(typed, found)).toEqual(typed);
  });

  it('never replaces a line an earlier lookup filled in', () => {
    const first = applyReverseGeocode(blank, found);
    const next = applyReverseGeocode(first, {
      ...found,
      fullAddress: '花蓮縣光復鄉糖廠街21號',
      addressToken: 'token-2',
    });
    expect(next).toBe(first);
  });

  it('fills a 樓 or 室 the lookup split off, unless one is already typed', () => {
    const next = applyReverseGeocode(
      { ...blank, floor: '1F' },
      { ...found, floor: '5樓', room: '502室' },
    );
    expect(next).toMatchObject({ floor: '1F', room: '502室' });
  });

  it('keeps the rest of the form as it was', () => {
    const form = { ...blank, name: '光復加水站' };
    expect(applyReverseGeocode(form, found).name).toBe('光復加水站');
  });

  it('ignores a lookup that found nothing or was unavailable', () => {
    for (const status of ['not_found', 'unavailable']) {
      expect(
        applyReverseGeocode(blank, {
          status,
          fullAddress: null,
          floor: null,
          room: null,
          addressToken: null,
        }),
      ).toBe(blank);
    }
  });
});

describe('afterPinMove', () => {
  it('keeps a looked-up line but drops its token, so it is saved unverified', () => {
    const looked = applyReverseGeocode(blank, found);
    expect(afterPinMove(looked)).toEqual({
      ...looked,
      fullAddress: '花蓮縣光復鄉大進村3鄰糖廠街19號',
      addressToken: '',
    });
  });

  it('leaves a form without a token as it was', () => {
    const typed = { ...blank, fullAddress: '我打的地址' };
    expect(afterPinMove(typed)).toBe(typed);
  });

  it("is not undone by the next point's lookup: the line and its lack of a token stay", () => {
    const moved = afterPinMove(applyReverseGeocode(blank, found));
    expect(
      applyReverseGeocode(moved, {
        ...found,
        fullAddress: '花蓮縣光復鄉糖廠街21號',
        addressToken: 'token-2',
      }),
    ).toBe(moved);
  });
});

describe('updateAddressFields', () => {
  const looked = {
    ...blank,
    fullAddress: '花蓮縣光復鄉糖廠街19號',
    addressToken: 'token-1',
  };

  it('drops the token once the line is edited', () => {
    expect(
      updateAddressFields(looked, { fullAddress: '花蓮縣光復鄉糖廠街21號' }),
    ).toMatchObject({
      fullAddress: '花蓮縣光復鄉糖廠街21號',
      addressToken: '',
    });
  });

  it('keeps the token while other fields change, or when the patch sets it', () => {
    expect(updateAddressFields(looked, { room: '3' }).addressToken).toBe(
      'token-1',
    );
    expect(
      updateAddressFields(looked, {
        fullAddress: '花蓮縣光復鄉糖廠街21號',
        addressToken: 'token-2',
      }).addressToken,
    ).toBe('token-2');
  });
});
