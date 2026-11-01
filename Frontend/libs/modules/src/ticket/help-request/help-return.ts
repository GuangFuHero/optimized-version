/**
 * The way back for a guest who pressed 請求協助: to sign in, then to the page they were on with the
 * drawer open again, and the point they picked on the map with it. `help=1` without a
 * point, `help=<lat>,<lng>` with one, and `helpBuilding=<uuid>&helpFloor=<label>` beside it when it
 * was a building's floor (在這一層請求協助). Built as A's claim does (`needs/claim-return.ts`).
 */

import {
  buildSignInHref,
  stripQueryKeys,
  type ReturnLocation,
  type ReturnQuery,
} from '../../route/return-query';

import type { HelpRequestPlace, HelpRequestSeed } from './open-help-request';

/** The drawer to open again, from where on the map if from anywhere. */
export interface HelpReturn {
  seed: HelpRequestSeed | null;
}

const HELP_KEY = 'help';
const BUILDING_KEY = 'helpBuilding';
const FLOOR_KEY = 'helpFloor';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A building's floor beside the point; its address is the drawer's to read again. */
function readPlace(query: ReturnQuery): HelpRequestPlace | undefined {
  const buildingUuid = query.get(BUILDING_KEY);
  const floor = query.get(FLOOR_KEY);

  return buildingUuid && UUID_PATTERN.test(buildingUuid) && floor !== null
    ? { buildingUuid, address: null, floor }
    : undefined;
}

function readSeed(value: string): HelpRequestSeed | null {
  const [lat, lng, ...rest] = value.split(',').map(Number);
  const isPoint =
    rest.length === 0 &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180;

  return isPoint ? { lat, lng } : null;
}

/**
 * A point that is not one still reopens the drawer, which then asks the device where it is. A
 * building's floor comes back only with its point.
 */
export function readHelpReturn(query: ReturnQuery): HelpReturn | null {
  const value = query.get(HELP_KEY);

  if (value === null) {
    return null;
  }

  const seed = readSeed(value);
  const place = seed ? readPlace(query) : undefined;

  return { seed: seed && place ? { ...seed, place } : seed };
}

/** The address without `help=` and the building's floor beside it. */
export function stripHelpReturn(href: string): string {
  return stripQueryKeys(href, [HELP_KEY, BUILDING_KEY, FLOOR_KEY]);
}

/** The shell's own sign-in sent guests back to a bare `/map`: this one keeps the address. */
export function buildHelpSignInHref(
  location: ReturnLocation,
  seed: HelpRequestSeed | null,
): string {
  return buildSignInHref(location, {
    [HELP_KEY]: seed ? `${seed.lat.toFixed(6)},${seed.lng.toFixed(6)}` : '1',
    ...(seed?.place
      ? {
          [BUILDING_KEY]: seed.place.buildingUuid,
          [FLOOR_KEY]: seed.place.floor,
        }
      : {}),
  });
}
