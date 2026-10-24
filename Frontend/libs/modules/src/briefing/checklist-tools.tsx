'use client';

import ChecklistRoundedIcon from '@mui/icons-material/ChecklistRounded';
import PrintRoundedIcon from '@mui/icons-material/PrintRounded';
import SyncRoundedIcon from '@mui/icons-material/SyncRounded';
import { Box, ButtonBase, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

import type { BriefingChecklist } from './briefing-checklist';

const { color, focusRing, radius } = designTokens;

function Pill({
  onClick,
  children,
  tone = 'neutral',
}: {
  onClick: () => void;
  children: ReactNode;
  tone?: 'neutral' | 'info' | 'link';
}) {
  return (
    <ButtonBase
      onClick={onClick}
      sx={{
        minHeight: 44,
        px: '12px',
        gap: '6px',
        borderRadius: `${radius.full}px`,
        fontSize: displayTextSize[13],
        fontWeight: 700,
        whiteSpace: 'nowrap',
        ...(tone === 'link'
          ? { color: color.fg.info, textDecoration: 'underline' }
          : tone === 'info'
            ? { color: color.fg.info, bgcolor: color.bg.neutral.default }
            : {
                color: color.fg.neutral.subtle,
                bgcolor: color.bg.neutral.subtle,
                boxShadow: `inset 0 0 0 1px ${color.border.default}`,
              }),
        '&:focus-visible': {
          outline: `${focusRing.width}px solid ${focusRing.color}`,
          outlineOffset: `${focusRing.offset}px`,
        },
        '& .MuiSvgIcon-root': { fontSize: 16 },
      }}
    >
      {children}
    </ButtonBase>
  );
}

/** 看是哪幾項: the first marked item, brought to the middle of the screen. */
function showFirstUpdated() {
  document
    .querySelector('[data-briefing-updated]')
    ?.closest('li')
    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/**
 * Above the article, since a volunteer comes back to this page mostly to go on packing (prototype
 * `ChecklistTools`): how far along they are, and — at the top, where a long list cannot hide it
 * (VB-BR-194c) — that the list changed since they last looked. Nothing at all for a briefing with no
 * checklist in it.
 */
export function ChecklistTools({
  checklist,
  onPrint,
}: {
  checklist: BriefingChecklist;
  onPrint: () => void;
}) {
  const total = checklist.items.length;
  const done = checklist.checked.size;
  const updated = checklist.updated.size;

  if (!total) {
    return null;
  }

  return (
    <Stack spacing={1}>
      {updated ? (
        <Stack
          role="status"
          direction="row"
          sx={{
            flexWrap: 'wrap',
            alignItems: 'flex-start',
            gap: 1,
            p: '10px 12px',
            borderRadius: `${radius.md}px`,
            bgcolor: color.bg.info.subtle,
            color: color.fg.info,
          }}
        >
          <SyncRoundedIcon sx={{ fontSize: 16, mt: '4px', flexShrink: 0 }} />
          <Typography
            sx={{
              flex: '1 1 220px',
              minWidth: 0,
              fontSize: displayTextSize[13],
              lineHeight: 1.7,
              textWrap: 'pretty',
            }}
          >
            <strong>清單有 {updated} 項更新，請重新核對。</strong>
            改過或新增的項目標了「已更新」，其他勾選都還在。
          </Typography>
          <Stack direction="row" spacing={0.75} sx={{ ml: 'auto' }}>
            <Pill tone="link" onClick={showFirstUpdated}>
              看是哪幾項
            </Pill>
            <Pill tone="info" onClick={checklist.dismissUpdates}>
              知道了
            </Pill>
          </Stack>
        </Stack>
      ) : null}
      <Stack
        direction="row"
        sx={{
          flexWrap: 'wrap',
          alignItems: 'center',
          columnGap: 1.25,
          rowGap: 0.5,
          p: '10px 14px',
          borderRadius: `${radius.md}px`,
          bgcolor: color.bg.neutral.default,
          boxShadow: `inset 0 0 0 1px ${color.border.default}`,
        }}
      >
        <ChecklistRoundedIcon
          sx={{ fontSize: 16, color: color.fg.neutral.subtle }}
        />
        <Typography
          sx={{
            color: color.fg.neutral.default,
            fontSize: displayTextSize[13],
          }}
        >
          裝備已勾 <strong>{done}</strong> / {total}
        </Typography>
        {/* Said where the ticks are, since it is the one thing a volunteer could not guess. */}
        <Typography
          sx={{ color: color.fg.neutral.muted, fontSize: displayTextSize[13] }}
        >
          · 只存在這台裝置，換手機不會同步
        </Typography>
        <Box sx={{ ml: 'auto', display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
          {done ? <Pill onClick={checklist.clear}>全部清除</Pill> : null}
          <Pill onClick={onPrint}>
            <PrintRoundedIcon />
            列印清單
          </Pill>
        </Box>
      </Stack>
    </Stack>
  );
}
