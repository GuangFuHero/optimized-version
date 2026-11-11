'use client';

import { useReturnQuery } from '../../route/use-return-query';

import { useMutation } from '@tanstack/react-query';
import { useForm, useStore } from '@tanstack/react-form';
import { createStore, useStore as useZustandStore } from 'zustand';
import type { components } from '@rescue-frontend/data-access/openapi';

import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Card,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';

import { ApiError } from '@rescue-frontend/data-access';
import { designTokens, Icons } from '@rescue-frontend/ui';

import {
  continueSignedOut,
  sessionStorageOrNull,
} from '../../session/end-expired-session';
import {
  authHref,
  newPasswordProblem,
  newPasswordText,
  type AuthIdentityType,
} from '../login';
import {
  changePasswordAsync,
  getCurrentUserAsync,
  logoutAllAsync,
  setPasswordAsync,
} from '../api/client';
import { resolveAuthErrorMessage } from '../api/error-messages';
import {
  createHashedCredentialAsync,
  resolveHashedCredentialAsync,
} from '../login/credentials';
import { StepDots } from './account-security-controls';
import {
  hasPassword,
  loginMethodsText,
  saltLookupIdentity,
  type AccountContact,
  type LoginMethod,
} from './account-security-view';
import {
  ACCOUNT_SECURITY_PATH,
  addContactSteps,
  buildAccountStepUpHref,
  cannotProveHere,
  contactName,
  contactsSummary,
  newCodeSentText,
  oldCodeSentText,
  oldCodeStillPending,
  originalContactName,
  readAccountStepUpReturn,
  readStepUpRequired,
  replacedContact,
  replaceNotice,
  setPasswordBlocked,
  setPasswordErrorMessage,
  type AccountStepUpAction,
  type StepUpProblem,
} from './account-step-up';
import { clearDraftsOnSignOut } from './sign-out-drafts';
import { useAddContact } from './use-add-contact';
import { useContactDraft, type ContactDraft } from './use-contact-draft';

interface AccountSecurityClientProps {
  /** The account, so a contact kept for the way back from LINE is only brought back to it. */
  userId: string;
  /** `/users/me`'s contacts and login methods, read on the server. */
  contacts: AccountContact[];
  loginMethods: LoginMethod[];
}

/**
 * The backend ended every session of this account in its answer and cleared the cookies — a
 * password changed or created, every device signed out (ADR-325) — so sign in
 * again.
 */
function signInAgain() {
  continueSignedOut('/login');
}

/** Where a first password is: typed, or waiting on the code the backend sent to a contact first. */
type SetPasswordStage =
  | { kind: 'enter' }
  | { kind: 'old-code'; pending: boolean };

// The design's floor for a reader up to ninety (design A1): 16px text, fields and buttons; 48px buttons.
const BODY_TEXT = { fontSize: 16, lineHeight: 1.7, color: '#6A5F5B' } as const;
const BIG_BUTTON = { minHeight: 48, fontSize: 16 } as const;
// An Alert can hold a whole email, longer than a phone is wide.
const ALERT_TEXT = { fontSize: 16, overflowWrap: 'anywhere' } as const;

const CODE_INPUT = {
  htmlInput: { inputMode: 'numeric', autoComplete: 'one-time-code' },
} as const;

const LINE_TEXT =
  '為了確認是你本人，要先到 LINE 再登入一次。登入好會自動回到這裡。';

/** The page's three rows; one is open at a time. */
type SecurityRowKey = 'password' | 'contact' | 'logout';
type SecurityEditor =
  | { kind: 'closed' | 'password' | 'logout' }
  | { kind: 'contact'; type: AuthIdentityType | null };
type StepUp = components['schemas']['StepUp'];
type ContactProof = {
  password: NonNullable<StepUp['password']>;
  oldCode: NonNullable<StepUp['old_channel_code']>;
  code: components['schemas']['VerifyContactRequest']['code'];
};
type ChangedPasswordDraft = Pick<
  Parameters<typeof changePasswordAsync>[0],
  'old_password' | 'new_password'
> & {
  confirm: Parameters<typeof changePasswordAsync>[0]['new_password'];
};
type FirstPasswordDraft = Pick<
  Parameters<typeof setPasswordAsync>[0],
  'password'
