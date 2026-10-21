/**
 * The way to LINE and back for an applicant whose account has only LINE to prove it is them
 * (backend ADR-361): the form is kept in this tab, the page goes to LINE to sign in again, and LINE
 * sends it back here with `apply=1` and the outcome (`step_up=ok`, or `step_up_error=<code>`). The
 * drawer then opens on the form as it was. Built as 請求協助's way back is (`help-return.ts`,
 * `help-request-draft.ts`).
 */

import type { RoleRequestRole } from '@rescue-frontend/data-access';

/** What reading the way back needs of a query: `URLSearchParams`, or Next's read-only one. */
export interface ApplyReturnQuery {
  get(name: string): string | null;
}

/** Where the person was — `window.location` will do. */
export interface ApplyReturnLocation {
  pathname: string;
  search: string;
}

const APPLY_KEY = 'apply';
const STEP_UP_KEY = 'step_up';
const STEP_UP_ERROR_KEY = 'step_up_error';
const RETURN_KEYS = [APPLY_KEY, STEP_UP_KEY, STEP_UP_ERROR_KEY];

/** Back from LINE: whether the proof was made, or the code of what went wrong there. */
export interface ApplyReturn {
  stepUp: 'ok' | { error: string } | null;
}

export function readApplyReturn(query: ApplyReturnQuery): ApplyReturn | null {
  if (query.get(APPLY_KEY) === null) {
    return null;
  }

  const error = query.get(STEP_UP_ERROR_KEY);

  if (error) {
    return { stepUp: { error } };
  }

  return { stepUp: query.get(STEP_UP_KEY) === 'ok' ? 'ok' : null };
}

/** The address without the way back — taken off once read, so a reload does not repeat it. */
export function stripApplyReturn(href: string): string {
  const url = new URL(href, 'http://site.invalid');

  // Rewriting the query re-spells what stays (`%20` as `+`): without the markers, hand the address
  // back as it came, so nothing mistakes it for a changed one.
  if (!RETURN_KEYS.some((key) => url.searchParams.has(key))) {
    return href;
  }

  for (const key of RETURN_KEYS) {
    url.searchParams.delete(key);
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Where to send the page to prove the person at LINE before adding a phone. From `window.location`,
 * not the router: the map rewrites its address in place. `return_to` keeps the rest of the address
 * — the map's view, the list's filters — so the person comes back to what they were looking at.
 */
export function buildPhoneStepUpHref(location: ApplyReturnLocation): string {
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

/** The form as it was when the page left for LINE. */
export interface ApplyDraft {
  role: RoleRequestRole | null;
  reason: string;
  name: string;
  phone: string;
}

/** The parts of `Storage` the draft uses: `sessionStorage` on the site, a stand-in in tests. */
export type ApplyDraftStorage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem'
>;

/** Raised when the form's shape changes, so a draft of the old shape is read as none. */
const DRAFT_VERSION = 1;

const DRAFT_KEY_PREFIX = 'wg:role-request-draft:';

const ROLES = new Set<unknown>(['government', 'ngo', 'data_auditor']);

/** Null where the browser will not hand it over (storage turned off); reading it can throw. */
export function sessionApplyDraftStorage(): ApplyDraftStorage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function isApplyDraft(value: unknown): value is ApplyDraft {
  return (
    isRecord(value) &&
    (value.role === null || ROLES.has(value.role)) &&
    typeof value.reason === 'string' &&
    typeof value.name === 'string' &&
    typeof value.phone === 'string'
  );
}

/** Keyed by the account, so someone else signing in to the same tab does not see it. */
export function writeApplyDraft(
  storage: ApplyDraftStorage | null,
  userId: string,
  draft: ApplyDraft,
): void {
  try {
    storage?.setItem(
      `${DRAFT_KEY_PREFIX}${userId}`,
      JSON.stringify({ v: DRAFT_VERSION, draft }),
    );
  } catch {
    // Not kept, then: the person comes back to an empty form.
  }
}

/** Read once: the draft is taken away as it is read, since it holds a name and a phone. */
export function takeApplyDraft(
  storage: ApplyDraftStorage | null,
  userId: string,
): ApplyDraft | null {
  const key = `${DRAFT_KEY_PREFIX}${userId}`;

  try {
    const saved: unknown = JSON.parse(storage?.getItem(key) ?? 'null');
    storage?.removeItem(key);

    return isRecord(saved) &&
      saved.v === DRAFT_VERSION &&
      isApplyDraft(saved.draft)
      ? saved.draft
      : null;
  } catch {
    return null;
  }
}
