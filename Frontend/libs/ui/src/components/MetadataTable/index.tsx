import { Box, Stack } from '@mui/material';
import type { ReactNode } from 'react';

import { designTokens } from '../../theme';

const { color, typography } = designTokens;

export interface MetadataRow {
  label: ReactNode;
  value?: ReactNode;
  note?: ReactNode;
}

export type MetadataTableLayout = 'grid' | 'split' | 'stacked';

export interface MetadataTableProps {
  rows: readonly MetadataRow[];
  layout?: MetadataTableLayout;
  divided?: boolean;
  labelWidth?: number;
  emptyText?: ReactNode;
}

export function MetadataTable({
  rows,
  layout = 'grid',
  divided = false,
  labelWidth = 104,
  emptyText = '—',
}: MetadataTableProps) {
  return (
    <Box
      component="dl"
      sx={{
        m: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: divided ? 0 : '10px',
      }}
    >
      {rows.map((row, index) => {
        const empty = row.value == null || row.value === '';

        return (
          <Box
            key={index}
            sx={{
              display: layout === 'stacked' ? 'flex' : 'grid',
              flexDirection: 'column',
              gridTemplateColumns:
                layout === 'grid'
                  ? `${labelWidth}px minmax(0, 1fr)`
                  : 'auto minmax(0, 1fr)',
              alignItems: 'start',
              gap:
                layout === 'stacked'
                  ? '3px'
                  : layout === 'split'
                    ? '16px'
                    : '12px',
              ...(divided && {
                py: '12px',
                '& + &': { borderTop: `1px solid ${color.bg.neutral.sunken}` },
              }),
            }}
          >
            <Box
              component="dt"
              sx={{
                ...typography.body[300],
                color: color.fg.neutral.muted,
                pt: layout === 'grid' ? '2px' : 0,
              }}
            >
              {row.label}
            </Box>
            <Stack
              component="dd"
              sx={{
                m: 0,
                minWidth: 0,
                gap: '4px',
                alignItems: layout === 'split' ? 'flex-end' : 'flex-start',
                textAlign: layout === 'split' ? 'right' : 'left',
                ...(layout === 'grid'
                  ? typography.body[300]
                  : typography.body[400]),
                color: empty
                  ? color.fg.neutral.muted
                  : color.fg.neutral.default,
                overflowWrap: 'anywhere',
              }}
            >
              {empty ? emptyText : row.value}
              {row.note ? (
                <Box
                  component="span"
                  sx={{
                    ...typography.body[300],
                    color: color.fg.neutral.muted,
                  }}
                >
                  {row.note}
                </Box>
              ) : null}
            </Stack>
          </Box>
        );
      })}
    </Box>
  );
}
