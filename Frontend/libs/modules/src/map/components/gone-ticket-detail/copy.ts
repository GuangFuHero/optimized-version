import type { RescueMapGoneTicket } from '../../types';

/** 糖's wording (Discord #uiux, 2026-10-31), word for word. */
export function goneTicketCopy(
  availability: RescueMapGoneTicket['availability'],
): {
  title: string;
  body: string;
} {
  return availability === 'deleted'
    ? {
        title: '這張任務單已刪除',
        body: '建立者已經關閉這張任務單，不再接受報名，內容也不再公開。如果你原本已承接，請看通知確認是否還需要前往。',
      }
    : {
        title: '找不到這張任務單',
        body: '它可能已經被刪除，或是連結不完整。內容不會再顯示。',
      };
}
