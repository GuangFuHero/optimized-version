import { describe, expect, it } from 'vitest';

import type { BuildingMapEntry } from '../../building/use-building-maps';
import type { RescueMapMarkerItem } from '../types';
import {
  buildingOfMarker,
  pinnedBesideBuildings,
  toBuildingMarker,
} from './building-markers';

const building: BuildingMapEntry = {
  uuid: 'building-1',
  name: '大進國宅 A 棟',
  address: '光復鄉大進村大進路 12 號',
  point: [23.67, 121.43],
  floors: [{ label: '2F' }, { label: '1F' }],
};

function ticket(id: string, buildingMapUuid: string | null) {
  return {
    id,
    title: id,
    subtitle: '',
    position: [23.67, 121.43],
    label: '待媒合',
    variant: 'urgent-ticket',
    detailType: 'ticket',
    ticketMeta: { buildingMapUuid },
  } satisfies RescueMapMarkerItem;
}

describe('toBuildingMarker', () => {
  it('draws a building at its point, named, standing for the building and not for a ticket', () => {
    const marker = toBuildingMarker(building);

    expect(marker).toMatchObject({
      title: '大進國宅 A 棟',
      subtitle: '光復鄉大進村大進路 12 號',
      label: '大進國宅 A 棟',
      position: [23.67, 121.43],
      building: { uuid: 'building-1' },
    });
    expect(marker && buildingOfMarker(marker)).toBe('building-1');
  });

  it('never takes a ticket’s or a location cell’s id', () => {
    const id = toBuildingMarker(building)?.id ?? '';

    expect(id).not.toBe('building-1');
    expect(id.startsWith('cell:')).toBe(false);
  });

  it('draws nothing for a building with no point', () => {
    expect(toBuildingMarker({ ...building, point: null })).toBeNull();
  });
});

describe('buildingOfMarker', () => {
  it('is null for a ticket or a station', () => {
    expect(buildingOfMarker(ticket('ticket-1', 'building-1'))).toBeNull();
  });
});

describe('pinnedBesideBuildings', () => {
  const drawn = new Set(['building-1']);

  it('leaves out a ticket whose building is drawn: the building stands for it', () => {
    expect(
      pinnedBesideBuildings(
        [ticket('in-it', 'building-1'), ticket('alone', null)],
        drawn,
      ).map((marker) => marker.id),
    ).toEqual(['alone']);
  });

  it('keeps one whose building is not drawn, so it never drops off the map', () => {
    expect(
      pinnedBesideBuildings([ticket('elsewhere', 'building-2')], drawn).map(
        (marker) => marker.id,
      ),
    ).toEqual(['elsewhere']);
  });

  it('keeps the one open, whose drawer reads it from the map', () => {
    expect(
      pinnedBesideBuildings(
        [ticket('in-it', 'building-1'), ticket('open', 'building-1')],
        drawn,
        'open',
      ).map((marker) => marker.id),
    ).toEqual(['open']);
  });
});
