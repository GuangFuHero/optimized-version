'use client';

import { Box, ButtonBase, Typography } from '@mui/material';

import { Icons } from '@rescue-frontend/ui';

import { useStationDetailColorScheme } from './constants';
import { StationDetailIconSlot } from './station-detail-primitives';
import type {
  StationDetailCloseActionProps,
  StationSummaryProps,
} from './types';

export interface StationDetailHeaderProps {
  stationSummary: StationSummaryProps;
  closeAction?: StationDetailCloseActionProps;
}

const CloseIcon = Icons.close;

export function StationDetailHeader({
  stationSummary,
  closeAction,
}: StationDetailHeaderProps) {
  const stationDetailPalette = useStationDetailColorScheme();

  return (
    <Box
      sx={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 2,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          minWidth: 0,
        }}
      >
        <StationDetailIconSlot
          icon={stationSummary.stationIcon}
          width={20}
          height={20}
          color={stationDetailPalette.heading}
        />
        <Typography
          sx={{
            color: stationDetailPalette.heading,
            fontSize: 14,
            lineHeight: '16px',
            fontWeight: 600,
            letterSpacing: '1.4px',
            textTransform: 'uppercase',
          }}
        >
          {stationSummary.stationCode}
        </Typography>
      </Box>

      {closeAction ? (
        <ButtonBase
          disableRipple
          aria-label={closeAction.ariaLabel ?? '關閉站點詳情'}
          onClick={closeAction.onClick}
          sx={{
            width: 40,
            height: 40,
            borderRadius: '999px',
            color: stationDetailPalette.heading,
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <StationDetailIconSlot
            icon={closeAction.icon ?? <CloseIcon />}
            width={16}
            height={16}
            color={stationDetailPalette.heading}
          />
        </ButtonBase>
      ) : null}
    </Box>
  );
}
