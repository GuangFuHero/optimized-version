// SPDX-License-Identifier: GPL-3.0-only
import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadPage } from './navigate';

function stubAssign() {
  const assign = vi.fn();
  vi.stubGlobal('window', { location: { assign } });
  return assign;
}

describe('loadPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads a path on this site as it came, query included', () => {
    const assign = stubAssign();

    loadPage('/api/v1/auth/oauth/line/start?purpose=step_up&return_to=%2Fmap');

    expect(assign).toHaveBeenCalledWith(
      '/api/v1/auth/oauth/line/start?purpose=step_up&return_to=%2Fmap',
    );
  });

  it.each([
    'https://evil.example/map',
    '//evil.example/map',
    '/\\evil.example/map',
    '/\t/evil.example/map',
    'javascript:alert(1)',
    'map',
    '',
  ])('loads the home page instead of %j', (href) => {
    const assign = stubAssign();

    loadPage(href);

    expect(assign).toHaveBeenCalledWith('/');
  });
});
