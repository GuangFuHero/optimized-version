/**
 * The link-preview card the whole site shares, drawn by `apps/demo/src/app/(site)/share-card.png`:
 * a PNG, since LINE, Facebook and X show no SVG. The URL is relative; the site layout's
 * `metadataBase` makes it absolute on the site's origin.
 *
 * `?v=` is the card's version: LINE, Facebook and the CDN keep an image by its full URL, so a card
 * redrawn under the same one would not show. Raise it whenever the card changes; the route ignores it.
 */
export const SITE_SHARE_CARD = {
  url: '/share-card.png?v=1',
  width: 1200,
  height: 630,
  alt: '島嶼守望',
};

/**
 * What every page's `openGraph` starts from. A page that sets its own replaces the layout's whole,
 * the card included, so it spreads this in first.
 */
export const SITE_OPEN_GRAPH = {
  type: 'website' as const,
  siteName: '島嶼守望',
  images: [SITE_SHARE_CARD],
};
