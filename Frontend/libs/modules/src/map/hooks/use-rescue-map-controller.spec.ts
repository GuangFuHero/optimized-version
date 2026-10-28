import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  normalizeLayerPreferences,
  readLayerPreferences,
  writeLayerPreferences,
} from './use-rescue-map-controller';

describe('layer preferences where the browser blocks site data', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Blocking site data makes the browser throw on any touch of `window.localStorage`.
  function blockSiteData() {
    vi.stubGlobal('window', {
      get localStorage(): Storage {
        throw new Error('SecurityError: access is denied for this document');
      },
    });
  }

  it('reads no preferred layer, so the map falls back to its default', () => {
    blockSiteData();

    expect(readLayerPreferences().baseLayer).toBeUndefined();
  });

  it('saves a picked layer nowhere, without failing', () => {
    blockSiteData();

    expect(() =>
      writeLayerPreferences(normalizeLayerPreferences({ baseLayer: 'nlsc' })),
    ).not.toThrow();
  });
});

describe('normalizeLayerPreferences', () => {
  it('turns on 責任區與標示區 for preferences saved before it existed', () => {
    expect(
      normalizeLayerPreferences({
        baseLayer: 'osm',
        enabledOverlayLayers: ['closure-areas'],
      }),
    ).toEqual({
      baseLayer: 'osm',
      enabledOverlayLayers: ['closure-areas', 'public-zones'],
      knownOverlayLayers: [
        'closure-areas',
        'public-zones',
        'routes',
        'secondary-locations',
      ],
    });
    // Saved with 封閉區域 turned off: that choice stands.
    expect(
      normalizeLayerPreferences({ enabledOverlayLayers: [] })
        .enabledOverlayLayers,
    ).toEqual(['public-zones']);
  });

  it('keeps it off for someone who turned it off', () => {
    const turnedOff = normalizeLayerPreferences({
      enabledOverlayLayers: ['closure-areas'],
      knownOverlayLayers: [
        'closure-areas',
        'public-zones',
        'routes',
        'secondary-locations',
      ],
    });

    expect(turnedOff.enabledOverlayLayers).toEqual(['closure-areas']);
    // Read again after it was written, as on the next visit.
    expect(
      normalizeLayerPreferences(JSON.parse(JSON.stringify(turnedOff)))
        .enabledOverlayLayers,
    ).toEqual(['closure-areas']);
  });
});
