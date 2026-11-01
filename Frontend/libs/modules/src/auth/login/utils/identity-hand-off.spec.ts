import { beforeEach, describe, expect, it } from 'vitest';

import { handOffIdentity, takeHandedOffIdentity } from './identity-hand-off';

describe('takeHandedOffIdentity', () => {
  beforeEach(() => {
    takeHandedOffIdentity();
  });

  it('gives the register page what the login form held, tab and all', () => {
    handOffIdentity({ identityType: 'phone', identity: '0912345678' });

    expect(takeHandedOffIdentity()).toEqual({
      identityType: 'phone',
      identity: '0912345678',
    });
  });

  it('gives it once: the next visit to the register page opens empty', () => {
    handOffIdentity({ identityType: 'email', identity: 'name@example.com' });
    takeHandedOffIdentity();

    expect(takeHandedOffIdentity()).toBeNull();
  });

  it('gives the last one left when 註冊帳號 was pressed twice', () => {
    handOffIdentity({ identityType: 'email', identity: 'first@example.com' });
    handOffIdentity({ identityType: 'phone', identity: '0912345678' });

    expect(takeHandedOffIdentity()).toEqual({
      identityType: 'phone',
      identity: '0912345678',
    });
  });

  it('gives nothing when the login page left nothing', () => {
    expect(takeHandedOffIdentity()).toBeNull();
  });
});
