import { describe, expect, it } from 'vitest';

import { SITE_BASE_LAYERS } from '../route/constants';
import { parseSiteRouteState } from '../route/parse';
import {
  DEFAULT_BASE_LAYER,
  DEFAULT_TILE_ORIGIN,
  isSelectableBaseLayer,
  tileOriginOf,
} from './constants';

describe('tileOriginOf', () => {
  it("gives a direct layer's tile server, and nothing for a layer the backend proxies", () => {
    expect(tileOriginOf('osm-direct')).toBe('https://tile.openstreetmap.org');
    expect(tileOriginOf('osm')).toBeNull();
    expect(tileOriginOf('sinica')).toBeNull();
  });

  it('connects ahead to the tile server of the layer a map opens on', () => {
    expect(DEFAULT_TILE_ORIGIN).toBe(tileOriginOf(DEFAULT_BASE_LAYER));
  });
});

describe('isSelectableBaseLayer', () => {
  it('turns away an unavailable layer, a hidden one and an unknown name', () => {
    expect(isSelectableBaseLayer('carto')).toBe(false);
    expect(isSelectableBaseLayer('sinica')).toBe(false);
    expect(isSelectableBaseLayer('toString')).toBe(false);
    expect(isSelectableBaseLayer('nasa_gibs')).toBe(true);
  });

  it('accepts every base layer a site link may carry', () => {
    expect(
      SITE_BASE_LAYERS.filter((layer) => !isSelectableBaseLayer(layer)),
    ).toEqual([]);
  });
});

describe('parseSiteRouteState', () => {
  it('opens a link to the unavailable CARTO layer on the viewer’s own layer', () => {
    const state = parseSiteRouteState(
      'map',
      ['carto', 'ticket'],
      new URLSearchParams(),
    );

    expect(state.baseLayer).toBeUndefined();
    expect(state.dataType).toBe('ticket');
  });
});
