import { designTokens } from '@rescue-frontend/ui';

import type { RescueMapMarkerItem } from '../../types';
import { stationTypeGlyphShapes } from './station-glyph';

const { color } = designTokens;

function escapeHtml(value: string): string {
  return value
    .split('&')
    .join('&amp;')
    .split('<')
    .join('&lt;')
    .split('>')
    .join('&gt;')
    .split('"')
    .join('&quot;')
    .split("'")
    .join('&#39;');
}

function getMapMarkerDimensions(_: RescueMapMarkerItem['variant']): {
  iconSize: [number, number];
  iconAnchor: [number, number];
} {
  return { iconSize: [92, 62], iconAnchor: [46, 35] };
}

function getMarkerTone(item: RescueMapMarkerItem): {
  markerFill: string;
  markerStroke: string;
  glyphColor: string;
} {
  // Fill and glyph always travel as a pair, from `.wg-marker--ticket` / `--station` in the design
  // prototype's site.css. The stroke is the surface colour, not a light grey: the ring exists to
  // separate the pin from whatever basemap is underneath it, so it has to be the page's own white.
  if (item.detailType === 'ticket') {
    return {
      markerFill: color.bg.primary.default,
      markerStroke: color.bg.neutral.default,
      glyphColor: color.fg.onPrimary,
    };
  }

  // White, not `fg.onSecondary`: on the blue, text stays black (4.5:1) but an icon needs only 3:1, and
  // white measures 3.56:1 (designer, 2026-10-25, `Design/前台/docs/前台視覺對齊.md` item 5).
  return {
    markerFill: color.brand.secondary.default,
    markerStroke: color.bg.neutral.default,
    glyphColor: color.fg.inverse,
  };
}

function buildMarkerGlyphSvg(
  item: RescueMapMarkerItem,
  glyphColor: string,
): string {
  // A station shows its type's icon, at the prototype's 19px in the 36px pin (`site-map.jsx`
  // markerGlyphName): whether it is a shelter or temporary no longer picks one of two drawn shapes.
  // A Lucide icon is drawn in lines, so the colour is its stroke, at Lucide's own width and joins.
  if (item.detailType === 'station') {
    return [
      `<svg x="8.5" y="8.5" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="${glyphColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">`,
      stationTypeGlyphShapes(item.stationMeta?.type),
      '</svg>',
    ].join('');
  }

  if (item.variant === 'urgent-ticket') {
    return [
      `<path d="M16.8 25V20.8L13.2 22.9L12 20.8L15.6 18.8L12 16.7L13.2 14.6L16.8 16.7V12.5H19.2V16.7L22.8 14.6L24 16.7L20.4 18.8L24 20.8L22.8 22.9L19.2 20.8V25H16.8Z" fill="${glyphColor}"/>`,
    ].join('');
  }

  return [
    `<path d="M24.1 25L20.3 21.2L21.8 19.7L25.6 23.5L24.1 25ZM14.5 25L13 23.5L17.8 18.7L16.6 17.5L16.1 18L15.2 17.1V18.5L14.7 19L12.6 16.9L13.1 16.4H14.5L13.6 15.5L16.1 13C16.3 12.8 16.6 12.6 16.8 12.5C17.1 12.4 17.4 12.3 17.7 12.3C18 12.3 18.3 12.4 18.6 12.5C18.8 12.6 19.1 12.8 19.3 13L17.7 14.6L18.6 15.5L18.1 16L19.3 17.2L20.8 15.7C20.8 15.6 20.7 15.4 20.7 15.3C20.6 15.1 20.6 15 20.6 14.8C20.6 14.1 20.8 13.5 21.3 13C21.8 12.5 22.4 12.3 23.1 12.3C23.3 12.3 23.5 12.3 23.6 12.4C23.8 12.4 24 12.5 24.1 12.6L22.4 14.3L23.6 15.5L25.3 13.8C25.4 14 25.4 14.1 25.5 14.3C25.5 14.4 25.6 14.6 25.6 14.8C25.6 15.5 25.3 16.1 24.9 16.6C24.4 17.1 23.8 17.3 23.1 17.3C23 17.3 22.8 17.3 22.7 17.3C22.5 17.2 22.4 17.2 22.2 17.1L14.5 25Z" fill="${glyphColor}"/>`,
  ].join('');
}

