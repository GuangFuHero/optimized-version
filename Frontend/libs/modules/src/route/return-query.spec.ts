import { describe, expect, it } from 'vitest';

import { buildSignInHref, stripQueryKeys } from './return-query';

describe('stripQueryKeys', () => {
  it('takes every key off, and keeps the rest of the address and its hash', () => {
    expect(
      stripQueryKeys('/list?q=a&apply=1&step_up=ok#top', [
        'apply',
        'step_up',
        'step_up_error',
      ]),
    ).toBe('/list?q=a#top');
  });

  it('hands an address without any of them back as it came', () => {
    expect(stripQueryKeys('/list/ticket?search=a%20b', ['help'])).toBe(
      '/list/ticket?search=a%20b',
    );
  });
});

describe('buildSignInHref', () => {
  it('comes back to the same page, its query kept, a marker set in place or added', () => {
    const href = buildSignInHref(
      { pathname: '/list/ticket', search: '?search=a%20b&claim=old' },
      { id: 't-1', claim: 'n-1' },
    );

    expect(href.startsWith('/login?callbackUrl=')).toBe(true);
    expect(decodeURIComponent(href.slice('/login?callbackUrl='.length))).toBe(
      '/list/ticket?search=a+b&claim=n-1&id=t-1',
    );
  });
});
