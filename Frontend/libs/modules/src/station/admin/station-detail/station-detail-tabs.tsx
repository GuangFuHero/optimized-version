'use client';

import { Box, ButtonBase, Typography } from '@mui/material';

import {
  stationDetailDimensions,
  useStationDetailColorScheme,
} from './constants';
import { StationDetailIconSlot } from './station-detail-primitives';
import type { StationDetailTabId, StationDetailTabItem } from './types';

export interface StationDetailTabsProps {
  items: readonly StationDetailTabItem[];
  activeTab: StationDetailTabId;
  onTabChange?: (tabId: StationDetailTabId) => void;
}

export function StationDetailTabs({
  items,
  activeTab,
  onTabChange,
}: StationDetailTabsProps) {
  const stationDetailPalette = useStationDetailColorScheme();

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
        height: stationDetailDimensions.tabRowHeight,
        bgcolor: stationDetailPalette.tabSurface,
        borderTop: `1px solid ${stationDetailPalette.border}`,
        borderBottom: `1px solid ${stationDetailPalette.border}`,
      }}
    >
      {items.map((item) => {
        const active = item.id === activeTab;

        return (
          <ButtonBase
            key={item.id}
            disableRipple
            onClick={() => {
              onTabChange?.(item.id);
            }}
            sx={{
              minWidth: 0,
              px: 1.5,
              pt: 1.25,
              pb: item.badgeCount ? 1.5 : 1.75,
              bgcolor: active
                ? stationDetailPalette.tabActiveSurface
                : 'transparent',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              boxShadow: active
                ? `inset 0 -3px 0 0 ${stationDetailPalette.tabActiveAccent}`
                : 'none',
            }}
          >
            <Box sx={{ position: 'relative', display: 'inline-flex' }}>
              <StationDetailIconSlot
                icon={item.icon}
                width={item.id === 'info' ? 20 : 18}
                height={item.id === 'pendingCorrections' ? 16 : 18}
                color={
                  active
                    ? stationDetailPalette.tabActiveText
                    : stationDetailPalette.tabInactiveText
                }
              />
              {item.badgeCount ? (
                <Box
                  sx={{
                    position: 'absolute',
                    top: -5,
                    right: -8,
                    minWidth: 16,
                    height: 17,
                    px: '3px',
                    borderRadius: '999px',
                    bgcolor: stationDetailPalette.pendingBadgeBackground,
                    border: `1px solid ${stationDetailPalette.pendingBadgeBorder}`,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Typography
                    sx={{
                      color: stationDetailPalette.pendingBadgeText,
                      fontSize: 10,
                      lineHeight: '15px',
                      fontWeight: 700,
                    }}
                  >
                    {item.badgeCount}
                  </Typography>
                </Box>
              ) : null}
            </Box>

            <Typography
              sx={{
                color: active
                  ? stationDetailPalette.tabActiveText
                  : stationDetailPalette.tabInactiveText,
                fontSize: 12,
                lineHeight: item.badgeCount ? '15px' : '16px',
                fontWeight: 600,
                letterSpacing: '0.6px',
                textAlign: 'center',
                whiteSpace: 'pre-line',
              }}
            >
              {item.label}
            </Typography>
          </ButtonBase>
        );
      })}
    </Box>
  );
}
