/**
 * What a need's confirmation shows — 確認承接 and 停止招募 alike — from what it read of the ticket:
 * the need, a line saying it is loading, or a line saying it is gone.
 */

export type NeedDialogBox = 'need' | 'loading' | 'gone';

export interface NeedDialog {
  box: NeedDialogBox;
  /** The last try's refusal, beneath the box — or nothing, where the box has said it all. */
  refusal: string | null;
}

/**
 * Once the need is gone, the box says so, and a refusal beneath it would only repeat it: a claim or
 * a stop on a deleted need is refused with 'Ticket task not found', which reads the same words. Any
 * other refusal is about a need that no longer exists, so it goes too; the way out is to close.
 */
export function readNeedDialog({
  found,
  fetching,
  refusal,
}: {
  /** Whether the ticket read has the need, with all the box shows about it. */
  found: boolean;
  fetching: boolean;
  refusal: string | null;
}): NeedDialog {
  if (found) {
    return { box: 'need', refusal };
  }

  return fetching
    ? { box: 'loading', refusal }
    : { box: 'gone', refusal: null };
}
