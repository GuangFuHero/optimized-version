/**
 * 請求協助 as it is being filled in, kept in this tab for the person filling it (spec S10): the
 * form is long, and is lost whole when the site reloads as a guest on a sign-in that ran out, or
 * when a sign-out in another tab turns the drawer into the guest one. Keyed by the account, so
 * someone else signing in to the same tab does not see it. Gone when it is sent, or on 取消.
 */

import {
  SITE_NEED_OPTIONS,
  type HelpRequestForm,
  type NeedDraft,
  type PickedPoint,
} from './help-request-form';

/** The parts of `Storage` the draft uses: `sessionStorage` on the site, a stand-in in tests. */
export type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Raised when the form's shape changes, so a draft of the old shape is read as none. */
const DRAFT_VERSION = 1;

export function helpRequestDraftKey(userId: string): string {
  return `wg:help-request-draft:${userId}`;
}

/** Null where the browser will not hand it over (storage turned off); reading it can throw. */
export function sessionDraftStorage(): DraftStorage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

const TEXT_FIELDS = [
  'title',
  'address',
  'floor',
  'room',
  'contactName',
  'contactPhone',
  'description',
] as const;

/**
 * Something the person did. A point the drawer was opened at, or the device's, is not: a draft of
 * that alone would come back on every opening.
 */
function hasContent(form: HelpRequestForm): boolean {
  return (
    TEXT_FIELDS.some((field) => form[field].trim() !== '') ||
    form.needs.some(
      (row) => row.need !== null || row.name.trim() || row.quantity.trim(),
    ) ||
    form.photoUrls.length > 0 ||
    form.landmark?.source === 'manual'
  );
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const NEED_VALUES = new Set<unknown>(
  SITE_NEED_OPTIONS.map((option) => option.value),
);
const POINT_SOURCES = new Set<unknown>(['seed', 'gps', 'manual']);

function isPoint(value: unknown): value is PickedPoint {
  return (
    isRecord(value) &&
    typeof value.lat === 'number' &&
    typeof value.lng === 'number' &&
    POINT_SOURCES.has(value.source)
  );
}

function isNeedDraft(value: unknown): value is NeedDraft {
  return (
    isRecord(value) &&
    (value.need === null || NEED_VALUES.has(value.need)) &&
    typeof value.name === 'string' &&
    typeof value.quantity === 'string'
  );
}

/** The drawer reads every field without a check, and always has a last need row. */
function isHelpRequestForm(value: unknown): value is HelpRequestForm {
  return (
    isRecord(value) &&
    TEXT_FIELDS.every((field) => typeof value[field] === 'string') &&
    (value.landmark === null || isPoint(value.landmark)) &&
    Array.isArray(value.needs) &&
    value.needs.length > 0 &&
    value.needs.every(isNeedDraft) &&
    Array.isArray(value.photoUrls) &&
    value.photoUrls.every((url) => typeof url === 'string')
  );
}

/** Null when there is none, or none this version of the form can take. */
export function readHelpRequestDraft(
  storage: DraftStorage | null,
  userId: string,
): HelpRequestForm | null {
  try {
    const saved: unknown = JSON.parse(
      storage?.getItem(helpRequestDraftKey(userId)) ?? 'null',
    );

    return isRecord(saved) &&
      saved.v === DRAFT_VERSION &&
      isHelpRequestForm(saved.form)
      ? saved.form
      : null;
  } catch {
    return null;
  }
}

/** A form with nothing done by hand takes the draft away rather than keeping it. */
export function writeHelpRequestDraft(
  storage: DraftStorage | null,
  userId: string,
  form: HelpRequestForm,
): void {
  const key = helpRequestDraftKey(userId);

  try {
    if (hasContent(form)) {
      storage?.setItem(key, JSON.stringify({ v: DRAFT_VERSION, form }));
    } else {
      storage?.removeItem(key);
    }
  } catch {
    // Not kept, then: the form still works, it only does not outlast a reload.
  }
}

export function clearHelpRequestDraft(
  storage: DraftStorage | null,
  userId: string,
): void {
  try {
    storage?.removeItem(helpRequestDraftKey(userId));
  } catch {
    // Nothing kept that could be taken away.
  }
}
