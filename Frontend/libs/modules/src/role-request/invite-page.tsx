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
import { readApplicantAccount } from './applicant';
import { ApplicantSection } from './applicant-section';
import {
  buildPhoneStepUpHref,
  readApplyReturn,
  stripApplyReturn,
} from './apply-return';
import { roleRequestErrorMessage } from './error';
import {
  pendingRequestName,
  REASON_MAX_LENGTH,
  validateRoleRequestForm,
} from './form';
import {
  joinThroughInvite,
  openTeamInvite,
  type OpenedInvite,
} from './invite-api';
import { BACK_OFFICE_HREF } from './portal-entry';
import { useApplyDraft } from './use-apply-draft';
import { usePhoneVerification } from './use-phone-verification';
import { useWithdrawRoleRequest } from './use-withdraw-role-request';

const { color, radius } = designTokens;
type CurrentUser = components['schemas']['UserResponse'];

function inviteError(error: unknown): string {
  if (error instanceof ApiError) {
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
          // ①: the backend names the team only to someone signed in.
          <>
            <Box>
              <Typography component="h2" variant="h6">
                你收到一個加入團隊的邀請
              </Typography>
              <Typography color="text.secondary">
                登入後就會看到是哪一個團隊，再決定要不要申請。
              </Typography>
            </Box>
            <Button variant="contained" href={authLink}>
              登入
            </Button>
            <Button
              variant="outlined"
              href={authHref('/register', { callbackUrl })}
            >
              註冊帳號
            </Button>
            <Typography color="text.secondary">
              還沒有帳號的話，用手機或電子郵件就能註冊。登入或註冊好會自動回到這一頁，不用再掃一次。
            </Typography>
          </>
        ) : invite.isPending || applicant.isPending ? (
          <>
            <Typography role="status">載入邀請中…</Typography>
            <BackToSite />
          </>
        ) : invite.error instanceof ApiError && invite.error.status === 404 ? (
          <InviteUnusable />
        ) : invite.isError || applicant.isError ? (
          <>
            <Alert severity="error">
              {inviteError(invite.error ?? applicant.error)}
            </Alert>
            <Button
              onClick={() => {
                void invite.refetch();
                void applicant.refetch();
              }}
            >
              重新載入
            </Button>
            {(invite.error instanceof ApiError &&
              invite.error.status === 401) ||
            (applicant.error instanceof ApiError &&
              applicant.error.status === 401) ? (
              <Button href={authLink}>重新登入</Button>
            ) : null}
            <BackToSite />
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
      </Stack>
    </Container>
  );
}

/** 前台: the public map, where 申請管理權限 also opens (`?apply=1`, `apply-return.ts`). */
const SITE_HREF = '/map';
const APPLY_HREF = '/map?apply=1';

function BackToSite({ label = '回到前台' }: { label?: string }) {
  return (
    <Button href={SITE_HREF} variant="text">
      {label}
    </Button>
  );
}

/**
 * ⑥: expired, revoked or its team suspended — the backend tells them apart to no one (404). Not an
 * error box: the person did nothing wrong, and applying on their own still gets them there.
 */
