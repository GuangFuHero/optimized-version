'use client';

import { Box, Typography } from '@mui/material';

import {
  type StationDetailColorScheme,
  useStationDetailColorScheme,
} from './constants';
import { StationDetailIconSlot } from './station-detail-primitives';
import type { StationSummaryProps } from './types';

export interface StationStatusCardProps {
  address: StationSummaryProps['address'];
  addressIcon?: StationSummaryProps['addressIcon'];
  status: StationSummaryProps['status'];
}

function resolveStatusPalette(
  status: StationStatusCardProps['status'],
  stationDetailPalette: StationDetailColorScheme,
) {
  if (
    status.backgroundColor ||
    status.borderColor ||
    status.dotColor ||
    status.textColor
  ) {
    return {
      backgroundColor:
        status.backgroundColor ?? stationDetailPalette.activeStatusBackground,
      borderColor:
        status.borderColor ?? stationDetailPalette.activeStatusBorder,
      dotColor: status.dotColor ?? stationDetailPalette.activeStatusDot,
      textColor: status.textColor ?? stationDetailPalette.activeStatusText,
    };
  }

  switch (status.tone) {
    case 'warning':
      return {
        backgroundColor: stationDetailPalette.warningStatusBackground,
        borderColor: stationDetailPalette.warningStatusBorder,
        dotColor: stationDetailPalette.warningStatusDot,
        textColor: stationDetailPalette.warningStatusText,
      };
    case 'inactive':
      return {
        backgroundColor: stationDetailPalette.inactiveStatusBackground,
        borderColor: stationDetailPalette.inactiveStatusBorder,
        dotColor: stationDetailPalette.inactiveStatusDot,
        textColor: stationDetailPalette.inactiveStatusText,
      };
    case 'active':
    default:
      return {
        backgroundColor: stationDetailPalette.activeStatusBackground,
        borderColor: stationDetailPalette.activeStatusBorder,
        dotColor: stationDetailPalette.activeStatusDot,
        textColor: stationDetailPalette.activeStatusText,
      };
  }
}

export function StationStatusCard({
  address,
  addressIcon,
  status,
}: StationStatusCardProps) {
  const stationDetailPalette = useStationDetailColorScheme();
  const statusPalette = resolveStatusPalette(status, stationDetailPalette);

  return (
    <Box
      sx={{
        width: '100%',
        p: '17px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 1.5,
        borderRadius: '32px',
        bgcolor: stationDetailPalette.cardSurface,
        border: `1px solid ${stationDetailPalette.cardBorder}`,
        boxShadow: '0px 1px 1px rgba(0, 0, 0, 0.05)',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          minWidth: 0,
          columnGap: '4px',
        }}
      >
        <StationDetailIconSlot
          icon={addressIcon}
          width="10.667px"
          height="13.333px"
          color={stationDetailPalette.bodyText}
        />
        <Typography
          sx={{
            color: stationDetailPalette.bodyText,
            fontSize: 14,
            lineHeight: '20px',
            fontWeight: 400,
            minWidth: 0,
          }}
        >
          {address}
        </Typography>
      </Box>

      <Box
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          px: '9px',
          py: '5px',
          borderRadius: '999px',
          flexShrink: 0,
          bgcolor: statusPalette.backgroundColor,
          border: `1px solid ${statusPalette.borderColor}`,
        }}
      >
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: '999px',
            bgcolor: statusPalette.dotColor,
            flexShrink: 0,
          }}
        />
        <Typography
          sx={{
            color: statusPalette.textColor,
            fontSize: 10,
            lineHeight: '12px',
            fontWeight: 700,
            letterSpacing: '0.8px',
            textTransform: 'uppercase',
          }}
        >
          {status.label}
        </Typography>
      </Box>
    </Box>
  );
}
