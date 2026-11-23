// SPDX-License-Identifier: GPL-3.0-only
import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadPage } from './navigate';
import { SITE_PATHS, withQuery, type SiteHref } from './paths';

/** The tab's own page: where it would go. */
function fakeBrowserTab() {
  const location = { assign: vi.fn() };
  vi.stubGlobal('window', { location });
  return location;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadPage', () => {
  it('loads a page on this site', () => {
    const location = fakeBrowserTab();

    loadPage(withQuery(SITE_PATHS.map, { apply: '1' }));

    expect(location.assign).toHaveBeenCalledWith('/map?apply=1');
  });

  it('loads the home page instead of another site, however the address got here', () => {
    const location = fakeBrowserTab();

    loadPage('//evil.example/login' as SiteHref);

    expect(location.assign).toHaveBeenCalledWith('/');
  });

  it.each(['//one.invalid/x', '/\\two.invalid/x', '//this-site.invalid/x'])(
    'loads the home page for %s, a host the check itself reads against',
    (href) => {
      const location = fakeBrowserTab();

      loadPage(href as SiteHref);

      expect(location.assign).toHaveBeenCalledWith('/');
    },
  );
});
