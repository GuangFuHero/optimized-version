// SPDX-License-Identifier: GPL-3.0-only
import type {
  PointShareChannel,
  PointShareLink,
  PointShareTarget,
  ShareHref,
} from './types';

/**
 * The share pages another window may open: each channel's, and LINE's message page. Every share
 * address is built on one of these, and `openSharePage` opens nothing else.
 */
const SHARE_PAGES = {
  line: 'https://social-plugins.line.me/lineit/share',
  facebook: 'https://www.facebook.com/sharer/sharer.php',
  threads: 'https://www.threads.net/intent/post',
  x: 'https://twitter.com/intent/tweet',
  lineMessage: 'https://line.me/R/msg/text/',
} as const;

function sharePage(page: keyof typeof SHARE_PAGES, query: string): ShareHref {
  return `${SHARE_PAGES[page]}?${query}` as ShareHref;
}

/** LINE's own message page: the app's chat picker on a phone, LINE on the web on a computer. */
export function lineMessageHref(text: string, url: string): ShareHref {
  return sharePage('lineMessage', encodeURIComponent(`${text}\n${url}`));
}

export function createPointShareLinks(
  target: PointShareTarget,
): readonly PointShareLink[] {
  const encodedUrl = encodeURIComponent(target.url);
  const encodedMessage = encodeURIComponent(
    `${target.title}\n${target.description}\n${target.url}`,
  );
  // X takes the link apart from the text and shows it as a card.
  const encodedText = encodeURIComponent(
    `${target.title}\n${target.description}`,
  );

  return [
    {
      channel: 'line',
      label: 'LINE',
      href: sharePage('line', `url=${encodedUrl}&text=${encodedMessage}`),
    },
    {
      channel: 'facebook',
      label: 'Facebook',
      href: sharePage('facebook', `u=${encodedUrl}`),
    },
    {
      channel: 'threads',
      label: 'Threads',
      href: sharePage('threads', `text=${encodedMessage}`),
    },
    {
      channel: 'x',
      label: 'X',
      href: sharePage('x', `text=${encodedText}&url=${encodedUrl}`),
    },
  ];
}

/**
 * Whether a channel's tile hands the link to the device's own share sheet instead of opening the
 * channel's share page: Facebook's, on a touch screen that has the sheet. There Facebook's app takes
 * every `facebook.com` link but `/dialog/*` (its apple-app-site-association), `sharer.php` included,
 * and opens on its feed with nothing to post. Picked from the sheet, Facebook is the app's own share,
 * which posts the link with its card. A computer keeps the share page.
 */
export function sharesThroughDeviceSheet(
  channel: PointShareChannel,
  device: { canShareNatively: boolean; touchScreen: boolean },
): boolean {
  return (
    channel === 'facebook' && device.canShareNatively && device.touchScreen
  );
}

/**
 * Whether the share sheet's refusal needs nothing more: the person closing it (`AbortError`), or a
 * sheet still open from the press before (`InvalidStateError`), whose own share goes on. Any other —
 * a browser in an app that has `navigator.share` but refuses it — is the sheet failing, and a tile
 * that went through it opens its channel's page instead.
 */
export function isShareSheetDismissal(error: unknown): boolean {
  const name = (error as Error | undefined)?.name;

  return name === 'AbortError' || name === 'InvalidStateError';
}

export async function copyPointShareUrl(url: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(url);
      return;
    } catch {
      // Fall back to a temporary textarea when browser permissions block Clipboard API.
    }
  }

  if (typeof document === 'undefined') {
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = url;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

/** A channel's share page, in a small window beside this one. */
export function openPointShareLink(href: ShareHref) {
  openSharePage(href, 'noopener,noreferrer,width=720,height=640');
}

/** A share page, in a new tab. */
export function openShareTab(href: ShareHref) {
  openSharePage(href, 'noopener');
}

/**
 * The one place the site opens another window, and only on a share page above. A cast can make any
 * string a `ShareHref`, so the address is checked again here; anything else opens nothing. The
 * window gets the address as checked, not the text it came as: the browser reads that text against
 * this page, where `https:line.me/…` or `https:\line.me\…` is a path of this site's own.
 */
function openSharePage(href: ShareHref, features: string) {
  const page = typeof window === 'undefined' ? null : checkedSharePage(href);

  if (page === null) {
    return;
  }

  window.open(page, '_blank', features);
}

/** `href` read on its own, written out in full, if it is a share page above; else null. */
function checkedSharePage(href: string): string | null {
  try {
    const url = new URL(href);

    return Object.values<string>(SHARE_PAGES).includes(
      url.origin + url.pathname,
    )
      ? url.href
      : null;
  } catch {
    return null;
  }
}
