/**
 * The tab's title and the page's share tags, kept in step with what is open on the site's map and
 * list.
 *
 * The server's `generateMetadata` sets them for a page load. After that the site opens and closes
 * a point in place — a card picked, a drawer shut — which changes only `?id=` and runs nothing on
 * the server: without this, the list's tab kept naming the first point opened. The map did this
 * already; both pages now do it the same way.
 */

import type { PointShareTarget } from './types';

/** What a page is called, and says of itself, when no point is open. */
export interface PageMetadata {
  title: string;
  description: string;
}

/** The list's own: what its `generateMetadata` gives a page load with nothing open, too. */
export const SITE_LIST_METADATA: PageMetadata = {
  title: '救災列表 - 島嶼守望',
  description: '以列表檢視救災任務與站點資訊。',
};

/**
 * The point the title should name: the open one once it has been read, none when nothing is open
 * — and `'reading'` while the open one is still on its way (a link past the loaded pages), when
 * the title the server gave the page load stands rather than flashing the page's own.
 */
export function pointForMetadata<T extends object>(
  selectedId: string | null | undefined,
  selected: T | null,
): T | null | 'reading' {
  if (!selectedId) {
    return null;
  }

  return selected ?? 'reading';
}

function ensureHeadMeta(
  selector: string,
  attributes: Record<string, string>,
): HTMLMetaElement {
  let element = document.head.querySelector<HTMLMetaElement>(selector);

  if (!element) {
    element = document.createElement('meta');
    Object.entries(attributes).forEach(([name, value]) => {
      element?.setAttribute(name, value);
    });
    document.head.appendChild(element);
  }

  return element;
}

/** Name the open point (`target`) in the tab's title and share tags, or else the page (`fallback`). */
export function syncDocumentMetadata(
  target: PointShareTarget | null,
  fallback: PageMetadata,
): void {
  const title = target?.title ?? fallback.title;
  const description = target?.description ?? fallback.description;
  const url = target?.url ?? window.location.href;

  document.title = title;
  ensureHeadMeta('meta[name="description"]', {
    name: 'description',
  }).setAttribute('content', description);
  ensureHeadMeta('meta[property="og:title"]', {
    property: 'og:title',
  }).setAttribute('content', title);
  ensureHeadMeta('meta[property="og:description"]', {
    property: 'og:description',
  }).setAttribute('content', description);
  ensureHeadMeta('meta[property="og:url"]', {
    property: 'og:url',
  }).setAttribute('content', url);
  ensureHeadMeta('meta[name="twitter:title"]', {
    name: 'twitter:title',
  }).setAttribute('content', title);
  ensureHeadMeta('meta[name="twitter:description"]', {
    name: 'twitter:description',
  }).setAttribute('content', description);
}
