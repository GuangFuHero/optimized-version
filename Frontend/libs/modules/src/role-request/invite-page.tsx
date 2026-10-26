'use client';

import {
  Alert,
  Box,
  Button,
  Container,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { ApiError } from '@rescue-frontend/data-access';
import type { components } from '@rescue-frontend/data-access/openapi';
import { designTokens } from '@rescue-frontend/ui';

import { getCurrentUserAsync } from '../auth/api/client';
import { authHref } from '../auth/login/utils/auth-href';
import { useAuthSession } from '../session/auth-session';
import { SiteTextScale } from '../shell/site/site-text-scale';
import { readApplicantAccount } from './applicant';
import { ApplicantSection } from './applicant-section';
import {
  buildPhoneStepUpHref,
  readApplyReturn,
  stripApplyReturn,
} from './apply-return';
import { roleRequestErrorMessage } from './error';
import { REASON_MAX_LENGTH, validateRoleRequestForm } from './form';
import {
  joinThroughInvite,
  openTeamInvite,
  type OpenedInvite,
} from './invite-api';
import { useApplyDraft } from './use-apply-draft';
import { usePhoneVerification } from './use-phone-verification';
import { useWithdrawRoleRequest } from './use-withdraw-role-request';

const { color, radius } = designTokens;
type CurrentUser = components['schemas']['UserResponse'];

function inviteError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404)
      return '邀請連結已失效、已過期或團隊已停用。請向團隊管理員索取新的邀請。';
    if (error.status === 401) return '登入已過期，請重新登入後再試一次。';
    if (error.status === 403) return '目前暫停開放申請。';
    return roleRequestErrorMessage({
      graphQLErrors: [{ message: error.message }],
    });
  }
  return '連線失敗，請確認網路後再試一次。';
}

/** A public invitation needs a site account; login and registration both return to this token. */
export function TeamInvitePage({ token }: { token: string }) {
  const { status, user } = useAuthSession();
  const callbackUrl = `/invites/${encodeURIComponent(token)}`;
  const invite = useQuery({
    queryKey: ['site', 'invite', user?.uuid, token],
    queryFn: ({ signal }) => openTeamInvite(token, signal),
    enabled: status === 'authenticated',
    retry: false,
    meta: { quietErrors: true },
  });
  const applicant = useQuery({
    queryKey: ['users', 'me', user?.uuid],
    queryFn: getCurrentUserAsync,
    enabled: status === 'authenticated',
    retry: false,
    meta: { quietErrors: true },
  });
  const authLink = authHref('/login', { callbackUrl });

  return (
    <SiteTextScale>
      <Container
        component="main"
        maxWidth="sm"
        sx={{ py: { mobile: 3, tablet: 6 } }}
      >
        <Stack
          sx={{
            gap: 3,
            p: { mobile: 2, tablet: 4 },
            border: `1px solid ${color.border.default}`,
            borderRadius: `${radius.lg}px`,
            bgcolor: color.bg.neutral.default,
          }}
        >
          <Typography component="h1" variant="h5">
            加入團隊
          </Typography>
          {status === 'loading' ? (
            <Typography role="status">確認登入狀態中…</Typography>
          ) : status !== 'authenticated' ? (
            <>
              <Typography>
                請先登入或註冊，接著即可查看團隊並申請加入。
              </Typography>
              <Button variant="contained" href={authLink}>
                登入後繼續
              </Button>
              <Button href={authHref('/register', { callbackUrl })}>
                註冊帳號
              </Button>
            </>
          ) : invite.isPending || applicant.isPending ? (
            <Typography role="status">載入邀請中…</Typography>
          ) : invite.isError || applicant.isError ? (
            <>
              <Alert severity="error">
                {inviteError(invite.error ?? applicant.error)}
              </Alert>
              {invite.error instanceof ApiError &&
              invite.error.status === 404 ? null : (
                <Button
                  onClick={() => {
                    void invite.refetch();
                    void applicant.refetch();
                  }}
                >
                  重新載入
                </Button>
              )}
              {(invite.error instanceof ApiError &&
                invite.error.status === 401) ||
              (applicant.error instanceof ApiError &&
                applicant.error.status === 401) ? (
                <Button href={authLink}>重新登入</Button>
              ) : null}
            </>
          ) : (
            <InviteDetails
              key={`${user?.uuid}:${token}`}
              token={token}
              invite={invite.data}
              user={applicant.data}
              refreshInvite={() => void invite.refetch()}
              refreshAccount={() => void applicant.refetch()}
            />
          )}
          <Button href="/map" variant="text">
            回到公開地圖
          </Button>
        </Stack>
      </Container>
    </SiteTextScale>
  );
}

