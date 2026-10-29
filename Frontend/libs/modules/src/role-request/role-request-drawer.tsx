'use client';

import {
  Alert,
  AlertTitle,
  Box,
  Button,
  ButtonBase,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import { useMutation } from 'urql';

import {
  SubmitRoleRequestDocument,
  type MyRoleRequestsQuery,
} from '@rescue-frontend/data-access';
import { designTokens, displayTextSize } from '@rescue-frontend/ui';

import { getCurrentUserAsync } from '../auth/api/client';
import { useAuthSession } from '../session/auth-session';
import { SiteActionDrawer } from '../shell/site/site-action-drawer';
import { readApplicantAccount } from './applicant';
import { ApplicantSection } from './applicant-section';
import { buildPhoneStepUpHref, type ApplyReturn } from './apply-return';
import { roleRequestDrawerView } from './drawer-view';
import { isTeamListRefusal, roleRequestErrorMessage } from './error';
import {
  REASON_MAX_LENGTH,
  ROLE_REQUEST_OPTIONS,
  roleRequestFormProblems,
  toSubmitRoleRequestInput,
  validateRoleRequestForm,
  type RoleRequestFormValues,
} from './form';
import { RoleRequestCard } from './role-request-card';
import {
  findTeamNamed,
  inviteHint,
  NEW_TEAM,
  reviewerText,
  teamTypeForRole,
} from './team';
import { TeamPicker } from './team-picker';
import { useApplyDraft } from './use-apply-draft';
import { usePhoneVerification } from './use-phone-verification';
import { useRoleRequestTeams } from './use-role-request-teams';
import { useWithdrawRoleRequest } from './use-withdraw-role-request';

const { color, radius } = designTokens;

const TITLE = '申請管理權限';
const EMPTY_FORM: RoleRequestFormValues = {
  role: null,
  team: null,
  newTeamName: '',
  reason: '',
  name: '',
};

// Until `/users/me` answers: nothing verified, nothing to prove with.
const NO_ACCOUNT = {
  nickname: '',
  verifiedPhone: null,
  hasPassword: false,
  saltIdentifier: null,
};

interface RoleRequestDrawerProps {
  open: boolean;
  onClose: () => void;
  myRoleRequests: MyRoleRequestsQuery['myRoleRequests'] | null;
  /**
   * Read the applications again once one is sent or withdrawn: the drawer then shows it waiting,
   * or the form again.
   */
  onSubmitted: () => void;
  /** Back from proving the person at LINE: the form comes back as it was, and carries on. */
  applyReturn?: ApplyReturn | null;
  onApplyReturnHandled?: () => void;
}

/**
 * 申請管理權限 (prototype `RoleElevationDrawer`, `Design/前台/js/site/site-actions.jsx:157-265`):
 * the application waiting for review, which can be withdrawn, or the form under the last
 * rejection. What it shows is `roleRequestDrawerView`'s decision; the form's rules are
 * `validateRoleRequestForm`'s.
 */
export function RoleRequestDrawer({
  open,
  onClose,
  myRoleRequests,
  onSubmitted,
  applyReturn = null,
  onApplyReturnHandled,
}: RoleRequestDrawerProps) {
  const [values, setValues] = useState<RoleRequestFormValues>(EMPTY_FORM);
  // The name starts from the nickname until the person types one of their own.
  const [nameEdited, setNameEdited] = useState(false);
  const [touched, setTouched] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [{ fetching: submitting }, submitRoleRequest] = useMutation(
    SubmitRoleRequestDocument,
  );
  const withdraw = useWithdrawRoleRequest(onSubmitted);
  const resetWithdraw = withdraw.reset;
  const roleLabelId = useId();
  const userId = useAuthSession().user?.uuid ?? null;
  // The account as the form needs it, while the drawer is open: the session itself holds only the
  // uuid and the nickname. Read again once a phone is verified, which makes it the account's.
  const applicant = useQuery({
    queryKey: ['users', 'me'],
    queryFn: getCurrentUserAsync,
    select: readApplicantAccount,
    enabled: open,
  });
  const account = applicant.data ?? NO_ACCOUNT;
  const { keep: keepDraft, take: takeDraft } = useApplyDraft(userId);
  const teamType = teamTypeForRole(values.role);
  const teamList = useRoleRequestTeams(teamType, open);

  /**
   * Only LINE can prove it is them (ADR-361): the form is kept in this tab and the page goes to LINE.
   * `/users/me` first, through the session's own fetch: a session refreshed or ended there, rather
   * than in the navigation, which would show its error as a page of JSON.
   */
  const goProveAtLine = async (phone: string) => {
    keepDraft({ ...values, phone });

    try {
      await getCurrentUserAsync();
    } catch {
      // An ended session reloads the tab as a guest by itself; anything else, LINE is tried anyway.
    }

    window.location.assign(buildPhoneStepUpHref(window.location));
  };

  const verification = usePhoneVerification({
    account,
    onVerified: () => void applicant.refetch(),
    onReauth: (phone) => void goProveAtLine(phone),
  });
  const resetVerification = verification.reset;
  const resumeVerification = verification.resume;

  // Each opening starts from an empty form, as the prototype does — unless it is the way back
  // from LINE, which brings the form back below. Only as it opens: the way back being handled
  // while it is open must not empty what it brought back.
  const wasOpen = useRef(false);

  useEffect(() => {
    const opening = open && !wasOpen.current;
    wasOpen.current = open;

    if (opening && !applyReturn) {
      setValues(EMPTY_FORM);
      setNameEdited(false);
      setTouched(false);
      setSubmitError(null);
      resetWithdraw();
      resetVerification();
    }
  }, [applyReturn, open, resetVerification, resetWithdraw]);

  useEffect(() => {
    if (!open || !applyReturn || !userId) {
      return;
    }

    const draft = takeDraft();

    setTouched(false);
    setSubmitError(null);

    if (draft) {
      setValues({
        role: draft.role,
        team: draft.team,
        newTeamName: draft.newTeamName,
        reason: draft.reason,
        name: draft.name,
      });
      setNameEdited(true);
      resumeVerification(draft.phone, applyReturn.stepUp);
    }

    onApplyReturnHandled?.();
  }, [
    applyReturn,
    onApplyReturnHandled,
    open,
    resumeVerification,
    takeDraft,
    userId,
  ]);

  const nickname = applicant.data?.nickname;

  useEffect(() => {
    if (open && nickname && !nameEdited) {
      setValues((current) => ({ ...current, name: nickname }));
    }
  }, [nameEdited, nickname, open]);

  if (!myRoleRequests) {
    return null;
  }

  const view = roleRequestDrawerView(myRoleRequests);

  // After a refusal the reload may show what the application became instead — decided meanwhile,
  // say — and the reason stays in sight until the drawer is closed.
  const withdrawRefusal =
    withdraw.error && view.kind !== 'pending' ? (
      <Alert severity="error">{withdraw.error}</Alert>
    ) : null;

  if (view.kind === 'pending') {
    const { pending } = view;

    return (
      <SiteActionDrawer open={open} title={TITLE} onClose={onClose}>
        <Stack spacing={2}>
          <Alert severity="info">
            <AlertTitle>你已經有一筆申請在審核中</AlertTitle>
            同一時間只能有一筆申請。要改申請別的身分或團隊，可以先撤回這一筆。
          </Alert>
          <RoleRequestCard request={pending} />
          {/* Asked here, not in a dialog (the designer's 2026-10-06 prototype): withdrawn, it can
              be sent again at once. */}
          {withdraw.confirming ? (
            <Stack
              spacing={1.5}
              sx={{
                p: 2,
                borderRadius: `${radius.md}px`,
                border: `1px solid ${color.border.default}`,
              }}
            >
              <Typography
                sx={{
                  color: color.fg.neutral.default,
                  fontSize: displayTextSize[13],
                  lineHeight: 1.6,
                  textWrap: 'pretty',
                }}
              >
                撤回後審核者就不會再處理這筆申請。你隨時可以重新送出，但要重新排隊審核。
              </Typography>
              {withdraw.error ? (
                <Alert severity="error">{withdraw.error}</Alert>
              ) : null}
              <Stack direction="row" spacing={1}>
                <Button
                  variant="outlined"
                  onClick={withdraw.cancel}
                  disabled={withdraw.submitting}
                  sx={{ flex: 1 }}
                >
                  先不要
                </Button>
                <Button
                  variant="contained"
                  onClick={() => void withdraw.confirm(pending.uuid)}
                  disabled={withdraw.submitting}
                  sx={{ flex: 1 }}
                >
                  {withdraw.submitting ? '撤回中…' : '確定撤回'}
                </Button>
              </Stack>
            </Stack>
          ) : (
            <Box>
              <Button variant="outlined" onClick={() => withdraw.request()}>
                撤回這筆申請
              </Button>
              {/* Not 「團隊已經用邀請碼讓你加入」 any more: a scan is an application too, and only one
                  waits at a time (Spec 026), so this one goes first. Worded by the designer. */}
              <Typography
                sx={{
                  mt: 1,
                  color: color.fg.neutral.muted,
                  fontSize: displayTextSize[12],
                  lineHeight: 1.6,
                  textWrap: 'pretty',
                }}
              >
                如果有團隊給你邀請碼，要先撤回這一筆，才能掃碼申請加入那個團隊。
              </Typography>
            </Box>
          )}
        </Stack>
      </SiteActionDrawer>
    );
  }

  if (view.kind === 'granted') {
    return (
      <SiteActionDrawer open={open} title={TITLE} onClose={onClose}>
        <Stack spacing={2}>
          {withdrawRefusal}
          <Alert severity="success">
            你已經有管理平台身分，可以從「前往管理平台」進入。
          </Alert>
          {view.approved ? <RoleRequestCard request={view.approved} /> : null}
        </Stack>
      </SiteActionDrawer>
    );
  }

  const errors = validateRoleRequestForm(values, {
    phoneVerified:
      Boolean(account.verifiedPhone) || verification.stage.kind === 'verified',
    teams: teamList.teams,
  });
  const problems = roleRequestFormProblems(errors, values.role);
  const set = (field: 'name' | 'reason' | 'newTeamName') => (value: string) =>
    setValues((current) => ({ ...current, [field]: value }));
  const invite = inviteHint(values.role);
  // A new name already on the list is said at once, not only after 送出申請 (prototype).
  const nameTaken = Boolean(
    values.team === NEW_TEAM &&
      teamList.teams &&
      findTeamNamed(teamList.teams, values.newTeamName),
  );

  // Another identity picks from another list: the team picked for the last one is dropped.
  const pickRole = (role: RoleRequestFormValues['role']) =>
    setValues((current) =>
      current.role === role
        ? current
        : { ...current, role, team: null, newTeamName: '' },
    );

  const submit = async () => {
    setTouched(true);

    if (problems.length || !values.role) {
      return;
    }

    setSubmitError(null);
    const result = await submitRoleRequest({
      input: toSubmitRoleRequestInput({ ...values, role: values.role }),
    });

    if (result.error) {
      setSubmitError(roleRequestErrorMessage(result.error));

      if (isTeamListRefusal(result.error)) {
        teamList.reload();
      }
    }

    // Either way the list may have moved on (a pending one from another tab, say): read it again.
    onSubmitted();
  };

  return (
    <SiteActionDrawer
      open={open}
      title={TITLE}
      subtitle={`有管理權限的人可以派工、審核資料、管理站點。${reviewerText(values.role, values.team, teamList.teams)}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="outlined" onClick={onClose} sx={{ flex: 1 }}>
            取消
          </Button>
          <Button
            variant="contained"
            onClick={() => void submit()}
            disabled={view.paused || submitting}
            sx={{ flex: 2 }}
          >
            送出申請
          </Button>
        </>
      }
    >
      <Stack spacing={2.5}>
        {withdrawRefusal}

        {view.paused ? (
          <Alert severity="info">目前暫停開放申請，請稍後再來。</Alert>
        ) : null}

        {view.lastClosed ? <RoleRequestCard request={view.lastClosed} /> : null}

        <Box>
          <Typography
            id={roleLabelId}
            sx={{
              mb: 1,
              color: color.fg.neutral.default,
              fontSize: displayTextSize[14],
              lineHeight: 1.2,
              fontWeight: 700,
            }}
          >
            你要申請哪一種身分？
            <Box component="span" aria-hidden sx={{ color: color.fg.danger }}>
              *
            </Box>
          </Typography>
          {touched && errors.role ? (
            <Typography
              role="alert"
              sx={{
                mb: 1,
                color: color.fg.danger,
                fontSize: displayTextSize[13],
                lineHeight: 1.5,
              }}
            >
              {errors.role}
            </Typography>
          ) : null}
          <Stack role="radiogroup" aria-labelledby={roleLabelId} spacing={1}>
            {ROLE_REQUEST_OPTIONS.map((option) => (
              <RoleOption
                key={option.value}
                label={option.label}
                hint={option.hint}
                checked={values.role === option.value}
                onSelect={() => pickRole(option.value)}
              />
            ))}
          </Stack>
          {invite ? (
            <Typography
              sx={{
                mt: 1,
                color: color.fg.neutral.muted,
                fontSize: displayTextSize[12],
                lineHeight: 1.6,
                textWrap: 'pretty',
              }}
            >
              {invite}
            </Typography>
          ) : null}
        </Box>

        {values.role && teamType ? (
          <TeamPicker
            key={values.role}
            role={values.role}
            teams={teamList.teams}
            failed={teamList.failed}
            onReload={teamList.reload}
            team={values.team}
            onPick={(team) => setValues((current) => ({ ...current, team }))}
            newTeamName={values.newTeamName}
            onNewTeamName={set('newTeamName')}
            teamError={touched ? (errors.team ?? null) : null}
            newTeamNameError={
              touched || nameTaken ? (errors.newTeamName ?? null) : null
            }
          />
        ) : null}

        {applicant.data ? (
          <ApplicantSection
            account={applicant.data}
            name={values.name}
            onNameChange={(name) => {
              setNameEdited(true);
              set('name')(name);
            }}
            nameError={touched ? (errors.name ?? null) : null}
            phoneError={touched ? (errors.phone ?? null) : null}
            verification={verification}
          />
        ) : applicant.isError ? (
          <Alert severity="error">讀不到你的帳號資料，請關閉後再試一次。</Alert>
        ) : null}

        <TextField
          label="申請理由"
          required
          multiline
          minRows={3}
          fullWidth
          value={values.reason}
          onChange={(event) => set('reason')(event.target.value)}
          placeholder="例：我是光復鄉公所民政課，負責收容所名冊，需要在管理平台更新站點資訊。"
          error={touched && Boolean(errors.reason)}
          helperText={
            touched && errors.reason
              ? errors.reason
              : `寫清楚你的單位、職務，以及為什麼需要管理權限（最多 ${REASON_MAX_LENGTH} 字）`
          }
        />

        {touched && problems.length ? (
          <Alert severity="error">
            <AlertTitle>尚有 {problems.length} 項未完成</AlertTitle>
            請補齊：{problems.join('、')}。
          </Alert>
        ) : null}

        {submitError ? <Alert severity="error">{submitError}</Alert> : null}
      </Stack>
    </SiteActionDrawer>
  );
}

/** One of the three identities, a card-like radio (prototype site-actions.jsx:224-240). */
function RoleOption({
  label,
  hint,
  checked,
  onSelect,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onSelect: () => void;
}) {
  return (
    <ButtonBase
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      sx={{
        display: 'block',
        width: '100%',
        p: 1.5,
        textAlign: 'left',
        borderRadius: `${radius.md}px`,
        border: `1px solid ${checked ? color.brand.secondary.default : color.border.default}`,
        bgcolor: checked ? color.bg.secondary.subtle : color.bg.neutral.default,
      }}
    >
      <Typography
        component="span"
        sx={{
          display: 'block',
          color: color.fg.neutral.default,
          fontSize: displayTextSize[14],
          lineHeight: 1.4,
          fontWeight: checked ? 800 : 700,
        }}
      >
        {label}
      </Typography>
      <Typography
        component="span"
        sx={{
          display: 'block',
          mt: 0.25,
          color: color.fg.neutral.subtle,
          fontSize: displayTextSize[12],
          lineHeight: 1.5,
        }}
      >
        {hint}
      </Typography>
    </ButtonBase>
  );
}
