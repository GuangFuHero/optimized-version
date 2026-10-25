import { describe, expect, it } from 'vitest';

import {
  addressNote,
  addressTokenFor,
  addressToCheck,
  applyPinLookup,
  applyTypedLookup,
  distanceM,
  isFilledByLookup,
  lookupPoint,
  readAddressLookup,
  restorePinAddress,
  restoreTypedLine,
  shortDoor,
  toAddressInput,
  type AddressFields,
  type AddressLookup,
  type FoundDoor,
} from './address-lookup';

// 光復車站 and a 門牌 a few metres from it.
const PIN = { lat: 23.6587, lng: 121.4206 };

function door(overrides: Partial<FoundDoor> = {}): FoundDoor {
  return {
    fullAddress: '花蓮縣光復鄉大進村3鄰糖廠街19號',
    token: 'token-19',
    lat: 23.658676,
    lng: 121.420631,
    buildingSection: null,
    floor: null,
    room: null,
    ...overrides,
  };
}

const NEXT_DOOR = door({
  fullAddress: '花蓮縣光復鄉大進村3鄰糖廠街21號',
  token: 'token-21',
});

const found = (at: FoundDoor = door()): AddressLookup => ({
  status: 'found',
  door: at,
});

function fields(overrides: Partial<AddressFields> = {}): AddressFields {
  return {
    address: '',
    floor: '',
    room: '',
    addressFilled: null,
    ...overrides,
  };
}

/** A line the pin's lookup filled and nobody touched. */
function filledFromPin(at: FoundDoor = door()): AddressFields {
  return applyPinLookup(fields(), found(at));
}

describe('lookupPoint', () => {
  it('rounds the pin to six places, so the same spot is the same lookup', () => {
    expect(lookupPoint({ lat: 23.65870000001, lng: 121.4206 })).toEqual({
      lat: 23.6587,
      lng: 121.4206,
    });
    expect(lookupPoint({ lat: 23.1234567, lng: 121.7654321 })).toEqual({
      lat: 23.123457,
      lng: 121.765432,
    });
  });

  it('is null without a pin', () => {
    expect(lookupPoint(null)).toBeNull();
  });
});

describe('readAddressLookup', () => {
  const answer = {
    status: 'found',
    fullAddress: '花蓮縣光復鄉大進村3鄰糖廠街19號',
    addressToken: 'token-19',
    lat: 23.658676,
    lng: 121.420631,
    buildingSection: null,
    floor: '3樓',
    room: null,
  };

  it('reads a found 門牌 with its token and point', () => {
    expect(
      readAddressLookup({ current: true, fetching: false, answer }),
    ).toEqual({ status: 'found', door: door({ floor: '3樓' }) });
  });

  it('is still looking while the answer on hand is for another pin, or none came yet', () => {
    expect(
      readAddressLookup({ current: false, fetching: false, answer }),
    ).toEqual({ status: 'looking' });
    expect(readAddressLookup({ current: true, fetching: true })).toEqual({
      status: 'looking',
    });
  });

  it('takes any error as no answer: too many lookups, a sign-in run out, no network', () => {
    expect(
      readAddressLookup({
        current: true,
        fetching: false,
        error: new Error('Too many address lookups; try again in a minute'),
      }),
    ).toEqual({ status: 'unavailable' });
  });

  it('passes not_found, ambiguous and unavailable on, and anything else as unavailable', () => {
    const status = (value: string) =>
      readAddressLookup({
        current: true,
        fetching: false,
        answer: { status: value },
      }).status;

    expect(status('not_found')).toBe('not_found');
    expect(status('ambiguous')).toBe('ambiguous');
    expect(status('unavailable')).toBe('unavailable');
    expect(status('something new')).toBe('unavailable');
  });

  it('does not take a found with no token for a 門牌 to fill in', () => {
    expect(
      readAddressLookup({
        current: true,
        fetching: false,
        answer: { ...answer, addressToken: null },
      }),
    ).toEqual({ status: 'unavailable' });
  });
});

