import { describe, expect, it } from 'vitest';

import { currentInvite, inviteUrl, toTeamInvite } from './invite';

const invite = (token: string, expires_at: string) => ({
  token,
  team_uuid: 't-ngo',
  created_at: '2026-10-22T00:00:00Z',
  expires_at,
});

describe('inviteUrl', () => {
  it('points at the user site on the same origin, carrying the token', () => {
    expect(inviteUrl('abc_DEF-123', 'https://wan-guard.com')).toBe(
      'https://wan-guard.com/invites/abc_DEF-123',
    );
  });

  it('escapes what a URL path cannot carry', () => {
    expect(inviteUrl('a/b', 'http://localhost:3001')).toBe(
      'http://localhost:3001/invites/a%2Fb',
    );
  });
});

describe('currentInvite', () => {
  it('reuses the newest valid link, which the backend lists first', () => {
    const newest = invite('new', '2026-10-23T02:00:00Z');
    expect(currentInvite([newest, invite('old', '2026-10-22T20:00:00Z')])).toBe(
      newest,
    );
  });

  it('has none to reuse when nothing is valid or loaded', () => {
    expect(currentInvite([])).toBeNull();
    expect(currentInvite(undefined)).toBeNull();
  });
});

describe('toTeamInvite', () => {
  it("keeps the backend's expiry: the client clock decides nothing", () => {
    expect(
      toTeamInvite(invite('tok', '2026-10-23T00:00:00Z'), 'https://x.tw'),
    ).toEqual({
      url: 'https://x.tw/invites/tok',
      expiresAt: '2026-10-23T00:00:00Z',
    });
  });
});
