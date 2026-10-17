import { Megaphone } from 'lucide-react';
import { Box } from '@mui/material';
import type { ReactNode } from 'react';

import { designTokens } from '../../theme';

const { color, typography } = designTokens;

export function AnnouncementBanner({
  children,
  announce = true,
}: {
  children: ReactNode;
  announce?: boolean;
}) {
  return (
    <Box
      role={announce ? 'alert' : undefined}
      aria-live={announce ? 'assertive' : 'off'}
      sx={{
        display: 'flex',
        flexShrink: 0,
        alignItems: 'center',
        gap: '10px',
        height: 40,
        px: '16px',
        bgcolor: color.bg.danger.default,
        color: color.fg.onDanger,
        fontFamily: typography.label[400].fontFamily,
        fontSize: 14,
        fontWeight: 700,
      }}
    >
      <Box
        component={Megaphone}
        sx={{ width: 17, height: 17, flexShrink: 0 }}
      />
      <Box
        component="span"
        sx={{
          flex: 1,
          minWidth: 0,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
