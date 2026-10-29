import { describe, expect, it } from 'vitest';

import {
  activeFilterCount,
  DEFAULT_ADMIN_MAP_FILTERS,
  filterMarkers,
  isFiltering,
  toggleValue,
  type AdminMapFilters,
} from './map-filter';
import type { RescueMapMarkerItem } from '../types';

function ticket(
  id: string,
  priority: string,
  status: string,
): RescueMapMarkerItem {
  return {
    id,
    title: id,
    subtitle: '',
    position: [0, 0],
    label: id,
    variant: 'urgent-ticket',
    detailType: 'ticket',
    ticketMeta: { priority, status },
  };
}

function station(id: string, type: string): RescueMapMarkerItem {
  return {
    id,
    title: id,
    subtitle: '',
    position: [0, 0],
    label: id,
    variant: 'resource-station',
    detailType: 'station',
    stationMeta: { type },
  };
}

const MARKERS = [
  ticket('t-critical', 'critical', 'pending'),
  ticket('t-low', 'low', 'in_progress'),
  ticket('t-done', 'medium', 'completed'),
  station('s-water', 'water'),
  station('s-shelter', 'Shelter '),
];
const ids = (filters: AdminMapFilters) =>
  filterMarkers(MARKERS, filters).map((marker) => marker.id);

describe('filterMarkers', () => {
  it('lets everything through by default', () => {
    expect(ids(DEFAULT_ADMIN_MAP_FILTERS)).toHaveLength(5);
  });

  it('narrows tickets to the priorities picked, and leaves the stations alone', () => {
    expect(
      ids({ ...DEFAULT_ADMIN_MAP_FILTERS, priorities: ['critical', 'low'] }),
    ).toEqual(['t-critical', 't-low', 's-water', 's-shelter']);
  });

  it('narrows tickets to the statuses picked', () => {
    expect(
      ids({ ...DEFAULT_ADMIN_MAP_FILTERS, statuses: ['completed'] }),
    ).toEqual(['t-done', 's-water', 's-shelter']);
  });

  it('narrows stations to the types picked, however the type is written', () => {
    expect(
      ids({ ...DEFAULT_ADMIN_MAP_FILTERS, stationTypes: ['shelter'] }),
    ).toEqual(['t-critical', 't-low', 't-done', 's-shelter']);
  });

  it('hides a whole layer', () => {
    expect(
      ids({
        ...DEFAULT_ADMIN_MAP_FILTERS,
        layers: { tickets: false, stations: true, areas: true },
      }),
    ).toEqual(['s-water', 's-shelter']);
    expect(
      ids({
        ...DEFAULT_ADMIN_MAP_FILTERS,
        layers: { tickets: true, stations: false, areas: true },
      }),
    ).toEqual(['t-critical', 't-low', 't-done']);
  });
});

describe('toggleValue', () => {
  it('adds a value that is not there, and takes one that is', () => {
    expect(toggleValue(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleValue(['a', 'b'], 'a')).toEqual(['b']);
  });
});

describe('activeFilterCount and isFiltering', () => {
  it('count the picks, and a layer turned off counts as filtering', () => {
    expect(activeFilterCount(DEFAULT_ADMIN_MAP_FILTERS)).toBe(0);
    expect(isFiltering(DEFAULT_ADMIN_MAP_FILTERS)).toBe(false);
    expect(
      activeFilterCount({
        ...DEFAULT_ADMIN_MAP_FILTERS,
        priorities: ['low'],
        statuses: ['pending', 'completed'],
      }),
    ).toBe(3);
    expect(
      isFiltering({
        ...DEFAULT_ADMIN_MAP_FILTERS,
        layers: { tickets: true, stations: true, areas: false },
      }),
    ).toBe(true);
  });
});
