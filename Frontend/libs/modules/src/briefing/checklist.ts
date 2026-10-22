/**
 * 行前資訊's packing list: which items this device has ticked, and which items changed since it last
 * looked (prototype `vb-data.js` `vbChecklistLoad` / `vbChecklistSave`, VB-BR-193 and H-1 of
 * 2026-10-11).
 *
 * - Only on this device, never the backend, and no account needed (VB-BR-193; cross-device was
 *   turned down, Q10): it is one person's packing, which nobody else needs to see.
 * - An item is its words, not its place: one added in the middle must not shift every tick below it
 *   (VB-BR-194a). The cost — one changed word makes a new item — is exactly the case to mark.
 * - After the list is edited, what did not change stays ticked, and what changed or was added is
 *   marked 已更新 until the volunteer touches it or dismisses the notice; a removed item just goes
 *   (H-1, which overturned 09-19's reset of the whole list).
 * - Marking works by remembering the whole list as last seen (`seen`): an item not in it is new to
 *   this device. Someone with no record yet sees no marks — to them every item is new.
 */

/** The prototype's key and shape: `{ checked: string[], seen: string[], at }`. */
export const BRIEFING_CHECKLIST_KEY = 'wg.briefing.checklist.v2';

/** The parts of `Storage` the checklist uses: `localStorage` on the site, a stand-in in tests. */
export type ChecklistStorage = Pick<Storage, 'getItem' | 'setItem'>;

export interface ChecklistMarks {
  /** Ticked, and still on the list. */
  checked: readonly string[];
  /** On the list, but not as this device last saw it: changed or added. */
  updated: readonly string[];
}

export const NO_MARKS: ChecklistMarks = { checked: [], updated: [] };

/** Null where the browser will not hand it over (site data blocked); reading it can throw. */
export function localChecklistStorage(): ChecklistStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

/**
 * The marks for the list as it is now (`items`, in order). Only reads: the prototype's first
 * version deleted data while reading, and whichever caller ran first ate the notice.
 */
export function readChecklist(
  storage: ChecklistStorage | null,
  items: readonly string[],
): ChecklistMarks {
  try {
    const record: unknown = JSON.parse(
      storage?.getItem(BRIEFING_CHECKLIST_KEY) ?? 'null',
    );
    if (typeof record !== 'object' || record === null) {
      return NO_MARKS;
    }

    const now = new Set(items);
    const seen = new Set(strings((record as { seen?: unknown }).seen));

    return {
      checked: strings((record as { checked?: unknown }).checked).filter(
        (item) => now.has(item),
      ),
      updated: seen.size ? items.filter((item) => !seen.has(item)) : [],
    };
  } catch {
    return NO_MARKS;
  }
}

/**
 * Saves the marks. What counts as seen is the list less what is still marked, so a mark the
 * volunteer has not dealt with is still there after a reload.
 */
export function writeChecklist(
  storage: ChecklistStorage | null,
  items: readonly string[],
  marks: ChecklistMarks,
  now = Date.now(),
): void {
  const updated = new Set(marks.updated);

  try {
    storage?.setItem(
      BRIEFING_CHECKLIST_KEY,
      JSON.stringify({
        checked: marks.checked,
        seen: items.filter((item) => !updated.has(item)),
        at: now,
      }),
    );
  } catch {
    // Not kept, then: the ticks are gone on the next visit, which the page already warns can happen.
  }
}

/** Ticks or unticks an item. Either way it has been looked at, so its 已更新 goes. */
export function toggleItem(
  marks: ChecklistMarks,
  item: string,
): ChecklistMarks {
  return {
    checked: marks.checked.includes(item)
      ? marks.checked.filter((checked) => checked !== item)
      : [...marks.checked, item],
    updated: marks.updated.filter((updated) => updated !== item),
  };
}

/** 知道了: every 已更新 goes at once, the ticks stay. */
export function dismissUpdates(marks: ChecklistMarks): ChecklistMarks {
  return { checked: marks.checked, updated: [] };
}
