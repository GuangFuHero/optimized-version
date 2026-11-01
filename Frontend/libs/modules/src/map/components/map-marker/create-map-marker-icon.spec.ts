import { MapPin, type LucideIcon } from 'lucide-react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { designTokens } from '@rescue-frontend/ui';

import {
  getStationTypeLucideIcon,
  STATION_TYPE_LUCIDE_ICONS,
} from '../../../station/station-type-icon';
import { STATION_TYPE_OPTIONS } from '../../../station/type-options';
import type { RescueMapMarkerItem } from '../../types';
import { createMapMarkerIcon } from './create-map-marker-icon';

const { color } = designTokens;

// Leaflet only wraps the HTML it is handed, so the test reads that back.
const leaflet = {
  divIcon: (options: unknown) => options,
} as unknown as typeof import('leaflet');

function pinHtml(item: Partial<RescueMapMarkerItem>): string {
  const marker: RescueMapMarkerItem = {
    id: 'marker-1',
    title: '光復國小物資發放站',
    subtitle: '',
    position: [23.67, 121.43],
    label: '物資',
    variant: 'resource-station',
    detailType: 'station',
    ...item,
  };

  return (createMapMarkerIcon(marker, leaflet) as unknown as { html: string })
    .html;
}

/** An icon's first shape as Lucide draws it: what the list row shows for the type. */
function firstShape(icon: LucideIcon): string {
  const shape =
    /<(?:path|circle|rect|line|polyline|polygon|ellipse)\b[^>]*>/.exec(
      renderToStaticMarkup(createElement(icon)),
    )?.[0];

  if (!shape) {
    throw new Error('every station type icon draws at least one shape');
  }

  return shape;
}

describe('a station pin', () => {
  it("shows its type's own icon, the one the list row shows", () => {
    for (const { value } of STATION_TYPE_OPTIONS) {
      expect(pinHtml({ stationMeta: { type: value } })).toContain(
        firstShape(STATION_TYPE_LUCIDE_ICONS[value]),
      );
    }
  });

  it('draws the icon white on the blue (designer, 2026-10-25), in lines', () => {
    expect(pinHtml({ stationMeta: { type: 'water' } })).toContain(
      `fill="none" stroke="${color.fg.inverse}" stroke-width="2"`,
    );
  });

  it('draws a pin for a type it does not know, not the supply box', () => {
    expect(getStationTypeLucideIcon('evacuation')).toBe(MapPin);
    expect(pinHtml({ stationMeta: { type: 'evacuation' } })).toContain(
      firstShape(MapPin),
    );
  });

  it('reads the type as the list does, and falls back to its icon for one it does not know', () => {
    expect(pinHtml({ stationMeta: { type: ' Water ' } })).toContain(
      firstShape(STATION_TYPE_LUCIDE_ICONS.water),
    );
    expect(pinHtml({ stationMeta: { type: 'evacuation' } })).toContain(
      firstShape(getStationTypeLucideIcon('evacuation')),
    );
    expect(pinHtml({})).toContain(firstShape(getStationTypeLucideIcon(null)));
  });

  it('gives a shelter and a temporary station their type icons too, not one shape between them', () => {
    expect(
      pinHtml({ variant: 'pinned-location', stationMeta: { type: 'shelter' } }),
    ).toContain(firstShape(STATION_TYPE_LUCIDE_ICONS.shelter));
    expect(
      pinHtml({
        variant: 'pinned-location',
        stationMeta: { type: 'water', isTemporary: true },
      }),
    ).toContain(firstShape(STATION_TYPE_LUCIDE_ICONS.water));
  });

  it("carries only the icon's shapes, none of MUI's classes or styles", () => {
    const html = pinHtml({ stationMeta: { type: 'medical' } });

    expect(html).not.toContain('Mui');
    expect(html).not.toContain('<style');
  });
});

describe('a ticket pin', () => {
  it('keeps its black glyph on the orange', () => {
    const html = pinHtml({ detailType: 'ticket', variant: 'urgent-ticket' });

    expect(html).toContain(`fill="${color.bg.primary.default}"`);
    expect(html).toContain(`fill="${color.fg.onPrimary}"`);
    expect(html).not.toContain(`fill="${color.fg.inverse}"`);
  });
});

describe('a teardrop pin (`pin`)', () => {
  const pin = { color: '#BA1A1A' };

  it('is a teardrop unless asked for a square', () => {
    const html = pinHtml({ pin });

    expect(html).toContain('class="map-pin"');
    expect(html).not.toContain('map-pin--square');
  });

  it('is square for a space, with a building drawn in it (designer: only a space is square)', () => {
    const html = pinHtml({ pin: { ...pin, shape: 'square' } });

    expect(html).toContain('class="map-pin map-pin--square"');
    expect(html).toContain('<svg');
    expect(pinHtml({ pin })).not.toContain('<svg');
  });

  it('escapes the colour it is handed', () => {
    expect(pinHtml({ pin: { color: '"><b>&' } })).not.toContain('"><b>');
  });
});
