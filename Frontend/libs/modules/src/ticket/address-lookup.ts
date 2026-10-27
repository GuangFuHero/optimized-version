/**
 * An address line filled in from TGOS (the backend's `reverseGeocode` and `normalizeAddress`,
 * `Backend/Spec/027-address-normalization/frontend-guide.md`): the nearest 門牌 to the pin once it is
 * placed, or the typed line checked once the field is left, with the token that has the line saved as
 * verified. The rules are the designer's 新增地點 (`Design/後台/js/admin/ticket/tk-building.jsx:
 * 130-155`, 2026-10-25) and 請求協助 (`Design/前台/js/site/site-actions.jsx:1738-1827`, 2026-10-25),
 * so every form that fills an address from the map behaves alike. Nothing here stops a form from
 * sending: a line with no lookup behind it is saved as unverified.
 */

import type {
  AddressLookupType,
  NormalizeAddressQueryVariables,
} from '@rescue-frontend/data-access';

/** The `full_address` column's width (backend `models/secondary_location.py`). */
export const ADDRESS_MAX_LENGTH = 255;

/** How far a 門牌 may be from the pin and still count as the pin's (backend `PIN_TOLERANCE_M`). */
const PIN_TOLERANCE_M = 500;

export interface LatLng {
  lat: number;
  lng: number;
}

/** A 門牌 TGOS confirmed. */
export interface FoundDoor extends LatLng {
  /** The official line, which the token is for. */
  fullAddress: string;
  token: string;
  /** The 棟, 樓 and 室 typed after the 號, split off; only a typed line's check has them. */
  buildingSection: string | null;
  floor: string | null;
  room: string | null;
}

/** One lookup's answer as a form uses it. */
export type AddressLookup =
  | { status: 'looking' }
  | { status: 'found'; door: FoundDoor }
  | { status: 'not_found' | 'ambiguous' | 'unavailable' };

/** What a lookup put in the address line, kept while the line is still exactly that. */
export interface FilledAddress extends LatLng {
  fullAddress: string;
  token: string;
  /** From the pin, the line moves with the pin; checked from what was typed, it is the person's own. */
  from: 'pin' | 'typed';
}

/** The address fields of a form, whichever form it is. */
export interface AddressFields {
  address: string;
  floor: string;
  room: string;
  addressFilled: FilledAddress | null;
  /** A line taken back with 改回你打的 over a check's answer, so not checked again. */
  addressKept: string | null;
}

/** `reverseGeocode` and `normalizeAddress` alike, as much of `AddressLookupType` as is read here. */
export type AddressLookupAnswer = Pick<
  AddressLookupType,
  | 'status'
  | 'fullAddress'
  | 'addressToken'
  | 'lat'
  | 'lng'
  | 'buildingSection'
  | 'floor'
  | 'room'
>;

/** The variables of `NormalizeAddress`: a typed line, with the pin if there is one. */
export type AddressCheck = NormalizeAddressQueryVariables;

const round6 = (value: number) => Math.round(value * 1e6) / 1e6;

/**
 * The pin as it is looked up: to six places (about 10 cm), so a pin dragged back to where it was is
 * the same lookup, not one that differs in the last digit.
 */
export function lookupPoint(point: LatLng | null): LatLng | null {
  return point ? { lat: round6(point.lat), lng: round6(point.lng) } : null;
}

/**
 * A lookup as urql answers it. Any error is taken as no answer — too many lookups, a sign-in run
 * out, no network — since none of them stops the form from sending.
 */
export function readAddressLookup(result: {
  /** The answer on hand is for the pin or line asked about now, not the one before. */
  current: boolean;
  fetching: boolean;
  error?: unknown;
  answer?: AddressLookupAnswer | null;
}): AddressLookup {
  const { current, fetching, error, answer } = result;

  if (!current || fetching) {
    return { status: 'looking' };
  }
  if (error) {
    return { status: 'unavailable' };
  }
  if (!answer) {
    return { status: 'looking' };
  }

  switch (answer.status) {
    case 'found': {
      const { fullAddress, addressToken, lat, lng } = answer;

      return fullAddress && addressToken && lat != null && lng != null
        ? {
            status: 'found',
            door: {
              fullAddress,
              token: addressToken,
              lat,
              lng,
              buildingSection: answer.buildingSection ?? null,
              floor: answer.floor ?? null,
              room: answer.room ?? null,
            },
          }
        : { status: 'unavailable' };
    }
    case 'not_found':
    case 'ambiguous':
      return { status: answer.status };
    // The schema's `status` is a plain string: anything else is taken as no answer.
    default:
      return { status: 'unavailable' };
  }
}

/** Metres along the ground, as the backend measures a 門牌 from the pin. */
export function distanceM(a: LatLng, b: LatLng): number {
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) *
      Math.cos(rad(b.lat)) *
      Math.sin(rad(b.lng - a.lng) / 2) ** 2;

  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** The line is still the lookup's, untouched. */
