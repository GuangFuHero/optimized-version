import type { PointShareLink, PointShareTarget } from './types';

export function createPointShareLinks(
  target: PointShareTarget,
): readonly PointShareLink[] {
  const encodedUrl = encodeURIComponent(target.url);
  const encodedMessage = encodeURIComponent(
    `${target.title}\n${target.description}\n${target.url}`,
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
  ];
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
