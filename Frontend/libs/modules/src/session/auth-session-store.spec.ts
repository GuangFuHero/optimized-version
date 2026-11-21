import { describe, expect, it } from 'vitest';

import { toAuthSession } from './auth-session-store';

describe('toAuthSession', () => {
  it('exposes only the uuid and name to session consumers', () => {
    const profile = { uuid: 'u-1', name: '王小明', contacts: [] };
    expect(toAuthSession(profile)).toEqual({
      status: 'authenticated',
      user: { uuid: 'u-1', name: '王小明' },
    });
  });

  it('identifies a signed-out visitor', () => {
    expect(toAuthSession(null)).toEqual({
      status: 'unauthenticated',
      user: null,
    });
  });
});
