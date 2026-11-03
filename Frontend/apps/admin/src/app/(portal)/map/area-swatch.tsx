import { Box } from '@mui/material';
import type { SxProps, Theme } from '@mui/material';

import {
  PUBLIC_ZONE_COLORS,
  type RescueMapAreaKind,
} from '@rescue-frontend/modules';
import { designTokens } from '@rescue-frontend/ui';

const { color } = designTokens;

/**
 * The colour chip of an area's kind: the orange and white stripes of a 危險區, the only stripes on the
 * map, or the flat colour of a 責任區 or 標示區. One chip for the list, the form and the legend.
 */
export function AreaSwatch({
  kind,
  size = 14,
  sx,
}: {
  kind: RescueMapAreaKind;
  size?: number;
  sx?: SxProps<Theme>;
}) {
  return (
    <Box
      aria-hidden="true"
      sx={[
        {
          width: size,
          height: size,
          flexShrink: 0,
          borderRadius: '3px',
          ...(kind === 'hazardous_zone'
            ? {
                // The map's own stripes: 45°, 4px a stripe, and the outline of a 危險區 there.
                background: `repeating-linear-gradient(45deg, ${color.bg.warning.default} 0 4px, ${color.bg.neutral.default} 4px 8px)`,
                border: `1px solid ${color.bg.warning.hover}`,
              }
            : { bgcolor: PUBLIC_ZONE_COLORS[kind] }),
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    />
  );
}