export function isFilledByLookup(fields: AddressFields): boolean {
  return (
    fields.addressFilled !== null &&
    fields.address.trim() === fields.addressFilled.fullAddress
  );
}

/** The line is still the one the pin's lookup filled in: nobody has written anything. */
export function isFilledFromPin(fields: AddressFields): boolean {
  return isFilledByLookup(fields) && fields.addressFilled?.from === 'pin';
}

function fill<T extends AddressFields>(
  fields: T,
  line: string,
  at: FoundDoor,
  from: FilledAddress['from'],
): T {
  const { addressFilled } = fields;

  if (
    fields.address === line &&
    addressFilled?.token === at.token &&
    addressFilled.from === from
  ) {
    return fields;
  }

  return {
    ...fields,
    address: line,
    addressFilled: {
      fullAddress: line,
      token: at.token,
      lat: at.lat,
      lng: at.lng,
      from,
    },
  };
}

/**
 * The pin's lookup. A found 門牌 fills a blank line, or one the last pin filled and nobody touched.
 * No 門牌 near the new pin clears a line the last pin filled: it names a door at the old pin, and
 * would stand beside 「查不到門牌」. A lookup not made leaves it — a draft reopened while TGOS is down
 * keeps its address, and `addressNote` warns once the pin is far from it. A line typed or changed by
 * hand is never touched.
 */
export function applyPinLookup<T extends AddressFields>(
  fields: T,
  lookup: AddressLookup | null,
): T {
  if (!lookup || lookup.status === 'looking') {
    return fields;
  }

  if (lookup.status === 'found') {
    return !fields.address.trim() || isFilledFromPin(fields)
      ? fill(fields, lookup.door.fullAddress, lookup.door, 'pin')
      : fields;
  }

  return lookup.status === 'not_found' && isFilledFromPin(fields)
    ? { ...fields, address: '', addressFilled: null }
    : fields;
}

/**
 * The typed line's check, while the line is still what was checked. A found 門牌 takes the line's
 * place in its official form. The 樓 and 室 typed after the 號 move to their fields where those are
 * blank — a filled field wins, as on the backend. A 棟 stays at the line's end: the form has no
 * field for it, and the backend cuts it off before matching the token.
 */
export function applyTypedLookup<T extends AddressFields>(
  fields: T,
  checked: string,
  lookup: AddressLookup | null,
): T {
  if (lookup?.status !== 'found' || fields.address.trim() !== checked) {
    return fields;
  }

  const { door: at } = lookup;
  const filled = fill(
    fields,
    at.fullAddress + (at.buildingSection ?? ''),
    at,
    'typed',
  );
  const floor = fields.floor.trim() ? fields.floor : (at.floor ?? fields.floor);
  const room = fields.room.trim() ? fields.room : (at.room ?? fields.room);

  return filled === fields && floor === fields.floor && room === fields.room
    ? fields
    : { ...filled, floor, room };
}

/** 用大頭針的地址: the pin's 門牌 over whatever is in the line, with its token. */
export function restorePinAddress<T extends AddressFields>(
  fields: T,
  at: FoundDoor,
): T {
  return fill(fields, at.fullAddress, at, 'pin');
}

/**
 * 改回你打的: the line as it was typed, in place of the official one a check put there, and kept from
 * another check (designer, 2026-10-25). A 樓 or 室 split off to its field stays there, as the
 * designer's does.
 */
export function restoreTypedLine<T extends AddressFields>(
  fields: T,
  line: string,
): T {
  return { ...fields, address: line, addressFilled: null, addressKept: line };
}

/**
 * A 門牌 as a button names it (designer, `site-actions.jsx:1708-1712`): the road and number, without
 * the 縣市, 鄉鎮市區, 村里 and 鄰; the whole line is in the field once it is used. A 村 or 里 goes only
 * before its 鄰, so 萬里路 keeps its 萬里.
 */
export function shortDoor(fullAddress: string): string {
  return (
    fullAddress
      .replace(/^.*?[縣市](?=.)/, '')
      .replace(/^.*?[鄉鎮市區](?=.)/, '')
      .replace(/^[^\d路街道巷弄]{1,4}[村里](?=\d+鄰)/, '')
      .replace(/^\d+鄰/, '') || fullAddress
  );
}

/** The token goes only with the line it was issued for; changed and changed back, it goes again. */
export function addressTokenFor(fields: AddressFields): string | null {
  return isFilledByLookup(fields)
    ? (fields.addressFilled?.token ?? null)
    : null;
}

/**
 * What to check once the address field is left (the guide's 「on blur」, never per keystroke): the
 * typed line with the pin. Null for a blank line, one too long to save, a lookup's own line, and the
 * one taken back with 改回你打的.
 */
export function addressToCheck(
  fields: AddressFields,
  pin: LatLng | null,
): AddressCheck | null {
  const address = fields.address.trim();

  if (
    !address ||
    address.length > ADDRESS_MAX_LENGTH ||
    isFilledByLookup(fields) ||
    address === fields.addressKept
  ) {
    return null;
  }

  const point = lookupPoint(pin);

  return point ? { address, ...point } : { address };
}

