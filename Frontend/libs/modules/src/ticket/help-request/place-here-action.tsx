'use client';

import AddLocationAltRoundedIcon from '@mui/icons-material/AddLocationAltRounded';
import OpenWithRoundedIcon from '@mui/icons-material/OpenWithRounded';
import { Box, ButtonBase, Typography } from '@mui/material';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

import { openHelpRequest, type HelpRequestSeed } from './open-help-request';

const { color, radius, shadow } = designTokens;

interface PlaceHereActionProps {
  /** Where the crosshair stands. */
  point: HelpRequestSeed;
  /** The point has been taken up: let the crosshair go. */
  onPlaced: () => void;
}

/**
 * Above the crosshair of a point picked on the map: 在這裡新增 opens 請求協助 there, the drawer's
 * map starting from the point rather than the device's location (prototype
 * `site-map.jsx:1046-1077`, spec Q4/Q6). Guests see it too: they are stopped before sending, not
 * before starting.
 */
export function PlaceHereAction({ point, onPlaced }: PlaceHereActionProps) {
  return (
    <Box
      sx={{
        // Laid out from the point: centred over it, clear of the 44px crosshair.
        position: 'absolute',
        left: 0,
        top: 0,
        transform: 'translate(-50%, calc(-100% - 30px))',
        display: 'grid',
        justifyItems: 'center',
        gap: 0.5,
      }}
    >
      {/* Said, or nobody grabs it: the crosshair looks like a decoration (designer). */}
      <Box
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.5,
          px: 1,
          py: 0.25,
          borderRadius: `${radius.full}px`,
          bgcolor: color.bg.neutral.default,
          boxShadow: shadow.sm,
          color: color.fg.neutral.subtle,
          whiteSpace: 'nowrap',
        }}
      >
        <OpenWithRoundedIcon sx={{ fontSize: 12 }} />
        <Typography
          component="span"
          sx={{ fontSize: displayTextSize[11], lineHeight: 1.5 }}
        >
          可拖曳準心調整位置
        </Typography>
      </Box>
      <ButtonBase
        onClick={() => {
          openHelpRequest(point);
          onPlaced();
        }}
        sx={{
          gap: 0.75,
          height: 36,
          px: 2,
          borderRadius: `${radius.full}px`,
          bgcolor: color.bg.primary.default,
          color: color.fg.onPrimary,
          boxShadow: shadow.lg,
          fontSize: displayTextSize[13],
          fontWeight: 700,
          whiteSpace: 'nowrap',
          '&:hover': { bgcolor: color.bg.primary.hover },
        }}
      >
        <AddLocationAltRoundedIcon sx={{ fontSize: 16 }} />
        在這裡新增
      </ButtonBase>
    </Box>
  );
}
