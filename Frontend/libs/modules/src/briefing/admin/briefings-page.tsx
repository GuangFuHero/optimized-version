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
  Typography,
} from '@mui/material';
import {
  BookOpen,
  Globe,
  PencilLine,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  BriefingState,
  useBriefings,
  useCurrentUser,
  useDeleteBriefing,
  useTeams,
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

import {
  briefingTime,
  briefingTitle,
  type Briefing,
  type BriefingTemplate,
} from './briefing-content';
import { BriefingEditor } from './briefing-editor';
import { TemplatePicker } from './template-picker';

const { color, radius, typography } = designTokens;

type EditorSelection =
  | { kind: 'new'; template?: BriefingTemplate }
  | { kind: 'edit'; briefing: Briefing };

function BriefingsContent() {
  const query = useBriefings({ state: BriefingState.Briefing });
  const remove = useDeleteBriefing();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickingTemplate, setPickingTemplate] = useState(false);
  const [editor, setEditor] = useState<EditorSelection | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Briefing | null>(null);
  const briefings = query.data?.briefings ?? [];
  const briefing =
    briefings.find((item) => item.uuid === selectedId) ?? briefings[0];

  if (editor) {
    return (
      <BriefingEditor
        briefing={editor.kind === 'edit' ? editor.briefing : undefined}
        template={editor.kind === 'new' ? editor.template : undefined}
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
      <Stack
        direction="row"
        sx={{ alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}
      >
        <Typography
          component="h1"
          sx={{ ...typography.heading[600], mr: 'auto' }}
        >
          公開內容總覽
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
        <>
          <Callout tone="warning">目前沒有公開的行前資訊。</Callout>
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
        </>
      ) : null}

      {briefing ? (
        <>
          <Callout tone="success">
            目前有 {briefings.length}{' '}
            份公開行前資訊。已儲存的內容，未登入的人也能閱讀。
          </Callout>
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
              p: { xs: 2, md: 3 },
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
                  目前公開的內容
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
                      ? briefingTime(briefing.createdAt)
                      : null,
                  },
                  {
                    label: '最後更新',
                    value: briefing.updatedAt
                      ? briefingTime(briefing.updatedAt)
                      : null,
                  },
                ]}
              />
              <Divider />
              {briefing.content.trim() ? (
                <Markdown source={briefing.content} />
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
                setDeleteTarget(briefing);
              }}
            >
              刪除行前資訊
            </Button>
          </Box>
          <Dialog
            open={Boolean(deleteTarget)}
            onClose={() => setDeleteTarget(null)}
            onConfirm={() => {
              if (remove.isPending || !deleteTarget) return;
              remove.mutate(
                { uuid: deleteTarget.uuid },
                {
                  onSuccess: () => {
                    setDeleteTarget(null);
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

      {pickingTemplate ? (
        <TemplatePicker
          onClose={() => setPickingTemplate(false)}
          onPick={(template) => {
            setPickingTemplate(false);
            setEditor({ kind: 'new', template });
          }}
        />
      ) : null}
    </Stack>
  );
}

export function BriefingsPage() {
  const user = useCurrentUser();
  const identity = user.data?.active_identity;
  const teams = useTeams({ enabled: Boolean(identity?.team_uuid) });
  const loading =
    user.isPending || Boolean(identity?.team_uuid && teams.isPending);
  const failed = user.isError || Boolean(identity?.team_uuid && teams.isError);
  const canManage =
    identity?.role === 'super_admin' ||
    teams.data?.some(
      (team) => team.uuid === identity?.team_uuid && team.type === 'gov',
    );

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1136 }}>
      {loading ? (
        <CircularProgress aria-label="正在確認身分" />
      ) : failed ? (
        <Callout tone="danger">
          無法確認目前身分。
          <Button
            variant="ghost"
            size="sm"
            disabled={user.isFetching || teams.isFetching}
            onClick={() => {
              void user.refetch();
              if (identity?.team_uuid) void teams.refetch();
            }}
          >
            重試
          </Button>
        </Callout>
      ) : canManage ? (
        <BriefingsContent
          key={`${identity?.role_uuid}:${identity?.team_uuid ?? ''}`}
        />
      ) : (
        <EmptyState
          icon={<ShieldAlert />}
          title="這一頁需要超級管理員或政府身分"
          description="請從帳號選單切換至可維護行前資訊的身分。"
        />
      )}
    </Box>
  );
}
