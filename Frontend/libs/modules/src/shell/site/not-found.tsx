'use client';

import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded';
import { Box, Stack, Typography } from '@mui/material';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

import { GuangFuMascot } from '../../brand';
import { SITE_MODULE_META } from '../../route/module-meta';
import { BRIEFING_HREF } from '../../ticket/needs/briefing';

const { color, focusRing, radius } = designTokens;

const MapIcon = SITE_MODULE_META.map.Icon;
const ListIcon = SITE_MODULE_META.list.Icon;

/**
 * Where to go on from a page that is not there: the site's three ways in, never a site map
 * (prototype `前台找不到頁面 Site Not Found.html`).
 */
const NEXT_STEPS: {
  href: string;
  label: string;
  sub: string;
  icon: ReactNode;
}[] = [
  {
    href: '/map',
    label: '救災地圖',
    sub: '看附近的任務與資源站點',
    icon: <MapIcon sx={{ fontSize: 20 }} />,
  },
  {
    href: '/list',
    label: '救災列表',
    sub: '找需要人手的任務',
    icon: <ListIcon sx={{ fontSize: 20 }} />,
  },
  {
    href: BRIEFING_HREF,
    label: '志工行前資訊',
    sub: '出發前要準備什麼',
    icon: <MenuBookRoundedIcon sx={{ fontSize: 20 }} />,
  },
];

/**
 * 找不到這一頁 (prototype `wg-notfound.jsx`, 2026-10-18; the moving 光復寶寶 2026-10-20). It sits
 * inside the site's frame, sidebar and top bar as ever: someone who is lost first needs to see they
 * are still on the site. No technical words — 「404」 is only on 光復寶寶's sign, for whoever
 * reports the problem to match up.
 *
 * Not for a ticket or station that has been deleted: that is the map's and the list's to say.
 */
export function SiteNotFound() {
  return (
    <Box
      sx={{
        height: '100%',
        overflowY: 'auto',
        bgcolor: color.bg.neutral.subtle,
      }}
    >
      <Box
        sx={{
          maxWidth: 560,
          mx: 'auto',
          px: 2,
          pt: 'clamp(24px, 6vh, 64px)',
          pb: 6,
        }}
      >
        <Box sx={{ mb: 2.5 }}>
          <GuangFuMascot code="404" />
        </Box>
        <Box sx={{ textAlign: 'center' }}>
          <Typography
            component="h1"
            sx={{
              m: '0 0 12px',
              color: color.fg.neutral.default,
              fontSize: displayTextSize[24],
              lineHeight: 1.3,
              fontWeight: 700,
            }}
          >
            找不到這一頁
          </Typography>
          <Typography
            sx={{
              m: '0 auto 28px',
              maxWidth: 460,
              color: color.fg.neutral.subtle,
              fontSize: displayTextSize[16],
              lineHeight: 1.7,
              // No lone 「續：」 on a line of its own.
              textWrap: 'pretty',
            }}
          >
            連結可能打錯了，或這個頁面已經不在了。可以從這裡繼續：
          </Typography>
        </Box>
        <Stack component="nav" aria-label="繼續前往" spacing={1}>
          {NEXT_STEPS.map((step) => (
            <Box
              key={step.href}
              component={Link}
              href={step.href}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                minHeight: 44,
                p: '12px 16px',
                borderRadius: `${radius.lg}px`,
                bgcolor: color.bg.neutral.default,
                border: `1px solid ${color.border.default}`,
                color: 'inherit',
                textDecoration: 'none',
                transition: 'border-color .15s',
                '&:hover': { borderColor: color.bg.primary.default },
                '&:focus-visible': {
                  borderColor: color.bg.primary.default,
                  outline: `${focusRing.width}px solid ${focusRing.color}`,
                  outlineOffset: `${focusRing.offset}px`,
                },
              }}
            >
              <Box
                aria-hidden
                sx={{
                  width: 40,
                  height: 40,
                  flexShrink: 0,
                  display: 'grid',
                  placeItems: 'center',
                  borderRadius: `${radius.full}px`,
                  bgcolor: color.bg.primary.subtle,
                  color: color.fg.neutral.default,
                }}
              >
                {step.icon}
              </Box>
              <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                <Typography
                  sx={{
                    color: color.fg.neutral.default,
                    fontSize: displayTextSize[16],
                    lineHeight: 1.4,
                    fontWeight: 700,
                  }}
                >
                  {step.label}
                </Typography>
                <Typography
                  sx={{
                    color: color.fg.neutral.muted,
                    fontSize: displayTextSize[13],
                    lineHeight: 1.5,
                  }}
                >
                  {step.sub}
                </Typography>
              </Stack>
            </Box>
          ))}
        </Stack>
      </Box>
    </Box>
  );
}
