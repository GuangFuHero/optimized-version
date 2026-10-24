'use client';

import { Box, Stack, Typography } from '@mui/material';
import { ArrowLeft, Check, EyeOff, Save, Send, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import {
  BriefingStatus,
  useDeleteBriefing,
  usePublishBriefing,
  useUpdateBriefing,
} from '@rescue-frontend/data-access/admin';
import {
  Badge,
  Button,
  Callout,
  Card,
  MarkdownEditor,
  designTokens,
} from '@rescue-frontend/ui';

import type { Briefing } from './briefing-content';
import { BriefingPreview, BriefingStamp } from './briefing-preview';
import { TakeDownBriefingConfirm } from './take-down-briefing-confirm';

const { color, typography } = designTokens;

export function BriefingEditor({
  draft,
  available,
  onRefresh,
  published,
  versionCount,
  canPublish,
  canDiscard,
  onClose,
}: {
  draft: Briefing;
  available: boolean;
  onRefresh: () => Promise<Briefing | undefined>;
  published?: Briefing;
  versionCount: number;
  canPublish: boolean;
  canDiscard: boolean;
  onClose: () => void;
}) {
  const [content, setContent] = useState(draft.content);
  const [confirm, setConfirm] = useState<
    'publish' | 'leave' | 'discard' | 'takeDown' | null
  >(null);
  const update = useUpdateBriefing();
  const publish = usePublishBriefing();
  const discard = useDeleteBriefing();
  const [checking, setChecking] = useState(false);
  const pending =
    checking || update.isPending || publish.isPending || discard.isPending;
  const error = update.error ?? publish.error ?? discard.error;
  const dirty = content !== draft.content;
  const empty = !content.trim();

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  async function save(action: 'save' | 'leave' | 'publish') {
    if (
      pending ||
      !available ||
      (action === 'publish' && (empty || !canPublish))
    )
      return;
    update.reset();
    publish.reset();
    discard.reset();
    try {
      if (dirty) {
        await update.mutateAsync({ uuid: draft.uuid, input: { content } });
      }
      if (action === 'publish') {
        await publish.mutateAsync({ uuid: draft.uuid });
        toast.success('已發布到前台，志工現在看到的是這份內容。');
        onClose();
      } else {
        toast.success('草稿已儲存，前台內容沒有變更。');
        if (action === 'leave') onClose();
      }
    } catch {
      // Mutation errors remain visible while the editor keeps the working content.
    }
  }

  async function discardDraft() {
    if (pending || !canDiscard || !available) return;
    setChecking(true);
    try {
      const latest = await onRefresh();
      if (!latest || latest.status !== BriefingStatus.Draft) {
        setConfirm(null);
        toast.error('這份草稿已發布或已移除，沒有丟棄任何內容。');
        return;
      }
      await discard.mutateAsync({ uuid: draft.uuid });
      toast.success('草稿已丟棄。');
      onClose();
    } catch {
      toast.error('無法丟棄草稿，請重新整理後再試。');
    } finally {
      setChecking(false);
    }
  }

  return (
    <Stack sx={{ gap: 2 }}>
      <Stack
        direction="row"
        sx={{ gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}
      >
        <Button
          variant="outline"
          startIcon={<ArrowLeft size={16} />}
          disabled={pending}
          onClick={() => (dirty ? setConfirm('leave') : onClose())}
        >
          完成編輯
        </Button>
        <Badge tone={published ? 'info' : 'warning'}>
          {published ? '編輯中的草稿' : '尚未發布'}
        </Badge>
        {dirty ? <Badge tone="warning">尚未儲存</Badge> : null}
        <BriefingStamp briefing={draft} />
      </Stack>
      {!available ? (
        <Callout tone="warning">
          這份草稿已發布或已移除，目前的修改仍保留在編輯區。請先複製內容後再離開。
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void navigator.clipboard.writeText(content).then(
                () => toast.success('已複製 Markdown 內容。'),
                () => toast.error('複製失敗，請從編輯區選取並複製內容。'),
              );
            }}
          >
            複製目前內容
          </Button>
        </Callout>
      ) : null}
      <Callout tone="info">
        這裡改的是草稿，儲存不會變更前台內容。
        {published
          ? '志工目前看到的仍是已發布的內容，直到你按下「發布到前台」。'
          : '前台目前沒有行前資訊，要按「發布到前台」才會出現。'}
        {published ? (
          <BriefingStamp briefing={published} versionNumber={versionCount} />
        ) : null}
      </Callout>
      {error ? (
        <Callout tone="danger">
          操作失敗，修改內容仍保留在編輯區。{error.message}
        </Callout>
      ) : null}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            mobile: '1fr',
            desktop: 'minmax(0, 1fr) 280px',
          },
          gap: 2,
          alignItems: 'start',
        }}
      >
        <MarkdownEditor
          defaultValue={draft.content}
          onChange={setContent}
          label="行前資訊內容"
          helperText="用段落標題分段，段裡再用小標題細分。可勾項目讓志工在前台逐項打勾。"
          disabled={pending || !available}
          previewLabel="志工看到的樣子"
          preview={
            <BriefingPreview
              content={content}
              title="目前編輯中的內容，發布前志工看不到這份修改。"
            />
          }
        />
        <Stack sx={{ gap: 2, position: { desktop: 'sticky' }, top: 0 }}>
          {confirm === 'publish' ? (
            <Callout tone="danger">
              <strong>確認發布？</strong>
              <br />
              發布後，<strong>所有志工立刻看到這一份</strong>（含未登入的人）。
              {published ? (
                <>
                  目前的第 {versionCount} 版會<strong>整份被取代</strong>
                  ，舊內容不會殘留在頁面上。
                </>
              ) : (
                '這會是第一次對外。'
              )}
              <Stack direction="row" sx={{ gap: 1, mt: 1, flexWrap: 'wrap' }}>
                <Button
                  size="sm"
                  disabled={pending || empty || !canPublish || !available}
                  onClick={() => void save('publish')}
                >
                  {publish.isPending ? '發布中…' : '確認發布'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => setConfirm(null)}
                >
                  返回修改
                </Button>
              </Stack>
            </Callout>
          ) : confirm === 'discard' ? (
            <Callout tone="danger">
              <strong>確認丟棄草稿？</strong>
              <br />
              {published
                ? `丟棄後回到目前對外的第 ${versionCount} 版，草稿的修改救不回來。`
                : '丟棄後草稿的修改救不回來。'}
              <Stack direction="row" sx={{ gap: 1, mt: 1, flexWrap: 'wrap' }}>
                <Button
                  size="sm"
                  disabled={pending || !available}
                  onClick={() => void discardDraft()}
                >
                  {discard.isPending ? '丟棄中…' : '確認丟棄'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => setConfirm(null)}
                >
                  取消
                </Button>
              </Stack>
            </Callout>
          ) : confirm === 'leave' ? (
            <Callout tone="warning">
              有還沒儲存的修改，離開就沒了。
              <Stack direction="row" sx={{ gap: 1, mt: 1, flexWrap: 'wrap' }}>
                <Button
                  size="sm"
                  disabled={pending || !available}
                  onClick={() => void save('leave')}
                >
                  {update.isPending ? '儲存中…' : '存成草稿再離開'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={onClose}
                >
                  直接離開
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => setConfirm(null)}
                >
                  取消
                </Button>
              </Stack>
            </Callout>
          ) : published && confirm === 'takeDown' ? (
            <TakeDownBriefingConfirm
              briefing={published}
              onClose={() => setConfirm(null)}
            />
          ) : (
            <Card>
              <Stack sx={{ gap: 1.5 }}>
                <Typography
                  sx={{
                    ...typography.body[300],
                    color: color.fg.neutral.subtle,
                  }}
                >
                  {dirty ? '有尚未儲存的修改。' : '目前沒有未儲存的修改。'}
                  <br />
                  字數 {Array.from(content).length}
                </Typography>
                <Button
                  variant="outline"
                  startIcon={<Save size={16} />}
                  disabled={pending || !dirty || !available}
                  onClick={() => void save('save')}
                >
                  {update.isPending ? '儲存中…' : '儲存草稿'}
                </Button>
                {canPublish ? (
                  <Button
                    startIcon={<Send size={16} />}
                    disabled={pending || empty || !available}
                    onClick={() => setConfirm('publish')}
                  >
                    發布到前台
                  </Button>
                ) : (
                  <Typography sx={typography.body[300]}>
                    目前身分可以儲存草稿，沒有發布權限。
                  </Typography>
                )}
                {empty ? (
                  <Typography sx={typography.body[300]}>
                    草稿可以留白，發布前請補上內容。
                  </Typography>
                ) : null}
                <Button
                  variant="outline"
                  startIcon={<Check size={16} />}
                  disabled={pending}
                  onClick={() => (dirty ? setConfirm('leave') : onClose())}
                >
                  完成編輯，回到總覽
                </Button>
                {canDiscard || published ? (
                  <Box
                    component="details"
                    sx={{
                      borderTop: `1px solid ${color.border.default}`,
                      pt: 1.5,
                    }}
                  >
                    <Box
                      component="summary"
                      sx={{
                        cursor: 'pointer',
                        ...typography.body[300],
                        color: color.fg.neutral.muted,
                      }}
                    >
                      更多動作
                    </Box>
                    {canDiscard ? (
                      <Button
                        variant="ghost"
                        startIcon={<Trash2 size={16} />}
                        sx={{ mt: 1, color: color.fg.danger }}
                        disabled={pending || !available}
                        onClick={() => setConfirm('discard')}
                      >
                        丟棄草稿
                      </Button>
                    ) : null}
                    {published ? (
                      <Button
                        variant="ghost"
                        startIcon={<EyeOff size={16} />}
                        sx={{ mt: 1, color: color.fg.danger }}
                        disabled={pending}
                        onClick={() => setConfirm('takeDown')}
                      >
                        從前台下架
                      </Button>
                    ) : null}
                  </Box>
                ) : null}
              </Stack>
            </Card>
          )}
          <Card>
            <Typography
              sx={{ ...typography.body[300], color: color.fg.neutral.subtle }}
            >
              寫給還沒出發、對現場不熟悉的人。請核對地點、時間、聯絡方式與安全資訊。
            </Typography>
          </Card>
        </Stack>
      </Box>
    </Stack>
  );
}
