import { describe, expect, it } from 'vitest';

import { nameInitials } from './index';

describe('nameInitials', () => {
  it('takes the first letter of each of the first two words', () => {
    expect(nameInitials('ada lovelace byron')).toBe('AL');
    expect(nameInitials('王小明')).toBe('王');
  });

  it('takes a whole character outside the BMP, not half of it', () => {
    expect(nameInitials('😀 Bob')).toBe('😀B');
    expect(nameInitials('𠮷野 家')).toBe('𠮷家');
  });
});