> & {
  confirm: Parameters<typeof setPasswordAsync>[0]['password'];
  code: NonNullable<StepUp['old_channel_code']>;
};
type PasswordSubmission = { resending: boolean };
const PASSWORD_SUBMISSION: PasswordSubmission = { resending: false };
const EMPTY_CONTACT_PROOF: ContactProof = {
  password: '',
  oldCode: '',
  code: '',
};

const ROW_BORDER = '#E5DDD8';
const OPEN_BLUE = designTokens.color.brand.secondary.default;
const GREYED = designTokens.color.fg.neutral.muted;

/**
 * One row of the page (design A1): its name and a line about it, opened to show what it asks.
 * The whole row opens it, not only 打開; an open row turns blue, says 收起, and ends in 取消, which closes
 * it. A row that cannot be used here is grey, says why under it, and does not open.
 */
function SecurityRow({
  title,
  summary,
  open,
  blocked,
  headerRef,
  onOpen,
  onClose,
  children,
}: {
  title: string;
  summary: string;
  open: boolean;
  /** Why the row cannot be used here, shown under it in place of 打開. */
  blocked?: string | null;
  /** The row's header, for the page to put focus back on. */
  headerRef?: React.RefObject<HTMLButtonElement | null>;
  onOpen: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const contentId = useId();
  const ownHeader = useRef<HTMLButtonElement>(null);
  const header = headerRef ?? ownHeader;
  const heading = (
    <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
      <Typography
        sx={{
          fontSize: 20,
          fontWeight: 700,
          color: blocked ? GREYED : '#241B19',
        }}
      >
        {title}
      </Typography>
      {/* An email in it can be longer than a phone is wide. */}
      <Typography
        sx={{
          ...BODY_TEXT,
          color: blocked ? GREYED : BODY_TEXT.color,
          overflowWrap: 'anywhere',
        }}
      >
        {summary}
      </Typography>
    </Stack>
  );

  return (
    <Card
      sx={{
        borderRadius: '24px',
        boxShadow: 'none',
        border: `1px solid ${open ? OPEN_BLUE : ROW_BORDER}`,
      }}
    >
      {blocked ? (
        <Stack spacing={1.5} sx={{ p: 3 }}>
          {heading}
          <CannotHere>{blocked}</CannotHere>
        </Stack>
      ) : (
        <>
          <ButtonBase
            ref={header}
            aria-expanded={open}
            aria-controls={open ? contentId : undefined}
            onClick={open ? onClose : onOpen}
            sx={{
              width: '100%',
              p: 3,
              gap: 2,
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              borderRadius: '24px',
            }}
          >
            {heading}
            <Stack
              direction="row"
              sx={{
                alignItems: 'center',
                flexShrink: 0,
                pt: '2px',
                color: OPEN_BLUE,
                fontSize: 16,
                fontWeight: 700,
              }}
            >
              {open ? '收起' : '打開'}
              {open ? <Icons.chevronUp /> : <Icons.chevronDown />}
            </Stack>
          </ButtonBase>
          {open ? (
            <Stack id={contentId} spacing={2} sx={{ px: 3, pb: 3 }}>
              {children}
              {/* 取消 goes with the row it closes: focus stays on the row, not the top of the page. */}
              <Button
                variant="text"
                sx={BIG_BUTTON}
                onClick={() => {
                  onClose();
                  header.current?.focus();
                }}
              >
                取消
              </Button>
            </Stack>
          ) : null}
        </>
      )}
    </Card>
  );
}

/** Why a row cannot be used here: no button, which would only be pressed. */
function CannotHere({ children }: { children: React.ReactNode }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
      <Icons.info sx={{ mt: '4px', fontSize: 20, color: '#6A5F5B' }} />
      <Typography sx={BODY_TEXT}>{children}</Typography>
    </Stack>
  );
}

function ProblemAlert({ problem }: { problem: StepUpProblem | null }) {
  return problem ? (
    <Alert severity={problem.tone} sx={ALERT_TEXT}>
      {problem.message}
    </Alert>
  ) : null;
}

