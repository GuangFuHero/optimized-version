'use client';

import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
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
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { ApiError } from '@rescue-frontend/data-access';

import { continueSignedOut } from '../../session/end-expired-session';
import { authHref, newPasswordProblem, newPasswordText } from '../login';
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
import { ContactTypeChoice, StepDots } from './account-security-controls';
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
  newCodeSentText,
  OLD_CODE_STILL_PENDING,
  oldCodeSentText,
  originalContactName,
  readAccountStepUpReturn,
  readStepUpRequired,
  replacedContact,
  replaceNotice,
  setPasswordBlocked,
  setPasswordErrorMessage,
  stripAccountStepUpReturn,
  type AccountStepUpAction,
  type StepUpProblem,
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
  | { kind: 'old-code'; pending: boolean };

// The design's floor for a reader up to ninety (design A1): 16px text, fields and buttons; 48px buttons.
const BODY_TEXT = { fontSize: 16, lineHeight: 1.7, color: '#6A5F5B' } as const;
const BIG_BUTTON = { minHeight: 48, fontSize: 16 } as const;
const ALERT_TEXT = { fontSize: 16 } as const;

const CODE_INPUT = {
  htmlInput: { inputMode: 'numeric', autoComplete: 'one-time-code' },
} as const;

const LINE_TEXT =
  '為了確認是你本人，要先到 LINE 再登入一次。登入好會自動回到這裡。';

function SecuritySection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
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
            {description ? (
              <Typography sx={BODY_TEXT}>{description}</Typography>
            ) : null}
          </Stack>

          {children}
        </Stack>
      </CardContent>
    </Card>
  );
}

