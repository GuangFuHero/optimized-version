import { describe, expect, it } from 'vitest';

import { createPointShareLinks } from './share-links';

const target = {
  title: '光復國中洗澡點｜救災站點',
  description: '設置簡易淋浴間',
  url: 'https://demo.wan-guard.com/map/osm/station?id=a1',
};

describe('createPointShareLinks', () => {
  it('offers LINE first, as the prototype orders them, then Facebook, Threads and X', () => {
    expect(createPointShareLinks(target).map((link) => link.channel)).toEqual([
      'line',
      'facebook',
      'threads',
      'x',
    ]);
  });

  it("sends X the title and description as the post's text, and the link on its own", () => {
    const x = createPointShareLinks(target).find(
      (link) => link.channel === 'x',
    );
    const href = new URL(x?.href ?? '');

    expect(href.origin + href.pathname).toBe(
      'https://twitter.com/intent/tweet',
    );
    expect(href.searchParams.get('text')).toBe(
      '光復國中洗澡點｜救災站點\n設置簡易淋浴間',
    );
    expect(href.searchParams.get('url')).toBe(target.url);
  });
});
