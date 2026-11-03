import { describe, expect, it } from 'vitest';

import { ADMIN_PAGE_HELP, adminPageHelpKey } from './page-help';

describe('adminPageHelpKey', () => {
  it('finds a page by its first segment', () => {
    expect(adminPageHelpKey('/tickets')).toBe('/tickets');
    expect(adminPageHelpKey('/stations/abc')).toBe('/stations');
  });

  it('gives no help where the page is not in yet', () => {
    // 互助地圖's areas, 重複審核, 團隊 and 成員與權限 wait for their pages.
    for (const path of ['/map', '/audit', '/teams', '/users', '/', '/nope']) {
      expect(adminPageHelpKey(path)).toBeNull();
    }
  });
});

describe('ADMIN_PAGE_HELP', () => {
  it('names no team assigning a ticket, which tickets do not have', () => {
    const tickets = JSON.stringify(ADMIN_PAGE_HELP['/tickets']);

    expect(tickets).not.toContain('指派給團隊');
  });

  it('gives every row of a 權限 table one mark per action', () => {
    for (const help of Object.values(ADMIN_PAGE_HELP)) {
      const permissions = help?.permissions;
      if (!permissions) {
        continue;
      }
      for (const group of permissions.groups) {
        for (const [, marks] of group.rows) {
          expect(marks).toHaveLength(permissions.actions.length);
        }
      }
    }
  });
});
