'use client';

import { useTheme } from '@mui/material/styles';

import { getRescueColorScheme } from '@rescue-frontend/ui';

type RescueTheme = Parameters<typeof getRescueColorScheme>[0];

export function getStationDetailColorScheme(theme: RescueTheme) {
  return getRescueColorScheme(theme).stationDetail;
}

export type StationDetailColorScheme = ReturnType<
  typeof getStationDetailColorScheme
>;

export function useStationDetailColorScheme() {
  return getStationDetailColorScheme(useTheme());
}

export const stationDetailDimensions = {
  width: 400,
  minHeight: 1024,
  tabRowHeight: 76,
} as const;
