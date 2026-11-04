import { describe, expect, it } from 'vitest';

import { canOpenAdminHref } from './nav';

describe('canOpenAdminHref', () => {
  it('lets a team admin open 團隊, query and all', () => {
    expect(
      canOpenAdminHref('/teams?team=abc', ['team.view', 'team.member.manage']),
    ).toBe(true);
  });

  it('keeps a team member, who holds only team.view, out of 團隊', () => {
    expect(canOpenAdminHref('/teams', ['team.view'])).toBe(false);
  });

  it('keeps 成員與權限 for an identity holding rbac.assign', () => {
    expect(canOpenAdminHref('/users', ['user.view'])).toBe(false);
    expect(canOpenAdminHref('/users', ['rbac.assign'])).toBe(true);
  });

  it('opens a link under no sidebar item', () => {
    expect(canOpenAdminHref('/', [])).toBe(true);
  });
});
