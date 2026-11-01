import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearHandedOffIdentity,
  handOffIdentity,
  peekHandedOffIdentity,
} from './identity-hand-off';

describe('identity hand-off', () => {
  beforeEach(() => {
    clearHandedOffIdentity();
  });

  it('gives the register page what the login form held, tab and all', () => {
    handOffIdentity({ identityType: 'phone', identity: '0912345678' });

    expect(peekHandedOffIdentity()).toEqual({
      identityType: 'phone',
      identity: '0912345678',
    });
  });

  it('gives it again to a render that starts over, until it is cleared', () => {
    handOffIdentity({ identityType: 'email', identity: 'name@example.com' });
    peekHandedOffIdentity();

    expect(peekHandedOffIdentity()).toEqual({
      identityType: 'email',
      identity: 'name@example.com',
    });
  });

  it('gives nothing once cleared: the next visit to the register page opens empty', () => {
    handOffIdentity({ identityType: 'email', identity: 'name@example.com' });
    clearHandedOffIdentity();

    expect(peekHandedOffIdentity()).toBeNull();
  });

  it('gives the last one left when 註冊帳號 was pressed twice', () => {
    handOffIdentity({ identityType: 'email', identity: 'first@example.com' });
    handOffIdentity({ identityType: 'phone', identity: '0912345678' });

    expect(peekHandedOffIdentity()).toEqual({
      identityType: 'phone',
      identity: '0912345678',
    });
  });

  it('gives nothing when the login page left nothing', () => {
    expect(peekHandedOffIdentity()).toBeNull();
  });
});