describe('distanceM', () => {
  it('measures metres along the ground', () => {
    // 0.001° of latitude is about 111 m anywhere.
    expect(
      Math.round(distanceM(PIN, { lat: PIN.lat + 0.001, lng: PIN.lng })),
    ).toBe(111);
    expect(distanceM(PIN, PIN)).toBe(0);
  });
});

describe('applyPinLookup', () => {
  it("fills a blank line with the pin's 門牌, keeping its token", () => {
    expect(filledFromPin()).toEqual(
      fields({
        address: '花蓮縣光復鄉大進村3鄰糖廠街19號',
        addressFilled: {
          fullAddress: '花蓮縣光復鄉大進村3鄰糖廠街19號',
          token: 'token-19',
          lat: 23.658676,
          lng: 121.420631,
          from: 'pin',
        },
      }),
    );
  });

  it('moves a line nobody touched along with the pin', () => {
    const moved = applyPinLookup(filledFromPin(), found(NEXT_DOOR));

    expect(moved.address).toBe('花蓮縣光復鄉大進村3鄰糖廠街21號');
    expect(moved.addressFilled?.token).toBe('token-21');
  });

  it('never writes over a line someone typed or changed', () => {
    const typed = fields({ address: '糖廠街19號後面的鐵皮屋' });
    const edited = { ...filledFromPin(), address: '花蓮縣光復鄉糖廠街19號' };

    expect(applyPinLookup(typed, found(NEXT_DOOR))).toBe(typed);
    expect(applyPinLookup(edited, found(NEXT_DOOR))).toBe(edited);
  });

  it('clears a line the last pin filled once the new pin finds no 門牌: it names a door elsewhere', () => {
    expect(applyPinLookup(filledFromPin(), { status: 'not_found' })).toEqual(
      fields(),
    );
  });

  it('keeps the line when the lookup could not be made, as for a draft reopened while TGOS is down', () => {
    const filled = filledFromPin();

    expect(applyPinLookup(filled, { status: 'unavailable' })).toBe(filled);
  });

  it('leaves a typed line, and a blank one, when nothing is found', () => {
    const typed = fields({ address: '光復國小旁' });

    expect(applyPinLookup(typed, { status: 'not_found' })).toBe(typed);
    expect(applyPinLookup(fields(), { status: 'unavailable' })).toEqual(
      fields(),
    );
  });

  it('does nothing while still looking, or with no pin', () => {
    const filled = filledFromPin();

    expect(applyPinLookup(filled, { status: 'looking' })).toBe(filled);
    expect(applyPinLookup(filled, null)).toBe(filled);
  });

  it('hands back the same fields when the answer is the one already in them', () => {
    const filled = filledFromPin();

    expect(applyPinLookup(filled, found())).toBe(filled);
  });

  it('never moves a line checked from what was typed: that one is the person’s own', () => {
    const checked = applyTypedLookup(
      fields({ address: '糖廠街19號' }),
      '糖廠街19號',
      found(),
    );

    expect(applyPinLookup(checked, found(NEXT_DOOR))).toBe(checked);
    expect(applyPinLookup(checked, { status: 'not_found' })).toBe(checked);
  });
});

