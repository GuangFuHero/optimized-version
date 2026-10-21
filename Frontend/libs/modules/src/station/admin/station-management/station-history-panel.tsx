'use client';

import { Box } from '@mui/material';
import { useStationHistory } from '@rescue-frontend/data-access/admin';
import { Button, Timeline } from '@rescue-frontend/ui';
import { useState } from 'react';

const PAGE = 50;
const MAX = 200;

export function StationHistoryPanel({ uuid }: { uuid: string }) {
  const [limit, setLimit] = useState(PAGE);
  const history = useStationHistory({ path: { uuid }, query: { limit } });
  const events = history.data?.data ?? [];
  const total = history.data?.meta?.total ?? 0;
  const canLoadMore = limit < MAX && total > events.length;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
