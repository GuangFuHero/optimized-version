/**
 * The way back for a guest who pressed 修改建議: to sign in, then to the page they were on with the
 * station's suggestion drawer open again (`suggest=<station uuid>`). Built as the claim's and the help
 * request's are (`ticket/needs/claim-return.ts`, `ticket/help-request/help-return.ts`).
 */

import {
  buildSignInHref,
  stripQueryKeys,
  type ReturnLocation,
  type ReturnQuery,
} from '../../route/return-query';

const SUGGEST_KEY = 'suggest';

/** The station whose drawer to open again, or null. */
export function readSuggestionReturn(query: ReturnQuery): string | null {
  return query.get(SUGGEST_KEY)?.trim() || null;
}

/** The address without `suggest=`. */
export function stripSuggestionReturn(href: string): string {
  return stripQueryKeys(href, [SUGGEST_KEY]);
}

/** The open station stays in the address with the rest, so the guest comes back to it. */
export function buildSuggestionSignInHref(
  location: ReturnLocation,
  stationUuid: string,
): string {
  return buildSignInHref(location, { [SUGGEST_KEY]: stationUuid });
}
