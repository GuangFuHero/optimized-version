'use client';

import { Box, Stack, Typography } from '@mui/material';

import { displayTextSize } from '@rescue-frontend/ui';

import type { SupplyStatusLine } from '../../supply-status';
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
  supplyStatus?: SupplyStatusLine | null;
}

export function StationDetailInfoPanel({
  stationSummary,
  contactCard,
  resources,
  supplyStatus,
}: StationDetailInfoPanelProps) {
  const stationDetailPalette = useStationDetailColorScheme();

  return (
    <Stack spacing={3} sx={{ width: '100%' }}>
      {stationSummary ? (
        <StationStatusCard
          address={stationSummary.address}
          addressIcon={stationSummary.addressIcon}
          status={stationSummary.status}
          statusDetail={stationSummary.statusDetail}
          badges={stationSummary.badges}
        />
      ) : null}

      {/* Right under whether it is open: what it is short of is the next thing someone going asks. */}
      {supplyStatus ? (
        <Stack spacing={1} sx={{ width: '100%' }}>
          <StationDetailSectionHeading label="物資狀況" />
          <Box
            sx={{
              px: 2.5,
              py: 2,
              borderRadius: '32px',
              bgcolor: stationDetailPalette.cardSurface,
              border: `1px solid ${stationDetailPalette.cardBorder}`,
            }}
          >
            <Typography
              sx={{
                color: stationDetailPalette.heading,
                fontSize: displayTextSize[14],
                lineHeight: '20px',
                whiteSpace: 'pre-line',
                overflowWrap: 'anywhere',
              }}
            >
              {supplyStatus.text}
            </Typography>
            {supplyStatus.updated ? (
              <Typography
                sx={{
                  mt: 0.5,
                  color: stationDetailPalette.bodyText,
                  fontSize: displayTextSize[12],
                  lineHeight: '16px',
                }}
              >
                {supplyStatus.updated}
              </Typography>
            ) : null}
          </Box>
        </Stack>
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
              fontSize: displayTextSize[14],
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
