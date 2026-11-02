import { describe, expect, it } from 'vitest';

import { shouldAutoLocate } from './auto-locate';

describe('shouldAutoLocate', () => {
  it('starts from where the person is when opened with no point', () => {
    expect(shouldAutoLocate({ autoLocate: true, hasInitialValue: false })).toBe(
      true,
    );
  });

  it('keeps a point it was opened with', () => {
    expect(shouldAutoLocate({ autoLocate: true, hasInitialValue: true })).toBe(
      false,
    );
  });

  it('never asks the device when told not to — back-office staff are rarely on site', () => {
    expect(
      shouldAutoLocate({ autoLocate: false, hasInitialValue: false }),
    ).toBe(false);
  });
});
