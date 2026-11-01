import { describe, expect, it } from 'vitest';

import { tagToneOf } from './tag-tone';

describe('tagToneOf', () => {
  it("names Badge's primary as Tag's brand", () => {
    expect(tagToneOf('primary')).toBe('brand');
  });

  it('keeps the tones the two share', () => {
    expect(
      (
        [
          'neutral',
          'secondary',
          'success',
          'warning',
          'danger',
          'info',
        ] as const
      ).map(tagToneOf),
    ).toEqual(['neutral', 'secondary', 'success', 'warning', 'danger', 'info']);
  });
});
