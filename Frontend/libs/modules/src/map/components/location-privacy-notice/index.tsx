'use client';

import type { ReactNode } from 'react';

import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import { Box, Typography } from '@mui/material';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

const { color, radius, spacing } = designTokens;

interface LocationPrivacyNoticeProps {
  isAuthenticated: boolean;
  children: ReactNode;
}

/**
 * 為什麼只看得到區塊（後端 ADR-281；原型 `site-detail.jsx` 的 masked 提示框）。
 *
 * 沒登入時多講一句「登入後可看」：seed 讓每個登入帳號都持有 `ticket.view_detail`，這句話是真的。
 * 已登入卻仍看到區塊，代表管理者縮小了權限範圍，就不再承諾登入能解決。
 */
export function LocationPrivacyNotice({
  isAuthenticated,
  children,
}: LocationPrivacyNoticeProps) {
  return (
    <Box
      role="note"
      sx={{
        display: 'flex',
        gap: `${spacing[2]}px`,
        p: `${spacing[3]}px`,
        borderRadius: `${radius.md}px`,
        bgcolor: color.bg.neutral.subtle,
        border: `1px solid ${color.border.default}`,
      }}
    >
      <VerifiedUserOutlinedIcon
        sx={{
          fontSize: 16,
          mt: '1px',
          color: color.fg.neutral.muted,
          flexShrink: 0,
        }}
      />
      <Typography
        component="div"
        sx={{
          fontSize: displayTextSize[12],
          lineHeight: 1.6,
          color: color.fg.neutral.subtle,
        }}
      >
        {children}
        {isAuthenticated ? null : '登入後可看精確位置與說明。'}
      </Typography>
    </Box>
  );
}
