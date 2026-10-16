'use client';

import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import { ButtonBase, Dialog, Popover, Tooltip } from '@mui/material';
import { useId, useState, type MouseEvent } from 'react';

import { designTokens } from '@rescue-frontend/ui';

import { FreshDot, PageHelpPanel } from './page-help-panel';
import { usePageHelp } from './use-page-help';

const { color } = designTokens;

/** As wide as the prototype's (`wg-help.jsx`, 340 for a page without a roles table). */
const PANEL_WIDTH = 340;

/**
 * Solid, as the prototype's: the theme's frosted popover lets the map through, and paragraphs read
 * over a green blur do not.
 */
const panelSurface = {
  bgcolor: color.bg.neutral.default,
  backdropFilter: 'none',
  border: `1px solid ${color.border.default}`,
  borderRadius: '12px',
  px: 2.25,
  py: 2,
} as const;

/**
 * 這一頁怎麼用 in the desktop top bar, between 請求協助 and the account (prototype
 * `site-shell.jsx:427-428`). A ？, not a ！, which the site already uses for warnings. Hovered it
 * says only what it is; the help itself opens on a click, as a phone has no hover.
 */
export function PageHelpButton({ ringColor }: { ringColor: string }) {
  const page = usePageHelp();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const titleId = useId();

  if (!page) {
    return null;
  }

  const open = Boolean(anchor);

  const toggle = (event: MouseEvent<HTMLElement>) => {
    setAnchor(open ? null : event.currentTarget);
    page.markSeen();
  };

  return (
    <>
      <Tooltip title="這一頁怎麼用" disableHoverListener={open}>
        <ButtonBase
          aria-label={`這一頁怎麼用：${page.help.title}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={toggle}
          sx={{
            position: 'relative',
            width: 36,
            height: 36,
            borderRadius: '50%',
            color: open ? color.brand.primary.subtle : color.fg.neutral.muted,
            bgcolor: open ? color.bg.primary.subtle : 'transparent',
            transition: 'background-color 120ms ease',
            '&:hover': {
              bgcolor: open ? color.bg.primary.subtle : color.bg.neutral.subtle,
            },
          }}
        >
          <HelpOutlineRoundedIcon sx={{ fontSize: 26 }} />
          {page.fresh ? <FreshDot ringColor={ringColor} /> : null}
        </ButtonBase>
      </Tooltip>

      {/* Escape and a click outside close it, as the prototype's does. */}
      <Popover
        open={open}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            role: 'dialog',
            'aria-labelledby': titleId,
            sx: {
              ...panelSurface,
              width: PANEL_WIDTH,
              maxWidth: 'calc(100vw - 24px)',
              mt: 1,
            },
          },
        }}
      >
        <PageHelpPanel
          help={page.help}
          titleId={titleId}
          onClose={() => setAnchor(null)}
        />
      </Popover>
    </>
  );
}

/**
 * The same help on a phone, opened from the menu's row: a card 12px in from the top and the sides
 * over a scrim, as the prototype's (`wg-help.jsx`, below 768px), closed by the scrim or Escape.
 */
export function PageHelpDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const page = usePageHelp();
  const titleId = useId();

  if (!page) {
    return null;
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby={titleId}
      sx={{ '& .MuiDialog-container': { alignItems: 'flex-start' } }}
      slotProps={{
        paper: {
          sx: {
            ...panelSurface,
            m: 1.5,
            width: 'calc(100% - 24px)',
            maxWidth: 'none',
            maxHeight: 'calc(100% - 24px)',
          },
        },
      }}
    >
      <PageHelpPanel help={page.help} titleId={titleId} onClose={onClose} />
    </Dialog>
  );
}
