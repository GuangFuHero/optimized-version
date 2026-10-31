'use client';

import { Box, Stack, Typography } from '@mui/material';
import { UserRound } from 'lucide-react';
import Link from 'next/link';
import { useCurrentUser } from '@rescue-frontend/data-access/admin';
import { designTokens } from '@rescue-frontend/ui';

import { GuangFuMascot } from '../../brand';
import { backOfficeIdentities, identityLabel } from '../../constants/roles';
import { useAdminNavSections } from './nav';

const { color, focusRing, radius, typography } = designTokens;

export function AdminErrorPage({ code }: { code: '404' | '403' }) {
  const { data: user } = useCurrentUser();
  const sections = useAdminNavSections();
  const links = sections
    .filter((section) => !section.footer)
    .flatMap((section) => section.items)
    .slice(0, 3);
  const identity = user?.active_identity;
  const forbidden = code === '403';
  const contact =
    identity?.team_uuid && identity.role !== 'admin'
      ? '你的團隊管理員'
      : '平台的超級管理員';
  const lead = forbidden
    ? (identity?.role === 'super_admin'
        ? '你目前的身份沒有開放這個頁面'
        : `你目前的身份沒有開放這個頁面。如果工作上需要，請聯絡${contact}開通`) +
      (backOfficeIdentities(user?.identities ?? []).length > 1
        ? '；或從右上角的人名切換到其他身份再試一次。'
        : '。') +
      '也可以從左邊的選單，或從這裡繼續：'
    : '網址可能打錯了，或這個頁面已經移除。可以從左邊的選單前往其他頁面，或從這裡繼續：';

  return (
    <Box
      sx={{
        maxWidth: 560,
        mx: 'auto',
        p: 'clamp(24px, 6vh, 64px) 16px 48px',
        color: color.fg.neutral.default,
      }}
    >
      <Box sx={{ mb: '20px' }}>
        <GuangFuMascot code={code} />
      </Box>
      <Box sx={{ textAlign: 'center' }}>
        <Typography
          component="h2"
          sx={{
            ...typography.heading[700],
            fontSize: 28,
            lineHeight: 1.3,
            mb: '12px',
          }}
        >
          {forbidden ? '沒有權限訪問此頁' : '找不到這一頁'}
        </Typography>
        <Typography
          sx={{
            ...typography.body[400],
            lineHeight: 1.7,
            maxWidth: 460,
            mx: 'auto',
            mb: forbidden && identity ? '14px' : '28px',
            color: color.fg.neutral.subtle,
          }}
        >
          {lead}
        </Typography>
        {forbidden && identity ? (
          <Box sx={{ mb: '28px' }}>
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                justifyContent: 'center',
                gap: '8px',
                p: '6px 12px',
                borderRadius: `${radius.full}px`,
                bgcolor: color.bg.neutral.default,
                border: `1px solid ${color.border.default}`,
                ...typography.body[300],
                lineHeight: 1.4,
                color: color.fg.neutral.subtle,
              }}
            >
              <UserRound size={16} aria-hidden />
              <span>目前身份</span>
              <Box
                component="b"
                sx={{ fontWeight: 700, color: color.fg.neutral.default }}
              >
                {user?.name} · {identityLabel(identity)}
              </Box>
            </Box>
          </Box>
        ) : null}
      </Box>
      <Stack component="nav" aria-label="繼續前往" sx={{ gap: '8px' }}>
        {links.map((link) => (
          <Box
            component={Link}
            key={link.id}
            href={link.href}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              minHeight: 70,
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
              sx={{
                width: 40,
                height: 40,
                flexShrink: 0,
                display: 'grid',
                placeItems: 'center',
                borderRadius: `${radius.full}px`,
                bgcolor: color.bg.primary.subtle,
              }}
            >
              <link.Icon size={20} aria-hidden />
            </Box>
            <Stack sx={{ gap: '2px', minWidth: 0 }}>
              <Typography
                sx={{
                  ...typography.body[400],
                  fontWeight: 700,
                  lineHeight: 1.4,
                }}
              >
                {link.label}
              </Typography>
              <Typography
                sx={{
                  ...typography.body[300],
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: color.fg.neutral.muted,
                }}
              >
                {link.description}
              </Typography>
            </Stack>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}
