'use client';

import {
  Box,
  Stack,
  Tab,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { Globe, Globe2, Lock, Megaphone } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  AnnouncementFilter,
  AnnouncementPlacement,
  useAnnouncements,
  useCreateAnnouncement,
  useCurrentUser,
  useSetAnnouncementActive,
  type AdminAnnouncementsQuery,
} from '@rescue-frontend/data-access/admin';
import {
  AnnouncementBanner,
  Badge,
  Button,
  Callout,
  designTokens,
  Dialog,
  EmptyState,
  SegmentedTabs,
  TextInput,
  Timeline,
  type BadgeTone,
  type TimelineItem,
} from '@rescue-frontend/ui';

const { color, radius, typography } = designTokens;

const MAX_LENGTH = 50;

const TARGETS: Record<
  AnnouncementPlacement,
  {
    label: string;
    hint: string;
    audience: string;
    Icon: typeof Globe;
    tone: BadgeTone;
  }
> = {
  [AnnouncementPlacement.PublicPage]: {
    label: '前台',
    hint: '含未登入訪客',
    audience:
      '所有人都看得到，包含未登入的訪客。發出後無法收回已被看到的內容。',
    Icon: Globe,
    tone: 'warning',
  },
  [AnnouncementPlacement.AdminPage]: {
    label: '後台',
    hint: '僅後台使用者',
    audience: '所有後台使用者都看得到，包含其他單位與其他團隊。',
    Icon: Lock,
    tone: 'info',
  },
  [AnnouncementPlacement.All]: {
    label: '前後台同時',
    hint: '兩邊一起關',
    audience:
      '前台所有人（含未登入的訪客）與所有後台使用者都看得到。發出後無法收回已被看到的內容。',
    Icon: Globe2,
    tone: 'secondary',
  },
};

type Announcement = AdminAnnouncementsQuery['announcements'][number];

function announcementPlacement(placement: Announcement['placement']) {
  switch (placement) {
    case AnnouncementPlacement.PublicPage:
    case AnnouncementPlacement.All:
      return placement;
    default:
      return AnnouncementPlacement.AdminPage;
  }
}

export function AnnouncementPage() {
  const [publishing, setPublishing] = useState(false);
  const [tab, setTab] = useState<'live' | 'history'>('live');
  const { data: user } = useCurrentUser();
  const canEdit = user?.capabilities.includes('announcement.edit') ?? false;
  const canPublish =
    canEdit && (user?.capabilities.includes('announcement.publish') ?? false);
  const activeTab = canEdit ? tab : 'live';
  const { data, isPending, isError } = useAnnouncements({
    filter:
      activeTab === 'history'
        ? AnnouncementFilter.All
        : AnnouncementFilter.Active,
    placement: AnnouncementPlacement.All,
  });
  const live =
    data?.announcements.filter((announcement) => announcement.active) ?? [];
  const history =
    data?.announcements
      .flatMap((announcement) => {
        if (!announcement.publishedAt) return [];
        const target = TARGETS[announcementPlacement(announcement.placement)];

        return [
          {
            id: announcement.uuid,
            at: announcement.publishedAt,
            actor: announcement.publisher?.name ?? '發布者未提供',
            tone: 'danger',
            icon: <Megaphone />,
            title: (
              <>
                <span>發布</span>
                <Badge tone={target.tone} icon={<target.Icon size={12} />}>
                  {target.label}
                </Badge>
                <Badge tone={announcement.active ? 'success' : 'neutral'}>
                  {announcement.active ? '顯示中' : '已下架'}
                </Badge>
              </>
            ),
            content: (
              <Box sx={{ ...typography.body[400], lineHeight: 1.65 }}>
                {announcement.content}
              </Box>
            ),
          } satisfies TimelineItem,
        ];
      })
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()) ??
    [];

  return (
    <Stack sx={{ maxWidth: 780, p: 3, gap: 2 }}>
      <Stack
        direction="row"
        sx={{ alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}
      >
        {canPublish ? (
          <Button
            startIcon={<Megaphone size={16} />}
            disabled={!data}
            onClick={() => setPublishing(true)}
          >
            發布公告
          </Button>
        ) : null}
        <SegmentedTabs
          value={activeTab}
          onChange={(_, value: 'live' | 'history') => setTab(value)}
          aria-label="公告列表"
          sx={{ ml: 'auto', alignSelf: 'auto' }}
        >
          <Tab
            id="announcements-live-tab"
            aria-controls="announcements-live-panel"
            value="live"
            label="目前公告"
          />
          {canEdit ? (
            <Tab
              id="announcements-history-tab"
              aria-controls="announcements-history-panel"
              value="history"
              label="歷史紀錄"
            />
          ) : null}
        </SegmentedTabs>
      </Stack>

      {isPending ? (
        <Box>載入公告中…</Box>
      ) : isError ? (
        <Callout tone="danger">無法載入公告，請重新整理頁面。</Callout>
      ) : activeTab === 'live' ? (
        <Stack
          role="tabpanel"
          id="announcements-live-panel"
          aria-labelledby="announcements-live-tab"
          sx={{ gap: 2 }}
        >
          {live.length === 0 ? (
            <Box sx={cardSx}>
              <EmptyState
                icon={<Megaphone />}
                title="目前沒有任何公告"
                description={
                  canPublish
                    ? '要對外或對內廣播一句話時，按「發布公告」。'
                    : undefined
                }
              />
            </Box>
          ) : (
            live.map((announcement) => (
              <LiveAnnouncement
                key={announcement.uuid}
                announcement={announcement}
                canEdit={canEdit}
              />
            ))
          )}
        </Stack>
      ) : (
        <Stack
          role="tabpanel"
          id="announcements-history-panel"
          aria-labelledby="announcements-history-tab"
          sx={{ ...cardSx, gap: '14px' }}
        >
          <Box sx={{ ...typography.body[300], color: color.fg.neutral.muted }}>
            依最近發布時間排序，顯示公告目前的文字與狀態。不含草稿、關閉與取代事件，也不保留先前的文字及發布紀錄。
          </Box>
          <Timeline items={history} showIcons emptyText="尚無發布紀錄。" />
        </Stack>
      )}

      {publishing && canPublish ? (
        <PublishAnnouncementDialog
          live={live}
          onClose={() => setPublishing(false)}
        />
      ) : null}
    </Stack>
  );
}