function InviteDetails({
  token,
  invite,
  user,
  refreshInvite,
  refreshAccount,
}: {
  token: string;
  invite: OpenedInvite;
  user: CurrentUser;
  refreshInvite: () => void;
  refreshAccount: () => void;
}) {
  const [submitted, setSubmitted] = useState(false);
  const withdraw = useWithdrawRoleRequest(() => {
    setSubmitted(false);
    refreshInvite();
    refreshAccount();
  });
  const pending = invite.my_request ?? invite.pending_elsewhere;
  const alreadyMember = user.identities?.some(
    (identity) => identity.team_uuid === invite.team.uuid,
  );

  return (
    <Stack sx={{ gap: 2.5 }}>
      <Box>
        <Typography component="h2" variant="h6">
          {invite.team.name}
        </Typography>
        <Typography color="text.secondary">
          {invite.team.type === 'gov' ? '政府單位' : '社福團體'} ·
          需管理員核准後加入
        </Typography>
        <Typography color="text.secondary">
          有效至{' '}
          {new Date(invite.expires_at).toLocaleString('zh-TW', {
            timeZone: 'Asia/Taipei',
            hour12: false,
          })}
          （台灣時間）
        </Typography>
      </Box>
      {alreadyMember ? (
        <Alert severity="success">
          你已經是這個團隊的成員，可從管理平台切換至團隊身分。
        </Alert>
      ) : submitted || invite.my_request ? (
        <Alert severity="success">
          你的加入申請已送出，正在等待管理員審核。邀請連結到期不會取消已送出的申請。
        </Alert>
      ) : invite.pending_elsewhere ? (
        <Alert severity="warning">
          你已有一筆「
          {invite.pending_elsewhere.team_name ??
            invite.pending_elsewhere.new_team_name ??
            '資料檢核員'}
          」申請在審核中。若要改申請加入本隊，請先撤回原申請。
        </Alert>
      ) : (
        <InviteForm
          token={token}
          invite={invite}
          user={user}
          onSubmitted={() => {
            setSubmitted(true);
            refreshInvite();
          }}
          refreshInvite={refreshInvite}
          refreshAccount={refreshAccount}
        />
      )}
      {!alreadyMember && pending ? (
        <Stack sx={{ gap: 1 }}>
          {withdraw.confirming ? (
            <>
              <Typography>確定撤回這筆申請？撤回後需重新送出。</Typography>
              <Button
                color="error"
                variant="outlined"
                disabled={withdraw.submitting}
                onClick={() => void withdraw.confirm(pending.uuid)}
              >
                確定撤回
              </Button>
              <Button disabled={withdraw.submitting} onClick={withdraw.cancel}>
                保留申請
              </Button>
            </>
          ) : (
            <Button onClick={withdraw.request}>撤回申請</Button>
          )}
          {withdraw.error ? (
            <Alert severity="error">{withdraw.error}</Alert>
          ) : null}
        </Stack>
      ) : null}
    </Stack>
  );
}

function InviteForm({
  token,
  invite,
  user,
  onSubmitted,
  refreshInvite,
  refreshAccount,
}: {
  token: string;
  invite: OpenedInvite;
  user: CurrentUser;
  onSubmitted: () => void;
  refreshInvite: () => void;
  refreshAccount: () => void;
}) {
  const account = readApplicantAccount(user);
  const [name, setName] = useState(account.nickname);
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { keep, take } = useApplyDraft(user.uuid);
  const verification = usePhoneVerification({
    account,
    onVerified: refreshAccount,
    onReauth: async (phone) => {
      keep({
        role: invite.team.type === 'gov' ? 'government' : 'ngo',
        team: invite.team.uuid,
        newTeamName: '',
        name,
        reason,
        phone,
      });
      // Refresh cookies through the API proxy before a whole-page navigation to LINE.
      try {
        await getCurrentUserAsync();
      } catch {
        // The session layer handles an ended session; LINE can retry a transient failure.
      }
      window.location.assign(buildPhoneStepUpHref(window.location));
    },
  });
  const resumed = useRef(false);
  const resumeVerification = verification.resume;
  useEffect(() => {
    if (resumed.current) return;
    resumed.current = true;
    const back = readApplyReturn(new URLSearchParams(window.location.search));
    if (!back) return;
    const draft = take();
    const href = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.history.replaceState(
      window.history.state,
      '',
      stripApplyReturn(href),
    );
    if (draft?.team === invite.team.uuid) {
      setName(draft.name);
      setReason(draft.reason);
      resumeVerification(draft.phone, back.stepUp);
    }
  }, [invite.team.uuid, resumeVerification, take]);

  const errors = validateRoleRequestForm(
    {
      role: invite.team.type === 'gov' ? 'government' : 'ngo',
      team: invite.team.uuid,
      newTeamName: '',
      name,
      reason,
    },
    {
      phoneVerified:
        Boolean(account.verifiedPhone) ||
        verification.stage.kind === 'verified',
      teams: [invite.team],
    },
  );

  const submit = async () => {
    if (busy) return;
    setTouched(true);
    setError(null);
    if (Object.keys(errors).length > 0) return;
    setBusy(true);
    try {
      await joinThroughInvite(token, {
        name: name.trim(),
        reason: reason.trim(),
      });
      onSubmitted();
    } catch (cause) {
      setError(inviteError(cause));
      if (cause instanceof ApiError && [404, 409].includes(cause.status))
        refreshInvite();
      if (cause instanceof ApiError && [409, 422].includes(cause.status))
        refreshAccount();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack
      component="form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      sx={{ gap: 3 }}
    >
      <ApplicantSection
        account={account}
        name={name}
        onNameChange={setName}
        nameError={touched ? (errors.name ?? null) : null}
        phoneError={touched ? (errors.phone ?? null) : null}
        verification={verification}
      />
      <TextField
        label="申請理由"
        required
        multiline
        minRows={3}
        fullWidth
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        error={touched && Boolean(errors.reason)}
        helperText={
          touched && errors.reason
            ? errors.reason
            : `請說明你與團隊的關係或想協助的工作，最多 ${REASON_MAX_LENGTH} 字`
        }
      />
      {error ? <Alert severity="error">{error}</Alert> : null}
      {touched && Object.keys(errors).length > 0 ? (
        <Alert severity="warning">
          請確認名字、手機驗證與申請理由後再送出。
        </Alert>
      ) : null}
      <Button
        type="submit"
        variant="contained"
        disabled={busy || verification.busy}
      >
        {busy ? '送出中…' : '送出加入申請'}
      </Button>
    </Stack>
  );
}
