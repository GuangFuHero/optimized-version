'use client';

import { Box, Stack, Typography } from '@mui/material';

import { useStationDetailColorScheme } from './constants';
import { StationDetailIconSlot } from './station-detail-primitives';
import type { StationContactCardProps } from './types';

export function StationContactCard({
  name,
  role,
  avatarIcon,
  methods,
}: StationContactCardProps) {
  const stationDetailPalette = useStationDetailColorScheme();

  return (
    <Box
      sx={{
        width: '100%',
        p: '17px',
        borderRadius: '32px',
        bgcolor: stationDetailPalette.cardSurface,
        border: `1px solid ${stationDetailPalette.cardBorder}`,
        boxShadow: '0px 1px 1px rgba(0, 0, 0, 0.05)',
      }}
    >
      <Stack spacing={1}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: '999px',
              bgcolor: stationDetailPalette.contactAvatarBackground,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <StationDetailIconSlot
              icon={avatarIcon}
              width={16}
              height={16}
              color={stationDetailPalette.heading}
            />
          </Box>

          <Box sx={{ minWidth: 0 }}>
            <Typography
              sx={{
                color: stationDetailPalette.heading,
                fontSize: 14,
                lineHeight: '16px',
                fontWeight: 600,
                letterSpacing: '0.7px',
              }}
            >
              {name}
            </Typography>
            <Typography
              sx={{
                color: stationDetailPalette.bodyText,
                fontSize: 14,
                lineHeight: '20px',
                fontWeight: 400,
              }}
            >
              {role}
            </Typography>
          </Box>
        </Box>

        <Stack
          sx={{
            rowGap: '3.5px',
            pt: '9px',
            borderTop: `1px solid ${stationDetailPalette.cardDivider}`,
          }}
        >
          {methods.map((method) => (
            <Box
              key={method.id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <StationDetailIconSlot
                icon={method.icon}
                width={14}
                height={14}
                color={stationDetailPalette.heading}
              />
              <Typography
                sx={{
                  color: stationDetailPalette.heading,
                  fontSize: 14,
                  lineHeight: '20px',
                  fontWeight: 400,
                }}
              >
                {method.value}
              </Typography>
            </Box>
          ))}
        </Stack>
      </Stack>
    </Box>
  );
}
