'use client';

import { Box, Typography } from '@mui/material';
import { useTicketHistory } from '@rescue-frontend/data-access/admin';
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
  const history = useTicketHistory({ path: { uuid }, query: { limit } });
  const events = history.data?.data ?? [];
  const total = history.data?.meta?.total ?? 0;
  const canLoadMore = limit < MAX && total > events.length;

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
          sx={{ alignSelf: 'center' }}
        >
          載入更多
        </Button>
      ) : null}
    </Box>
  );
}
