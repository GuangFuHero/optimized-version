'use client';

import { Box, Typography } from '@mui/material';
import { useStationHistory } from '@rescue-frontend/data-access/admin';
import { Button, designTokens, Timeline } from '@rescue-frontend/ui';
import { History } from 'lucide-react';
import { useState } from 'react';

const { color, typography } = designTokens;

const PAGE = 50;
const MAX = 200;

/**
 * The station's current version, from the history the panel has already loaded (v1 plus one per
 * change), or null before the history tab is first opened. Never fetches on its own.
 */
export function useLoadedStationVersion(uuid: string): number | null {
  const history = useStationHistory(
    { path: { uuid }, query: { limit: PAGE } },
    { enabled: false },
  );
  if (!history.data) return null;
  return (history.data.meta?.total ?? history.data.data?.length ?? 0) + 1;
}

export function StationHistoryPanel({ uuid }: { uuid: string }) {
  const [limit, setLimit] = useState(PAGE);
  const history = useStationHistory({ path: { uuid }, query: { limit } });
  const events = history.data?.data ?? [];
  const total = history.data?.meta?.total ?? 0;
  const canLoadMore = limit < MAX && total > events.length;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* The prototype adds 「下架為軟刪除，歷史永久保留」: here deleting is permanent, so not that. */}
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
          欄位級版本鏈：誰、何時、改了什麼。
        </Typography>
      </Box>
      <Timeline
        items={events}
        emptyText={history.isPending ? '載入中…' : '尚無變更紀錄'}
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
