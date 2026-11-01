'use client';

import type { ReactElement } from 'react';
import { useEffect, useMemo, useState } from 'react';

import {
  Box,
  Button,
  ButtonBase,
  Drawer,
  IconButton,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';

import { createQrDataUrl, downloadQrSvg } from './qr-code';
import {
  copyPointShareUrl,
  createPointShareLinks,
  isShareSheetDismissal,
  openPointShareLink,
  sharesThroughDeviceSheet,
} from './share-links';
import type { PointShareChannel, PointShareTarget } from './types';

import {
  designTokens,
  displayTextSize,
  safeAreaBottom,
  Icons,
} from '@rescue-frontend/ui';

const { color, radius } = designTokens;

interface PointShareDrawerProps {
  open: boolean;
  target: PointShareTarget | null;
  onClose: () => void;
}

const channelIcons: Record<PointShareChannel, ReactElement> = {
  line: <Icons.messageCircle />,
  facebook: <Icons.facebookBrand />,
  threads: <Icons.atSign />,
  x: <Icons.xBrand />,
};

// A tile a finger can hit (prototype site-actions.jsx:1318). Five of them fit one row at 390px, each
// ~64px wide inside; at the 10 step 「Facebook」, the widest label, still fits one line on a phone.
const tileSx = {
  minHeight: 76,
  px: 0,
  py: 1.5,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 0.75,
  borderRadius: `${radius.md}px`,
  border: `1px solid ${color.border.default}`,
  bgcolor: color.bg.neutral.default,
  color: color.fg.neutral.default,
  // A <button> takes the browser's font, not the page's.
  fontFamily: 'inherit',
  fontSize: displayTextSize[10],
  fontWeight: 500,
  whiteSpace: 'nowrap',
  '& .MuiSvgIcon-root': { fontSize: 20, color: color.fg.neutral.subtle },
} as const;

/**
 * Sharing a point, laid out as the prototype's (site-actions.jsx:1255-1395, Sucre 2026-09-11): one
 * screen with no scrolling, the QR code as large as it fits — it is printed and posted on site —
 * the phone's own share sheet where there is one, then the channels. A bottom sheet on a phone.
 */
export function PointShareDrawer({
  open,
  target,
  onClose,
}: PointShareDrawerProps) {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down('tablet'));
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');
  // After mount: the server has no `navigator`, and most desktop browsers have no share sheet —
  // a button that does nothing is left out rather than shown.
  const [canShareNatively, setCanShareNatively] = useState(false);
  // A finger, not a mouse: where a channel's own app may be installed and take its links.
  const touchScreen = useMediaQuery('(pointer: coarse)');
  const links = useMemo(
    () => (target ? createPointShareLinks(target) : []),
    [target],
  );
  const qrDataUrl = useMemo(
    () => (target ? createQrDataUrl(target.url) : ''),
    [target],
  );

  useEffect(() => {
    setCanShareNatively(typeof navigator.share === 'function');
  }, []);

  const handleCopy = async () => {
    if (!target) {
      return;
    }

    await copyPointShareUrl(target.url);
    setCopyState('copied');
    window.setTimeout(() => setCopyState('idle'), 1400);
  };

  const handleNativeShare = (fallbackHref?: string) => {
    if (!target) {
      return;
    }

    // A dismissed sheet rejects; there is nothing to tell the person who dismissed it. One that
    // fails, opened from a channel's tile, gives way to that channel's page.
    navigator
      .share({ title: target.title, text: target.description, url: target.url })
      .catch((error: unknown) => {
        if (fallbackHref && !isShareSheetDismissal(error)) {
          openPointShareLink(fallbackHref);
        }
      });
  };

  return (
    <Drawer
      anchor={isPhone ? 'bottom' : 'right'}
      open={open}
      onClose={onClose}
      sx={{
        '& .MuiDrawer-paper': isPhone
          ? {
              // Never past the drawer's top, under the announcement banner if one is up.
              height: 'min(92dvh, 100%)',
              borderRadius: `${radius.lg}px ${radius.lg}px 0 0`,
              bgcolor: color.bg.neutral.default,
            }
          : {
              width: 440,
              maxWidth: '100vw',
              bgcolor: color.bg.neutral.default,
            },
      }}
    >
      <Box
        sx={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          pb: safeAreaBottom(0),
        }}
      >
        {isPhone ? (
          // Says it is a sheet that goes back down; dragging it is not wired up.
          <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1 }}>
            <Box
              sx={{
                width: 36,
                height: 4,
                borderRadius: '999px',
                bgcolor: color.border.default,
              }}
            />
          </Box>
        ) : null}

        <Box
          sx={{
            px: { mobile: 2, tablet: 3 },
            py: 1.5,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            borderBottom: `1px solid ${color.border.default}`,
          }}
        >
          <Typography
            sx={{
              minWidth: 0,
              flex: 1,
              color: color.fg.neutral.default,
              fontSize: displayTextSize[16],
              fontWeight: 700,
            }}
          >
            {target?.title ?? '分享'}
          </Typography>
          <IconButton aria-label="關閉分享" onClick={onClose} size="small">
            <Icons.close />
          </IconButton>
        </Box>

        {target ? (
          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              p: { mobile: 2, tablet: 3 },
            }}
          >
            {/* The largest part, as the prototype has it: too small to scan, it is no use at all. */}
            <Box
              sx={{
                flex: 1,
                minHeight: 0,
                p: 2,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 1,
                borderRadius: `${radius.lg}px`,
                border: `1px solid ${color.border.default}`,
                bgcolor: color.bg.neutral.subtle,
              }}
            >
              <Box
                component="img"
                alt={`${target.title} QR Code`}
                src={qrDataUrl}
                sx={{
                  flex: '1 1 0',
                  minHeight: 0,
                  maxWidth: '100%',
                  aspectRatio: '1 / 1',
                  objectFit: 'contain',
                }}
              />
              <Typography
                sx={{
                  color: color.fg.neutral.muted,
                  fontSize: displayTextSize[12],
                  lineHeight: 1.5,
                  textAlign: 'center',
                }}
              >
                給現場的人掃，或長按另存後列印張貼。
              </Typography>
              <Button
                size="small"
                startIcon={<Icons.download />}
                onClick={() => downloadQrSvg(target.url, `${target.title}.svg`)}
                sx={{ textTransform: 'none' }}
              >
                下載 QR Code
              </Button>
            </Box>

            {canShareNatively ? (
              <Button
                variant="contained"
                startIcon={<Icons.iosShare />}
                onClick={() => handleNativeShare()}
                sx={{ textTransform: 'none', fontWeight: 700 }}
              >
                分享到⋯
              </Button>
            ) : null}

            <Box>
              <Typography
                sx={{
                  mb: 1,
                  color: color.fg.neutral.default,
                  fontSize: displayTextSize[13],
                  fontWeight: 700,
                }}
              >
                傳給別人
              </Typography>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(64px, 1fr))',
                  gap: 0.75,
                }}
              >
                {links.map((link) => (
                  <ButtonBase
                    key={link.channel}
                    onClick={() =>
                      sharesThroughDeviceSheet(link.channel, {
                        canShareNatively,
                        touchScreen,
                      })
                        ? handleNativeShare(link.href)
                        : openPointShareLink(link.href)
                    }
                    sx={tileSx}
                  >
                    {channelIcons[link.channel]}
                    {link.label}
                  </ButtonBase>
                ))}
                <ButtonBase onClick={handleCopy} sx={tileSx}>
                  {copyState === 'copied' ? <Icons.check /> : <Icons.link />}
                  {copyState === 'copied' ? '已複製' : '複製連結'}
                </ButtonBase>
              </Box>
            </Box>
          </Box>
        ) : null}
      </Box>
    </Drawer>
  );
}
