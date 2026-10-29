import { describe, expect, it } from 'vitest';

import { spaceErrorMessage } from './space-error';

/** A refused building-map write, as urql hands it over: the backend's message is the contract. */
function refused(message: string) {
  return { graphQLErrors: [{ message }] };
}

describe('spaceErrorMessage', () => {
  it('says a space deleted meanwhile is gone', () => {
    expect(spaceErrorMessage('delete', refused('Building map not found'))).toBe(
      '這一棟已經被刪除了。',
    );
    expect(spaceErrorMessage('update', refused('Building map not found'))).toBe(
      '找不到這一棟，可能已經被刪除。',
    );
  });

  it('asks for the address without a floor or room', () => {
    expect(
      spaceErrorMessage(
        'create',
        refused(
          "A building map's address has no building section, floor or room",
        ),
      ),
    ).toBe('空間的地址只寫到門牌號碼，不要有棟別、樓層或房號。');
  });

  it('reads a 403, from the capability or the gov team check, as no permission', () => {
    expect(
      spaceErrorMessage('delete', refused('403: Permission Denied.')),
    ).toBe('你的帳號沒有刪除這一棟的權限。');
    expect(
      spaceErrorMessage(
        'create',
        refused('403: Only gov teams may pin, edit or delete building maps.'),
      ),
    ).toBe('你的帳號不能開啟空間：要是政府單位的成員，並有開啟空間的權限。');
  });

  it('blames the connection, or falls back to a plain failure, never the English', () => {
    expect(
      spaceErrorMessage('update', {
        networkError: new TypeError('Failed to fetch'),
      }),
    ).toBe('連線失敗，請確認網路後再試一次。');
    expect(spaceErrorMessage('create', refused('Unexpected error.'))).toBe(
      '開啟空間失敗，請稍後再試一次。',
    );
    expect(spaceErrorMessage('update', refused('Name must be 1-100'))).toBe(
      '更新空間失敗，請稍後再試一次。',
    );
    expect(spaceErrorMessage('delete', new Error('boom'))).toBe(
      '刪除空間失敗，請稍後再試一次。',
    );
  });
});