const textOrNull = (value: string) => value.trim() || null;

/**
 * The address part of `SecondaryLocationInput`: the line as it stands, with its token while it is
 * still the lookup's.
 */
export function toAddressInput(fields: AddressFields) {
  return {
    fullAddress: textOrNull(fields.address),
    addressToken: addressTokenFor(fields),
    floor: textOrNull(fields.floor),
    room: textOrNull(fields.room),
  };
}

/**
 * The line under the address field. `no_door` already asks for the address by hand, so the field
 * then shows no 「必填」 of its own (designer, `tk-building.jsx:267-269`).
 */
export interface AddressNote {
  kind:
    | 'looking'
    | 'filled'
    | 'confirmed'
    | 'mismatch'
    | 'checking'
    | 'not_found'
    | 'ambiguous'
    | 'edited'
    | 'no_door';
  text: string;
  /** 用大頭針的地址: the pin's 門牌, offered beside a line that differs from it. */
  pinDoor: FoundDoor | null;
  /** 改回你打的: the line as typed, offered while the check's official one stands in its place. */
  typedLine: string | null;
}

// The designer's words (`site-actions.jsx:1808-1827`), with no 「會存成『未確認門牌』」: that is the
// back office's word, and a resident is filling this in (designer, 2026-10-25). The checked line's are
// the backend guide's (§3).
const NOTE_TEXT = {
  looking: '正在找最近的門牌…',
  filled: (metres: number) =>
    `已帶入最近的門牌（距離大頭針 ${metres} 公尺）。不對的話可以直接改`,
  confirmed: '已對到門牌，換成正式寫法。不對的話可以直接改',
  mismatch: (metres: number) =>
    `地址和大頭針相距 ${metres} 公尺，請確認哪一個不對`,
  checking: '正在確認門牌…',
  not_found: '查無此門牌，仍可送出',
  ambiguous: '符合的門牌不只一個，請加上鄉鎮市區',
  // Not 「你改過地址」: whoever typed the address before putting the pin down changed nothing.
  edited: '跟大頭針的地址不一樣',
  no_door: `這附近 ${PIN_TOLERANCE_M} 公尺內查不到門牌，請自己填地址`,
} as const;

/**
 * What to say about the address line, or null for nothing: a lookup that could not be made says
 * nothing, since the form sends all the same (the guide's 「say nothing alarming」).
 */
export function addressNote(input: {
  fields: AddressFields;
  pin: LatLng | null;
  pinLookup: AddressLookup | null;
  /** The last typed line checked, and what the check found. */
  check: { address: string; lookup: AddressLookup } | null;
}): AddressNote | null {
  const { fields, pin, pinLookup, check } = input;
  const line = fields.address.trim();
  // One thing said at a time, with at most one offer.
  const say = (
    kind: AddressNote['kind'],
    text: string,
    offer: Partial<Pick<AddressNote, 'pinDoor' | 'typedLine'>> = {},
  ): AddressNote => ({ kind, text, pinDoor: null, typedLine: null, ...offer });
  const filled = fields.addressFilled;

  if (filled && isFilledByLookup(fields)) {
    if (filled.from === 'pin' && pinLookup?.status === 'looking') {
      return say('looking', NOTE_TEXT.looking);
    }

    const metres = pin ? Math.round(distanceM(pin, filled)) : null;
    // What was typed before the check put this line in its place.
    const typedLine =
      filled.from === 'typed' &&
      check?.lookup.status === 'found' &&
      check.lookup.door.token === filled.token &&
      check.address !== line
        ? check.address
        : null;

    if (metres !== null && metres > PIN_TOLERANCE_M) {
      return say('mismatch', NOTE_TEXT.mismatch(metres), { typedLine });
    }
    if (filled.from === 'typed') {
      return say('confirmed', NOTE_TEXT.confirmed, { typedLine });
    }

    return metres === null ? null : say('filled', NOTE_TEXT.filled(metres));
  }

  if (check && check.address === line) {
    switch (check.lookup.status) {
      case 'looking':
        return say('checking', NOTE_TEXT.checking);
      case 'not_found':
        return say('not_found', NOTE_TEXT.not_found);
      case 'ambiguous':
        return say('ambiguous', NOTE_TEXT.ambiguous);
      default:
        break;
    }
  }

  switch (pinLookup?.status) {
    case 'looking':
      return say('looking', NOTE_TEXT.looking);
    case 'found': {
      const pinDoor = pinLookup.door;

      // Nothing to compare a blank line with; one typed out exactly as found has nothing to offer.
      return line && line !== pinDoor.fullAddress
        ? say('edited', NOTE_TEXT.edited, { pinDoor })
        : null;
    }
    case 'not_found':
      // Once something is typed, it has been asked for and given.
      return line ? null : say('no_door', NOTE_TEXT.no_door);
    default:
      return null;
  }
}
