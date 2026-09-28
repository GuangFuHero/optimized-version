import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import { Box } from '@mui/material';
import type { ReactNode } from 'react';

import { designTokens } from '../../theme';

const { color, typography } = designTokens;

export function AnnouncementBanner({ children }: { children: ReactNode }) {
  return (
    <Box
      role="alert"
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
      <CampaignOutlinedIcon sx={{ fontSize: 17, flexShrink: 0 }} />
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
