'use client';

import {
  Clock,
  Copy,
  Download,
  Link2,
  MessageCircle,
  Share2,
  Users,
} from 'lucide-react';

import { Box, Stack, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import {
  useCreateTeamInvite,
  useTeamInvites,
} from '@rescue-frontend/data-access/admin';
import { Button, Callout, designTokens, Sheet } from '@rescue-frontend/ui';

import {
  copyPointShareUrl,
  createQrDataUrl,
  downloadQrPng,
} from '../../point-share';
import {
  currentInvite,
  inviteUrl,
  INVITE_VALID_HOURS,
  toTeamInvite,
} from './invite';
import { captionSx, formatDateTime } from './parts';
import type { Team } from './roster';

const { color, radius, shadow, typography } = designTokens;

/** LINE's own web intent: opens the app's chat picker on a phone, LINE web on a desktop. */
function lineShareUrl(text: string, url: string) {
  return `https://line.me/R/msg/text/?${encodeURIComponent(`${text}\n${url}`)}`;
}

/**
 * 邀請成員 (the prototype's `InviteMemberModal`, 2026-10-20): opening it is creating the invite,
 * valid 24 hours for anyone who scans it. Scanning is not joining — the applicant verifies a
 * phone and lands in the team's queue for an admin to approve.
 *
 * The link comes from the backend (Spec/026, ADR-353): the newest one still valid is shown
 * again, and only when there is none does opening the sheet issue a new one. Without a link the
 * sheet says so — never a made-up QR, which looks scannable and sends people to a dead end.
 */
export function InviteSheet({
  team,
  siteUrl,
  onClose,
}: {
  team: Team;
  siteUrl?: string;
  onClose: () => void;
}) {
  const [canShareNatively, setCanShareNatively] = useState(false);
  const siteConfigured = useMemo(() => {
    try {
      return Boolean(siteUrl && inviteUrl('check', siteUrl));
    } catch {
      return false;
    }
  }, [siteUrl]);
  const invites = useTeamInvites(team.uuid, { enabled: siteConfigured });
  const createInvite = useCreateTeamInvite();
  const existing = currentInvite(invites.data);
  const needsInvite =
    siteConfigured && invites.isSuccess && !existing && createInvite.isIdle;
  const { mutate: issueInvite } = createInvite;

  useEffect(() => {
    if (needsInvite) issueInvite({ teamUuid: team.uuid });
  }, [needsInvite, issueInvite, team.uuid]);

  const issued = existing ?? createInvite.data ?? null;
  const invite = useMemo(() => {
    if (!issued || !siteUrl) return null;
    try {
      return toTeamInvite(issued, siteUrl);
    } catch {
      return null;
    }
  }, [issued, siteUrl]);
  const loading =
    siteConfigured &&
    (invites.isPending || createInvite.isPending || (needsInvite && !issued));
  const qr = useMemo(() => {
    if (!invite) return null;
    try {
      return createQrDataUrl(invite.url);
    } catch {
      return null;
    }
  }, [invite]);
  const shareText = `邀請你加入「${team.name}」，${INVITE_VALID_HOURS} 小時內點連結或掃 QR，完成手機驗證後由管理員審核`;
  // File names stay ASCII: some Chrome builds save a Chinese one as 「download」.
  const fileName = `wanguard-invite-${team.uuid.slice(0, 8)}.png`;

  // After mount: the server has no `navigator`, and most desktops have no share sheet.
  useEffect(() => {
    setCanShareNatively(typeof navigator.share === 'function');
  }, []);

  return (
    <Sheet
      open
      onClose={onClose}
      title={`邀請成員加入「${team.name}」`}
      footer={
        <Button onClick={onClose} sx={{ width: '100%' }}>
          完成
        </Button>
      }
    >
      <Stack sx={{ gap: 2.5 }}>
        <Typography sx={{ ...captionSx, lineHeight: 1.7 }}>
          把 QR 或連結傳到 LINE 群組，<b>{INVITE_VALID_HOURS} 小時內</b>
          誰都可以掃，不限人數。掃碼者完成手機驗證後進入審核佇列，
          <b>你核准了才會加入</b>，並以成員身份加入本隊。
        </Typography>

        {!siteConfigured ? (
          <Callout tone="danger">
            暫時無法分享邀請，請聯絡管理員確認公開網站網址。
          </Callout>
        ) : loading ? (
          <Typography sx={captionSx}>產生邀請連結中…</Typography>
        ) : !invite || !qr ? (
          <Callout tone="danger">
            無法產生邀請連結，請稍後再試。QR
            只能由後端發的邀請連結產生，不會顯示示意圖。
          </Callout>
        ) : (
          <>
            <Box
              sx={{
                alignSelf: 'center',
                p: '14px',
                borderRadius: `${radius.md}px`,
                border: `1px solid ${color.border.default}`,
                bgcolor: color.bg.neutral.default,
                boxShadow: shadow.sm,
                lineHeight: 0,
              }}
            >
              <Box
                component="img"
                src={qr}
                alt={`加入「${team.name}」的邀請 QR Code`}
                sx={{ width: 184, height: 184 }}
              />
            </Box>

            <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
              <Button
                size="sm"
                startIcon={<MessageCircle size={15} />}
                onClick={() =>
                  window.open(
                    lineShareUrl(shareText, invite.url),
                    '_blank',
                    'noopener',
                  )
                }
              >
                分享到 LINE
              </Button>
              {canShareNatively ? (
                <Button
                  size="sm"
                  variant="outline"
                  startIcon={<Share2 size={15} />}
                  onClick={() =>
                    // A dismissed share sheet rejects; nothing to tell whoever dismissed it.
                    navigator
                      .share({ title: shareText, url: invite.url })
                      .catch(() => undefined)
                  }
                >
                  其他分享方式
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                startIcon={<Download size={15} />}
                onClick={() => {
                  downloadQrPng(invite.url, fileName);
                  toast.success(
                    '已下載 QR 圖片，可直接傳到 LINE 群組或列印張貼',
                  );
                }}
              >
                下載 QR 圖片
              </Button>
            </Stack>

            <Stack sx={{ gap: '6px' }}>
              <Typography
                sx={{
                  ...typography.label[400],
                  color: color.fg.neutral.subtle,
                }}
              >
                邀請連結（與 QR 是同一個）
              </Typography>
              <Stack
                direction="row"
                sx={{
                  alignItems: 'center',
                  gap: 1,
                  minHeight: 44,
                  pl: '14px',
                  pr: '6px',
                  borderRadius: `${radius.full}px`,
                  bgcolor: color.bg.neutral.subtle,
                  boxShadow: `inset 0 0 0 1px ${color.border.default}`,
                }}
              >
                <Box
                  component={Link2}
                  sx={{ width: 16, height: 16, color: color.fg.neutral.muted }}
                />
                <Typography
                  noWrap
                  sx={{
                    ...typography.data[400],
                    flex: 1,
                    minWidth: 0,
                    color: color.fg.neutral.default,
                  }}
                >
                  {invite.url}
                </Typography>
                <Button
                  size="sm"
                  variant="ghost"
                  startIcon={<Copy size={15} />}
                  onClick={async () => {
                    await copyPointShareUrl(invite.url);
                    toast.success('已複製邀請連結');
                  }}
                >
                  複製
                </Button>
              </Stack>
            </Stack>

            <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
              {[
                {
                  Icon: Clock,
                  text: `有效至 ${formatDateTime(invite.expiresAt)}`,
                },
                { Icon: Users, text: '不限人數 · 需管理員核准' },
              ].map(({ Icon, text }) => (
                <Stack
                  key={text}
                  direction="row"
                  sx={{
                    alignItems: 'center',
                    gap: '6px',
                    height: 30,
                    px: '12px',
                    borderRadius: `${radius.full}px`,
                    bgcolor: color.bg.neutral.subtle,
                    border: `1px solid ${color.border.default}`,
                  }}
                >
                  <Box
                    component={Icon}
                    sx={{
                      width: 14,
                      height: 14,
                      color: color.fg.neutral.muted,
                    }}
                  />
                  <Typography
                    sx={{ ...captionSx, color: color.fg.neutral.subtle }}
                  >
                    {text}
                  </Typography>
                </Stack>
              ))}
            </Stack>

            <Callout tone="info">
              <b>掃碼者需完成 OTP 驗證</b>
              <br />
              掃描後將要求填寫手機並輸入簡訊
              OTP，完成註冊才會進入佇列，避免假冒身份。
            </Callout>
          </>
        )}
      </Stack>
    </Sheet>
  );
}
