import { describe, expect, it } from 'vitest';

import { buildClaimSignInHref } from './claim-return';

const TICKET = 'd0000000-0000-4000-8000-000000000010';

/** The page the login page will send the guest back to, as it reads it. */
function callbackOf(href: string) {
  return new URL(href, 'http://site.test').searchParams.get('callbackUrl');
}

describe('buildClaimSignInHref', () => {
  it('sends a guest to sign in and back to the list with the ticket open', () => {
    expect(buildClaimSignInHref({ pathname: '/list/ticket', search: '' }, TICKET)).toBe(
      '/login?callbackUrl=%2Flist%2Fticket%3Fid%3Dd0000000-0000-4000-8000-000000000010',
    );
  });

  it('opens the pressed ticket, not the one the drawer showed, and keeps the search', () => {
    const href = buildClaimSignInHref(
      { pathname: '/list/ticket', search: '?id=d0000000-0000-4000-8000-000000000021&search=光復' },
      TICKET,
    );

    expect(callbackOf(href)).toBe(
      '/list/ticket?id=d0000000-0000-4000-8000-000000000010&search=%E5%85%89%E5%BE%A9',
    );
  });

  it('brings a guest on the map back to the same layer and viewport, where the ticket is', () => {
    const href = buildClaimSignInHref(
      { pathname: '/map/osm-direct/ticket/@23.6690000,121.4210000,15z', search: '' },
      TICKET,
    );

    expect(callbackOf(href)).toBe(
      '/map/osm-direct/ticket/@23.6690000,121.4210000,15z?id=d0000000-0000-4000-8000-000000000010',
    );
  });
});
