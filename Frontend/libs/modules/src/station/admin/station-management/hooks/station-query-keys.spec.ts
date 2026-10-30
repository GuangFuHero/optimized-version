import {
  allStationsQuery,
  stationAnalyticsDataQuery,
} from '@rescue-frontend/data-access/admin';
import { describe, expect, it } from 'vitest';

describe('station status counts query', () => {
  it('sits under the key every station mutation invalidates', () => {
    const { queryKey } = stationAnalyticsDataQuery({
      query: { y: 'station_status_count', x: 'category' },
    });
    expect(queryKey.slice(0, 2)).toEqual(['admin', 'stations']);
  });
});

describe('all stations query', () => {
  it('sits under the key every station mutation invalidates', () => {
    const { queryKey } = allStationsQuery({ hasPendingSuggestions: true });
    expect(queryKey.slice(0, 2)).toEqual(['admin', 'stations']);
  });
});
