import { describe, expect, it } from 'vitest';

import { normalizeLayerPreferences } from './use-rescue-map-controller';

describe('normalizeLayerPreferences', () => {
  it('turns on 責任區與標示區 for preferences saved before it existed', () => {
    expect(
      normalizeLayerPreferences({
        baseLayer: 'carto',
        enabledOverlayLayers: ['closure-areas'],
      }),
    ).toEqual({
      baseLayer: 'carto',
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
