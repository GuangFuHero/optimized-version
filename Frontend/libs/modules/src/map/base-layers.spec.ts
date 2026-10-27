import { describe, expect, it } from 'vitest';

import { SITE_BASE_LAYERS } from '../route/constants';
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