describe('applyTypedLookup', () => {
  it('puts the official line in place of what was typed, with its token', () => {
    const checked = applyTypedLookup(
      fields({ address: '糖廠街19號' }),
      '糖廠街19號',
      found(),
    );

    expect(checked.address).toBe('花蓮縣光復鄉大進村3鄰糖廠街19號');
    expect(checked.addressFilled).toMatchObject({
      token: 'token-19',
      from: 'typed',
    });
    expect(isFilledByLookup(checked)).toBe(true);
  });

  it('moves the 樓 and 室 typed after the 號 to their fields, only where those are blank', () => {
    const typed = '糖廠街19號3樓302室';
    const answer = found(door({ floor: '3樓', room: '302室' }));

    expect(
      applyTypedLookup(fields({ address: typed }), typed, answer),
    ).toMatchObject({ floor: '3樓', room: '302室' });
    expect(
      applyTypedLookup(fields({ address: typed, floor: '5樓' }), typed, answer),
    ).toMatchObject({ floor: '5樓', room: '302室' });
  });

  it('keeps a 棟 on the line, which has no field of its own here and still counts as the same 門牌', () => {
    const typed = '糖廠街19號A棟';
    const checked = applyTypedLookup(
      fields({ address: typed }),
      typed,
      found(door({ buildingSection: 'A棟' })),
    );

    expect(checked.address).toBe('花蓮縣光復鄉大進村3鄰糖廠街19號A棟');
    expect(addressTokenFor(checked)).toBe('token-19');
  });

  it('does nothing once the line has changed since it was checked', () => {
    const typing = fields({ address: '糖廠街19號3' });

    expect(applyTypedLookup(typing, '糖廠街19號', found())).toBe(typing);
  });

  it('keeps what was typed when the 門牌 is not found, or not checked', () => {
    const typed = fields({ address: '糖廠街190號' });

    for (const status of [
      'not_found',
      'ambiguous',
      'unavailable',
      'looking',
    ] as const) {
      expect(applyTypedLookup(typed, '糖廠街190號', { status })).toBe(typed);
    }
  });
});

describe('restorePinAddress', () => {
  it("puts the pin's 門牌 back over a typed line, token and all", () => {
    const restored = restorePinAddress(fields({ address: '我家' }), door());

    expect(restored).toEqual(filledFromPin());
  });
});

describe('restoreTypedLine', () => {
  it('puts the typed line back with no token, leaving the 樓 and 室 split off', () => {
    const typed = '糖廠街19號3樓';
    const checked = applyTypedLookup(
      fields({ address: typed }),
      typed,
      found(door({ floor: '3樓' })),
    );
    const restored = restoreTypedLine(checked, typed);

    expect(restored).toEqual(fields({ address: typed, floor: '3樓' }));
    expect(addressTokenFor(restored)).toBeNull();
  });
});

describe('shortDoor', () => {
  it('names a 門牌 by its road and number', () => {
    expect(shortDoor('花蓮縣光復鄉大進村3鄰糖廠街19號')).toBe('糖廠街19號');
    expect(shortDoor('花蓮縣花蓮市國聯里5鄰中山路一段20號')).toBe(
      '中山路一段20號',
    );
  });

  it('takes off a 村 or 里 only before its 鄰, so a road named for one keeps its name', () => {
    expect(shortDoor('新北市萬里區萬里路12號')).toBe('萬里路12號');
    expect(shortDoor('新北市萬里區萬里里5鄰萬里路12號')).toBe('萬里路12號');
  });
});

describe('addressTokenFor', () => {
  it('sends the token only with the line it came with', () => {
    const filled = filledFromPin();

    expect(addressTokenFor(filled)).toBe('token-19');
    expect(addressTokenFor({ ...filled, address: '糖廠街19號' })).toBeNull();
    expect(addressTokenFor(fields({ address: '糖廠街19號' }))).toBeNull();
  });

  it('takes the line back once it is changed back, and ignores the spaces around it', () => {
    const filled = filledFromPin();

    expect(addressTokenFor({ ...filled, address: ` ${filled.address} ` })).toBe(
      'token-19',
    );
  });
});

