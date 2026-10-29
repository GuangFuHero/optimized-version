'use client';

import { Box, CircularProgress, Stack, Tab, Typography } from '@mui/material';
import {
  BookOpen,
  EyeOff,
  PencilLine,
  Plus,
  Send,
  ShieldAlert,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  BriefingState,
  BriefingStatus,
  BriefingStatusFilter,
  useBriefings,
  useBriefingTemplates,
  useCurrentUser,
  useGenerateBriefing,
  usePublishBriefing,
} from '@rescue-frontend/data-access/admin';
import {
  Badge,
  Button,
  Callout,
  Card,
  EmptyState,
  Tabs,
  designTokens,
} from '@rescue-frontend/ui';

import {
  briefingTime,
  type Briefing,
  type BriefingTemplate,
} from './briefing-content';
import { BriefingEditor } from './briefing-editor';
import { BriefingHistory } from './briefing-history';
import { BriefingPreview, BriefingStamp } from './briefing-preview';
import { BriefingPublicationNotice } from './briefing-publication-notice';
import { BriefingVersions } from './briefing-versions';
import { TakeDownBriefingConfirm } from './take-down-briefing-confirm';
import { TemplatePicker } from './template-picker';

const { color, typography } = designTokens;

function BriefingsContent({
  canPublish,
  canDiscard,
}: {
  canPublish: boolean;
  canDiscard: boolean;
}) {
  const query = useBriefings({
    state: BriefingState.Briefing,
    status: BriefingStatusFilter.All,
  });
  const create = useGenerateBriefing();
  const publish = usePublishBriefing();
  const [editing, setEditing] = useState<Briefing | null>(null);
  const [pickingTemplate, setPickingTemplate] = useState(false);
  const [showDraft, setShowDraft] = useState(false);
  const [confirm, setConfirm] = useState<'publish' | 'takeDown' | null>(null);
  const [tab, setTab] = useState<'content' | 'history' | 'versions'>('content');
  const templates = useBriefingTemplates(
    { state: BriefingState.Briefing },
    { enabled: pickingTemplate && canPublish },
  );
  const briefings = query.data?.briefings ?? [];
  const drafts = briefings.filter(
    (item) => item.status === BriefingStatus.Draft,
  );
  const versions = briefings.filter(
    (item) => item.status !== BriefingStatus.Draft,
  );
  const draft = drafts[0];
  const published = versions.find(
    (item) => item.status === BriefingStatus.Published,
  );
  const editor = drafts.find((item) => item.uuid === editing?.uuid);
  const pending = create.isPending || publish.isPending;
  const hasDraftChanges =
    draft && (!published || draft.content !== published.content);
  const viewing =
    showDraft && hasDraftChanges ? draft : (published ?? draft ?? versions[0]);

  function startDraft(template?: BriefingTemplate) {
    if (pending || query.isError) return;
    const source = versions[0];
    create.mutate(
      {
        input: source
          ? { sourceBriefingUuid: source.uuid }
          : {
              content: template?.content ?? '',
              state: BriefingState.Briefing,
              tags: template?.tags ?? [],
              templateUuid: template?.uuid ?? null,
            },
      },
      {
        onSuccess: ({ generateBriefing }) => {
          setPickingTemplate(false);
          setEditing(generateBriefing);
          create.reset();
          if (!source) toast.success('草稿已建立，確認內容後再發布到前台。');
        },
      },
    );
  }

  if (query.isPending && !editing) {
    return (
      <CircularProgress
        aria-label="正在載入行前資訊"
        sx={{ alignSelf: 'center', my: 6 }}
      />
    );
  }

  return (
    <Stack sx={{ gap: 2 }}>
      {query.isError ? (
        <Callout tone="danger">
          行前資訊載入失敗，請重新整理後再操作。
          <Button
            variant="ghost"
            size="sm"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            重新整理
          </Button>
        </Callout>
      ) : null}
      <BriefingPublicationNotice
        published={published}
        versionCount={versions.length}
        hasDraftChanges={Boolean(hasDraftChanges)}
      />
      {viewing || editing ? (
        <Tabs
          value={tab}
          onChange={(_, value: typeof tab) => {
            setTab(value);
            setShowDraft(false);
          }}
          aria-label="行前資訊"
          sx={{ minWidth: 0 }}
        >
          <Tab
            id="briefings-content-tab"
            value="content"
            label="內容"
            aria-controls="briefings-content-panel"
          />
          <Tab
            id="briefings-history-tab"
            value="history"
            label="編輯紀錄"
            aria-controls="briefings-history-panel"
          />
          <Tab
            id="briefings-versions-tab"
            value="versions"
            label="已發布版本"
            aria-controls="briefings-versions-panel"
          />
        </Tabs>
      ) : null}
      {create.isError ? (
        <Callout tone="danger">無法建立草稿。{create.error.message}</Callout>
      ) : null}
      {editing ? (
        <Box
          role="tabpanel"
          id="briefings-content-panel"
          aria-labelledby="briefings-content-tab"
          hidden={tab !== 'content'}
        >
          <BriefingEditor
            key={editing.uuid}
            draft={editor ?? editing}
            available={Boolean(editor)}
            onRefresh={async () => {
              const result = await query.refetch({ throwOnError: true });
              return result.data?.briefings.find(
                (item) => item.uuid === editing.uuid,
              );
            }}
            published={published}
            versionCount={versions.length}
            canPublish={canPublish}
            canDiscard={canDiscard}
            onClose={() => {
              setEditing(null);
              setShowDraft(false);
            }}
          />
        </Box>
      ) : null}
      {tab === 'history' && (viewing || editing) ? (
        <Box
          role="tabpanel"
          id="briefings-history-panel"
          aria-labelledby="briefings-history-tab"
        >
          <BriefingHistory briefings={briefings} versions={versions} />
        </Box>
      ) : tab === 'versions' && (viewing || editing) ? (
        <Box
          role="tabpanel"
          id="briefings-versions-panel"
          aria-labelledby="briefings-versions-tab"
        >
          <BriefingVersions versions={versions} />
        </Box>
      ) : editing ? null : viewing ? (
        <Stack
          role="tabpanel"
          id="briefings-content-panel"
          aria-labelledby="briefings-content-tab"
          sx={{ gap: 2 }}
        >
          <Stack
            direction="row"
            sx={{ alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}
          >
            <Badge
              tone={
                !published ? 'warning' : hasDraftChanges ? 'info' : 'success'
              }
            >
              {!published
                ? draft
                  ? '草稿'
                  : '已下架'
                : hasDraftChanges
                  ? '對外中 · 有未發布的修改'
                  : '對外中'}
            </Badge>
            <Typography
              component="span"
              sx={{ ...typography.body[300], color: color.fg.neutral.muted }}
            >
              {published?.publishedAt ? (
                <>
                  第 {versions.length} 版 ·{' '}
                  <time dateTime={published.publishedAt}>
                    {briefingTime(published.publishedAt)}
                  </time>{' '}
                  由 {published.publisher?.name ?? '發布者未提供'} 發布
                </>
              ) : versions.length ? (
                '目前未對外（曾發布過，已下架）'
              ) : (
                '從未對外'
              )}
            </Typography>
            <Stack
              direction="row"
              sx={{ ml: 'auto', gap: 1, flexWrap: 'wrap' }}
            >
              <Button
                startIcon={<PencilLine size={16} />}
                disabled={pending || query.isError}
                onClick={() => (draft ? setEditing(draft) : startDraft())}
              >
                {create.isPending ? '建立草稿中…' : '編輯內容'}
              </Button>
              {draft && canPublish && hasDraftChanges ? (
                <Button
                  variant="outline"
                  startIcon={<Send size={16} />}
                  disabled={pending || query.isError || !draft.content.trim()}
                  onClick={() => {
                    publish.reset();
                    setConfirm('publish');
                  }}
                >
                  {published ? '發布修改' : '發布到前台'}
                </Button>
              ) : null}
              {published ? (
                <Button
                  variant="ghost"
                  startIcon={<EyeOff size={16} />}
                  disabled={pending || query.isError}
                  onClick={() => setConfirm('takeDown')}
                >
                  從前台下架
                </Button>
              ) : null}
            </Stack>
          </Stack>
          {draft && canPublish && confirm === 'publish' ? (
            <Callout tone="danger">
              <strong>確認發布？</strong>
              <br />
              發布後<strong>所有志工立刻看到這一份</strong>（含未登入的人）。
              {published ? (
                <>
                  目前的第 {versions.length} 版會<strong>整份被取代</strong>。
                </>
              ) : (
                '這會是第一次對外。'
              )}
              {published && !showDraft ? (
                <>
                  <br />
                  ⚠️ 你現在看的是<strong>已發布的那一版</strong>
                  。建議先按「看未發布的修改」確認要發出去的內容。
                </>
              ) : null}
              {publish.error ? (
                <>
                  <br />
                  發布失敗。{publish.error.message}
                </>
              ) : null}
              <Stack direction="row" sx={{ gap: 1, mt: 1, flexWrap: 'wrap' }}>
                <Button
                  size="sm"
                  disabled={pending || query.isError || !draft.content.trim()}
                  onClick={() =>
                    publish.mutate(
                      { uuid: draft.uuid },
                      {
                        onSuccess: () => {
                          setConfirm(null);
                          setShowDraft(false);
                          toast.success(
                            '已發布到前台，志工現在看到的是這份內容。',
                          );
                        },
                      },
                    )
                  }
                >
                  {publish.isPending ? '發布中…' : '確認發布'}
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
          ) : null}
          {published && confirm === 'takeDown' ? (
            <TakeDownBriefingConfirm
              briefing={published}
              onClose={() => setConfirm(null)}
            />
          ) : null}
          {published && draft && hasDraftChanges ? (
            <Callout tone="info">
              有一份還沒發布的修改，志工目前看到的仍是已發布的內容。
              <BriefingStamp briefing={draft} />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDraft(!showDraft)}
              >
                {showDraft ? '看志工目前看到的' : '看未發布的修改'}
              </Button>
            </Callout>
          ) : null}
          {drafts.length > 1 ? (
            <Callout tone="warning">
              有 {drafts.length} 份未發布草稿，目前顯示最近儲存的一份。
            </Callout>
          ) : null}
          <BriefingPreview
            content={viewing.content}
            briefing={viewing}
            versionNumber={
              viewing.status === BriefingStatus.Draft
                ? undefined
                : versions.length - versions.indexOf(viewing)
            }
            readOnly
            tone={
              viewing.status === BriefingStatus.Published
                ? 'success'
                : published
                  ? 'info'
                  : 'warning'
            }
            title={
              viewing.status === BriefingStatus.Published
                ? '志工現在在前台看到的內容'
                : viewing.status === BriefingStatus.Inactive
                  ? '已從前台下架，志工看不到'
                  : published
                    ? '未發布的修改（志工看不到）'
                    : '這一份還沒對外，志工看不到'
            }
          />
        </Stack>
      ) : query.isSuccess ? (
        <Card sx={{ maxWidth: 620, alignSelf: 'center', width: '100%', p: 4 }}>
          <EmptyState
            icon={<BookOpen />}
            title="還沒有志工行前資訊"
            description="一個專案只需要一份行前資訊。可以從範本開始，也可以空白開始，確認後再發布。"
            action={
              <Button
                startIcon={<Plus size={16} />}
                onClick={() => setPickingTemplate(true)}
              >
                新增行前資訊
              </Button>
            }
          />
        </Card>
      ) : null}
      {pickingTemplate ? (
        <TemplatePicker
          onClose={() => {
            setPickingTemplate(false);
            create.reset();
          }}
          onPick={startDraft}
          templates={templates.data?.briefingTemplates ?? []}
          pending={canPublish && templates.isPending}
          error={templates.isError}
          onRetry={() => void templates.refetch()}
          submitting={create.isPending}
          creationError={create.error?.message}
        />
      ) : null}
    </Stack>
  );
}

export function BriefingsPage() {
  const user = useCurrentUser();
  const identity = user.data?.active_identity;
  const canManage = user.data?.capabilities.includes('pre_departure.edit');

  return (
    <Box
      sx={{
        p: { mobile: '12px 16px 28px', tablet: '12px 28px 28px' },
        maxWidth: 1136,
        width: '100%',
      }}
    >
      {user.isPending ? (
        <CircularProgress aria-label="正在確認身分" />
      ) : user.isError ? (
        <Callout tone="danger">
          無法確認目前身分。
          <Button
            variant="ghost"
            size="sm"
            disabled={user.isFetching}
            onClick={() => {
              void user.refetch();
            }}
          >
            重試
          </Button>
        </Callout>
      ) : canManage ? (
        <BriefingsContent
          key={`${identity?.role_uuid}:${identity?.team_uuid ?? ''}`}
          canPublish={user.data.capabilities.includes('pre_departure.publish')}
          canDiscard={user.data.capabilities.includes('pre_departure.delete')}
        />
      ) : (
        <EmptyState
          icon={<ShieldAlert />}
          title="目前身分無法維護行前資訊"
          description="請從帳號選單切換至可維護行前資訊的身分。"
        />
      )}
    </Box>
  );
}
