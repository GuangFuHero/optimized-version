import { describe, expect, it } from 'vitest';

import { readNeedDialog } from './need-dialog';

const FULL = '這筆需求剛好額滿了。';
const GONE = '找不到這筆需求，可能已經被刪除。';

describe('readNeedDialog', () => {
  it('shows the need, with the last refusal beneath it', () => {
    expect(
      readNeedDialog({ found: true, fetching: false, refusal: FULL }),
    ).toEqual({ box: 'need', refusal: FULL });
  });

  it('has nothing beneath the need when nothing was refused', () => {
    expect(
      readNeedDialog({ found: true, fetching: false, refusal: null }),
    ).toEqual({ box: 'need', refusal: null });
  });

  it('says it is loading while the ticket is read, keeping the refusal until it knows more', () => {
    expect(
      readNeedDialog({ found: false, fetching: true, refusal: FULL }),
    ).toEqual({ box: 'loading', refusal: FULL });
  });

  it('says the need is gone once read without it, and does not say it again beneath', () => {
    expect(
      readNeedDialog({ found: false, fetching: false, refusal: GONE }),
    ).toEqual({ box: 'gone', refusal: null });
  });

  it('drops any refusal once the need is gone: whatever it was about, nothing is left to act on', () => {
    expect(
      readNeedDialog({ found: false, fetching: false, refusal: FULL }),
    ).toEqual({ box: 'gone', refusal: null });
  });
});