describe('addressToCheck', () => {
  it('checks a typed line with the pin beside it', () => {
    expect(addressToCheck(fields({ address: ' 糖廠街19號 ' }), PIN)).toEqual({
      address: '糖廠街19號',
      lat: 23.6587,
      lng: 121.4206,
    });
  });

  it('checks without a pin when there is none yet', () => {
    expect(addressToCheck(fields({ address: '糖廠街19號' }), null)).toEqual({
      address: '糖廠街19號',
    });
  });

  it("does not check a blank line, one too long to save, or a lookup's own line", () => {
    expect(addressToCheck(fields({ address: '  ' }), PIN)).toBeNull();
    expect(
      addressToCheck(fields({ address: '號'.repeat(256) }), PIN),
    ).toBeNull();
    expect(addressToCheck(filledFromPin(), PIN)).toBeNull();
  });

  it('does not check again a line taken back with 改回你打的', () => {
    const kept = fields({ address: '糖廠街19號' });

    expect(addressToCheck(kept, PIN, '糖廠街19號')).toBeNull();
    expect(
      addressToCheck({ ...kept, address: '糖廠街21號' }, PIN, '糖廠街19號'),
    ).toMatchObject({ address: '糖廠街21號' });
  });
});

describe('toAddressInput', () => {
  it('sends the line as fullAddress with its token, and floor and room beside it', () => {
    expect(
      toAddressInput({ ...filledFromPin(), floor: ' 3樓 ', room: '302室' }),
    ).toEqual({
      fullAddress: '花蓮縣光復鄉大進村3鄰糖廠街19號',
      addressToken: 'token-19',
      floor: '3樓',
      room: '302室',
    });
  });

  it('sends a typed line without a token, and blanks as null', () => {
    expect(toAddressInput(fields({ address: ' 光復國小旁 ' }))).toEqual({
      fullAddress: '光復國小旁',
      addressToken: null,
      floor: null,
      room: null,
    });
  });
});

