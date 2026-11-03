import { describe, expect, it, vi } from 'vitest';

import type { BuildingMapEntry } from '../../building/use-building-maps';
import { onOpenHelpRequest } from '../../ticket/help-request/open-help-request';
import { floorHelpForOpenBuilding } from './use-site-map-buildings';

function building(overrides: Partial<BuildingMapEntry> = {}): BuildingMapEntry {
  return {
    uuid: 'office',
    name: '光復鄉公所',
    address: '花蓮縣光復鄉中正路二段10號',
    point: [23.6697, 121.4235],
    floors: [{ label: '1F' }, { label: '2F' }, { label: '3F' }],
    ticketCount: null,
    shortfall: null,
    ...overrides,
  };
}

describe('floorHelpForOpenBuilding', () => {
  it('shuts the drawer and opens 請求協助 at the open building, on the floor picked', () => {
    const host = vi.fn();
    const stop = onOpenHelpRequest(host);
    const close = vi.fn();

    floorHelpForOpenBuilding(
      [building({ uuid: 'school', point: [23.6602, 121.4142] }), building()],
      'office',
      close,
    )?.('3F');

    expect(close).toHaveBeenCalledOnce();
    expect(host).toHaveBeenCalledWith(
      expect.objectContaining({
        lat: 23.6697,
        lng: 121.4235,
        place: expect.objectContaining({
          address: '花蓮縣光復鄉中正路二段10號',
          floor: '3F',
        }),
      }),
    );
    stop();
  });

  it('offers nothing while no building is open', () => {
    expect(
      floorHelpForOpenBuilding([building()], null, vi.fn()),
    ).toBeUndefined();
  });

  it('offers nothing for a building with no point, which 請求協助 could not start from', () => {
    expect(
      floorHelpForOpenBuilding([building({ point: null })], 'office', vi.fn()),
    ).toBeUndefined();
  });
});
