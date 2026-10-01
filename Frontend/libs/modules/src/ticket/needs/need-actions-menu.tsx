'use client';

import MoreHorizRoundedIcon from '@mui/icons-material/MoreHorizRounded';
import {
  ButtonBase,
  Menu,
  MenuItem,
  type SxProps,
  type Theme,
} from '@mui/material';
import { useState } from 'react';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

import type { NeedAction } from './need-actions';

const { color, radius, shadow, motion } = designTokens;

interface NeedActionsMenuProps {
  /** Joins the label in the accessible name — 「更多動作」 alone does not say which need. */
  needName: string;
  items: NeedAction[];
  /** Where the row puts it: pulled into the row's padding, say, so it does not make the row taller. */
  sx?: SxProps<Theme>;
}

/**
 * The ⋯ at the end of a need's row: what the ticket's requester can do to that need (spec Q45).
 * Nothing at all when there is nothing to do — never a ⋯ that opens onto an empty menu, and the
 * need's state decides that row by row.
 */
export function NeedActionsMenu({ needName, items, sx }: NeedActionsMenuProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  if (items.length === 0) {
    return null;
  }

  return (
    <>
      <ButtonBase
        disableRipple
        aria-label={`更多動作：${needName}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => setAnchorEl(event.currentTarget)}
        sx={[
          {
            flexShrink: 0,
            // As tall as the need's claim button: below that it is missed on a moving truck.
            width: 36,
            height: 36,
            borderRadius: `${radius.full}px`,
            color: color.fg.neutral.subtle,
            transition: `background ${motion.transition.fast}`,
            '&:hover': { bgcolor: color.bg.neutral.subtle },
          },
          ...(Array.isArray(sx) ? sx : [sx]),
        ]}
      >
        <MoreHorizRoundedIcon sx={{ fontSize: 20 }} />
      </ButtonBase>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: {
              mt: 0.5,
              minWidth: 160,
              bgcolor: color.bg.neutral.default,
              border: `1px solid ${color.border.default}`,
              borderRadius: `${radius.md}px`,
              backgroundImage: 'none',
              boxShadow: shadow.lg,
            },
          },
        }}
      >
        {items.map((item) => (
          <MenuItem
            key={item.label}
            onClick={() => {
              setAnchorEl(null);
              item.onSelect();
            }}
            sx={{
              minHeight: 44,
              fontSize: displayTextSize[14],
              color:
                item.tone === 'danger'
                  ? color.fg.danger
                  : color.fg.neutral.default,
            }}
          >
            {item.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
