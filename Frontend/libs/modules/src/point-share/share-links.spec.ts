// SPDX-License-Identifier: GPL-3.0-only
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createPointShareLinks,
  isShareSheetDismissal,
  lineMessageHref,
  openPointShareLink,
  openShareTab,
  sharesThroughDeviceSheet,
} from './share-links';
import type { ShareHref } from './types';

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

describe('lineMessageHref', () => {
  it("puts the text and the link, a line apart, after LINE's message page", () => {
    const href = new URL(lineMessageHref('邀請你加入「第一隊」', target.url));

    expect(href.origin + href.pathname).toBe('https://line.me/R/msg/text/');
    expect(decodeURIComponent(href.search.slice(1))).toBe(
      `邀請你加入「第一隊」\n${target.url}`,
    );
  });
});

describe('opening a share page', () => {
  /** The browser's `window.open`: what it was asked to open. */
  function fakeWindow() {
    const open = vi.fn();
    vi.stubGlobal('window', { open });
    return open;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens each channel's page in a small window beside this one", () => {
    const open = fakeWindow();
    const links = createPointShareLinks(target);

    links.forEach((link) => openPointShareLink(link.href));

    expect(open.mock.calls).toEqual(
      links.map((link) => [
        link.href,
        '_blank',
        'noopener,noreferrer,width=720,height=640',
      ]),
    );
  });

  it("opens LINE's message page in a new tab", () => {
    const open = fakeWindow();
    const href = lineMessageHref('邀請', target.url);

    openShareTab(href);

    expect(open).toHaveBeenCalledWith(href, '_blank', 'noopener');
  });

  it.each([
    'https://evil.example/lineit/share?url=x',
    'https://line.me.evil.example/R/msg/text/?x',
    'https://line.me/R/oaMessage/@evil/?x',
    'http://twitter.com/intent/tweet?text=x',
    '//twitter.com/intent/tweet?text=x',
    'javascript:void 0',
    '/map',
  ])('opens nothing for %s, which no share link builds', (href) => {
    const open = fakeWindow();

    openPointShareLink(href as ShareHref);
    openShareTab(href as ShareHref);

    expect(open).not.toHaveBeenCalled();
  });

  it.each(['https:line.me/R/msg/text/?x', 'https:\\line.me\\R\\msg\\text\\?x'])(
    'opens the share page it checked for %j, not the text, which the page would read as a path of its own',
    (href) => {
      const open = fakeWindow();

      openPointShareLink(href as ShareHref);
      openShareTab(href as ShareHref);

      // Read against a page of this site, the text stays here; read alone, it is LINE's page.
      expect(
        new URL(href, 'https://demo.wan-guard.com/admin/members').origin,
      ).toBe('https://demo.wan-guard.com');
      expect(open.mock.calls.map(([url]) => url)).toEqual([
        'https://line.me/R/msg/text/?x',
        'https://line.me/R/msg/text/?x',
      ]);
    },
  );
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

describe('isShareSheetDismissal', () => {
  it('is the sheet the person closed, or one still open from the press before', () => {
    expect(
      [
        new DOMException('Share canceled', 'AbortError'),
        new DOMException('A share is already open', 'InvalidStateError'),
      ].map(isShareSheetDismissal),
    ).toEqual([true, true]);
  });

  it('is not a sheet that failed, which the share page stands in for', () => {
    expect(
      [
        new DOMException('Not allowed', 'NotAllowedError'),
        new TypeError('Bad data'),
        undefined,
      ].map(isShareSheetDismissal),
    ).toEqual([false, false, false]);
  });
});
