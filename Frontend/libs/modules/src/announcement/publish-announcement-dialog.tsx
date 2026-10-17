'use client';

import { Box, ButtonBase, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { toast } from 'sonner';

import { latestAnnouncementForTarget } from '@rescue-frontend/data-access';
import {
  AnnouncementPlacement,
  useCreateAnnouncement,
  type AdminAnnouncementsQuery,
} from '@rescue-frontend/data-access/admin';
import {
  AnnouncementBanner,
  Button,
  Callout,
  designTokens,
  Dialog,
  TextInput,
} from '@rescue-frontend/ui';

import { ANNOUNCEMENT_TARGETS } from './announcement-targets';

const { color, radius, typography } = designTokens;
const MAX_LENGTH = 50;

export function PublishAnnouncementDialog({
  announcements,
  onClose,
  onPublished,
}: {
  announcements: AdminAnnouncementsQuery['announcements'];
  onClose: () => void;
  onPublished: () => void;
}) {
  const [placement, setPlacement] = useState<AnnouncementPlacement>(
    AnnouncementPlacement.PublicPage,
  );
  const [content, setContent] = useState('');
  const [confirming, setConfirming] = useState(false);
  const create = useCreateAnnouncement();
  const target =
    ANNOUNCEMENT_TARGETS.find((target) => target.value === placement) ??
    ANNOUNCEMENT_TARGETS[0];
  const length = [...content].length;
  const over = length > MAX_LENGTH;
  const valid = content.trim().length > 0 && !over;
  const affected = ANNOUNCEMENT_TARGETS.filter(
    (target) =>
      target.value !== AnnouncementPlacement.All &&
      (placement === AnnouncementPlacement.All || target.value === placement),
  );

  function publish() {
    if (!valid || create.isPending) return;
    if (!confirming) {
      setConfirming(true);
      return;
    }
    create.mutate(
      { input: { content: content.trim(), placement } },
      {
        onSuccess: () => {
          toast.success(`已發布到${target.label}`);
          onPublished();
        },
      },
    );
  }

  return (
    <Dialog
      open
      width={680}
      title="發布公告"
      subtitle="公告會顯示在所選目標的每一頁頂部"
      onClose={onClose}
      onConfirm={publish}
      confirmLabel={confirming ? '確認發布' : '預覽無誤，發布'}
      confirmDisabled={!valid}
      submitting={create.isPending}
      error={create.error?.message}
      footerContent={
        <Stack sx={{ gap: '12px' }}>
          <Typography
            sx={{ ...typography.label[300], color: color.fg.neutral.muted }}
          >
            草稿預覽
          </Typography>
          <Box
            sx={{
              borderRadius: `${radius.md}px`,
              overflow: 'hidden',
              border: `1px solid ${color.border.default}`,
              opacity: over ? 0.65 : 1,
            }}
          >
            {content.trim() ? (
              <AnnouncementBanner announce={false}>
                {content.trim()}
              </AnnouncementBanner>
            ) : (
              <Box
                sx={{
                  p: '10px 16px',
                  ...typography.body[300],
                  color: color.fg.neutral.muted,
                }}
              >
                輸入文字後，這裡會顯示公告的實際外觀
              </Box>
            )}
          </Box>
          {confirming ? (
            <>
              <Callout tone="warning">
                確認後會立即發布到{target.label}。{target.audience}
              </Callout>
              <Button
                size="sm"
                variant="ghost"
                disabled={create.isPending}
                onClick={() => setConfirming(false)}
                sx={{ alignSelf: 'flex-start' }}
              >
                返回修改
              </Button>
            </>
          ) : null}
        </Stack>
      }
    >
      <Stack sx={{ gap: '16px' }}>
        <Box component="fieldset" sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}>
          <Typography
            component="legend"
            sx={{ ...typography.label[400], mb: '8px' }}
          >
            發布目標 *
          </Typography>
          <Box
            role="group"
            aria-label="發布目標"
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 1,
            }}
          >
            {ANNOUNCEMENT_TARGETS.map((option) => (
              <ButtonBase
                key={option.value}
                aria-pressed={placement === option.value}
                disabled={create.isPending}
                onClick={() => {
                  setPlacement(option.value);
                  setConfirming(false);
                  create.reset();
                }}
                sx={{
                  flexDirection: 'column',
                  gap: '5px',
                  p: '10px 4px',
                  borderRadius: `${radius.md}px`,
                  border: `1.5px solid ${placement === option.value ? color.brand.secondary.default : color.border.default}`,
                  bgcolor:
                    placement === option.value
                      ? color.bg.secondary.subtle
                      : color.bg.neutral.subtle,
                  color:
                    placement === option.value
                      ? color.brand.secondary.subtle
                      : color.fg.neutral.subtle,
                  ...typography.label[400],
                  '&.Mui-focusVisible': {
                    outline: `2px solid ${color.brand.secondary.default}`,
                    outlineOffset: 2,
                  },
                }}
              >
                <option.Icon size={19} />
                <span>{option.label}</span>
                <Typography component="span" sx={typography.data[300]}>
                  {option.hint}
                </Typography>
              </ButtonBase>
            ))}
          </Box>
        </Box>

        <Callout
          tone={
            placement === AnnouncementPlacement.AdminPage ? 'info' : 'warning'
          }
        >
          {target.audience}
        </Callout>

        <Stack
          sx={{
            gap: '6px',
            p: '10px 12px',
            borderRadius: `${radius.md}px`,
            bgcolor: color.bg.neutral.subtle,
            ...typography.body[300],
            color: color.fg.neutral.subtle,
          }}
        >
          {affected.map((target) => {
            if (target.value === AnnouncementPlacement.All) return null;
            const current = latestAnnouncementForTarget(
              announcements,
              target.value,
            );
            return (
              <Box key={target.value}>
                {current
                  ? `${target.label}將以新公告取代目前顯示的「${current.content}」。`
                  : `${target.label}目前沒有公告。`}
              </Box>
            );
          })}
          <span>
            {placement !== AnnouncementPlacement.All
              ? '其他目標的公告不受影響。'
              : ''}
            舊公告仍保留啟用狀態。
          </span>
        </Stack>

        <TextInput
          autoFocus
          required
          multiline
          minRows={2}
          label="公告文字"
          value={content}
          disabled={create.isPending}
          placeholder="例：大平村上游土石流警報，志工請暫停前往"
          onChange={(event) => {
            setContent(event.target.value.replace(/[\r\n]+/g, ' '));
            setConfirming(false);
            create.reset();
          }}
          error={
            over ? `超過 ${length - MAX_LENGTH} 字，請縮短公告。` : undefined
          }
          helperText="純文字，不支援圖片或換行。網址會以純文字顯示。"
        />
        <Typography
          aria-live="polite"
          sx={{
            ...typography.data[300],
            fontWeight: 700,
            color: over ? color.fg.danger : color.fg.neutral.muted,
          }}
        >
          {length}／{MAX_LENGTH}
        </Typography>
      </Stack>
    </Dialog>
  );
}
