/**
 * 請求協助 as it is being filled in, kept in this tab for the person filling it: the
 * form is long, and is lost whole when the site reloads as a guest on a sign-in that ran out, or
 * when a sign-out in another tab turns the drawer into the guest one. Keyed by the account, so
 * someone else signing in to the same tab does not see it. Gone when it is sent, on 取消, or on
 * 登出 in this tab. An opening at a point on the map leaves it be (`holdHelpRequestDraft`).
 */

import { isFilledFromPin, type FilledAddress } from '../address-lookup';
import {
  SITE_NEED_OPTIONS,
  type HelpRequestForm,
  type NeedDraft,
  type PickedPoint,
} from './help-request-form';

/** The parts of `Storage` the draft uses: `sessionStorage` on the site, a stand-in in tests. */
export type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * Raised when the form's shape changes, so a draft of the old shape is read as none. Not for a field
 * added that a draft can do without: `addressFilled` and `addressKept` are read as none instead.
 */
const DRAFT_VERSION = 1;

const DRAFT_KEY_PREFIX = 'wg:help-request-draft:';

export function helpRequestDraftKey(userId: string): string {
  return `${DRAFT_KEY_PREFIX}${userId}`;
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
 * Something the person did. A point the drawer was opened at, or the device's, is not, nor the 門牌
 * looked up for it: a draft of that alone would come back on every opening.
 */
function hasContent(form: HelpRequestForm): boolean {
  return (
    TEXT_FIELDS.some(
      (field) => field !== 'address' && form[field].trim() !== '',
    ) ||
    (form.address.trim() !== '' && !isFilledFromPin(form)) ||
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

const FILLED_FROM = new Set<unknown>(['pin', 'typed']);

function isFilledAddress(value: unknown): value is FilledAddress {
  return (
    isRecord(value) &&
    typeof value.fullAddress === 'string' &&
    typeof value.token === 'string' &&
    typeof value.lat === 'number' &&
    typeof value.lng === 'number' &&
    FILLED_FROM.has(value.from)
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

/**
 * The drawer reads every field without a check, and always has a last need row. `addressFilled` and
 * `addressKept` are left to `readHelpRequestDraft`: without them the address is still the person's.
 */
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

/**
 * Null when there is none, or none this version of the form can take. One kept before addresses
 * were looked up, or with a lookup of another shape, comes back with none: its address then goes
 * without a token, as typed.
 */
export function readHelpRequestDraft(
  storage: DraftStorage | null,
  userId: string,
): HelpRequestForm | null {
  try {
    const saved: unknown = JSON.parse(
      storage?.getItem(helpRequestDraftKey(userId)) ?? 'null',
    );

    if (
      !isRecord(saved) ||
      saved.v !== DRAFT_VERSION ||
      !isHelpRequestForm(saved.form)
    ) {
      return null;
    }

    const { addressFilled, addressKept } = saved.form as {
      addressFilled?: unknown;
      addressKept?: unknown;
    };

    return {
      ...saved.form,
      addressFilled: isFilledAddress(addressFilled) ? addressFilled : null,
      addressKept: typeof addressKept === 'string' ? addressKept : null,
    };
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

/** What one opening of the drawer does with the tab's draft. */
export interface HelpRequestDraftHold {
  /** The form to start from: none where the opening does not bring the draft back. */
  read: (
    storage: DraftStorage | null,
    userId: string,
  ) => HelpRequestForm | null;
  /** The form as it is filled in. */
  write: (
    storage: DraftStorage | null,
    userId: string,
    form: HelpRequestForm,
  ) => void;
  /** 取消: what was typed in this opening is let go of. */
  discard: (storage: DraftStorage | null, userId: string) => void;
}

/**
 * The tab's draft, for one opening of the drawer. From 請求協助, or back from signing in, the
 * draft comes back and the form is kept as it is filled in. At a point picked on the map it does
 * not: its title and address were written for another place (designer, 10-27). That draft is then
 * left as it was, for 請求協助 to bring back, until something is done in this form — the point it
 * was opened at and the pin's 門牌 are not — and from then on this form is the draft.
 */
export function holdHelpRequestDraft(
  bringsBack: boolean,
): HelpRequestDraftHold {
  let leftBe = !bringsBack;

  return {
    read: (storage, userId) =>
      bringsBack ? readHelpRequestDraft(storage, userId) : null,
    write: (storage, userId, form) => {
      if (leftBe && !hasContent(form)) {
        return;
      }

      leftBe = false;
      writeHelpRequestDraft(storage, userId, form);
    },
    discard: (storage, userId) => {
      if (!leftBe) {
        clearHelpRequestDraft(storage, userId);
      }
    },
  };
}

/**
 * Every draft in the tab, whoever's: on a sign-out the person chose, maybe on a shared device, none
 * is left for the next person — not this account's, nor one kept for an account whose sign-in ran
 * out here earlier.
 */
export function clearAllHelpRequestDrafts(
  storage: Pick<Storage, 'length' | 'key' | 'removeItem'> | null,
): void {
  try {
    if (!storage) {
      return;
    }

    // Collected first: removing while walking the keys would shift the ones after it.
    const keys: string[] = [];

    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);

      if (key?.startsWith(DRAFT_KEY_PREFIX)) {
        keys.push(key);
      }
    }

    for (const key of keys) {
      storage.removeItem(key);
    }
  } catch {
    // Nothing kept that could be taken away.
  }
}
