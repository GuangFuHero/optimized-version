import type { RescueMapMarkerItem } from '../../types';

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
  glyphFill: string;
} {
  if (item.detailType === 'ticket') {
    return {
      markerFill: '#E3791E',
      markerStroke: '#E7EFF7',
      glyphFill: '#4C2200',
    };
  }

  return {
    markerFill: '#006493',
    markerStroke: '#E7EFF7',
    glyphFill: '#FFFFFF',
  };
}

function buildMarkerGlyphSvg(
  variant: RescueMapMarkerItem['variant'],
  glyphFill: string,
): string {
  if (variant === 'resource-station') {
    return [
      `<path d="M16.9 22.6H19.1V20.8H20.9V18.6H19.1V16.8H16.9V18.6H15.1V20.8H16.9V22.6Z" fill="${glyphFill}"/>`,
      `<path d="M18 27C16.3 26.6 14.9 25.6 13.8 24.1C12.7 22.6 12.1 20.9 12.1 19.1V14.7L18 12.5L23.9 14.7V19.1C23.9 20.9 23.3 22.6 22.2 24.1C21.1 25.6 19.7 26.6 18 27ZM18 25.5C19.2 25.1 20.3 24.3 21.1 23.1C21.9 21.9 22.3 20.6 22.3 19.1V15.7L18 14.1L13.7 15.7V19.1C13.7 20.6 14.1 21.9 14.9 23.1C15.7 24.3 16.8 25.1 18 25.5Z" fill="${glyphFill}"/>`,
    ].join('');
  }

  if (variant === 'pinned-location') {
    return [
      `<path d="M21.3 13.3H23V15H21.3V21.2L19.3 23.2H16.7L14.7 21.2V15H13V13.3H14.7V11H13.8V9.3H22.2V11H21.3V13.3ZM16.4 15V20.5L17.4 21.5H18.6L19.6 20.5V15H16.4Z" fill="${glyphFill}"/>`,
    ].join('');
  }

  if (variant === 'urgent-ticket') {
    return [
      `<path d="M16.8 25V20.8L13.2 22.9L12 20.8L15.6 18.8L12 16.7L13.2 14.6L16.8 16.7V12.5H19.2V16.7L22.8 14.6L24 16.7L20.4 18.8L24 20.8L22.8 22.9L19.2 20.8V25H16.8Z" fill="${glyphFill}"/>`,
    ].join('');
  }

  return [
    `<path d="M24.1 25L20.3 21.2L21.8 19.7L25.6 23.5L24.1 25ZM14.5 25L13 23.5L17.8 18.7L16.6 17.5L16.1 18L15.2 17.1V18.5L14.7 19L12.6 16.9L13.1 16.4H14.5L13.6 15.5L16.1 13C16.3 12.8 16.6 12.6 16.8 12.5C17.1 12.4 17.4 12.3 17.7 12.3C18 12.3 18.3 12.4 18.6 12.5C18.8 12.6 19.1 12.8 19.3 13L17.7 14.6L18.6 15.5L18.1 16L19.3 17.2L20.8 15.7C20.8 15.6 20.7 15.4 20.7 15.3C20.6 15.1 20.6 15 20.6 14.8C20.6 14.1 20.8 13.5 21.3 13C21.8 12.5 22.4 12.3 23.1 12.3C23.3 12.3 23.5 12.3 23.6 12.4C23.8 12.4 24 12.5 24.1 12.6L22.4 14.3L23.6 15.5L25.3 13.8C25.4 14 25.4 14.1 25.5 14.3C25.5 14.4 25.6 14.6 25.6 14.8C25.6 15.5 25.3 16.1 24.9 16.6C24.4 17.1 23.8 17.3 23.1 17.3C23 17.3 22.8 17.3 22.7 17.3C22.5 17.2 22.4 17.2 22.2 17.1L14.5 25Z" fill="${glyphFill}"/>`,
  ].join('');
}

function buildMarkerAssetSvg(item: RescueMapMarkerItem): string {
  const tone = getMarkerTone(item);
  const glyphSvg = buildMarkerGlyphSvg(item.variant, tone.glyphFill);

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

export function createMapMarkerIcon(
  item: RescueMapMarkerItem,
  leaflet: typeof import('leaflet'),
): import('leaflet').DivIcon {
  const { iconSize, iconAnchor } = getMapMarkerDimensions(item.variant);

  return leaflet.divIcon({
    className: 'map-marker-wrapper',
    html: createMapMarkerIconHtml(item),
    iconSize,
    iconAnchor,
    popupAnchor: [0, -20],
  });
}