const cardSx = {
  p: 3,
  borderRadius: `${radius.lg}px`,
  bgcolor: color.bg.neutral.default,
  border: `1px solid ${color.border.default}`,
};

function LiveAnnouncement({
  announcement,
  canEdit,
}: {
  announcement: Announcement;
  canEdit: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const deactivate = useSetAnnouncementActive();
  const target = TARGETS[announcementPlacement(announcement.placement)];

  function close() {
    deactivate.mutate(
      { uuid: announcement.uuid, active: false },
      { onSuccess: () => toast.success(`已關閉：「${announcement.content}」`) },
    );
  }

  return (
    <Stack sx={{ ...cardSx, gap: 1.5 }}>
      <Stack direction="row" sx={{ alignItems: 'center' }}>
        <Badge tone={target.tone} icon={<target.Icon size={12} />}>
          {target.label}
        </Badge>
        <Box
          sx={{
            ml: 'auto',
            ...typography.data[300],
            color: color.fg.neutral.muted,
          }}
        >
          顯示中
        </Box>
      </Stack>

      <Box sx={{ ...typography.body[500], color: color.fg.neutral.default }}>
        {announcement.content}
      </Box>

      {announcement.publishedAt ? (
        <Box sx={{ ...typography.data[300], color: color.fg.neutral.muted }}>
          {announcement.publisher?.name ?? '發布者未提供'} 於{' '}
          {new Date(announcement.publishedAt).toLocaleString('zh-TW', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })}{' '}
          發布
        </Box>
      ) : null}

      {canEdit && confirming ? (
        <Stack
          sx={{
            gap: 1,
            p: 1.5,
            borderRadius: `${radius.md}px`,
            bgcolor: color.bg.danger.subtle,
          }}
        >
          <Box sx={{ ...typography.body[300], color: color.fg.danger }}>
            {announcement.placement === AnnouncementPlacement.All
              ? '關閉後即刻從前台與後台的所有頁面同時消失。'
              : `關閉後即刻從${target.label}所有頁面消失。`}
            內容保留在歷史紀錄。
          </Box>
          <Stack direction="row" sx={{ gap: 1 }}>
            <Button size="sm" disabled={deactivate.isPending} onClick={close}>
              確認關閉
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={deactivate.isPending}
              onClick={() => setConfirming(false)}
            >
              取消
            </Button>
          </Stack>
        </Stack>
      ) : canEdit ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setConfirming(true)}
          sx={{ alignSelf: 'flex-start' }}
        >
          關閉公告
        </Button>
      ) : null}
    </Stack>
  );
}

