'use client';

import { useStationAnalyticsData } from '@rescue-frontend/data-access/admin';

import { parseStatusCounts } from '../model/status-counts';

export function useStationStatusCounts() {
  const query = useStationAnalyticsData({
    query: { y: 'station_status_count', x: 'category', tz: 'Asia/Taipei' },
  });
  return {
    ...query,
    counts: query.data ? parseStatusCounts(query.data) : null,
  };
}
