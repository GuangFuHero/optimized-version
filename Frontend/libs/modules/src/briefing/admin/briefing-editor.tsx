'use client';

import { Box, Stack, Typography } from '@mui/material';
import { ArrowLeft, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import {
  BriefingState,
  useGenerateBriefing,
  useUpdateBriefing,
} from '@rescue-frontend/data-access/admin';
import {
  Badge,
  Button,
  Callout,
  Dialog,
  MarkdownEditor,
  designTokens,
} from '@rescue-frontend/ui';

import type { Briefing, BriefingTemplate } from './briefing-content';

const { color, radius, typography } = designTokens;

export function BriefingEditor({
  briefing,
  template,
  onClose,
  onSaved,
}: {
  briefing?: Briefing;
  template?: BriefingTemplate;
  onClose: () => void;
  onSaved: (uuid: string) => void;
}) {
  const [content, setContent] = useState(
    briefing?.content ?? template?.content ?? '',
  );
  const [confirm, setConfirm] = useState<'save' | 'leave' | null>(null);
  const create = useGenerateBriefing();
  const update = useUpdateBriefing();
  const pending = create.isPending || update.isPending;
  const error = create.error ?? update.error;
  const dirty = briefing
    ? content !== briefing.content
    : Boolean(content.trim());

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  function save() {
    if (pending || !dirty || !content.trim()) return;
    if (briefing) {
      update.mutate(
        { uuid: briefing.uuid, input: { content } },
        {
          onSuccess: ({ updateBriefing }) => {
            toast.success('行前資訊已儲存，公開內容已更新。');
            onSaved(updateBriefing.uuid);
          },
        },
      );
    } else {
      create.mutate(
        {
          input: {
            content,
            state: BriefingState.Briefing,
            templateUuid: template?.uuid ?? null,
          },
        },
        {
          onSuccess: ({ generateBriefing }) => {
            toast.success('行前資訊已建立並公開。');
            onSaved(generateBriefing.uuid);
          },
        },
      );
    }
  }

  return (
    <Stack sx={{ gap: 2 }}>
      <Stack
        direction="row"
        sx={{ gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}
      >
        <Button
          variant="ghost"
          startIcon={<ArrowLeft size={16} />}
          disabled={pending}
          onClick={() => (dirty ? setConfirm('leave') : onClose())}
        >
          回到總覽
        </Button>
        <Typography component="h1" sx={typography.heading[600]}>
          {briefing ? '編輯行前資訊' : '新增行前資訊'}
        </Typography>
        {dirty ? <Badge tone="warning">尚未儲存</Badge> : null}
      </Stack>
      <Callout tone="warning">
        儲存後會立即公開，所有志工與未登入的人都能閱讀。修改在確認儲存前不會公開。
      </Callout>
      {template ? (
        <Callout>請先核對範本中的地點、時間、聯絡方式與安全資訊。</Callout>
      ) : null}
      {error ? (
        <Callout tone="danger">
          儲存失敗，修改內容仍保留在編輯區。{error.message}
        </Callout>
      ) : null}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 260px' },
          gap: 2,
          alignItems: 'start',
        }}
      >
        <MarkdownEditor
          value={content}
          onChange={setContent}
          label="行前資訊內容"
          disabled={pending}
        />
        <Stack
          sx={{
            gap: 2,
            p: 2,
            position: { lg: 'sticky' },
            top: 0,
            bgcolor: color.bg.neutral.default,
            border: `1px solid ${color.border.default}`,
            borderRadius: `${radius.md}px`,
          }}
        >
          <Typography
            sx={{ ...typography.body[300], color: color.fg.neutral.subtle }}
          >
            {dirty ? '有尚未儲存的修改。' : '目前沒有未儲存的修改。'}字數{' '}
            {Array.from(content).length}
          </Typography>
          <Button
            startIcon={<Save size={16} />}
            disabled={pending || !dirty || !content.trim()}
            onClick={() => setConfirm('save')}
          >
            {pending ? '儲存中…' : '儲存並立即公開'}
          </Button>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => (dirty ? setConfirm('leave') : onClose())}
          >
            完成編輯，回到總覽
          </Button>
        </Stack>
      </Box>
      <Dialog
        open={confirm === 'save'}
        onClose={() => setConfirm(null)}
        onConfirm={save}
        title="確認儲存並公開？"
        confirmLabel={pending ? '儲存中…' : '確認儲存並公開'}
        submitting={pending}
        confirmDisabled={!dirty || !content.trim()}
        error={error?.message}
      >
        <Typography>
          {briefing
            ? '儲存後會立即取代這份公開內容，舊內容無法從此頁復原。'
            : '儲存後，所有志工與未登入的人都能立即閱讀這份內容。'}
        </Typography>
      </Dialog>
      <Dialog
        open={confirm === 'leave'}
        onClose={() => setConfirm(null)}
        onConfirm={onClose}
        title="離開編輯？"
        confirmLabel="捨棄修改並離開"
        confirmTone="danger"
      >
        <Typography>有尚未儲存的修改。離開後，這些修改將不會保留。</Typography>
      </Dialog>
    </Stack>
  );
}
