import { Box } from '@mui/material';
import type { ReactNode } from 'react';

/**
 * Text a screen reader reads and the eye does not see: what a dot or a colour says on its own,
 * such as 未讀 beside a shaded row.
 */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return (
    <Box
      component="span"
      sx={{
        position: 'absolute',
        width: 1,
        height: 1,
        m: '-1px',
        p: 0,
        overflow: 'hidden',
        clip: 'rect(0 0 0 0)',
        whiteSpace: 'nowrap',
        border: 0,
      }}
    >
      {children}
    </Box>
  );
}
