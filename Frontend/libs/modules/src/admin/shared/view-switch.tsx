'use client';

import { Box, ButtonBase, Typography } from '@mui/material';
import { designTokens } from '@rescue-frontend/ui';
import { CircleHelp, List, Map as MapIcon } from 'lucide-react';

const { color, shadow, typography } = designTokens;

/** An admin list page's two views: the table, or its rows on a map. */
export type BoardView = 'table' | 'map';

/**
 * The title-side controls the page renders into the admin header: a ? with the page's one-line
 * explanation, the `(N)` count, and the list/map switch.
 */
export function ViewSwitch({
  count,
  view,
  help,
  onChange,
}: {
  count: number;
  view: BoardView;
  /** The header ?'s one-line explanation of the page. */
  help: string;
  onChange: (view: BoardView) => void;
}) {
  const options = [
    { value: 'table', label: '列表視圖', Icon: List },
    { value: 'map', label: '地圖視圖', Icon: MapIcon },
  ] as const;
  return (
    <>
      <Box
        component="span"
        title={help}
        aria-label={help}
        role="img"
        sx={{ display: 'inline-flex', ml: '-8px', cursor: 'help' }}
      >
        <CircleHelp size={17} color={color.fg.neutral.muted} />
      </Box>
      <Typography
        component="span"
        sx={{ ...typography.data[300], color: color.fg.neutral.muted }}
      >
        ({count})
      </Typography>
      <Box
        role="group"
        aria-label="檢視方式"
        sx={{
          display: 'inline-flex',
          gap: '2px',
          p: '3px',
          borderRadius: '10px',
          border: `1px solid ${color.border.default}`,
          bgcolor: color.bg.neutral.sunken,
        }}
      >
        {options.map(({ value, label, Icon }) => {
          const on = view === value;
          const fg = on ? color.fg.neutral.default : color.fg.neutral.muted;
          return (
            <ButtonBase
              key={value}
              onClick={() => onChange(value)}
              aria-pressed={on}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                height: 30,
                px: '14px',
                borderRadius: '8px',
                whiteSpace: 'nowrap',
                bgcolor: on ? color.bg.neutral.default : 'transparent',
                boxShadow: on ? shadow.sm : 'none',
                ...typography.label[400],
                fontWeight: on ? 700 : 400,
                color: fg,
              }}
            >
              <Icon size={15} color={fg} />
              {label}
            </ButtonBase>
          );
        })}
      </Box>
    </>
  );
}
