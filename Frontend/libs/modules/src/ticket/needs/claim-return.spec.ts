import { describe, expect, it } from 'vitest';

import { buildClaimSignInHref, readClaimReturn, stripClaimReturn } from './claim-return';

const TICKET = 'd0000000-0000-4000-8000-000000000010';
const NEED = 'e0000000-0000-4000-8000-000000000020';

/** The page the login page will send the guest back to, as it reads it. */
function callbackOf(href: string) {
  return new URL(href, 'http://site.test').searchParams.get('callbackUrl');
}

describe('buildClaimSignInHref', () => {
  it('sends a guest to sign in and back to the list with the ticket open and the need to claim', () => {
    expect(buildClaimSignInHref({ pathname: '/list/ticket', search: '' }, TICKET, NEED)).toBe(
      '/login?callbackUrl=%2Flist%2Fticket%3Fid%3Dd0000000-0000-4000-8000-000000000010' +
        '%26claim%3De0000000-0000-4000-8000-000000000020',
    );
  });

  it('opens the pressed ticket, not the one the drawer showed, and keeps the search', () => {
    const href = buildClaimSignInHref(
      { pathname: '/list/ticket', search: '?id=d0000000-0000-4000-8000-000000000021&search=光復' },
      TICKET,
      NEED,
    );

    expect(callbackOf(href)).toBe(
      '/list/ticket?id=d0000000-0000-4000-8000-000000000010&search=%E5%85%89%E5%BE%A9' +
        '&claim=e0000000-0000-4000-8000-000000000020',
    );
  });

  it('brings a guest on the map back to the same layer and viewport, where the ticket is', () => {
    const href = buildClaimSignInHref(
      { pathname: '/map/osm-direct/ticket/@23.6690000,121.4210000,15z', search: '' },
      TICKET,
      NEED,
    );

    expect(callbackOf(href)).toBe(
      '/map/osm-direct/ticket/@23.6690000,121.4210000,15z?id=d0000000-0000-4000-8000-000000000010' +
        '&claim=e0000000-0000-4000-8000-000000000020',
    );
  });
});

describe('readClaimReturn', () => {
  it('finds the ticket and the need a guest signed in to claim', () => {
    expect(readClaimReturn(new URLSearchParams(`?id=${TICKET}&claim=${NEED}`))).toEqual({
      ticketUuid: 'd0000000-0000-4000-8000-000000000010',
      needUuid: 'e0000000-0000-4000-8000-000000000020',
    });
  });

  it('leaves a plain link alone — a shared ticket must not ask anyone to claim anything', () => {
    expect(readClaimReturn(new URLSearchParams(`?id=${TICKET}`))).toBeNull();
    expect(readClaimReturn(new URLSearchParams(`?claim=${NEED}`))).toBeNull();
  });
});

describe('stripClaimReturn', () => {
  it('drops the need once offered, and keeps the rest of the address', () => {
    expect(
      stripClaimReturn(`/map/osm-direct/ticket/@23.6690000,121.4210000,15z?id=${TICKET}&claim=${NEED}`),
    ).toBe('/map/osm-direct/ticket/@23.6690000,121.4210000,15z?id=d0000000-0000-4000-8000-000000000010');
  });

  it('leaves an address with no need in it exactly as it was, spelling and all', () => {
    expect(stripClaimReturn(`/list/ticket?search=a%20b&id=${TICKET}`)).toBe(
      '/list/ticket?search=a%20b&id=d0000000-0000-4000-8000-000000000010',
    );
  });

  it('leaves no bare question mark when the need was all the query held', () => {
    expect(stripClaimReturn(`/list/ticket?claim=${NEED}`)).toBe('/list/ticket');
  });
});
