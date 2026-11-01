import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { designTokens } from '@rescue-frontend/ui';

import {
  STATION_TYPE_ICONS,
  STATION_TYPE_OPTIONS,
  getStationTypeIcon,
} from '../../../station/type-options';
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

/** An icon's first shape as MUI draws it: what the list row shows for the type. */
function firstShape(icon: ReturnType<typeof getStationTypeIcon>): string {
  const shape = /<path d="([^"]+)"/.exec(
    renderToStaticMarkup(createElement(icon)),
  )?.[1];

  if (!shape) {
    throw new Error('every station type icon draws at least one path');
  }

  return shape;
}

describe('a station pin', () => {
  it("shows its type's own icon, the one the list row shows", () => {
    for (const { value } of STATION_TYPE_OPTIONS) {
      expect(pinHtml({ stationMeta: { type: value } })).toContain(
        firstShape(STATION_TYPE_ICONS[value]),
      );
    }
  });

  it('draws the icon white on the blue (designer, 2026-10-25)', () => {
    expect(pinHtml({ stationMeta: { type: 'water' } })).toContain(
      `fill="${color.fg.inverse}"`,
    );
  });

  it('reads the type as the list does, and falls back to its icon for one it does not know', () => {
    expect(pinHtml({ stationMeta: { type: ' Water ' } })).toContain(
      firstShape(STATION_TYPE_ICONS.water),
    );
    expect(pinHtml({ stationMeta: { type: 'evacuation' } })).toContain(
      firstShape(getStationTypeIcon('evacuation')),
    );
    expect(pinHtml({})).toContain(firstShape(getStationTypeIcon(null)));
  });

  it('gives a shelter and a temporary station their type icons too, not one shape between them', () => {
    expect(
      pinHtml({ variant: 'pinned-location', stationMeta: { type: 'shelter' } }),
    ).toContain(firstShape(STATION_TYPE_ICONS.shelter));
    expect(
      pinHtml({
        variant: 'pinned-location',
        stationMeta: { type: 'water', isTemporary: true },
      }),
    ).toContain(firstShape(STATION_TYPE_ICONS.water));
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

describe("a building's entry (`building`)", () => {
  function entry(ticketCount: number | null, shortfall: number | null) {
    const options = createMapMarkerIcon(
      {
        id: 'building:b-1',
        title: '大進國小',
        subtitle: '',
        position: [23.67, 121.43],
        label: '大進國小',
        variant: 'in-progress',
        detailType: 'ticket',
        building: { uuid: 'b-1', ticketCount, shortfall },
      },
      leaflet,
    ) as unknown as { html: string; iconAnchor: [number, number] };

    return { html: options.html, anchor: options.iconAnchor };
  }

  it('says its tickets, and on red what they are still short', () => {
    const { html } = entry(7, 3);

    expect(html).toContain('<span class="map-building__count">7 件</span>');
    expect(html).toContain('<span class="map-building__short">缺 3</span>');
    expect(html).not.toContain('看各樓層');
  });

  it('says only the tickets when none is short of people', () => {
    const { html } = entry(2, 0);

    expect(html).toContain('2 件');
    expect(html).not.toContain('缺');
  });

  it('says 看各樓層, never 0 件, for a building with none and to a guest, who is given no counts', () => {
    for (const html of [entry(0, 0).html, entry(null, null).html]) {
      expect(html).toContain('看各樓層');
      expect(html).not.toContain('件');
    }
  });

  it("stands above its point without a count, clear of a guest's cell, and on it with one", () => {
    expect(entry(null, null).anchor).toEqual([70, 72]);
    expect(entry(0, 0).anchor).toEqual([70, 72]);
    expect(entry(7, 3).anchor).toEqual([70, 40]);
  });
});
