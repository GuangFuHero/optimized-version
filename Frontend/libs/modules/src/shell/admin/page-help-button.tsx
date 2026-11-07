'use client';

import { usePathname } from 'next/navigation';
import { useId, useState } from 'react';

import {
  ButtonBase,
  Dialog,
  Popover,
  Tooltip,
  useMediaQuery,
  useTheme,
} from '@mui/material';

import { designTokens, Icons } from '@rescue-frontend/ui';

import { pageHelpWidth } from '../site/page-help/page-help';
import { usePageHelpSeen } from '../site/page-help/use-page-help-seen';
import { FreshDot, PageHelpPanel } from '../site/page-help/page-help-panel';
import { ADMIN_PAGE_HELP, adminPageHelpKey } from './page-help';

const { color, iconSize, radius } = designTokens;

/** Solid, as the site's: paragraphs over the theme's frosted popover do not read. */
const panelSurface = {
  bgcolor: color.bg.neutral.default,
  backdropFilter: 'none',
  border: `1px solid ${color.border.default}`,
  borderRadius: `${radius.md}px`,
  px: 2.25,
  py: 2,
} as const;

/**
 * 這一頁怎麼用 right after the page title (prototype `wg-shell.jsx`, the ？ beside the title). A ？,
 * not a ！, which the platform uses for warnings. It opens on a click, as a phone has no hover: a
 * popover under it on a desktop, a card over a scrim on a phone, as the site's. Until it is first
 * opened on this device it carries a small orange dot.
 */
export function AdminPageHelpButton() {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('tablet'));
  const key = adminPageHelpKey(usePathname() ?? '');
  const help = key ? ADMIN_PAGE_HELP[key] : undefined;
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const titleId = useId();
  const { seen, markSeen } = usePageHelpSeen(key);

  if (!help) {
    return null;
  }

  const open = Boolean(anchor);
  const close = () => setAnchor(null);
  const panel = <PageHelpPanel help={help} titleId={titleId} onClose={close} />;

  return (
    <>
      <Tooltip title="這一頁怎麼用" disableHoverListener={open}>
        <ButtonBase
          aria-label={`這一頁怎麼用：${help.title}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={(event) => {
            setAnchor(open ? null : event.currentTarget);
            markSeen();
          }}
          sx={{
            position: 'relative',
            flexShrink: 0,
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
          <Icons.support sx={{ fontSize: iconSize.lg }} />
          {seen ? null : <FreshDot ringColor={color.bg.neutral.default} />}
        </ButtonBase>
      </Tooltip>

      {phone ? (
        <Dialog
          open={open}
          onClose={close}
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
          {panel}
        </Dialog>
      ) : (
        // Escape and a click outside close it.
        <Popover
          open={open}
          anchorEl={anchor}
          onClose={close}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          transformOrigin={{ vertical: 'top', horizontal: 'left' }}
          slotProps={{
            paper: {
              role: 'dialog',
              'aria-labelledby': titleId,
              sx: {
                ...panelSurface,
                width: pageHelpWidth(help),
                maxWidth: 'calc(100vw - 24px)',
                mt: 1,
              },
            },
          }}
        >
          {panel}
        </Popover>
      )}
    </>
  );
}
