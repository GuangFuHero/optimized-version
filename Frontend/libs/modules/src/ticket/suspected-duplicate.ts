/**
 * 疑似重複 on the site: another ticket this one may repeat, as the backend says (`suspectedDuplicateOf`,
 * ADR-447) — those 重複審核 has yet to decide, or judged the same and not merged yet. A reminder only: it
 * changes nothing on the ticket and keeps no one from claiming, and the merge itself is the back
 * office's.
 */

/** Another ticket named on this one: enough to quote it and to open it. */
export interface SuspectedDuplicate {
  uuid: string;
  title: string;
}

/**
 * The most of the other ticket's title a sentence quotes (DUP-FE-206): on a 390px phone a line holds
 * about fifteen characters, so sixteen fold into two lines at most, and a longer title would push 重複
 * down to a third. The whole title is one tap away, on 看那張.
 */
const QUOTED_TITLE_MAX = 16;

/** The title as the sentence quotes it: whole, or its first fifteen characters and an ellipsis. */
export function quoteDuplicateTitle(title: string): string {
  const characters = Array.from(title);

  return characters.length > QUOTED_TITLE_MAX
    ? `${characters.slice(0, QUOTED_TITLE_MAX - 1).join('')}…`
    : title;
}

/** The sentence a list card and the detail give for one other ticket. */
export function duplicateSentence(other: SuspectedDuplicate): string {
  return `疑似跟「${quoteDuplicateTitle(other.title)}」重複`;
}

/** Under the detail's sentences: what to do before claiming, since claiming is not held back. */
export const DUPLICATE_CLAIM_ADVICE =
  '承接前建議先聯絡開單者，避免兩邊都派人過去。';
