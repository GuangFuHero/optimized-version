'use client';

import {
  Box,
  CircularProgress,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import {
  BookOpen,
  Globe,
  History,
  Layers,
  PencilLine,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { useId, useState } from 'react';
import { toast } from 'sonner';

import {
  BriefingState,
  useBriefings,
  useBriefingTemplates,
  useCapability,
  useDeleteBriefing,
} from '@rescue-frontend/data-access/admin';
import {
  Badge,
  Button,
  Callout,
  Dialog,
  EmptyState,
  Markdown,
  MetadataTable,
  designTokens,
} from '@rescue-frontend/ui';

import { briefingTitle, type EditorSelection } from './briefing-content';
import { BriefingEditor } from './briefing-editor';
import { TemplatePicker } from './template-picker';

const { color, radius, typography } = designTokens;

const briefingTime = new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei',
  dateStyle: 'medium',
  timeStyle: 'short',
});

function BriefingsContent() {
  const id = useId();
  const query = useBriefings({ state: BriefingState.Briefing });
  const remove = useDeleteBriefing();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickingTemplate, setPickingTemplate] = useState(false);
  const templateQuery = useBriefingTemplates(
    { state: BriefingState.Briefing },
    { enabled: pickingTemplate },
  );
  const [editor, setEditor] = useState<EditorSelection | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [tab, setTab] = useState<'content' | 'history' | 'versions'>('content');
  const briefings = query.data?.briefings ?? [];
  const briefing =
    briefings.find((item) => item.uuid === selectedId) ?? briefings[0];

  if (editor) {
    return (
      <BriefingEditor
        selection={editor}
        onClose={() => setEditor(null)}
        onSaved={(uuid) => {
          setSelectedId(uuid);
          setEditor(null);
        }}
      />
    );
  }

  return (
    <Stack sx={{ gap: 2 }}>
      {query.isSuccess ? (
        <Callout tone={briefing ? 'success' : 'warning'}>
          {briefing ? (
            <>
              志工在前台<strong>看得到</strong>
              行前資訊。儲存修改後，公開內容會立即更新。
            </>
          ) : (
            <>
              前台<strong>目前沒有行前資訊</strong>
              。志工打開那一頁會看到空白提示。
            </>
          )}
        </Callout>
      ) : null}
      <Tabs
        value={tab}
        onChange={(_, value: typeof tab) => setTab(value)}
        aria-label="行前資訊管理"
      >
        <Tab
          id={`${id}-content`}
          value="content"
          label="內容"
          aria-controls={`${id}-panel`}
        />
        <Tab
          id={`${id}-history`}
          value="history"
          label="編輯紀錄"
          aria-controls={`${id}-panel`}
        />
        <Tab
          id={`${id}-versions`}
          value="versions"
          label="已發布版本"
          aria-controls={`${id}-panel`}
        />
      </Tabs>
      <Box role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}`}>
        {tab === 'content' ? (
          <Stack sx={{ gap: 2 }}>
            <Stack
              direction="row"
              sx={{ alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}
            >
              <Typography
                component="h1"
                sx={{ ...typography.heading[600], mr: 'auto' }}
              >
                前台現況
              </Typography>
              <Button
                variant="ghost"
                size="sm"
                startIcon={<RefreshCw size={16} />}
                disabled={query.isFetching || remove.isPending}
                onClick={() => void query.refetch()}
              >
                重新整理
              </Button>
              {briefing ? (
                <Button
                  startIcon={<PencilLine size={16} />}
                  disabled={remove.isPending}
                  onClick={() => setEditor({ kind: 'edit', briefing })}
                >
                  編輯內容
                </Button>
              ) : null}
            </Stack>

            {query.isPending ? (
              <CircularProgress
                aria-label="正在載入行前資訊"
                sx={{ alignSelf: 'center', my: 6 }}
              />
            ) : null}
            {query.isError ? (
              <Callout tone="danger">
                行前資訊載入失敗，請按「重新整理」重試。
              </Callout>
            ) : null}
            {query.isSuccess && !briefing ? (
              <Box
                sx={{
                  bgcolor: color.bg.neutral.default,
                  border: `1px solid ${color.border.default}`,
                  borderRadius: `${radius.lg}px`,
                  maxWidth: 620,
                  alignSelf: 'center',
                  width: '100%',
                }}
              >
                <EmptyState
                  icon={<BookOpen />}
                  title="還沒有志工行前資訊"
                  description="出發前，讓志工知道怎麼過來、帶什麼、到了找誰。可以選擇範本，也可以空白開始。"
                  action={
                    <Button
                      startIcon={<Plus size={16} />}
                      onClick={() => setPickingTemplate(true)}
                    >
                      新增行前資訊
                    </Button>
                  }
                />
              </Box>
            ) : null}

            {briefing ? (
              <>
                {briefings.length > 1 ? (
                  <FormControl fullWidth sx={{ maxWidth: 780 }}>
                    <InputLabel id="briefing-selection-label">
                      選擇行前資訊
                    </InputLabel>
                    <Select
                      labelId="briefing-selection-label"
                      label="選擇行前資訊"
                      value={briefing.uuid}
                      disabled={remove.isPending}
                      onChange={(event) => setSelectedId(event.target.value)}
                    >
                      {briefings.map((item) => (
                        <MenuItem key={item.uuid} value={item.uuid}>
                          {briefingTitle(item.content)}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                ) : null}
                <Box
                  component="article"
                  sx={{
                    p: { mobile: 2, tablet: 3 },
                    maxWidth: 780,
                    border: `1px solid ${color.border.default}`,
                    borderRadius: `${radius.lg}px`,
                    bgcolor: color.bg.neutral.default,
                  }}
                >
                  <Stack sx={{ gap: 2.5 }}>
                    <Stack
                      direction="row"
                      sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1 }}
                    >
                      <Globe size={16} color={color.fg.success} />
                      <Typography component="h2" sx={typography.label[500]}>
                        志工現在在前台看到的內容
                      </Typography>
                      <Badge tone="success">已公開</Badge>
                      <Typography
                        sx={{
                          ...typography.body[300],
                          ml: 'auto',
                          color: color.fg.neutral.muted,
                        }}
                      >
                        唯讀，修改請按「編輯內容」
                      </Typography>
                    </Stack>
                    <Divider />
                    <MetadataTable
                      rows={[
                        {
                          label: '建立時間',
                          value: briefing.createdAt
                            ? briefingTime.format(new Date(briefing.createdAt))
                            : null,
                        },
                        {
                          label: '最後更新',
                          value: briefing.updatedAt
                            ? briefingTime.format(new Date(briefing.updatedAt))
                            : null,
                        },
                      ]}
                    />
                    <Divider />
                    {briefing.content.trim() ? (
                      <Markdown source={briefing.content} navigation />
                    ) : (
                      <Typography sx={{ color: color.fg.neutral.muted }}>
                        這份行前資訊沒有內容，請編輯補上。
                      </Typography>
                    )}
                  </Stack>
                </Box>
                <Box
                  component="details"
                  sx={{
                    maxWidth: 780,
                    borderTop: `1px solid ${color.border.default}`,
                    pt: 1.5,
                  }}
                >
                  <Box
                    component="summary"
                    sx={{
                      cursor: 'pointer',
                      color: color.fg.neutral.subtle,
                      ...typography.body[300],
                      py: 1,
                    }}
                  >
                    更多動作
                  </Box>
                  <Button
                    variant="ghost"
                    startIcon={<Trash2 size={16} />}
                    sx={{ color: color.fg.danger }}
                    disabled={remove.isPending}
                    onClick={() => {
                      remove.reset();
                      setConfirmingDelete(true);
                    }}
                  >
                    刪除行前資訊
                  </Button>
                </Box>
                <Dialog
                  open={confirmingDelete}
                  onClose={() => setConfirmingDelete(false)}
                  onConfirm={() => {
                    if (remove.isPending) return;
                    remove.mutate(
                      { uuid: briefing.uuid },
                      {
                        onSuccess: () => {
                          setConfirmingDelete(false);
                          setSelectedId(null);
                          toast.success('行前資訊已刪除，不再公開。');
                        },
                      },
                    );
                  }}
                  title="確認刪除行前資訊？"
                  confirmLabel={remove.isPending ? '刪除中…' : '確認刪除'}
                  confirmTone="danger"
                  submitting={remove.isPending}
                  error={remove.error?.message}
                >
                  <Typography>
                    刪除後，這份內容不再公開，且無法從此頁復原。
                  </Typography>
                </Dialog>
              </>
            ) : null}
          </Stack>
        ) : (
          <Box
            sx={{
              p: { mobile: 2, tablet: 3 },
              bgcolor: color.bg.neutral.default,
              border: `1px solid ${color.border.default}`,
              borderRadius: `${radius.md}px`,
            }}
          >
            <EmptyState
              icon={tab === 'history' ? <History /> : <Layers />}
              title={
                tab === 'history' ? '尚未提供編輯紀錄' : '尚未提供過往版本'
              }
              description={
                tab === 'history'
                  ? '目前僅提供最新公開內容，儲存與修改的操作紀錄尚未開放查閱。'
                  : '目前僅保留最新公開內容，尚未留存過往版本。修改前請另行備份需要保留的內容。'
              }
            />
          </Box>
        )}
      </Box>
      {pickingTemplate ? (
        <TemplatePicker
          templates={templateQuery.data?.briefingTemplates ?? []}
          pending={templateQuery.isPending}
          error={templateQuery.isError}
          onRetry={() => void templateQuery.refetch()}
          onClose={() => setPickingTemplate(false)}
          onPick={(selection) => {
            setPickingTemplate(false);
            setEditor(selection);
          }}
        />
      ) : null}
    </Stack>
  );
}

export function BriefingsPage() {
  const canPublish = useCapability('pre_departure.publish');

  return (
    <Box sx={{ p: { mobile: 2, tablet: 3 }, maxWidth: 1136, width: '100%' }}>
      {canPublish.isPending ? (
        <CircularProgress aria-label="正在確認身分" />
      ) : canPublish.isError ? (
        <Callout tone="danger">
          無法確認目前身分。
          <Button
            variant="ghost"
            size="sm"
            disabled={canPublish.isFetching}
            onClick={() => void canPublish.refetch()}
          >
            重試
          </Button>
        </Callout>
      ) : canPublish.data ? (
        <BriefingsContent />
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