function InviteUnusable() {
  return (
    <>
      <Box>
        <Typography component="h2" variant="h6">
          這個邀請連結不能用了
        </Typography>
        <Typography color="text.secondary">
          可能已經超過 24
          小時，或是被收回了。請跟給你邀請的人要一個新的，再掃一次。
        </Typography>
      </Box>
      <Button variant="contained" href={APPLY_HREF}>
        自己申請加入團隊
      </Button>
      <BackToSite />
    </>
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
  const myRequest = invite.my_request;
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
        // ④
        <>
          <Box>
            <Typography sx={{ fontWeight: 700 }}>
              你已經是{invite.team.name}的成員
            </Typography>
            <Typography color="text.secondary">
              不用再申請。要做團隊的事，請到管理平台。
            </Typography>
          </Box>
          <Button variant="contained" href={BACK_OFFICE_HREF}>
            前往管理平台
          </Button>
          <BackToSite />
        </>
      ) : submitted || invite.my_request ? (
        <>
          <Alert severity="success">
            你的加入申請已送出，正在等待管理員審核。邀請連結到期不會取消已送出的申請。
          </Alert>
          {myRequest ? (
            <Stack sx={{ gap: 1 }}>
              {withdraw.confirming ? (
                <>
                  <Typography>確定撤回這筆申請？撤回後需重新送出。</Typography>
                  <Button
                    color="error"
                    variant="outlined"
                    disabled={withdraw.submitting}
                    onClick={() => void withdraw.confirm(myRequest.uuid)}
                  >
                    確定撤回
                  </Button>
                  <Button
                    disabled={withdraw.submitting}
                    onClick={withdraw.cancel}
                  >
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
          <BackToSite />
        </>
      ) : invite.pending_elsewhere ? (
        // ⑤: withdrawing it reads the invite again, which then opens the form.
        <PendingElsewhere
          pending={invite.pending_elsewhere}
          teamName={invite.team.name}
          withdraw={withdraw}
        />
      ) : (
        <>
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
          <BackToSite />
        </>
      )}
    </Stack>
  );
}

function PendingElsewhere({
  pending,
  teamName,
  withdraw,
}: {
  pending: NonNullable<OpenedInvite['pending_elsewhere']>;
  teamName: string;
  withdraw: ReturnType<typeof useWithdrawRoleRequest>;
}) {
  const other = pendingRequestName(pending);
  return (
    <>
      <Alert severity="warning">
        <Typography sx={{ fontWeight: 700 }}>你有另一筆申請還在審核</Typography>
        <Typography>
          申請{other}，
          {new Date(pending.created_at).toLocaleDateString('zh-TW', {
            timeZone: 'Asia/Taipei',
          })}
          送出
        </Typography>
      </Alert>
      {withdraw.confirming ? (
        <>
          <Typography>撤回「{other}」那一筆？</Typography>
          <Button
            variant="contained"
            disabled={withdraw.submitting}
            onClick={() => void withdraw.confirm(pending.uuid)}
          >
            撤回，改申請{teamName}
          </Button>
          <Button disabled={withdraw.submitting} onClick={withdraw.cancel}>
            不撤回
          </Button>
        </>
      ) : (
        <>
          <Button variant="contained" onClick={withdraw.request}>
            撤回那一筆，改申請{teamName}
          </Button>
          <BackToSite label="先不要，回到前台" />
        </>
      )}
      {withdraw.error ? <Alert severity="error">{withdraw.error}</Alert> : null}
    </>
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
  // ⑪: the invite stopped working while this was being filled in (404 on sending).
  const [lapsed, setLapsed] = useState(false);
  const lapsedRef = useRef<HTMLDivElement>(null);
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
      // Stays on the form rather than reading the invite again into ⑥, which would drop what was typed.
      if (cause instanceof ApiError && cause.status === 404) {
        setLapsed(true);
        return;
      }
      setError(inviteError(cause));
      if (cause instanceof ApiError && cause.status === 409) refreshInvite();
      if (cause instanceof ApiError && [409, 422].includes(cause.status))
        refreshAccount();
    } finally {
      setBusy(false);
    }
  };

  // JOIN-112: the notice sits above the form and the button below it, so bring it into view.
  useEffect(() => {
    if (!lapsed) return;
    lapsedRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    lapsedRef.current?.focus();
  }, [lapsed]);

  // The form as it is, for 申請管理權限 to open with (`?apply=1` takes the draft, `apply-return.ts`).
  const applyOnOwn = () => {
    keep({
      role: invite.team.type === 'gov' ? 'government' : 'ngo',
      team: invite.team.uuid,
      newTeamName: '',
      name,
      reason,
      phone: verification.phone,
    });
    window.location.assign(APPLY_HREF);
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
      {lapsed ? (
        <Alert
          ref={lapsedRef}
          severity="error"
          role="alert"
          tabIndex={-1}
          sx={{ scrollMarginTop: 16 }}
        >
          這個邀請連結剛剛不能用了（可能超過 24
          小時，或被收回）。你填的內容還在，可以改成自己申請，不用重打。
        </Alert>
      ) : null}
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
      {lapsed ? (
        <Button variant="contained" onClick={applyOnOwn}>
          改成自己申請
        </Button>
      ) : (
        <Button
          type="submit"
          variant="contained"
          disabled={busy || verification.busy}
        >
          {busy ? '送出中…' : '送出加入申請'}
        </Button>
      )}
    </Stack>
  );
}
