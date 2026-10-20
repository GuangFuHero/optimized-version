import { describe, expect, it } from 'vitest';

import { stationSuggestionErrorMessage } from './error';

const refusal = (message: string) => ({ graphQLErrors: [{ message }] });

describe('stationSuggestionErrorMessage', () => {
  it("puts the backend's refusals in the site's words", () => {
    expect(stationSuggestionErrorMessage(refusal('station not found'))).toBe(
      '這個站點已經不在地圖上，無法送出修改建議。',
    );
    expect(
      stationSuggestionErrorMessage(
        refusal("'new_value' must be at most 1000 characters"),
      ),
    ).toBe('建議內容最多 1000 字。');
    expect(
      stationSuggestionErrorMessage(
        refusal("'comment' must be at most 1000 characters"),
      ),
    ).toBe('補充說明最多 1000 字。');
  });

  it('reads 403 as an identity that cannot suggest, and 401 as a sign-in that ran out', () => {
    expect(
      stationSuggestionErrorMessage(refusal('403: Permission Denied.')),
    ).toBe('你目前的身分不能送出修改建議。');
    expect(
      stationSuggestionErrorMessage(
        refusal('401: Could not validate credentials'),
      ),
    ).toBe('登入已過期，請重新登入後再試一次。');
    expect(
      stationSuggestionErrorMessage({
        networkError: new Error('Unauthorized'),
        response: { status: 401 },
      }),
    ).toBe('登入已過期，請重新登入後再試一次。');
  });

  it('tells a dropped connection apart from anything else', () => {
    expect(
      stationSuggestionErrorMessage({ networkError: new Error('offline') }),
    ).toBe('連線失敗，請確認網路後再試一次。');
    expect(stationSuggestionErrorMessage(refusal('Unexpected error.'))).toBe(
      '送出失敗，請稍後再試一次。',
    );
  });
});
