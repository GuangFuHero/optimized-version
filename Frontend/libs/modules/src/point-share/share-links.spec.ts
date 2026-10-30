import { describe, expect, it } from 'vitest';

import { createPointShareLinks, sharesThroughDeviceSheet } from './share-links';

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

describe('sharesThroughDeviceSheet', () => {
  const phone = { canShareNatively: true, touchScreen: true };

  it("hands Facebook to a phone's share sheet, whose Facebook app would open sharer.php on its feed", () => {
    expect(sharesThroughDeviceSheet('facebook', phone)).toBe(true);
  });

  it('keeps every other channel on its own share page', () => {
    expect(
      (['line', 'threads', 'x'] as const).map((channel) =>
        sharesThroughDeviceSheet(channel, phone),
      ),
    ).toEqual([false, false, false]);
  });

  it("keeps Facebook's share page on a computer, even one with a share sheet", () => {
    expect(
      sharesThroughDeviceSheet('facebook', {
        canShareNatively: true,
        touchScreen: false,
      }),
    ).toBe(false);
  });

  it('keeps it on a touch screen with no share sheet to hand it to', () => {
    expect(
      sharesThroughDeviceSheet('facebook', {
        canShareNatively: false,
        touchScreen: true,
      }),
    ).toBe(false);
  });
});