describe('addressNote', () => {
  const note = (
    input: Partial<Parameters<typeof addressNote>[0]> & {
      fields: AddressFields;
    },
  ) => addressNote({ pin: PIN, pinLookup: null, check: null, ...input });

  it('says it is looking while the pin is being looked up, the old pin’s 門牌 still in the line', () => {
    for (const filled of [fields(), filledFromPin()]) {
      expect(
        note({ fields: filled, pinLookup: { status: 'looking' } }),
      ).toMatchObject({ kind: 'looking', text: '正在找最近的門牌…' });
    }
  });

  it('has nothing to offer for a line typed out exactly as found', () => {
    expect(
      note({
        fields: fields({ address: door().fullAddress }),
        pinLookup: found(),
      }),
    ).toBeNull();
  });

  it('says how far the filled-in 門牌 is from the pin, and that it can be changed', () => {
    expect(note({ fields: filledFromPin(), pinLookup: found() })).toEqual({
      kind: 'filled',
      text: '已帶入最近的門牌（距離大頭針 4 公尺）。不對的話可以直接改',
      pinDoor: null,
      typedLine: null,
    });
  });

  it("offers the pin's 門牌 beside a line that differs from it, changed or typed first", () => {
    const expected = {
      kind: 'edited',
      text: '跟大頭針的地址不一樣',
      pinDoor: door(),
      typedLine: null,
    };

    expect(
      note({
        fields: { ...filledFromPin(), address: '糖廠街19號' },
        pinLookup: found(),
      }),
    ).toEqual(expected);
    expect(
      note({ fields: fields({ address: '我家' }), pinLookup: found() }),
    ).toEqual(expected);
  });

  it('says nothing beside a blank line when the pin has a 門牌: there is nothing to compare', () => {
    expect(note({ fields: fields(), pinLookup: found() })).toBeNull();
  });

  it('asks for the address by hand when no 門牌 is near the pin, until one is typed', () => {
    expect(
      note({ fields: fields(), pinLookup: { status: 'not_found' } }),
    ).toMatchObject({
      kind: 'no_door',
      text: '這附近 500 公尺內查不到門牌，請自己填地址',
    });
    expect(
      note({
        fields: fields({ address: '光復國小旁' }),
        pinLookup: { status: 'not_found' },
      }),
    ).toBeNull();
  });

  it('says nothing when the lookup could not be made: nothing alarming, the form still sends', () => {
    expect(
      note({ fields: fields(), pinLookup: { status: 'unavailable' } }),
    ).toBeNull();
    expect(note({ fields: fields(), pin: null })).toBeNull();
  });

  it('says how the typed line was checked, while it is still that line', () => {
    const typed = fields({ address: '糖廠街190號' });
    const checked = (lookup: AddressLookup) =>
      note({ fields: typed, check: { address: '糖廠街190號', lookup } });

    expect(checked({ status: 'looking' })).toMatchObject({
      kind: 'checking',
      text: '正在確認門牌…',
    });
    expect(checked({ status: 'not_found' })).toMatchObject({
      kind: 'not_found',
      text: '查無此門牌，仍可送出',
    });
    expect(checked({ status: 'ambiguous' })).toMatchObject({
      kind: 'ambiguous',
      text: '符合的門牌不只一個，請加上鄉鎮市區',
    });
    expect(checked({ status: 'unavailable' })).toBeNull();
  });

  it('forgets the check once the line changes after it', () => {
    expect(
      note({
        fields: fields({ address: '糖廠街19號' }),
        check: { address: '糖廠街190號', lookup: { status: 'not_found' } },
      }),
    ).toBeNull();
  });

  it('says a checked line is now the official one, and offers what was typed back', () => {
    const check = { address: '糖廠街19號', lookup: found() };
    const checked = applyTypedLookup(
      fields({ address: '糖廠街19號' }),
      '糖廠街19號',
      check.lookup,
    );

    expect(note({ fields: checked, check, pinLookup: found() })).toEqual({
      kind: 'confirmed',
      text: '已對到門牌，換成正式寫法。不對的話可以直接改',
      pinDoor: null,
      typedLine: '糖廠街19號',
    });
  });

  it('offers nothing back for a line typed exactly as the official one', () => {
    const line = door().fullAddress;
    const check = { address: line, lookup: found() };
    const checked = applyTypedLookup(
      fields({ address: line }),
      line,
      check.lookup,
    );

    expect(note({ fields: checked, check })).toMatchObject({
      kind: 'confirmed',
      typedLine: null,
    });
  });

  it("compares a line taken back with 改回你打的 with the pin's 門牌", () => {
    const check = { address: '糖廠街19號', lookup: found() };
    const checked = applyTypedLookup(
      fields({ address: '糖廠街19號' }),
      '糖廠街19號',
      check.lookup,
    );

    expect(
      note({
        fields: restoreTypedLine(checked, '糖廠街19號'),
        pinLookup: found(),
      }),
    ).toMatchObject({ kind: 'edited', pinDoor: door() });
  });

  it('warns when a filled-in 門牌 is left more than 500 m from a pin moved while TGOS was down', () => {
    const moved = { lat: PIN.lat + 0.01, lng: PIN.lng };

    expect(
      note({
        fields: filledFromPin(),
        pin: moved,
        pinLookup: { status: 'unavailable' },
      }),
    ).toMatchObject({
      kind: 'mismatch',
      text: '地址和大頭針相距 1115 公尺，請確認哪一個不對',
    });
  });

  it('warns when the checked 門牌 is more than 500 m from the pin, and offers what was typed back', () => {
    const check = {
      address: '糖廠街19號',
      lookup: found(door({ lat: PIN.lat + 0.01 })),
    };
    const checked = applyTypedLookup(
      fields({ address: '糖廠街19號' }),
      '糖廠街19號',
      check.lookup,
    );

    expect(
      note({ fields: checked, check, pinLookup: found(NEXT_DOOR) }),
    ).toEqual({
      kind: 'mismatch',
      text: '地址和大頭針相距 1112 公尺，請確認哪一個不對',
      pinDoor: null,
      typedLine: '糖廠街19號',
    });
  });
});
