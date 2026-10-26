import { describe, expect, it } from 'vitest';

import { SITE_BASE_LAYERS, SITE_FALLBACK_BASE_LAYER } from '../route/constants';
import { parseSiteRouteState } from '../route/parse';
import { isSelectableBaseLayer } from './constants';

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
  it('sends a link to the unavailable CARTO layer to the fallback layer', () => {
    const state = parseSiteRouteState(
      'map',
      ['carto', 'station'],
      new URLSearchParams(),
    );

    expect(state.baseLayer).toBe(SITE_FALLBACK_BASE_LAYER);
  });
});
