import { describe, expect, it } from 'vitest';

import { loginMethodsText, saltLookupIdentity } from './account-security-view';

describe('saltLookupIdentity', () => {
  it('looks the salt up by a contact the account has verified', () => {
    expect(
      saltLookupIdentity([
        { type: 'phone', value: '+886912345678', verified: false },
        { type: 'email', value: 'xiaoming@example.com', verified: true },
      ]),
    ).toBe('xiaoming@example.com');
  });

  it('has nothing to look it up by while no contact is verified', () => {
    expect(
      saltLookupIdentity([
        { type: 'phone', value: '+886912345678', verified: false },
      ]),
    ).toBeNull();
  });
});

describe('loginMethodsText', () => {
  it('names every way the account signs in, the password first', () => {
    expect(
      loginMethodsText([
        { provider: 'line' },
        { provider: 'google' },
        { provider: 'password' },
      ]),
    ).toBe('密碼、Google、LINE');
  });
});
