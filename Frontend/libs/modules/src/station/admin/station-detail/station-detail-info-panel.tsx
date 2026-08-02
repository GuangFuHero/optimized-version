'use client';

import { Box, Stack, Typography } from '@mui/material';

import { useStationDetailColorScheme } from './constants';
import { StationContactCard } from './station-contact-card';
import { StationDetailSectionHeading } from './station-detail-primitives';
import { StationResourceGrid } from './station-resource-grid';
import { StationStatusCard } from './station-status-card';
import type {
  StationContactCardProps,
  StationResourceItem,
  StationSummaryProps,
} from './types';

export interface StationDetailInfoPanelProps {
  stationSummary?: StationSummaryProps;
  contactCard?: StationContactCardProps;
  resources?: readonly StationResourceItem[];
}

export function StationDetailInfoPanel({
  stationSummary,
  contactCard,
  resources,
}: StationDetailInfoPanelProps) {
  const stationDetailPalette = useStationDetailColorScheme();

  return (
    <Stack spacing={3} sx={{ width: '100%' }}>
      {stationSummary ? (
        <StationStatusCard
          address={stationSummary.address}
          addressIcon={stationSummary.addressIcon}
          status={stationSummary.status}
        />
      ) : null}

      {contactCard ? (
        <Stack spacing={1} sx={{ width: '100%' }}>
          <StationDetailSectionHeading label="聯絡資料" />
          <StationContactCard {...contactCard} />
        </Stack>
      ) : null}

      {resources?.length ? (
        <Stack spacing={1} sx={{ width: '100%' }}>
          <StationDetailSectionHeading label="可用資源" />
          <StationResourceGrid items={resources} />
        </Stack>
      ) : null}

      {!contactCard && !resources?.length ? (
        <Box
          sx={{
            py: 3,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <Typography
            sx={{
              color: stationDetailPalette.bodyText,
              fontSize: 14,
              lineHeight: '20px',
            }}
          >
            目前沒有可用的站點資訊。
          </Typography>
        </Box>
      ) : null}
    </Stack>
  );
}
