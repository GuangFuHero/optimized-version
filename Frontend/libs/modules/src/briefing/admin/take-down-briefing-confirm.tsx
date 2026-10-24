'use client';

import { Stack } from '@mui/material';
import { toast } from 'sonner';

import { useTakeDownBriefing } from '@rescue-frontend/data-access/admin';
import { Button, Callout } from '@rescue-frontend/ui';

import type { Briefing } from './briefing-content';

export function TakeDownBriefingConfirm({
  briefing,
  onClose,
}: {
  briefing: Briefing;
  onClose: () => void;
}) {
  const takeDown = useTakeDownBriefing();

  return (
    <Callout tone="danger">
      <strong>確認下架？</strong>
      <br />
      下架後<strong>前台的行前資訊會整個變成空白</strong>
      ，正在路上的志工再打開就看不到裝備清單了。
      <br />
      內容不會刪除，會留在「已發布版本」。要再對外，請編輯內容後重新發布。
      {takeDown.error ? (
        <>
          <br />
          下架失敗。{takeDown.error.message}
        </>
      ) : null}
      <Stack direction="row" sx={{ gap: 1, mt: 1 }}>
        <Button
          size="sm"
          disabled={takeDown.isPending}
          onClick={() =>
            takeDown.mutate(
              { uuid: briefing.uuid },
              {
                onSuccess: () => {
                  toast.success('已下架，前台不再顯示行前資訊。');
                  onClose();
                },
              },
            )
          }
        >
          {takeDown.isPending ? '下架中…' : '確認下架'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={takeDown.isPending}
          onClick={onClose}
        >
          取消
        </Button>
      </Stack>
    </Callout>
  );
}
