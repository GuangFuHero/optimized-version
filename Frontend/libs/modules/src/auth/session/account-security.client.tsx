'use client';

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { ApiError } from '@rescue-frontend/data-access';

import { continueSignedOut } from '../../session/end-expired-session';
import { newPasswordProblem, newPasswordText } from '../login';
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
import {
  hasPassword,
  loginMethodsText,
  saltLookupIdentity,
  type AccountContact,
  type LoginMethod,
} from './account-security-view';
import {
  buildAccountStepUpHref,
  LINE_OK_SET_PASSWORD,
  lineReturnError,
  readAccountStepUpReturn,
  readStepUpRequired,
  setPasswordErrorMessage,
  stripAccountStepUpReturn,
  type AccountStepUpAction,
} from './account-step-up';
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
  | { kind: 'old-code'; message: string };

function SecuritySection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card
      sx={{
        borderRadius: '24px',
        boxShadow: 'none',
        border: '1px solid #E5DDD8',
      }}
    >
      <CardContent sx={{ p: 3 }}>
        <Stack spacing={2.5}>
          <Stack spacing={0.75}>
            <Typography
              sx={{ fontSize: 20, fontWeight: 700, color: '#241B19' }}
            >
              {title}
            </Typography>
            <Typography
              sx={{ fontSize: 14, lineHeight: '22px', color: '#6A5F5B' }}
            >
              {description}
            </Typography>
          </Stack>

          {children}
        </Stack>
      </CardContent>
    </Card>
  );
}

