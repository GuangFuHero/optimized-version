import type { RescueMapGoneTicket } from '../../types';

/** The two screens' words, as the design has them, word for word: a change to them starts there. */
export function goneTicketCopy(
  availability: RescueMapGoneTicket['availability'],
): {
  title: string;
  body: string;
} {
  return availability === 'deleted'
    ? {
        title: '這張任務單已刪除',
        body: '這張任務單已經關閉，不再接受報名，內容也不再公開。如果你原本已承接，不用前往了。',
      }
    : {
        title: '找不到這張任務單',
        body: '它可能已經被刪除，或是連結不完整。內容不會再顯示。',
      };
}