function PublishAnnouncementDialog({
  live,
  onClose,
}: {
  live: Announcement[];
  onClose: () => void;
}) {
  const [placement, setPlacement] = useState<AnnouncementPlacement>(
    AnnouncementPlacement.PublicPage,
  );
  const [content, setContent] = useState('');
  const [confirming, setConfirming] = useState(false);
  const create = useCreateAnnouncement();
  const activate = useSetAnnouncementActive();
  const submitting = create.isPending || activate.isPending;
  const target = TARGETS[placement];
  const text = content.trim();
  const length = [...text].length;
  const over = length > MAX_LENGTH;
  const replaced = live.filter((announcement) => {
    const currentPlacement = announcementPlacement(announcement.placement);
    return (
      placement === AnnouncementPlacement.All ||
      currentPlacement === AnnouncementPlacement.All ||
      currentPlacement === placement
    );
  });

  function activateDraft(uuid: Announcement['uuid']) {
    activate.mutate(
      { uuid, active: true },
      {
        onSuccess: () => {
          toast.success(`已發布到${target.label}`);
          onClose();
        },
      },
    );
  }

  function publish() {
    if (!text || over || submitting) return;
    if (!confirming) {
      setConfirming(true);
      return;
    }
    if (create.data) {
      activateDraft(create.data.createAnnouncement.uuid);
    } else {
      create.mutate(
        { input: { content: text, placement } },
        {
          onSuccess: ({ createAnnouncement }) =>
            activateDraft(createAnnouncement.uuid),
        },
      );
    }
  }

  return (
    <Dialog
      open
      title="發布公告"
      onClose={onClose}
      onConfirm={publish}
      confirmLabel={confirming ? '確認發布' : '預覽無誤，發布'}
      confirmDisabled={!text || over}
      submitting={submitting}
    >
      <ToggleButtonGroup
        disabled={submitting || create.isSuccess}
        exclusive
        fullWidth
        aria-label="發布目標"
        value={placement}
        onChange={(_, value: AnnouncementPlacement | null) => {
          if (value) {
            setPlacement(value);
            setConfirming(false);
          }
        }}
        sx={{ gap: 1 }}
      >
        {Object.entries(TARGETS).map(([value, { label, hint, Icon }]) => (
          <ToggleButton
            key={value}
            value={value}
            sx={{
              flexDirection: 'column',
              gap: '4px',
              py: 1,
              border: 'none !important',
              borderRadius: `${radius.md}px !important`,
              boxShadow: `inset 0 0 0 1px ${color.border.default}`,
              bgcolor: color.bg.neutral.subtle,
              color: color.fg.neutral.subtle,
              ...typography.label[400],
              '&.Mui-selected, &.Mui-selected:hover': {
                boxShadow: `inset 0 0 0 1.5px ${color.brand.secondary.default}`,
                bgcolor: color.bg.secondary.subtle,
                color: color.brand.secondary.subtle,
              },
            }}
          >
            <Icon size={19} />
            {label}
            <Box component="span" sx={{ fontSize: 11, opacity: 0.8 }}>
              {hint}
            </Box>
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      <Callout
        tone={
          placement === AnnouncementPlacement.AdminPage ? 'info' : 'warning'
        }
      >
        {target.audience}
      </Callout>

      {replaced.length > 0 ? (
        <Stack
          sx={{
            gap: 0.5,
            p: 1.5,
            borderRadius: `${radius.md}px`,
            bgcolor: color.bg.neutral.subtle,
            border: `1px solid ${color.border.default}`,
          }}
        >
          <Box
            sx={{ ...typography.label[300], color: color.fg.neutral.default }}
          >
            發布後會取代以下公告：
          </Box>
          {replaced.map((announcement) => (
            <Box
              key={announcement.uuid}
              sx={{ ...typography.body[300], color: color.fg.neutral.subtle }}
            >
              {TARGETS[announcementPlacement(announcement.placement)].label}「
              {announcement.content}」
            </Box>
          ))}
          {replaced.some(
            (announcement) =>
              announcement.placement === AnnouncementPlacement.All,
          ) ? (
            <Box
              sx={{ ...typography.body[300], color: color.fg.neutral.subtle }}
            >
              被取代的前後台公告會從兩邊同時消失。
            </Box>
          ) : null}
        </Stack>
      ) : null}

      <TextInput
        disabled={submitting || create.isSuccess}
        autoFocus
        required
        multiline
        minRows={2}
        label="公告文字"
        value={content}
        placeholder="例：大平村上游土石流警報，志工請暫停前往"
        onChange={(event) => {
          setContent(event.target.value.replace(/[\r\n]+/g, ' '));
          setConfirming(false);
        }}
        error={
          over ? `超過 ${length - MAX_LENGTH} 字，請縮短公告。` : undefined
        }
        helperText="純文字，不含連結、圖片與換行。"
        trailing={
          <Box
            sx={{
              alignSelf: 'flex-end',
              ...typography.data[300],
              color: over ? color.fg.danger : color.fg.neutral.muted,
            }}
          >
            {length}／{MAX_LENGTH}
          </Box>
        }
      />

      <Box
        sx={{
          borderRadius: `${radius.md}px`,
          overflow: 'hidden',
          border: `1px solid ${color.border.default}`,
          opacity: over ? 0.65 : 1,
        }}
      >
        {text ? (
          <AnnouncementBanner>{text}</AnnouncementBanner>
        ) : (
          <Box
            sx={{
              p: '10px 16px',
              ...typography.label[400],
              color: color.fg.neutral.muted,
            }}
          >
            打字之後這裡會顯示緊急公告實際的樣子
          </Box>
        )}
      </Box>

      {confirming ? (
        <Callout tone="danger">
          這則會立刻出現在{target.label}的每一頁頂部。{target.audience}
          {replaced.length > 0
            ? `同時會取代目前的 ${replaced.length} 則公告，被取代的公告會立刻停止顯示。`
            : null}
        </Callout>
      ) : null}
    </Dialog>
  );
}