/** Why a section cannot be used here, under its greyed fields: no button, which would only be pressed. */
function CannotHere({ children }: { children: React.ReactNode }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
      <InfoOutlinedIcon sx={{ mt: '4px', fontSize: 20, color: '#6A5F5B' }} />
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
  const router = useRouter();
  const saltIdentity = saltLookupIdentity(contacts);
  const signsInWithPassword = hasPassword(loginMethods);
  // Only Google and nothing to send a code to: both sections say so before anything is pressed.
  const googleOnly = cannotProveHere(contacts, loginMethods);
  // No email or phone to sign in with a password by: 設定登入密碼 says to add one first.
  const passwordBlocked = setPasswordBlocked(contacts, loginMethods);
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
  const [setPasswordProblem, setSetPasswordProblem] =
    useState<StepUpProblem | null>(null);
  const [setPasswordNotice, setSetPasswordNotice] = useState<string>();
  const [setPasswordSuccessMessage, setSetPasswordSuccessMessage] =
    useState<string>();
  const [isSettingPassword, setIsSettingPassword] = useState(false);

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
    replaces: (type) => replacedContact(contacts, type) !== null,
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

    // A first password does not go to LINE any more (`setPasswordBlocked`): nothing to pick up.
    if (back.action !== 'add_contact') {
      return;
    }

    const draft = takeContactDraft();

    if (draft) {
      resumeContact(draft, back.stepUp);
    }
  }, [resumeContact, takeContactDraft]);

  async function handleChangePasswordAsync() {
    if (!saltIdentity) {
      setPasswordError(
        '你的帳號還沒有已驗證的電子郵件或手機，沒辦法確認現在的密碼。',
      );
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

      setPasswordSuccess('密碼已經改好，請重新登入。');
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
   * a code it sends to a contact the account already had. `resending` asks again without the code, for
   * 沒收到？重新寄一次.
   */
  async function handleSetPasswordAsync({ resending = false } = {}) {
    const passwordProblem = newPasswordProblem(
      setPasswordValue,
      setPasswordConfirm,
    );

    if (passwordProblem) {
      setSetPasswordProblem({ message: passwordProblem, tone: 'error' });
      return;
    }

    const withCode = setPasswordStage.kind === 'old-code' && !resending;

    if (withCode && setPasswordCode.trim().length < 4) {
      setSetPasswordProblem({ message: '請輸入收到的驗證碼', tone: 'error' });
      return;
    }

    setIsSettingPassword(true);
    setSetPasswordProblem(null);
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

      setSetPasswordSuccessMessage('已設定登入密碼，請用新密碼重新登入。');
      setSetPasswordValue('');
      setSetPasswordConfirm('');
      // The backend ends the session on a password created, as on one changed.
      signInAgain();
    } catch (error) {
      const code = error instanceof ApiError ? error.code : undefined;

      if (code === 'step_up_required' && !withCode) {
        const ask = readStepUpRequired((error as ApiError).message);

        if (ask.kind === 'old-code') {
          if (resending) {
            setSetPasswordNotice(
              ask.pending ? OLD_CODE_STILL_PENDING : '驗證碼已經重新寄出。',
            );
          } else {
            setSetPasswordCode('');
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
    } finally {
      setIsSettingPassword(false);
    }
  }

  function cancelSetPassword() {
    setSetPasswordStage({ kind: 'enter' });
    setSetPasswordCode('');
    setSetPasswordProblem(null);
    setSetPasswordNotice(undefined);
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

  const setPasswordOriginal = originalContactName(contacts);
  const newName = contactName(contact.type);
  const contactOriginal = originalContactName(contacts, contact.type);
  // The account's own email or phone of the kind being added, which the new one takes the place of.
  const replacing = replacedContact(contacts, contact.type);
  const contactStep =
    contact.stage.kind === 'enter' ? 0 : contact.stage.kind === 'code' ? 2 : 1;

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
        <SecuritySection
          title="變更密碼"
          description="改好後，所有手機、電腦都會登出，要用新密碼重新登入一次。"
        >
          <Stack spacing={2}>
            <TextField
              label="現在的密碼"
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
              label="再輸入一次新密碼"
              type="password"
              value={newPasswordConfirm}
              onChange={(event) => setNewPasswordConfirm(event.target.value)}
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
                void handleChangePasswordAsync();
              }}
            >
              更新密碼
            </Button>
          </Stack>
        </SecuritySection>
      ) : (
        <SecuritySection
          title="設定登入密碼"
          description={`你現在是用 ${loginMethodsText(loginMethods)} 登入。設一組密碼，以後也可以用密碼登入。設好後要重新登入一次。`}
        >
          <Stack spacing={2}>
            <TextField
              label="新密碼"
              type="password"
              disabled={Boolean(passwordBlocked)}
              placeholder={newPasswordText.placeholder}
              value={setPasswordValue}
              onChange={(event) => setSetPasswordValue(event.target.value)}
            />
            <TextField
              label="再輸入一次新密碼"
              type="password"
              disabled={Boolean(passwordBlocked)}
              value={setPasswordConfirm}
              onChange={(event) => setSetPasswordConfirm(event.target.value)}
            />

            {passwordBlocked ? (
              <CannotHere>{passwordBlocked}</CannotHere>
            ) : null}

            {setPasswordStage.kind === 'old-code' ? (
              <>
                <Alert severity="info" sx={ALERT_TEXT}>
                  {oldCodeSentText(
                    setPasswordOriginal,
                    setPasswordStage.pending,
                  )}
                </Alert>
                <TextField
                  label={`原本的${setPasswordOriginal}收到的驗證碼`}
                  placeholder="6 位數字"
                  autoFocus
                  value={setPasswordCode}
                  slotProps={CODE_INPUT}
                  onChange={(event) => setSetPasswordCode(event.target.value)}
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

            {passwordBlocked ? null : (
              <Button
                variant="contained"
                disabled={isSettingPassword}
                sx={BIG_BUTTON}
                onClick={() => {
                  void handleSetPasswordAsync();
                }}
              >
                {setPasswordStage.kind === 'old-code' ? '確認' : '設定密碼'}
              </Button>
            )}
            {setPasswordStage.kind === 'old-code' ? (
              <>
                <Button
                  variant="text"
                  disabled={isSettingPassword}
                  sx={BIG_BUTTON}
                  onClick={() => {
                    void handleSetPasswordAsync({ resending: true });
                  }}
                >
                  沒收到？重新寄一次
                </Button>
                <Button
                  variant="text"
                  sx={BIG_BUTTON}
                  onClick={cancelSetPassword}
                >
                  取消
                </Button>
              </>
            ) : null}
          </Stack>
        </SecuritySection>
      )}

      <SecuritySection
        title="新增電子郵件或手機"
        description={
          contact.stage.kind === 'enter'
            ? `一次新增一個。為了安全，要先確認是你本人，再輸入新的${newName}收到的驗證碼，共三步。`
            : undefined
        }
      >
        <Stack spacing={2}>
          {contact.stage.kind === 'enter' ? (
            <>
              <Typography
                sx={{ fontSize: 16, fontWeight: 700, color: '#241B19' }}
              >
                要新增哪一種？（選一個）
              </Typography>
              <ContactTypeChoice
                value={contact.type}
                disabled={googleOnly}
                onChange={(type) => contact.change({ type })}
              />
              <TextField
                label={
                  contact.type === 'email' ? '新的電子郵件' : '新的手機號碼'
                }
                placeholder={
                  contact.type === 'email'
                    ? '例：wang@gmail.com'
                    : '例：0912345678'
                }
                disabled={googleOnly}
                value={contact.value}
                onChange={(event) =>
                  contact.change({ value: event.target.value })
                }
              />
              {replacing && !googleOnly ? (
                <Alert severity="warning" sx={ALERT_TEXT}>
                  {replaceNotice(replacing, signsInWithPassword)}
                </Alert>
              ) : null}
              {googleOnly ? (
                <CannotHere>
                  你是用 Google 登入，暫時不能在這裡新增。
                </CannotHere>
              ) : (
                <Button
                  variant="contained"
                  disabled={contact.busy}
                  sx={BIG_BUTTON}
                  onClick={contact.send}
                >
                  寄驗證碼
                </Button>
              )}
            </>
          ) : (
            <StepDots steps={addContactSteps(contact.type)} at={contactStep} />
          )}

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
                onChange={(event) => setContactPassword(event.target.value)}
              />
              <Button
                variant="contained"
                disabled={contact.busy || !contactPassword}
                sx={BIG_BUTTON}
                onClick={() => {
                  void contact.submitPassword(contactPassword);
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
              <Button variant="text" sx={BIG_BUTTON} onClick={contact.cancel}>
                取消
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
                onChange={(event) => setContactOldCode(event.target.value)}
              />
              <Button
                variant="contained"
                disabled={contact.busy || contactOldCode.trim().length < 4}
                sx={BIG_BUTTON}
                onClick={() => contact.submitOldCode(contactOldCode.trim())}
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
              <Button variant="text" sx={BIG_BUTTON} onClick={contact.cancel}>
                取消
              </Button>
            </>
          ) : null}

          {contact.stage.kind === 'line' ? (
            <>
              <Typography sx={BODY_TEXT}>{LINE_TEXT}</Typography>
              <Button
                variant="contained"
                sx={BIG_BUTTON}
                onClick={contact.proveAtLine}
              >
                到 LINE 確認是我
              </Button>
              <Button variant="text" sx={BIG_BUTTON} onClick={contact.cancel}>
                取消
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
                onChange={(event) => setContactCode(event.target.value)}
              />
              <Button
                variant="contained"
                disabled={contact.busy}
                sx={BIG_BUTTON}
                onClick={() => {
                  void contact.verify(contactCode);
                }}
              >
                完成新增
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
              <Button variant="text" sx={BIG_BUTTON} onClick={contact.cancel}>
                取消
              </Button>
            </>
          ) : null}

          <ProblemAlert problem={contact.problem} />
          {contact.notice ? (
            <Alert
              severity={contact.stage.kind === 'enter' ? 'success' : 'info'}
              sx={ALERT_TEXT}
            >
              {contact.notice}
            </Alert>
          ) : null}
        </Stack>
      </SecuritySection>

      <SecuritySection
        title="登出所有裝置"
        description="所有手機、電腦都會登出，包含這一台。"
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
      </SecuritySection>
    </Stack>
  );
}
