'use client';

import type { ReactNode } from 'react';

import { ClipboardList, Share2 } from 'lucide-react';

import { Box, IconButton, Stack, Tab, Typography } from '@mui/material';

import {
  designTokens,
  displayTextSize,
  Icons,
  Tabs,
} from '@rescue-frontend/ui';

const { color, radius, spacing } = designTokens;
const CloseIcon = Icons.close;

export interface SiteTicketDetailDrawerProps {
  title: string;
  onClose: () => void;
  /** Before the close button: the requester's ⋯. */
  headerActions?: ReactNode;
  /** Under the title: the ticket's status and how urgent it is. */
  badges?: ReactNode;
  /** The 詳情 tab's content. */
  children?: ReactNode;
  /** The footer's main action, before 分享: the claim button, or the line pointing to the needs. */
  footerLead?: ReactNode;
  onShare?: () => void;
}

/**
 * 前台的任務單詳情，照原型 `site-detail.jsx` 的 `TicketDetail`：白底，標題前一個圖示方塊，標題下是狀態和優先標籤，
 * 分頁只有「詳情」（操作紀錄要 `ticket.view_history`，前台不開，後端 ADR-286），頁尾是承接鈕和只有圖示的分享鈕。
 * 跟 `SiteStationDetailDrawer` 同一套字級與間距。
 */
export function SiteTicketDetailDrawer({
  title,
  onClose,
  headerActions,
  badges,
  children,
  footerLead,
  onShare,
}: SiteTicketDetailDrawerProps) {
  return (
    <Box
      component="aside"
      aria-label="任務單詳情"
      sx={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: color.bg.neutral.default,
        borderLeft: `1px solid ${color.border.default}`,
        overflow: 'hidden',
      }}
    >
      <Stack
        direction="row"
        sx={{
          alignItems: 'flex-start',
          gap: `${spacing[3]}px`,
          pl: `${spacing[6]}px`,
          pr: 1,
          py: `${spacing[4]}px`,
        }}
      >
        <Box
          sx={{
            width: 40,
            height: 40,
            flexShrink: 0,
            display: 'grid',
            placeItems: 'center',
            borderRadius: `${radius.md}px`,
            bgcolor: color.bg.primary.subtle,
            color: color.brand.primary.subtle,
          }}
        >
          <ClipboardList size={20} />
        </Box>
        <Typography
          component="h2"
          sx={{
            flex: 1,
            minWidth: 0,
            alignSelf: 'center',
            fontSize: displayTextSize[18],
            fontWeight: 700,
            lineHeight: 1.35,
            color: color.fg.neutral.default,
            overflowWrap: 'anywhere',
          }}
        >
          {title}
        </Typography>
        {/* Up into the header's padding, so the 44px targets keep the title's line where it is. */}
        <Stack
          direction="row"
          sx={{ flexShrink: 0, alignItems: 'center', mt: -1 }}
        >
          {headerActions}
          <IconButton
            aria-label="關閉詳情"
            onClick={onClose}
            sx={{ width: 44, height: 44, color: color.fg.neutral.subtle }}
          >
            <CloseIcon />
          </IconButton>
        </Stack>
      </Stack>

      {badges ? (
        <Stack
          direction="row"
          sx={{
            px: `${spacing[6]}px`,
            gap: `${spacing[2]}px`,
            flexWrap: 'wrap',
          }}
        >
          {badges}
        </Stack>
      ) : null}

      <Box sx={{ px: `${spacing[6]}px`, mt: `${spacing[4]}px` }}>
        <Tabs value="details">
          <Tab
            value="details"
            label="詳情"
            disableRipple
            sx={{ fontSize: displayTextSize[14] }}
          />
        </Tabs>
      </Box>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          px: `${spacing[6]}px`,
          pt: `${spacing[4]}px`,
          pb: `${spacing[6]}px`,
        }}
      >
        {children}
      </Box>

      {footerLead || onShare ? (
        <Stack
          direction="row"
          sx={{
            alignItems: 'center',
            gap: `${spacing[2]}px`,
            px: `${spacing[6]}px`,
            py: `${spacing[4]}px`,
            borderTop: `1px solid ${color.border.default}`,
            bgcolor: color.bg.neutral.default,
          }}
        >
          {/* Takes the row, so the share button stays at the end even when there is no lead. */}
          <Box sx={{ flex: 1, minWidth: 0, display: 'flex' }}>{footerLead}</Box>
          {onShare ? (
            <IconButton
              aria-label="分享任務"
              onClick={onShare}
              sx={{
                width: 44,
                height: 44,
                flexShrink: 0,
                color: color.fg.neutral.default,
                border: `1px solid ${color.border.default}`,
              }}
            >
              <Share2 size={18} />
            </IconButton>
          ) : null}
        </Stack>
      ) : null}
    </Box>
  );
}