export function AccountSecurityClient({
  userId,
  contacts,
  loginMethods,
}: AccountSecurityClientProps) {
  const router = useRouter();
  const saltIdentity = saltLookupIdentity(contacts);
  const signsInWithPassword = hasPassword(loginMethods);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [passwordError, setPasswordError] = useState<string>();
  const [passwordSuccess, setPasswordSuccess] = useState<string>();
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const [setPasswordValue, setSetPasswordValue] = useState('');
  const [setPasswordConfirm, setSetPasswordConfirm] = useState('');
  const [setPasswordStage, setSetPasswordStage] = useState<SetPasswordStage>({
    kind: 'enter',
  });
  const [setPasswordCode, setSetPasswordCode] = useState('');
  const [setPasswordErrorText, setSetPasswordErrorText] = useState<string>();
  const [setPasswordNotice, setSetPasswordNotice] = useState<string>();
  const [setPasswordSuccessMessage, setSetPasswordSuccessMessage] =
    useState<string>();
  const [isSettingPassword, setIsSettingPassword] = useState(false);
  // Back from LINE with the proof: a second 「去 LINE」 now means it ran out, not a first visit.
  const [lineProofReady, setLineProofReady] = useState(false);

  const [contactPassword, setContactPassword] = useState('');
  const [contactOldCode, setContactOldCode] = useState('');
  const [contactCode, setContactCode] = useState('');
  const [isLoggingOutAll, setIsLoggingOutAll] = useState(false);

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
    onReauth: (draft) => void goProveAtLine('add_contact', draft),
    // `saltIdentity` reads the account's contacts, which the server read before this one was added.
    onVerified: () => router.refresh(),
  });
  const resumeContact = contact.resume;

  // Each step asks for its own: what was typed for one does not carry into the next.
  useEffect(() => {
    setContactPassword('');
    setContactOldCode('');
    setContactCode('');
  }, [contact.stage.kind]);

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

    const address = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.history.replaceState(
      window.history.state,
      '',
      stripAccountStepUpReturn(address),
    );

    if (back.action === 'set_password') {
      if (back.stepUp === 'ok') {
        setLineProofReady(true);
        setSetPasswordNotice(LINE_OK_SET_PASSWORD);
      } else if (back.stepUp) {
        setSetPasswordErrorText(
          lineReturnError(back.stepUp.error, 'set_password'),
        );
      }
      return;
    }

    const draft = takeContactDraft();

    if (draft) {
      resumeContact(draft, back.stepUp);
    }
  }, [resumeContact, takeContactDraft]);

  async function handleChangePasswordAsync() {
    if (!saltIdentity) {
      setPasswordError('你的帳號還沒有已驗證的聯絡方式，無法確認目前的密碼。');
      return;
    }

    const newPasswordError = newPasswordProblem(
      newPassword,
      newPasswordConfirm,
    );

    if (newPasswordError) {
      setPasswordError(newPasswordError);
      return;
    }

    setIsChangingPassword(true);
    setPasswordError(undefined);
    setPasswordSuccess(undefined);

    try {
      const currentPassword = await resolveHashedCredentialAsync(
        saltIdentity,
        oldPassword,
      );
      const nextPassword = await createHashedCredentialAsync(newPassword);

      await changePasswordAsync({
        old_password: currentPassword.hashedPassword,
        new_password: nextPassword.hashedPassword,
        salt_frontend: nextPassword.saltFrontend,
      });

      setPasswordSuccess('密碼已更新，系統將重新登入。');
      signInAgain();
    } catch (error) {
      setPasswordError(
        resolveAuthErrorMessage(error, '變更密碼失敗，請稍後再試。'),
      );
    } finally {
      setIsChangingPassword(false);
    }
  }

  /**
   * A first password, with the proof the backend asks for first (`require_step_up_for_first_password`):
   * a code it sends to a contact the account already had, or LINE when that is all there is.
   */
  async function handleSetPasswordAsync() {
    const setPasswordProblem = newPasswordProblem(
      setPasswordValue,
      setPasswordConfirm,
    );

    if (setPasswordProblem) {
      setSetPasswordErrorText(setPasswordProblem);
      return;
    }

    const withCode = setPasswordStage.kind === 'old-code';

    if (withCode && setPasswordCode.trim().length < 4) {
      setSetPasswordErrorText('請輸入有效驗證碼');
      return;
    }

    setIsSettingPassword(true);
    setSetPasswordErrorText(undefined);
    setSetPasswordNotice(undefined);
    setSetPasswordSuccessMessage(undefined);

    try {
      const createdPassword =
        await createHashedCredentialAsync(setPasswordValue);

      await setPasswordAsync({
        password: createdPassword.hashedPassword,
        salt_frontend: createdPassword.saltFrontend,
        step_up: withCode
          ? { old_channel_code: setPasswordCode.trim() }
          : undefined,
      });

      setSetPasswordSuccessMessage('已建立登入密碼，請用新密碼重新登入。');
      setSetPasswordValue('');
      setSetPasswordConfirm('');
      // The backend ends the session on a password created, as on one changed.
      signInAgain();
    } catch (error) {
      const code = error instanceof ApiError ? error.code : undefined;

      if (code === 'step_up_reauth_required') {
        // Straight back from LINE, the proof has already run out: say so rather than go round again.
        if (lineProofReady) {
          setLineProofReady(false);
          setSetPasswordErrorText('LINE 驗證已逾時，請再按一次「建立密碼」');
        } else {
          void goProveAtLine('set_password');
        }
        return;
      }

      if (code === 'step_up_required' && !withCode) {
        const ask = readStepUpRequired((error as ApiError).message);

        if (ask.kind === 'old-code') {
          setSetPasswordCode('');
          setSetPasswordStage(ask);
        } else {
          setSetPasswordErrorText(
            ask.kind === 'refused'
              ? ask.message
              : setPasswordErrorMessage(error, 'send'),
          );
        }
        return;
      }

      setSetPasswordErrorText(
        setPasswordErrorMessage(error, withCode ? 'old-code' : 'send'),
      );
    } finally {
      setIsSettingPassword(false);
    }
  }

  async function handleLogoutAllAsync() {
    setIsLoggingOutAll(true);

    try {
      await logoutAllAsync();
      signInAgain();
    } finally {
      setIsLoggingOutAll(false);
    }
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography sx={{ fontSize: 32, lineHeight: '40px', fontWeight: 700 }}>
          帳號安全
        </Typography>
        <Typography sx={{ mt: 1, fontSize: 14, color: '#6A5F5B' }}>
          登入方式：{loginMethodsText(loginMethods)}
        </Typography>
      </Box>

      {/* One of the two, by whether the account has a password to change. */}
      {signsInWithPassword ? (
        <SecuritySection
          title="變更密碼"
          description="會立即撤銷既有登入狀態，完成後需要重新登入。"
        >
          <Stack spacing={2}>
            <TextField
              label="目前密碼"
              type="password"
              value={oldPassword}
              onChange={(event) => setOldPassword(event.target.value)}
            />
            <TextField
              label="新密碼"
              type="password"
              placeholder={newPasswordText.placeholder}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
            <TextField
              label="再次輸入新密碼"
              type="password"
              value={newPasswordConfirm}
              onChange={(event) => setNewPasswordConfirm(event.target.value)}
            />

            {passwordError ? (
              <Alert severity="error">{passwordError}</Alert>
            ) : null}
            {passwordSuccess ? (
              <Alert severity="success">{passwordSuccess}</Alert>
            ) : null}

            <Button
              variant="contained"
              disabled={isChangingPassword}
              onClick={() => {
                void handleChangePasswordAsync();
              }}
            >
              更新密碼
            </Button>
          </Stack>
        </SecuritySection>
      ) : (
        <SecuritySection
          title="建立登入密碼"
          description="你的帳號目前只用 Google 或 LINE 登入，可以在這裡建立登入密碼，之後也能用密碼登入。建立後需要重新登入。"
        >
          <Stack spacing={2}>
            <TextField
              label="新密碼"
              type="password"
              placeholder={newPasswordText.placeholder}
              value={setPasswordValue}
              onChange={(event) => setSetPasswordValue(event.target.value)}
            />
            <TextField
              label="再次輸入新密碼"
              type="password"
              value={setPasswordConfirm}
              onChange={(event) => setSetPasswordConfirm(event.target.value)}
            />

            {setPasswordStage.kind === 'old-code' ? (
              <>
                <Alert severity="info">{setPasswordStage.message}</Alert>
                <TextField
                  label="驗證碼"
                  value={setPasswordCode}
                  slotProps={{
                    htmlInput: {
                      inputMode: 'numeric',
                      autoComplete: 'one-time-code',
                    },
                  }}
                  onChange={(event) => setSetPasswordCode(event.target.value)}
                />
              </>
            ) : null}

            {setPasswordNotice ? (
              <Alert severity="info">{setPasswordNotice}</Alert>
            ) : null}
            {setPasswordErrorText ? (
              <Alert severity="error">{setPasswordErrorText}</Alert>
            ) : null}
            {setPasswordSuccessMessage ? (
              <Alert severity="success">{setPasswordSuccessMessage}</Alert>
            ) : null}

            <Button
              variant="contained"
              disabled={isSettingPassword}
              onClick={() => {
                void handleSetPasswordAsync();
              }}
            >
              {setPasswordStage.kind === 'old-code'
                ? '確認並建立密碼'
                : '建立密碼'}
            </Button>
          </Stack>
        </SecuritySection>
      )}

      <SecuritySection
        title="新增聯絡方式"
        description="新增 Email 或手機號碼後，需要輸入驗證碼才能完成綁定。"
      >
        <Stack spacing={2}>
          <Stack direction="row" spacing={0.5}>
            {(['email', 'phone'] as const).map((value) => {
              const active = contact.type === value;

              return (
                <Button
                  key={value}
                  type="button"
                  variant={active ? 'contained' : 'outlined'}
                  onClick={() => contact.change({ type: value })}
                >
                  {value === 'email' ? 'Email' : '手機號碼'}
                </Button>
              );
            })}
          </Stack>

          <TextField
            label={contact.type === 'email' ? '電子郵件' : '手機號碼'}
            value={contact.value}
            onChange={(event) => contact.change({ value: event.target.value })}
          />

          {contact.stage.kind === 'enter' ? (
            <Button
              variant="contained"
              disabled={contact.busy}
              onClick={contact.send}
            >
              發送驗證碼
            </Button>
          ) : null}

          {contact.stage.kind === 'password' ? (
            <Stack spacing={2}>
              <Typography sx={{ fontSize: 14, color: '#6A5F5B' }}>
                請先輸入目前的密碼，確認是你本人後才會寄出驗證碼。
              </Typography>
              <TextField
                label="目前密碼"
                type="password"
                autoComplete="current-password"
                value={contactPassword}
                onChange={(event) => setContactPassword(event.target.value)}
              />
              <Button
                variant="contained"
                disabled={contact.busy || !contactPassword}
                onClick={() => {
                  void contact.submitPassword(contactPassword);
                }}
              >
                確認並發送驗證碼
              </Button>
            </Stack>
          ) : null}

          {contact.stage.kind === 'old-code' ? (
            <Stack spacing={2}>
              <Alert severity="info">{contact.stage.message}</Alert>
              <TextField
                label="驗證碼"
                value={contactOldCode}
                slotProps={{
                  htmlInput: {
                    inputMode: 'numeric',
                    autoComplete: 'one-time-code',
                  },
                }}
                onChange={(event) => setContactOldCode(event.target.value)}
              />
              <Button
                variant="contained"
                disabled={contact.busy || contactOldCode.trim().length < 4}
                onClick={() => contact.submitOldCode(contactOldCode.trim())}
              >
                確認並發送驗證碼
              </Button>
            </Stack>
          ) : null}

          {contact.stage.kind === 'code' ? (
            <Stack spacing={2}>
              <TextField
                label="驗證碼"
                value={contactCode}
                slotProps={{
                  htmlInput: {
                    inputMode: 'numeric',
                    autoComplete: 'one-time-code',
                  },
                }}
                onChange={(event) => setContactCode(event.target.value)}
              />
              <Stack direction="row" spacing={1}>
                <Button
                  variant="outlined"
                  disabled={contact.busy}
                  onClick={() => {
                    void contact.verify(contactCode);
                  }}
                >
                  驗證並綁定
                </Button>
                <Button
                  variant="text"
                  disabled={contact.busy}
                  onClick={() => {
                    void contact.resend();
                  }}
                >
                  重新發送
                </Button>
              </Stack>
            </Stack>
          ) : null}

          {contact.error ? (
            <Alert severity="error">{contact.error}</Alert>
          ) : null}
          {contact.notice ? (
            <Alert severity="success">{contact.notice}</Alert>
          ) : null}
        </Stack>
      </SecuritySection>

      <SecuritySection
        title="所有裝置登出"
        description="撤銷所有 refresh token，包含目前這個裝置。"
      >
        <Button
          color="error"
          variant="outlined"
          disabled={isLoggingOutAll}
          onClick={() => {
            void handleLogoutAllAsync();
          }}
        >
          登出所有裝置
        </Button>
      </SecuritySection>
    </Stack>
  );
}
