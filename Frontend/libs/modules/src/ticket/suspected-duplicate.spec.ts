import { describe, expect, it } from 'vitest';

import {
  DUPLICATE_CLAIM_ADVICE,
  duplicateSentence,
  quoteDuplicateTitle,
} from './suspected-duplicate';

describe('quoteDuplicateTitle', () => {
  it('quotes a title of sixteen characters or fewer whole', () => {
    expect(quoteDuplicateTitle('光復國小旁民宅清淤')).toBe(
      '光復國小旁民宅清淤',
    );
    expect(quoteDuplicateTitle('一二三四五六七八九十一二三四五六')).toBe(
      '一二三四五六七八九十一二三四五六',
    );
  });

  it('cuts a longer one to fifteen and an ellipsis, so the sentence still reads on a phone', () => {
    expect(quoteDuplicateTitle('一二三四五六七八九十一二三四五六七')).toBe(
      '一二三四五六七八九十一二三四五…',
    );
  });

  it('counts a character outside the basic plane as one', () => {
    expect(quoteDuplicateTitle(`${'𠀀'.repeat(17)}`)).toBe(
      `${'𠀀'.repeat(15)}…`,
    );
  });
});

describe('duplicateSentence', () => {
  it('names the other ticket in the design’s words', () => {
    expect(duplicateSentence({ uuid: 'other', title: '民宅一樓清淤' })).toBe(
      '疑似跟「民宅一樓清淤」重複',
    );
  });

  it('leaves a claim alone, only advising the volunteer what to do first', () => {
    expect(DUPLICATE_CLAIM_ADVICE).toBe(
      '承接前建議先聯絡開單者，避免兩邊都派人過去。',
    );
  });
});
