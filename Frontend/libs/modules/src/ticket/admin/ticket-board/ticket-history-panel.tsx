'use client';

import { Box, Typography } from '@mui/material';
import { ticketHistoryQuery } from '@rescue-frontend/data-access/admin';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  backendEventsToTimelineItems,
  Button,
  Callout,
  designTokens,
  Timeline,
} from '@rescue-frontend/ui';
import { useState } from 'react';

const { color, typography } = designTokens;

/** The first page the tab loads; the drawer's tab count reads the same page from the cache. */
export const TICKET_HISTORY_PAGE = 50;
const PAGE = TICKET_HISTORY_PAGE;
const MAX = 200;

/** A ticket's 歷史紀錄, as `StationHistoryPanel` shows a station's. */
export function TicketHistoryPanel({ uuid }: { uuid: string }) {
  const [limit, setLimit] = useState(PAGE);
  // 載入更多 asks for a longer page; the shorter one stays on screen until it lands.
  const history = useQuery({
    ...ticketHistoryQuery({ path: { uuid }, query: { limit } }),
    placeholderData: keepPreviousData,
  });
  const events = history.data?.data ?? [];
  const total = history.data?.meta?.total ?? 0;
  // `total` is itself a floor when the backend's fetch cap cut the merge short.
  const truncated = history.data?.meta?.truncated ?? false;
  const more = total > events.length || truncated;
  const canLoadMore = limit < MAX && more;
  const capped = limit >= MAX && more && !history.isPlaceholderData;

  let emptyText = '尚無紀錄';
  if (history.error) emptyText = '歷史紀錄載入失敗';
  else if (history.isPending) emptyText = '載入中…';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* The prototype's note, as far as it is true here: the backend merges the ticket's audit
          log and its needs' claims (cancelled ones too) and offers no way to change either. */}
      <Callout tone="info">
        此單的所有異動與承接紀錄，新到舊排列。任何人都不能修改或刪除紀錄，包含
        Super Admin。
      </Callout>
      <Timeline
        items={backendEventsToTimelineItems(events)}
        emptyText={emptyText}
      />
      {canLoadMore ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setLimit((n) => Math.min(n + PAGE, MAX))}
          disabled={history.isPlaceholderData}
          sx={{ alignSelf: 'center' }}
        >
          {history.isPlaceholderData ? '載入中…' : '載入更多'}
        </Button>
      ) : null}
      {capped ? (
        <Typography
          sx={{
            ...typography.body[300],
            color: color.fg.neutral.muted,
            alignSelf: 'center',
          }}
        >
          {`僅顯示最近 ${MAX} 筆，共 ${total} 筆${truncated ? '以上' : ''}`}
        </Typography>
      ) : null}
    </Box>
  );
}
