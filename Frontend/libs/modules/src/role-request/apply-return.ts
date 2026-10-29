/**
 * The way to LINE and back for an applicant whose account has only LINE to prove it is them
 * (backend ADR-361): the form is kept in this tab (`use-apply-draft.ts`), the page goes to LINE to
 * sign in again, and LINE sends it back here with `apply=1` and the outcome (`step_up=ok`, or
 * `step_up_error=<code>`). The drawer then opens on the form as it was. Built as 請求協助's way back
 * is (`help-return.ts`).
 */

import {
  stripQueryKeys,
  type ReturnLocation,
  type ReturnQuery,
} from '../route/return-query';

const APPLY_KEY = 'apply';
const STEP_UP_KEY = 'step_up';
const STEP_UP_ERROR_KEY = 'step_up_error';
const RETURN_KEYS = [APPLY_KEY, STEP_UP_KEY, STEP_UP_ERROR_KEY];

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
export function buildPhoneStepUpHref(location: ReturnLocation): string {
  const back = new URLSearchParams(location.search);

  for (const key of RETURN_KEYS) {
    back.delete(key);
  }

  back.set(APPLY_KEY, '1');

  const start = new URLSearchParams({
    purpose: 'step_up',
    action: 'add_contact',
    app: 'site',
    return_to: `${location.pathname}?${back}`,
  });

  return `/api/v1/auth/oauth/line/start?${start}`;
}
