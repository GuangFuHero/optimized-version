import { describe, expect, it } from 'vitest';

import { ticketListFailure } from './ticket-list-failure';

const refusal = (message: string) => ({ graphQLErrors: [{ message }] });

describe('ticketListFailure', () => {
  it('asks for a narrower filter, with no 重試, when the tickets outside the map run past the time limit', () => {
    // As the backend sends it: the refusal with its ceiling after it (`app/core/search.py`).
    expect(
      ticketListFailure(
        refusal('範圍外的單太多，查詢逾時已中止，請縮小篩選再試（上限 3 秒）'),
      ),
    ).toEqual({ text: '範圍外的單太多，請縮小篩選再試', retry: false });
  });

  it('offers 重試 for any other failure', () => {
    const failed = { text: '無法載入任務單，請稍後再試', retry: true };
    expect(ticketListFailure(refusal('Unexpected error.'))).toEqual(failed);
    expect(
      ticketListFailure(
        refusal('搜尋耗時過長已中止，請改用更明確的關鍵字（上限 3 秒）'),
      ),
    ).toEqual(failed);
    expect(ticketListFailure({ networkError: new Error('offline') })).toEqual(
      failed,
    );
    expect(ticketListFailure(new Error('boom'))).toEqual(failed);
  });
});
