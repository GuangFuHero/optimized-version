import { describe, expect, it } from 'vitest';

import { goneTicketCopy } from './copy';

describe('goneTicketCopy', () => {
  it('says a deleted ticket was closed by whoever made it, and points a volunteer to the notices', () => {
    expect(goneTicketCopy('deleted')).toEqual({
      title: '這張任務單已刪除',
      body: '建立者已經關閉這張任務單，不再接受報名，內容也不再公開。如果你原本已承接，請看通知確認是否還需要前往。',
    });
  });

  it('says a ticket not found may be deleted or the link cut short', () => {
    expect(goneTicketCopy('not_found')).toEqual({
      title: '找不到這張任務單',
      body: '它可能已經被刪除，或是連結不完整。內容不會再顯示。',
    });
  });
});