function buildMarkerAssetSvg(item: RescueMapMarkerItem): string {
  const tone = getMarkerTone(item);
  const glyphSvg = buildMarkerGlyphSvg(item, tone.glyphColor);

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 36 36" fill="none" aria-hidden="true">',
    `<circle cx="18" cy="18" r="16.5" fill="${tone.markerFill}" stroke="${tone.markerStroke}" stroke-width="2"/>`,
    glyphSvg,
    '</svg>',
  ].join('');
}

function createMapMarkerIconHtml(item: RescueMapMarkerItem): string {
  const assetSvg = buildMarkerAssetSvg(item);
  const safeLabel = escapeHtml(item.label);
  const tone = item.detailType === 'station' ? 'station' : 'ticket';

  return [
    '<div class="map-marker-stack">',
    `<div class="map-marker map-marker--${item.variant} map-marker--${tone}">`,
    `<div class="map-marker__asset map-marker__asset--${item.variant}">${assetSvg}</div>`,
    '</div>',
    `<div class="map-marker__label map-marker__label--${tone}">`,
    `<span class="map-marker__label-text">${safeLabel}</span>`,
    '</div>',
    '</div>',
  ].join('');
}

/**
 * The opt-in teardrop pin (`item.pin`), from the admin station map prototype
 * (`Design/後台/js/admin/station-v2/station-map.jsx` pinHtml). The look lives in `styles.ts`;
 * only the caller's colour is inline.
 */
function createPinIcon(
  pin: NonNullable<RescueMapMarkerItem['pin']>,
  leaflet: typeof import('leaflet'),
): import('leaflet').DivIcon {
  const modifiers = [
    pin.shape === 'square' ? ' map-pin--square' : '',
    pin.selected ? ' map-pin--selected' : '',
    pin.dimmed ? ' map-pin--dimmed' : '',
  ].join('');

  // A space's square carries a building, as the prototype's pinHtml draws it (lucide Building).
  const glyph =
    pin.shape === 'square'
      ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M10 6h4M10 10h4M10 14h4M10 18h4"/></svg>'
      : '';

  return leaflet.divIcon({
    className: 'map-pin-wrapper',
    html: `<span class="map-pin${modifiers}"><span class="map-pin__drop" style="background:${escapeHtml(pin.color)}">${glyph}</span></span>`,
    iconSize: [42, 42],
    iconAnchor: [21, 36],
  });
}

/** Tooltip content for `item.tooltip`; null when the marker has none. */
export function createMapMarkerTooltipHtml(
  item: RescueMapMarkerItem,
): string | null {
  if (!item.tooltip) {
    return null;
  }

  const { title, subtitle } = item.tooltip;

  return [
    `<span class="map-marker-tooltip__title">${escapeHtml(title)}</span>`,
    subtitle
      ? `<span class="map-marker-tooltip__subtitle">${escapeHtml(subtitle)}</span>`
      : '',
  ].join('');
}

export function createMapMarkerIcon(
  item: RescueMapMarkerItem,
  leaflet: typeof import('leaflet'),
): import('leaflet').DivIcon {
  if (item.pin) {
    return createPinIcon(item.pin, leaflet);
  }

  const { iconSize, iconAnchor } = getMapMarkerDimensions(item.variant);

  return leaflet.divIcon({
    className: 'map-marker-wrapper',
    html: createMapMarkerIconHtml(item),
    iconSize,
    iconAnchor,
    popupAnchor: [0, -20],
  });
}
