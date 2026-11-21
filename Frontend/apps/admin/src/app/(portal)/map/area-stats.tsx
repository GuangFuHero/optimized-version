import { Box, Typography } from '@mui/material';

import { designTokens } from '@rescue-frontend/ui';
import type { AreaContents } from '@rescue-frontend/modules';

export type AreaCounts = { [Kind in keyof AreaContents]: number | null };

const { color, radius, typography } = designTokens;

export function AreaStats({
  values,
}: {
  values: readonly (readonly [label: string, value: string])[];
}) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 1.5,
        p: 1.75,
        borderRadius: `${radius.md}px`,
        border: `1px solid ${color.border.default}`,
        bgcolor: color.bg.neutral.default,
      }}
    >
      {values.map(([label, value]) => (
        <Box key={label}>
          <Typography
            sx={{
              ...typography.label[300],
              fontWeight: 700,
              color: color.fg.neutral.subtle,
            }}
          >
            {label}
          </Typography>
          <Typography sx={{ ...typography.heading[600] }}>{value}</Typography>
        </Box>
      ))}
    </Box>
  );
}
