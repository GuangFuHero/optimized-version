'use client';

import { Box, Typography } from '@mui/material';
import { ticketHistoryQuery } from '@rescue-frontend/data-access/admin';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  backendEventsToTimelineItems,
  Button,
  designTokens,
  Timeline,
} from '@rescue-frontend/ui';
import { History } from 'lucide-react';
import { useState } from 'react';

const { color, typography } = designTokens;

const PAGE = 50;
const MAX = 200;

/** A ticket's 變更紀錄, as `StationHistoryPanel` shows a station's. */
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

  let emptyText = '尚無變更紀錄';
  if (history.error) emptyText = '變更紀錄載入失敗';
  else if (history.isPending) emptyText = '載入中…';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          mb: '4px',
          color: color.fg.neutral.muted,
        }}
      >
        <History size={17} />
        <Typography sx={{ ...typography.body[300], color: 'inherit' }}>
          欄位級變更紀錄：誰、何時、改了什麼。
        </Typography>
      </Box>
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