export function AccountSecurityClient({
  userId,
  contacts,
  loginMethods,
}: AccountSecurityClientProps) {
  const consumeReturn = useReturnQuery();
  const router = useRouter();
  const saltIdentity = saltLookupIdentity(contacts);
  const signsInWithPassword = hasPassword(loginMethods);
  // Only Google and nothing to send a code to: both sections say so before anything is pressed.
  const googleOnly = cannotProveHere(contacts, loginMethods);
  // No email or phone to sign in with a password by: 設定登入密碼 says to add one first.
  const passwordBlocked = setPasswordBlocked(contacts, loginMethods);
  const changedPassword = useMutation({
    mutationFn: handleChangePasswordAsync,
  });
  const passwordForm = useForm({
    defaultValues: {
      old_password: '',
      new_password: '',
      confirm: '',
    } satisfies ChangedPasswordDraft,
    validators: {
      onSubmit: ({ value }): string | undefined =>
        !saltIdentity
          ? '你的帳號還沒有已驗證的電子郵件或手機，沒辦法確認現在的密碼。'
          : (newPasswordProblem(value.new_password, value.confirm) ??
            undefined),
    },
    onSubmit: ({ value }): Promise<void> => changedPassword.mutateAsync(value),
  });
  const {
    old_password: oldPassword,
    new_password: newPassword,
    confirm: newPasswordConfirm,
  } = useStore(passwordForm.store, (state) => state.values);
  const passwordError = useStore(
    passwordForm.store,
    (state) => state.errorMap.onSubmit,
  );
  const setPasswordError = (message?: string) =>
    passwordForm.setErrorMap({ onSubmit: message });
  const [passwordSuccess, setPasswordSuccess] = useState<string>();
  const isChangingPassword = changedPassword.isPending;

  const firstPassword = useMutation({ mutationFn: handleSetPasswordAsync });
  const firstPasswordForm = useForm({
    defaultValues: {
      password: '',
      confirm: '',
      code: '',
    } satisfies FirstPasswordDraft,
    onSubmitMeta: PASSWORD_SUBMISSION,
    validators: {
      onSubmit: ({ value }): StepUpProblem | undefined => {
        const message = newPasswordProblem(value.password, value.confirm);
        return message ? { message, tone: 'error' } : undefined;
      },
    },
    onSubmit: ({ value, meta }): Promise<void> =>
      firstPassword.mutateAsync({ draft: value, ...meta }),
  });
  const {
    password: setPasswordValue,
    confirm: setPasswordConfirm,
    code: setPasswordCode,
  } = useStore(firstPasswordForm.store, (state) => state.values);
  const setPasswordProblem = useStore(
    firstPasswordForm.store,
    (state) => state.errorMap.onSubmit ?? null,
  );
  const setSetPasswordProblem = (problem: StepUpProblem | null) =>
    firstPasswordForm.setErrorMap({ onSubmit: problem ?? undefined });
  const [setPasswordStage, setSetPasswordStage] = useState<SetPasswordStage>({
    kind: 'enter',
  });
  const [setPasswordNotice, setSetPasswordNotice] = useState<string>();
  const [setPasswordSuccessMessage, setSetPasswordSuccessMessage] =
    useState<string>();
  const isSettingPassword = firstPassword.isPending;
  // One more each time the password row is let go of (取消, or another row opened): an answer that
  // comes back after it is for a row the person has left, and is dropped, as in `use-add-contact.ts`.
  const passwordAttempt = useRef(0);

  const contactForm = useForm({
    defaultValues: EMPTY_CONTACT_PROOF,
    onSubmit: ({ value }): Promise<void> | void => {
      switch (contact.stage.kind) {
        case 'password':
          return contact.submitPassword(value.password);
        case 'old-code':
          return contact.submitOldCode(value.oldCode.trim());
        case 'code':
          return contact.verify(value.code);
      }
    },
  });
  const {
    password: contactPassword,
    oldCode: contactOldCode,
    code: contactCode,
  } = useStore(contactForm.store, (state) => state.values);
  const [isLoggingOutAll, setIsLoggingOutAll] = useState(false);
  const [editor] = useState(() =>
    createStore<SecurityEditor>(() => ({ kind: 'closed' })),
  );
  const editing = useZustandStore(editor);
  const openRow = editing.kind === 'closed' ? null : editing.kind;
  const contactKind = editing.kind === 'contact' ? editing.type : null;
  const setContactKind = (type: AuthIdentityType | null) =>
    editor.setState({ kind: 'contact', type }, true);
  const contactHeader = useRef<HTMLButtonElement>(null);

  const { keep: keepContactDraft, take: takeContactDraft } =
    useContactDraft(userId);

  /**
   * Only LINE can prove it is them (ADR-361): the page goes to LINE and comes back. `/users/me` first,
   * through the session's own fetch: a session refreshed or ended there, rather than in the navigation,
   * which would show its error as a page of JSON.
   */
  const goProveAtLine = async (
    action: AccountStepUpAction,
    draft?: ContactDraft,
  ) => {
    if (draft) {
      keepContactDraft(draft);
    }

    try {
      await getCurrentUserAsync();
    } catch {
      // An ended session reloads the tab as a guest by itself; anything else, LINE is tried anyway.
    }

    window.location.assign(buildAccountStepUpHref(action));
  };

  const contact = useAddContact({
    hasPassword: signsInWithPassword,
    saltIdentity,
    current: (type) => replacedContact(contacts, type),
    stillPending: (type) =>
      oldCodeStillPending(originalContactName(contacts, type)),
    onReauth: (draft) => void goProveAtLine('add_contact', draft),
    // The account's contacts are read again, the new one among them.
    onChanged: () => router.refresh(),
    // Done: back to the list, with what was done over it (design ⑫) and no warning about it. Focus goes
    // to the row's header: the button just pressed goes away with step 3.
    onVerified: () => {
      setContactKind(null);
      contactHeader.current?.focus();
    },
  });
  const resumeContact = contact.resume;

  // Each step asks for its own: what was typed for one does not carry into the next.
  useEffect(() => {
    contactForm.reset();
  }, [contact.stage.kind, contactForm]);

  // Back from LINE (`account-step-up.ts`), once: off the address, then on with what was pressed.
  const handledReturn = useRef(false);

  useEffect(() => {
    if (handledReturn.current) {
      return;
    }

    handledReturn.current = true;

    const back = readAccountStepUpReturn(
      new URLSearchParams(window.location.search),
    );

    if (!back) {
      return;
    }

    consumeReturn(['resume', 'step_up', 'step_up_error']);

    // A first password does not go to LINE any more (`setPasswordBlocked`): nothing to pick up.
    if (back.action !== 'add_contact') {
      return;
    }

    const draft = takeContactDraft();

    if (draft) {
      editor.setState({ kind: 'contact', type: draft.type }, true);
      resumeContact(draft, back.stepUp);
    }
  }, [consumeReturn, editor, resumeContact, takeContactDraft]);

  async function handleChangePasswordAsync({
    old_password: oldPassword,
    new_password: newPassword,
  }: ChangedPasswordDraft): Promise<void> {
    if (!saltIdentity) return;

    const asked = passwordAttempt.current;
    setPasswordError(undefined);
    setPasswordSuccess(undefined);

    try {
      const currentPassword = await resolveHashedCredentialAsync(
        saltIdentity,
        oldPassword,
      );
      const nextPassword = await createHashedCredentialAsync(newPassword);

      // Let go of while the passwords were being worked out: nothing goes out for it.
      if (asked !== passwordAttempt.current) {
        return;
      }

      await changePasswordAsync({
        old_password: currentPassword.hashedPassword,
        new_password: nextPassword.hashedPassword,
        salt_frontend: nextPassword.saltFrontend,
      });

      // Changed whether or not the row is still open: the backend has ended the session either way.
      setPasswordSuccess('密碼已經改好，請重新登入。');
      signInAgain();
    } catch (error) {
      if (asked !== passwordAttempt.current) {
        return;
      }

      setPasswordError(
        resolveAuthErrorMessage(error, '變更密碼失敗，請稍後再試。'),
      );
    }
  }

  /**
   * A first password, with the proof the backend asks for first (`require_step_up_for_first_password`):
   * a code it sends to a contact the account already had. `resending` asks again without the code, for
   * 沒收到？重新寄一次.
   */
  async function handleSetPasswordAsync({
    draft,
    resending,
  }: { draft: FirstPasswordDraft } & PasswordSubmission): Promise<void> {
    const { password: setPasswordValue, code: setPasswordCode } = draft;
    const withCode = setPasswordStage.kind === 'old-code' && !resending;

    if (withCode && setPasswordCode.trim().length < 4) {
      setSetPasswordProblem({ message: '請輸入收到的驗證碼', tone: 'error' });
      return;
    }

    const asked = passwordAttempt.current;
    setSetPasswordProblem(null);
    setSetPasswordNotice(undefined);
    setSetPasswordSuccessMessage(undefined);

    try {
      const createdPassword =
        await createHashedCredentialAsync(setPasswordValue);

      if (asked !== passwordAttempt.current) {
        return;
      }

      await setPasswordAsync({
        password: createdPassword.hashedPassword,
        salt_frontend: createdPassword.saltFrontend,
        step_up: withCode
          ? { old_channel_code: setPasswordCode.trim() }
          : undefined,
      });

      setSetPasswordSuccessMessage('已設定登入密碼，請用新密碼重新登入。');
      firstPasswordForm.setFieldValue('password', '');
      firstPasswordForm.setFieldValue('confirm', '');
      // The backend ends the session on a password created, as on one changed.
      signInAgain();
    } catch (error) {
      if (asked !== passwordAttempt.current) {
        return;
      }

      const code = error instanceof ApiError ? error.code : undefined;

      if (
        error instanceof ApiError &&
        code === 'step_up_required' &&
        !withCode
      ) {
        const ask = readStepUpRequired(error.message);

        if (ask.kind === 'old-code') {
          if (resending) {
            setSetPasswordNotice(
              ask.pending
                ? oldCodeStillPending(originalContactName(contacts))
                : '驗證碼已經重新寄出。',
            );
          } else {
            firstPasswordForm.setFieldValue('code', '');
          }
          setSetPasswordStage(ask);
        } else {
          setSetPasswordProblem({
            message:
              ask.kind === 'refused'
                ? ask.message
                : setPasswordErrorMessage(error, 'send'),
            tone: 'error',
          });
        }
        return;
      }

      setSetPasswordProblem({
        message: setPasswordErrorMessage(error, withCode ? 'old-code' : 'send'),
        tone: 'error',
      });
    }
  }

  /** A row closed, by 取消 or by another opening: what it was in the middle of is dropped. */
  function resetRow(row: SecurityRowKey) {
    if (row === 'password') {
      passwordAttempt.current += 1;
      changedPassword.reset();
      firstPassword.reset();
      passwordForm.reset();
      firstPasswordForm.reset();
      setSetPasswordStage({ kind: 'enter' });
      setSetPasswordNotice(undefined);
    } else if (row === 'contact') {
      contact.cancel();
      setContactKind(null);
    }
  }

  function openOnly(row: SecurityRowKey) {
    if (openRow && openRow !== row) {
      resetRow(openRow);
    }

    editor.setState(
      row === 'contact'
        ? { kind: 'contact', type: contactKind }
        : { kind: row },
      true,
    );
  }

  function closeRow(row: SecurityRowKey) {
    resetRow(row);
    editor.setState({ kind: 'closed' }, true);
  }

  async function handleLogoutAllAsync() {
    // This tab is signed out by the person's choice too, as by 登出 in the menu.
    clearDraftsOnSignOut(sessionStorageOrNull());
    setIsLoggingOutAll(true);

    try {
      await logoutAllAsync();
      signInAgain();
    } finally {
      setIsLoggingOutAll(false);
    }
  }

  const setPasswordOriginal = originalContactName(contacts);
  const contactOriginal = originalContactName(contacts, contact.type);
  // The account's own email or phone of the kind being changed: 更換 replaces it, 新增 has none.
  const replacing = contactKind ? replacedContact(contacts, contactKind) : null;
  const contactStep =
    contact.stage.kind === 'enter' ? 0 : contact.stage.kind === 'code' ? 2 : 1;
  const contactRowOpen = openRow === 'contact';
  const contactTitle = contactKind
    ? `${replacing ? '更換' : '新增'}${contactName(contactKind)}`
    : '電子郵件和手機';
  const contactLine = !contactRowOpen
    ? contactsSummary(contacts)
    : contactKind
      ? `為了安全，要先確認是你本人，再輸入新的${contactName(contactKind)}收到的驗證碼，共三步。`
      : '每個帳號可以有一個電子郵件、一個手機。';

  return (
    <Stack spacing={3}>
      <Box>
        <Typography sx={{ fontSize: 32, lineHeight: '40px', fontWeight: 700 }}>
          帳號安全
        </Typography>
        <Typography sx={{ ...BODY_TEXT, mt: 1 }}>
          登入方式：{loginMethodsText(loginMethods)}
        </Typography>
      </Box>

      {/* One of the two, by whether the account has a password to change. */}
      {signsInWithPassword ? (
        <SecurityRow
          title="變更密碼"
          summary="換一組新的密碼。"
          open={openRow === 'password'}
          onOpen={() => openOnly('password')}
          onClose={() => closeRow('password')}
        >
          <Typography sx={BODY_TEXT}>
            改好後，所有手機、電腦都會登出，要用新密碼重新登入一次。
          </Typography>
          <TextField
            label="現在的密碼"
            type="password"
            value={oldPassword}
            onChange={(event) =>
              passwordForm.setFieldValue('old_password', event.target.value, {
                dontValidate: true,
              })
            }
          />
          <TextField
            label="新密碼"
            type="password"
            placeholder={newPasswordText.placeholder}
            value={newPassword}
            onChange={(event) =>
              passwordForm.setFieldValue('new_password', event.target.value, {
                dontValidate: true,
              })
            }
          />
          <TextField
            label="再輸入一次新密碼"
            type="password"
            value={newPasswordConfirm}
            onChange={(event) =>
              passwordForm.setFieldValue('confirm', event.target.value, {
                dontValidate: true,
              })
            }
          />

          {passwordError ? (
            <Alert severity="error" sx={ALERT_TEXT}>
              {passwordError}
            </Alert>
          ) : null}
          {passwordSuccess ? (
            <Alert severity="success" sx={ALERT_TEXT}>
              {passwordSuccess}
            </Alert>
          ) : null}

          <Button
            variant="contained"
            disabled={isChangingPassword}
            sx={BIG_BUTTON}
            onClick={() => {
              void passwordForm.handleSubmit();
            }}
          >
            更新密碼
          </Button>
        </SecurityRow>
      ) : (
        <SecurityRow
          title="設定登入密碼"
          summary="設一組密碼，以後也可以用密碼登入。"
          open={openRow === 'password'}
          blocked={passwordBlocked}
          onOpen={() => openOnly('password')}
          onClose={() => closeRow('password')}
        >
          {/* The row's own line already says what a password is for. */}
          <Typography sx={BODY_TEXT}>
            你現在是用 {loginMethodsText(loginMethods)}{' '}
            登入。設好後要重新登入一次。
          </Typography>
          <TextField
            label="新密碼"
            type="password"
            placeholder={newPasswordText.placeholder}
            value={setPasswordValue}
            onChange={(event) =>
              firstPasswordForm.setFieldValue('password', event.target.value, {
                dontValidate: true,
              })
            }
          />
          <TextField
            label="再輸入一次新密碼"
            type="password"
            value={setPasswordConfirm}
            onChange={(event) =>
              firstPasswordForm.setFieldValue('confirm', event.target.value, {
                dontValidate: true,
              })
            }
          />

          {setPasswordStage.kind === 'old-code' ? (
            <>
              <Alert severity="info" sx={ALERT_TEXT}>
                {oldCodeSentText(setPasswordOriginal, setPasswordStage.pending)}
              </Alert>
              <TextField
                label={`原本的${setPasswordOriginal}收到的驗證碼`}
                placeholder="6 位數字"
                autoFocus
                value={setPasswordCode}
                slotProps={CODE_INPUT}
                onChange={(event) =>
                  firstPasswordForm.setFieldValue('code', event.target.value, {
                    dontValidate: true,
                  })
                }
              />
            </>
          ) : null}

          {setPasswordNotice ? (
            <Alert severity="info" sx={ALERT_TEXT}>
              {setPasswordNotice}
            </Alert>
          ) : null}
          <ProblemAlert problem={setPasswordProblem} />
          {setPasswordSuccessMessage ? (
            <Alert severity="success" sx={ALERT_TEXT}>
              {setPasswordSuccessMessage}
            </Alert>
          ) : null}

          <Button
            variant="contained"
            disabled={isSettingPassword}
            sx={BIG_BUTTON}
            onClick={() => {
              void firstPasswordForm.handleSubmit();
            }}
          >
            {setPasswordStage.kind === 'old-code' ? '確認' : '設定密碼'}
          </Button>
          {setPasswordStage.kind === 'old-code' ? (
            <Button
              variant="text"
              disabled={isSettingPassword}
              sx={BIG_BUTTON}
              onClick={() => {
                void firstPasswordForm.handleSubmit({ resending: true });
              }}
            >
              沒收到？重新寄一次
            </Button>
          ) : null}
        </SecurityRow>
      )}

      <SecurityRow
        title={contactTitle}
        summary={contactLine}
        open={contactRowOpen}
        blocked={googleOnly ? '你是用 Google 登入，暫時不能在這裡新增。' : null}
        headerRef={contactHeader}
        onOpen={() => openOnly('contact')}
        onClose={() => closeRow('contact')}
      >
        {contactKind ? (
          <StepDots steps={addContactSteps(contactKind)} at={contactStep} />
        ) : (
          <>
            {/* What was just done, over the list it changed (design ⑫). */}
            {contact.notice ? (
              <Alert severity="success" sx={ALERT_TEXT}>
                {contact.notice}
              </Alert>
            ) : null}
            {(['email', 'phone'] as const).map((type) => {
              const held = replacedContact(contacts, type);

              return (
                <Stack
                  key={type}
                  direction="row"
                  spacing={1.5}
                  sx={{
                    alignItems: 'center',
                    py: 1.5,
                    borderTop: `1px solid ${ROW_BORDER}`,
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      sx={{ fontSize: 16, fontWeight: 700, color: '#241B19' }}
                    >
                      {contactName(type)}
                    </Typography>
                    <Typography
                      sx={{
                        ...BODY_TEXT,
                        color: held ? BODY_TEXT.color : GREYED,
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {held?.value ?? '還沒有'}
                    </Typography>
                  </Box>
                  {/* Both can read 更換: the name says which, with the word on the button in it. */}
                  <Button
                    variant="outlined"
                    aria-label={`${held ? '更換' : '新增'}${contactName(type)}`}
                    sx={{ minHeight: 44, minWidth: 88, fontSize: 16 }}
                    onClick={() => {
                      setContactKind(type);
                      contact.change({ type, value: '' });
                    }}
                  >
                    {held ? '更換' : '新增'}
                  </Button>
                </Stack>
              );
            })}
          </>
        )}

        {contactKind && contact.stage.kind === 'enter' ? (
          <>
            {replacing ? (
              <Typography sx={BODY_TEXT}>
                現在的{contactName(contactKind)}：
                <Box
                  component="b"
                  sx={{ color: '#241B19', overflowWrap: 'anywhere' }}
                >
                  {replacing.value}
                </Box>
              </Typography>
            ) : null}
            <TextField
              label={contactKind === 'email' ? '新的電子郵件' : '新的手機號碼'}
              placeholder={
                contactKind === 'email'
                  ? '例：wang@gmail.com'
                  : '例：0912345678'
              }
              autoFocus
              value={contact.value}
              onChange={(event) =>
                contact.change({ value: event.target.value })
              }
              slotProps={{
                htmlInput: {
                  autoComplete: contactKind === 'email' ? 'email' : 'tel',
                },
              }}
            />
            {/* 更換 only, over its button (design ⑩); 新增 replaces nothing. */}
            {replacing ? (
              <Alert severity="warning" sx={ALERT_TEXT}>
                {replaceNotice(replacing, signsInWithPassword)}
              </Alert>
            ) : null}
            <Button
              variant="contained"
              disabled={contact.busy}
              sx={BIG_BUTTON}
              onClick={contact.send}
            >
              寄驗證碼
            </Button>
          </>
        ) : null}

        {contact.stage.kind === 'password' ? (
          <>
            <Typography sx={BODY_TEXT}>
              為了確認是你本人，請先輸入你現在的密碼。
            </Typography>
            <TextField
              label="現在的密碼"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={contactPassword}
              onChange={(event) =>
                contactForm.setFieldValue('password', event.target.value)
              }
            />
            <Button
              variant="contained"
              disabled={contact.busy || !contactPassword}
              sx={BIG_BUTTON}
              onClick={() => {
                void contactForm.handleSubmit();
              }}
            >
              確認
            </Button>
            {/* Until a code can stand in for it (design A2-2): reset it, sign in, and back here. */}
            <Button
              component={Link}
              href={authHref('/forgot-password', {
                callbackUrl: ACCOUNT_SECURITY_PATH,
              })}
              variant="text"
              sx={BIG_BUTTON}
            >
              忘記密碼？
            </Button>
          </>
        ) : null}

        {contact.stage.kind === 'old-code' ? (
          <>
            <Alert severity="info" sx={ALERT_TEXT}>
              {oldCodeSentText(contactOriginal, contact.stage.pending)}
            </Alert>
            <TextField
              label={`原本的${contactOriginal}收到的驗證碼`}
              placeholder="6 位數字"
              autoFocus
              value={contactOldCode}
              slotProps={CODE_INPUT}
              onChange={(event) =>
                contactForm.setFieldValue('oldCode', event.target.value)
              }
            />
            <Button
              variant="contained"
              disabled={contact.busy || contactOldCode.trim().length < 4}
              sx={BIG_BUTTON}
              onClick={() => void contactForm.handleSubmit()}
            >
              確認
            </Button>
            <Button
              variant="text"
              disabled={contact.busy}
              sx={BIG_BUTTON}
              onClick={contact.resendOldCode}
            >
              沒收到？重新寄一次
            </Button>
          </>
        ) : null}

        {contact.stage.kind === 'line' ? (
          <>
            <Typography sx={BODY_TEXT}>{LINE_TEXT}</Typography>
            {/* No field in this step: the button takes the focus 寄驗證碼 had. */}
            <Button
              variant="contained"
              autoFocus
              sx={BIG_BUTTON}
              onClick={contact.proveAtLine}
            >
              到 LINE 確認是我
            </Button>
          </>
        ) : null}

        {contact.stage.kind === 'code' ? (
          <>
            <Alert severity="info" sx={ALERT_TEXT}>
              {newCodeSentText(
                contact.stage.type,
                contact.stage.value,
                replacing,
              )}
            </Alert>
            <TextField
              label={`新的${contactName(contact.stage.type)}收到的驗證碼`}
              placeholder="6 位數字"
              autoFocus
              value={contactCode}
              slotProps={CODE_INPUT}
              onChange={(event) =>
                contactForm.setFieldValue('code', event.target.value)
              }
            />
            <Button
              variant="contained"
              disabled={contact.busy}
              sx={BIG_BUTTON}
              onClick={() => {
                void contactForm.handleSubmit();
              }}
            >
              {replacing ? '完成更換' : '完成新增'}
            </Button>
            <Button
              variant="text"
              disabled={contact.busy}
              sx={BIG_BUTTON}
              onClick={() => {
                void contact.resend();
              }}
            >
              沒收到？重新寄一次
            </Button>
          </>
        ) : null}

        <ProblemAlert problem={contact.problem} />
        {contactKind && contact.notice ? (
          <Alert severity="info" sx={ALERT_TEXT}>
            {contact.notice}
          </Alert>
        ) : null}
      </SecurityRow>

      <SecurityRow
        title="登出所有裝置"
        summary="所有手機、電腦都會登出，包含這一台。"
        open={openRow === 'logout'}
        onOpen={() => openOnly('logout')}
        onClose={() => closeRow('logout')}
      >
        <Button
          color="error"
          variant="outlined"
          disabled={isLoggingOutAll}
          sx={BIG_BUTTON}
          onClick={() => {
            void handleLogoutAllAsync();
          }}
        >
          登出所有裝置
        </Button>
      </SecurityRow>
    </Stack>
  );
}
