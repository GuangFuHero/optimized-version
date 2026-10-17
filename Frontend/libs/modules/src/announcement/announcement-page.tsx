'use client';

import { Box, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import { History, Megaphone, ShieldAlert } from 'lucide-react';
import { useId, useState } from 'react';
import { toast } from 'sonner';

import { latestAnnouncementForTarget } from '@rescue-frontend/data-access';
import {
  AnnouncementFilter,
  AnnouncementPlacement,
  useAnnouncements,
  useSetAnnouncementActive,
  type AdminAnnouncementsQuery,
} from '@rescue-frontend/data-access/admin';
import {
  Badge,
  Button,
  Callout,
  designTokens,
  Dialog,
  EmptyState,
  SegmentedTabs,
} from '@rescue-frontend/ui';

import {
  ANNOUNCEMENT_TARGETS,
  AnnouncementTargetBadge,
} from './announcement-targets';
import { PublishAnnouncementDialog } from './publish-announcement-dialog';
import { useAnnouncementAccess } from './use-announcement-access';

const { color, radius, typography } = designTokens;
type Announcement = AdminAnnouncementsQuery['announcements'][number];

const timestamp = new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

function publishTime(value: Announcement['createdAt']) {
  const time = Date.parse(value ?? '');
  return Number.isFinite(time)
    ? timestamp.format(new Date(time))
    : '未提供發布時間';
}

export function AnnouncementPage() {
  const access = useAnnouncementAccess();
  const query = useAnnouncements(
    { filter: AnnouncementFilter.All, placement: AnnouncementPlacement.All },
    { enabled: access.canManage, refetchInterval: 30_000 },
  );
  const close = useSetAnnouncementActive();
  const [tab, setTab] = useState<'live' | 'history'>('live');
  const [publishing, setPublishing] = useState(false);
  const [closingUuid, setClosingUuid] = useState<string | null>(null);
  const tabId = useId();
  const announcements = query.data?.announcements ?? [];
  const publicAnnouncement = latestAnnouncementForTarget(
    announcements,
    AnnouncementPlacement.PublicPage,
  );
  const adminAnnouncement = latestAnnouncementForTarget(
    announcements,
    AnnouncementPlacement.AdminPage,
  );
  const current = [publicAnnouncement, adminAnnouncement]
    .filter((announcement) => announcement !== undefined)
    .filter(
      (announcement, index, list) =>
        list.findIndex((item) => item.uuid === announcement.uuid) === index,
    );
  const history = [...announcements].sort(
    (a, b) =>
      (Date.parse(b.createdAt ?? '') || 0) -
        (Date.parse(a.createdAt ?? '') || 0) || b.uuid.localeCompare(a.uuid),
  );
  const closing = announcements.find((item) => item.uuid === closingUuid);

  function shownOn(announcement: Announcement) {
    return [
      publicAnnouncement?.uuid === announcement.uuid ? '前台' : null,
      adminAnnouncement?.uuid === announcement.uuid ? '後台' : null,
    ]
      .filter((target) => target !== null)
      .join('、');
  }

  function closeAnnouncement() {
    if (!closing || !closing.active || close.isPending) return;
    close.mutate(
      { uuid: closing.uuid, active: false },
      {
        onSuccess: () => {
          setClosingUuid(null);
          toast.success('已關閉公告');
        },
      },
    );
  }

  if (access.isPending) {
    return (
      <Box sx={{ p: 4 }} role="status" aria-label="載入公告權限">
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (access.isError) {
    return (
      <Box sx={{ p: 3 }}>
        <Callout tone="danger">無法載入目前身份。</Callout>
        <Button size="sm" variant="ghost" onClick={access.refetch}>
          重新載入
        </Button>
      </Box>
    );
  }

  if (!access.canManage) {
    return (
      <EmptyState
        icon={<ShieldAlert />}
        title="這一頁需要超級管理員或政府身份"
        description="請從右上角帳號選單切換身份。你仍可查看後台頂部的緊急公告。"
      />
    );
  }

  return (
    <Box sx={{ p: { mobile: '20px 16px', tablet: '28px' } }}>
      <Stack sx={{ maxWidth: 780, gap: '16px' }}>
        <Stack
          direction="row"
          sx={{ alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}
        >
          <Button
            startIcon={<Megaphone size={16} />}
            disabled={!query.data || query.isError}
            onClick={() => setPublishing(true)}
          >
            發布公告
          </Button>
          <Box sx={{ ml: 'auto' }}>
            <SegmentedTabs
              label="公告檢視"
              panelId={tabId}
              value={tab}
              onChange={setTab}
              items={[
                {
                  value: 'live',
                  label: `目前公告${current.length ? `（${current.length}）` : ''}`,
                },
                { value: 'history', label: '歷史紀錄' },
              ]}
            />
          </Box>
        </Stack>

        <Box id={tabId} role="tabpanel" aria-labelledby={`${tabId}-${tab}`}>
          {query.isPending ? (
            <Box role="status" aria-label="載入公告" sx={{ p: 4 }}>
              <CircularProgress size={24} />
            </Box>
          ) : query.isError ? (
            <Stack sx={{ gap: '12px' }}>
              <Callout tone="danger">
                無法載入公告。{query.error.message}
              </Callout>
              <Button
                variant="outline"
                onClick={() => void query.refetch()}
                sx={{ alignSelf: 'flex-start' }}
              >
                重新載入
              </Button>
            </Stack>
          ) : tab === 'live' ? (
            current.length ? (
              <Stack sx={{ gap: '12px' }}>
                {current.map((announcement) => (
                  <Paper
                    key={announcement.uuid}
                    variant="outlined"
                    sx={{ p: 3, borderRadius: `${radius.lg}px` }}
                  >
                    <Stack sx={{ gap: '12px' }}>
                      <Stack
                        direction="row"
                        sx={{
                          alignItems: 'center',
                          gap: '8px',
                          flexWrap: 'wrap',
                        }}
                      >
                        <AnnouncementTargetBadge
                          placement={announcement.placement}
                        />
                        <Typography
                          sx={{
                            ml: 'auto',
                            ...typography.data[300],
                            color: color.fg.neutral.muted,
                          }}
                        >
                          顯示中 · {shownOn(announcement)}
                        </Typography>
                      </Stack>
                      <Typography
                        sx={{
                          ...typography.body[500],
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {announcement.content}
                      </Typography>
                      <Typography
                        sx={{
                          ...typography.data[300],
                          color: color.fg.neutral.muted,
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {announcement.createdBy === access.user?.uuid
                          ? access.user?.name
                          : (announcement.createdBy ?? '未提供發布者')}{' '}
                        · {publishTime(announcement.createdAt)} 發布
                      </Typography>
                      <Button
                        size="sm"
                        variant="outline"
                        sx={{ alignSelf: 'flex-start' }}
                        onClick={() => {
                          close.reset();
                          setClosingUuid(announcement.uuid);
                        }}
                      >
                        關閉公告
                      </Button>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            ) : (
              <Paper variant="outlined" sx={{ borderRadius: `${radius.lg}px` }}>
                <EmptyState
                  icon={<Megaphone />}
                  title="目前沒有任何公告"
                  description="要對外或對內發布公告，請按「發布公告」。"
                />
              </Paper>
            )
          ) : (
            <Paper
              variant="outlined"
              sx={{ p: 3, borderRadius: `${radius.lg}px` }}
            >
              {history.length ? (
                <Stack component="ol" sx={{ listStyle: 'none', p: 0, m: 0 }}>
                  {history.map((announcement, index) => (
                    <Stack
                      component="li"
                      key={announcement.uuid}
                      direction="row"
                      sx={{ gap: '12px' }}
                    >
                      <Stack sx={{ alignItems: 'center' }}>
                        <Box
                          sx={{
                            display: 'grid',
                            placeItems: 'center',
                            width: 26,
                            height: 26,
                            borderRadius: `${radius.full}px`,
                            bgcolor: color.bg.danger.subtle,
                            color: color.fg.danger,
                          }}
                        >
                          <Megaphone size={14} />
                        </Box>
                        {index < history.length - 1 ? (
                          <Box
                            sx={{
                              flex: 1,
                              width: '1px',
                              minHeight: 14,
                              bgcolor: color.border.default,
                            }}
                          />
                        ) : null}
                      </Stack>
                      <Stack
                        sx={{
                          flex: 1,
                          minWidth: 0,
                          gap: '6px',
                          pb: index < history.length - 1 ? '20px' : 0,
                        }}
                      >
                        <Stack
                          direction="row"
                          sx={{
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '8px',
                          }}
                        >
                          <Typography sx={typography.label[400]}>
                            發布
                          </Typography>
                          <AnnouncementTargetBadge
                            placement={announcement.placement}
                          />
                          <Badge
                            tone={shownOn(announcement) ? 'success' : 'neutral'}
                          >
                            {shownOn(announcement)
                              ? `顯示中 · ${shownOn(announcement)}`
                              : announcement.active
                                ? '已被較新公告覆蓋'
                                : '已關閉'}
                          </Badge>
                        </Stack>
                        <Typography
                          sx={{
                            ...typography.data[300],
                            color: color.fg.neutral.muted,
                            overflowWrap: 'anywhere',
                          }}
                        >
                          {publishTime(announcement.createdAt)} ·{' '}
                          {announcement.createdBy === access.user?.uuid
                            ? access.user?.name
                            : (announcement.createdBy ?? '未提供發布者')}
                        </Typography>
                        <Typography
                          sx={{
                            ...typography.body[400],
                            color: color.fg.neutral.subtle,
                            overflowWrap: 'anywhere',
                          }}
                        >
                          {announcement.content}
                        </Typography>
                        {announcement.active ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            sx={{ alignSelf: 'flex-start' }}
                            onClick={() => {
                              close.reset();
                              setClosingUuid(announcement.uuid);
                            }}
                          >
                            關閉公告
                          </Button>
                        ) : null}
                      </Stack>
                    </Stack>
                  ))}
                </Stack>
              ) : (
                <EmptyState icon={<History />} title="尚無紀錄" />
              )}
            </Paper>
          )}
        </Box>
      </Stack>

      {publishing ? (
        <PublishAnnouncementDialog
          announcements={announcements}
          onClose={() => setPublishing(false)}
          onPublished={() => {
            setPublishing(false);
            setTab('live');
          }}
        />
      ) : null}

      {closing ? (
        <Dialog
          open
          title="關閉公告"
          confirmLabel="確認關閉"
          confirmTone="danger"
          confirmDisabled={!closing.active}
          submitting={close.isPending}
          error={close.error?.message}
          onClose={() => setClosingUuid(null)}
          onConfirm={closeAnnouncement}
        >
          <Typography
            sx={{ ...typography.body[400], overflowWrap: 'anywhere' }}
          >
            {closing.content}
          </Typography>
          <Callout tone="warning">
            內容會保留在歷史紀錄。關閉後，各目標會顯示下一則仍啟用的公告。
          </Callout>
          {ANNOUNCEMENT_TARGETS.map((target) => {
            if (target.value === AnnouncementPlacement.All) return null;
            const current = latestAnnouncementForTarget(
              announcements,
              target.value,
            );
            if (current?.uuid !== closing.uuid) return null;
            const next = latestAnnouncementForTarget(
              announcements.filter((item) => item.uuid !== closing.uuid),
              target.value,
            );
            return (
              <Typography key={target.value} sx={typography.body[300]}>
                {target.label}：
                {next ? `將顯示「${next.content}」` : '將不再顯示公告'}
              </Typography>
            );
          })}
        </Dialog>
      ) : null}
    </Box>
  );
}
