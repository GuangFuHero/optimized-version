/**
 * The way back for a guest who pressed 請求協助: to sign in, then to the page they were on with the
 * drawer open again, and the point they picked on the map with it. `help=1` without a
 * point, `help=<lat>,<lng>` with one. Built as A's claim does (`needs/claim-return.ts`).
 */

import {
  buildSignInHref,
  stripQueryKeys,
  type ReturnLocation,
  type ReturnQuery,
} from '../../route/return-query';

import type { HelpRequestSeed } from './open-help-request';

/** The drawer to open again, from where on the map if from anywhere. */
export interface HelpReturn {
  seed: HelpRequestSeed | null;
}

const HELP_KEY = 'help';

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

/** A point that is not one still reopens the drawer, which then asks the device where it is. */
export function readHelpReturn(query: ReturnQuery): HelpReturn | null {
  const value = query.get(HELP_KEY);

  return value === null ? null : { seed: readSeed(value) };
}

/** The address without `help=`. */
export function stripHelpReturn(href: string): string {
  return stripQueryKeys(href, [HELP_KEY]);
}

/** The shell's own sign-in sent guests back to a bare `/map`: this one keeps the address. */
export function buildHelpSignInHref(
  location: ReturnLocation,
  seed: HelpRequestSeed | null,
): string {
  return buildSignInHref(location, {
    [HELP_KEY]: seed ? `${seed.lat.toFixed(6)},${seed.lng.toFixed(6)}` : '1',
  });
}
