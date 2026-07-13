'use client';

import { useTheme } from '@mui/material/styles';

import { getRescueColorScheme } from '@rescue-frontend/ui';

type RescueTheme = Parameters<typeof getRescueColorScheme>[0];

export function getStationListColorScheme(theme: RescueTheme) {
  return getRescueColorScheme(theme).stationList;
}

export type StationListColorScheme = ReturnType<
  typeof getStationListColorScheme
>;

export function useStationListColorScheme() {
  return getStationListColorScheme(useTheme());
}
