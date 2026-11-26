// SPDX-License-Identifier: GPL-3.0-only
/**
 * The way to LINE and back for an applicant whose account has only LINE to prove it is them
 * (backend ADR-361): the form is kept in this tab (`use-apply-draft.ts`), the page goes to LINE to
 * sign in again, and LINE sends it back here with `apply=1` and the outcome (`step_up=ok`, or
 * `step_up_error=<code>`). The drawer then opens on the form as it was. Built as 請求協助's way back
 * is (`help-return.ts`).
 */

import {
  OAUTH_START_PATHS,
  SITE_PATHS,
  withQuery,
  type SiteHref,
} from '../route/paths';
import {
  stripQueryKeys,
  type ReturnLocation,
  type ReturnQuery,
} from '../route/return-query';

const APPLY_KEY = 'apply';
const STEP_UP_KEY = 'step_up';
const STEP_UP_ERROR_KEY = 'step_up_error';
const RETURN_KEYS = [APPLY_KEY, STEP_UP_KEY, STEP_UP_ERROR_KEY];

/** The map with 申請管理權限 open on it. */
export const APPLY_HREF = withQuery(SITE_PATHS.map, { [APPLY_KEY]: '1' });

/** Back from LINE: whether the proof was made, or the code of what went wrong there. */
export interface ApplyReturn {
  stepUp: 'ok' | { error: string } | null;
}

export function readApplyReturn(query: ReturnQuery): ApplyReturn | null {
  if (query.get(APPLY_KEY) === null) {
    return null;
  }

  const error = query.get(STEP_UP_ERROR_KEY);

  if (error) {
    return { stepUp: { error } };
  }

  return { stepUp: query.get(STEP_UP_KEY) === 'ok' ? 'ok' : null };
}

/** The address without the way back, so a reload does not repeat it. */
export function stripApplyReturn(href: string): string {
  return stripQueryKeys(href, RETURN_KEYS);
}

/**
 * Where to send the page to prove the person at LINE before adding a phone. From `window.location`,
 * not the router: the map rewrites its address in place. `return_to` keeps the rest of the address
 * — the map's view, the list's filters — so the person comes back to what they were looking at.
 */
export function buildPhoneStepUpHref(location: ReturnLocation): SiteHref {
  const back = new URLSearchParams(location.search);

  for (const key of RETURN_KEYS) {
    back.delete(key);
  }

  back.set(APPLY_KEY, '1');

  return withQuery(OAUTH_START_PATHS.line, {
    purpose: 'step_up',
    action: 'add_contact',
    app: 'site',
    return_to: `${location.pathname}?${back}`,
  });
}
