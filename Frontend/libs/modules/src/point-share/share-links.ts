import type {
  PointShareChannel,
  PointShareLink,
  PointShareTarget,
} from './types';

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
      href: `https://social-plugins.line.me/lineit/share?url=${encodedUrl}&text=${encodedMessage}`,
    },
    {
      channel: 'facebook',
      label: 'Facebook',
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    },
    {
      channel: 'threads',
      label: 'Threads',
      href: `https://www.threads.net/intent/post?text=${encodedMessage}`,
    },
    {
      channel: 'x',
      label: 'X',
      href: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
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
 * Whether the share sheet's refusal is the person closing it (`AbortError`), which needs nothing
 * more. Any other — a browser in an app that has `navigator.share` but refuses it, a sheet already
 * open — is the sheet failing, and a tile that went through it opens its channel's page instead.
 */
export function isShareSheetDismissal(error: unknown): boolean {
  return (error as Error | undefined)?.name === 'AbortError';
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

export function openPointShareLink(href: string) {
  if (typeof window === 'undefined') {
    return;
  }

  window.open(href, '_blank', 'noopener,noreferrer,width=720,height=640');
}
