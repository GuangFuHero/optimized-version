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
import { signOut } from 'next-auth/react';
import { useState } from 'react';

import {
  normalizeIdentityValue,
  validateIdentityValue,
  type AuthIdentityType,
} from '@rescue-frontend/modules';
import {
  addContactAsync,
  changePasswordAsync,
  logoutAllAsync,
  resendContactAsync,
  setPasswordAsync,
  verifyContactAsync,
} from '../api/client';
import { isStepUpRequired } from '../api/request-async';
import {
  createHashedCredentialAsync,
  resolveHashedCredentialAsync,
} from '../login/credentials';

interface AccountSecurityClientProps {
  currentIdentity?: string | null;
  currentProvider?: 'credentials' | 'google' | 'line';
}

interface PendingContact {
  identityType: AuthIdentityType;
  normalizedIdentity: string;
}

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
    <Card sx={{ borderRadius: '24px', boxShadow: 'none', border: '1px solid #E5DDD8' }}>
      <CardContent sx={{ p: 3 }}>
        <Stack spacing={2.5}>
          <Stack spacing={0.75}>
            <Typography sx={{ fontSize: 20, fontWeight: 700, color: '#241B19' }}>
              {title}
            </Typography>
            <Typography sx={{ fontSize: 14, lineHeight: '22px', color: '#6A5F5B' }}>
              {description}
            </Typography>
          </Stack>

          {children}
        </Stack>
      </CardContent>
    </Card>
  );
}

export default function AccountSecurityClient({
  currentIdentity,
  currentProvider,
}: AccountSecurityClientProps) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [passwordError, setPasswordError] = useState<string>();
  const [passwordSuccess, setPasswordSuccess] = useState<string>();
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const [setPasswordValue, setSetPasswordValue] = useState('');
  const [setPasswordConfirm, setSetPasswordConfirm] = useState('');
  const [setPasswordErrorMessage, setSetPasswordErrorMessage] =
    useState<string>();
  const [setPasswordSuccessMessage, setSetPasswordSuccessMessage] =
    useState<string>();
  const [isSettingPassword, setIsSettingPassword] = useState(false);
  // The backend gates a first password behind a code sent to a contact the account already
  // holds (ADR-215). It never asks for a password here — `set-password` 409s once one exists
  // — so one field is enough, and the notice below is the backend's own wording.
  const [setPasswordStepUpCode, setSetPasswordStepUpCode] = useState('');
  const [setPasswordStepUpNotice, setSetPasswordStepUpNotice] =
    useState<string>();

  const [contactType, setContactType] = useState<AuthIdentityType>('email');
  const [contactValue, setContactValue] = useState('');
  const [contactCode, setContactCode] = useState('');
  const [pendingContact, setPendingContact] = useState<PendingContact | null>(
    null,
  );
  const [contactError, setContactError] = useState<string>();
  const [contactSuccess, setContactSuccess] = useState<string>();
  const [isAddingContact, setIsAddingContact] = useState(false);
  // Adding a contact is gated too, once the account holds anything to prove with (ADR-220).
  // Unlike `set-password`, this account may or may not have a password, and the backend —
  // not the client — decides which proof it wants. So both fields are offered and whichever
  // is filled is sent; the notice says which one was asked for.
  const [contactStepUpCode, setContactStepUpCode] = useState('');
  const [contactStepUpPassword, setContactStepUpPassword] = useState('');
  const [contactStepUpNotice, setContactStepUpNotice] = useState<string>();
  const [isVerifyingContact, setIsVerifyingContact] = useState(false);
  const [isResendingContact, setIsResendingContact] = useState(false);
  const [isLoggingOutAll, setIsLoggingOutAll] = useState(false);

  async function handleChangePasswordAsync() {
    if (!currentIdentity) {
      setPasswordError('目前無法判斷你的登入識別，請重新登入後再試');
      return;
    }

    if (newPassword.trim().length < 6) {
      setPasswordError('新密碼至少需要 6 個字元');
      return;
    }

    if (newPassword !== newPasswordConfirm) {
      setPasswordError('兩次輸入的新密碼不一致');
      return;
    }

    setIsChangingPassword(true);
    setPasswordError(undefined);
    setPasswordSuccess(undefined);

    try {
      const currentPassword = await resolveHashedCredentialAsync(
        currentIdentity,
        oldPassword,
      );
      const nextPassword = await createHashedCredentialAsync(newPassword);

      await changePasswordAsync({
        old_password: currentPassword.hashedPassword,
        new_password: nextPassword.hashedPassword,
        salt_frontend: nextPassword.saltFrontend,
      });

      setPasswordSuccess('密碼已更新，系統將重新登入。');
      await signOut({ callbackUrl: '/login' });
    } catch (error) {
      setPasswordError(
        error instanceof Error ? error.message : '變更密碼失敗，請稍後再試',
      );
    } finally {
      setIsChangingPassword(false);
    }
  }

  async function handleSetPasswordAsync() {
    if (setPasswordValue.trim().length < 6) {
      setSetPasswordErrorMessage('新密碼至少需要 6 個字元');
      return;
    }

    if (setPasswordValue !== setPasswordConfirm) {
      setSetPasswordErrorMessage('兩次輸入的新密碼不一致');
      return;
    }

    setIsSettingPassword(true);
    setSetPasswordErrorMessage(undefined);
    setSetPasswordSuccessMessage(undefined);

    const code = setPasswordStepUpCode.trim();

    try {
      const createdPassword = await createHashedCredentialAsync(
        setPasswordValue,
      );

      await setPasswordAsync({
        password: createdPassword.hashedPassword,
        salt_frontend: createdPassword.saltFrontend,
        ...(code ? { step_up: { old_channel_code: code } } : {}),
      });

      setSetPasswordSuccessMessage('已建立登入密碼。');
      setSetPasswordValue('');
      setSetPasswordConfirm('');
      setSetPasswordStepUpCode('');
      setSetPasswordStepUpNotice(undefined);
    } catch (error) {
      // A 422 is not a mistake the user made: the backend has just sent a code and wants the
      // same call again carrying it. Surfacing it as an error would tell them to stop.
      if (isStepUpRequired(error)) {
        setSetPasswordStepUpNotice(
          error instanceof Error ? error.message : '請輸入驗證碼後再試一次',
        );
        return;
      }

      setSetPasswordErrorMessage(
        error instanceof Error ? error.message : '建立密碼失敗，請稍後再試',
      );
    } finally {
      setIsSettingPassword(false);
    }
  }

  /**
   * The step-up proof for adding a contact, or undefined when the user has filled neither.
   *
   * Both are offered because the backend picks the proof from the account's own shape — a
   * password identity means "prove the password", no password means "prove the channel" —
   * and the client is deliberately not the one deciding. The password is frontend-hashed
   * first, exactly like `old_password` on the change-password path.
   */
  async function buildContactStepUpAsync() {
    const code = contactStepUpCode.trim();
    const password = contactStepUpPassword.trim();

    if (!code && !password) {
      return undefined;
    }

    const hashed =
      password && currentIdentity
        ? await resolveHashedCredentialAsync(currentIdentity, password)
        : undefined;

    return {
      ...(code ? { old_channel_code: code } : {}),
      ...(hashed ? { password: hashed.hashedPassword } : {}),
    };
  }

  async function handleAddContactAsync() {
    const validation = validateIdentityValue(contactType, contactValue);

    if (validation !== true) {
      setContactError(validation);
      return;
    }

    setIsAddingContact(true);
    setContactError(undefined);
    setContactSuccess(undefined);

    try {
      const normalizedIdentity = normalizeIdentityValue(contactType, contactValue);
      const stepUp = await buildContactStepUpAsync();

      await addContactAsync({
        type: contactType,
        value: normalizedIdentity,
        ...(stepUp ? { step_up: stepUp } : {}),
      });

      setPendingContact({
        identityType: contactType,
        normalizedIdentity,
      });
      setContactSuccess('驗證碼已發送，請輸入後完成綁定。');
      setContactStepUpCode('');
      setContactStepUpPassword('');
      setContactStepUpNotice(undefined);
    } catch (error) {
      if (isStepUpRequired(error)) {
        setContactStepUpNotice(
          error instanceof Error ? error.message : '請先完成驗證再試一次',
        );
        return;
      }

      setContactError(
        error instanceof Error ? error.message : '新增聯絡方式失敗',
      );
    } finally {
      setIsAddingContact(false);
    }
  }

  async function handleVerifyContactAsync() {
    if (!pendingContact) {
      return;
    }

    if (contactCode.trim().length < 4) {
      setContactError('請輸入有效驗證碼');
      return;
    }

    setIsVerifyingContact(true);
    setContactError(undefined);
    setContactSuccess(undefined);

    try {
      await verifyContactAsync({
        type: pendingContact.identityType,
        value: pendingContact.normalizedIdentity,
        code: contactCode.trim(),
      });

      setPendingContact(null);
      setContactValue('');
      setContactCode('');
      setContactSuccess('聯絡方式已完成驗證與綁定。');
    } catch (error) {
      setContactError(
        error instanceof Error ? error.message : '驗證聯絡方式失敗',
      );
    } finally {
      setIsVerifyingContact(false);
    }
  }

  async function handleResendContactAsync() {
    if (!pendingContact) {
      return;
    }

    setIsResendingContact(true);
    setContactError(undefined);
    setContactSuccess(undefined);

    try {
      await resendContactAsync({
        type: pendingContact.identityType,
        value: pendingContact.normalizedIdentity,
      });
      setContactSuccess('驗證碼已重新發送。');
    } catch (error) {
      setContactError(
        error instanceof Error ? error.message : '重新發送驗證碼失敗',
      );
    } finally {
      setIsResendingContact(false);
    }
  }

  async function handleLogoutAllAsync() {
    setIsLoggingOutAll(true);

    try {
      await logoutAllAsync();
      await signOut({ callbackUrl: '/login' });
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
          目前登入識別：{currentIdentity ?? '未提供'}
        </Typography>
        <Typography sx={{ mt: 0.5, fontSize: 14, color: '#6A5F5B' }}>
          目前登入方式：
          {currentProvider === 'google'
            ? 'Google'
            : currentProvider === 'line'
              ? 'LINE'
              : '密碼'}
        </Typography>
      </Box>

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
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
          <TextField
            label="再次輸入新密碼"
            type="password"
            value={newPasswordConfirm}
            onChange={(event) => setNewPasswordConfirm(event.target.value)}
          />

          {passwordError ? <Alert severity="error">{passwordError}</Alert> : null}
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

      <SecuritySection
        title="建立登入密碼"
        description="如果你的帳號原本只透過第三方登入，可以在這裡建立本地登入密碼。"
      >
        <Stack spacing={2}>
          <TextField
            label="新密碼"
            type="password"
            value={setPasswordValue}
            onChange={(event) => setSetPasswordValue(event.target.value)}
          />
          <TextField
            label="再次輸入新密碼"
            type="password"
            value={setPasswordConfirm}
            onChange={(event) => setSetPasswordConfirm(event.target.value)}
          />

          {setPasswordStepUpNotice ? (
            <Stack spacing={2}>
              <Alert severity="info">{setPasswordStepUpNotice}</Alert>
              <TextField
                label="驗證碼"
                value={setPasswordStepUpCode}
                onChange={(event) =>
                  setSetPasswordStepUpCode(event.target.value)
                }
                helperText="驗證碼已寄到你帳號現有的聯絡方式，填入後再按一次「建立密碼」。"
              />
            </Stack>
          ) : null}

          {setPasswordErrorMessage ? (
            <Alert severity="error">{setPasswordErrorMessage}</Alert>
          ) : null}
          {setPasswordSuccessMessage ? (
            <Alert severity="success">{setPasswordSuccessMessage}</Alert>
          ) : null}

          <Button
            variant="outlined"
            disabled={isSettingPassword}
            onClick={() => {
              void handleSetPasswordAsync();
            }}
          >
            建立密碼
          </Button>
        </Stack>
      </SecuritySection>

      <SecuritySection
        title="新增聯絡方式"
        description="新增 Email 或手機號碼後，需要輸入驗證碼才能完成綁定。"
      >
        <Stack spacing={2}>
          <Stack direction="row" spacing={0.5}>
            {(['email', 'phone'] as const).map((value) => {
              const active = contactType === value;

              return (
                <Button
                  key={value}
                  type="button"
                  variant={active ? 'contained' : 'outlined'}
                  onClick={() => setContactType(value)}
                >
                  {value === 'email' ? 'Email' : '手機號碼'}
                </Button>
              );
            })}
          </Stack>

          <TextField
            label={contactType === 'email' ? '電子郵件' : '手機號碼'}
            value={contactValue}
            onChange={(event) => setContactValue(event.target.value)}
          />

          {contactStepUpNotice ? (
            <Stack spacing={2}>
              <Alert severity="info">{contactStepUpNotice}</Alert>
              <TextField
                label="目前密碼"
                type="password"
                value={contactStepUpPassword}
                onChange={(event) =>
                  setContactStepUpPassword(event.target.value)
                }
              />
              <TextField
                label="原聯絡方式收到的驗證碼"
                value={contactStepUpCode}
                onChange={(event) => setContactStepUpCode(event.target.value)}
              />
              <Typography sx={{ fontSize: 13, color: '#6A5F5B' }}>
                上方訊息會說明你的帳號需要哪一項；填好之後再按一次「發送驗證碼」。
              </Typography>
            </Stack>
          ) : null}

          <Button
            variant="contained"
            disabled={isAddingContact}
            onClick={() => {
              void handleAddContactAsync();
            }}
          >
            發送驗證碼
          </Button>

          {pendingContact ? (
            <Stack spacing={2}>
              <TextField
                label="驗證碼"
                value={contactCode}
                onChange={(event) => setContactCode(event.target.value)}
              />
              <Stack direction="row" spacing={1}>
                <Button
                  variant="outlined"
                  disabled={isVerifyingContact}
                  onClick={() => {
                    void handleVerifyContactAsync();
                  }}
                >
                  驗證並綁定
                </Button>
                <Button
                  variant="text"
                  disabled={isResendingContact}
                  onClick={() => {
                    void handleResendContactAsync();
                  }}
                >
                  重新發送
                </Button>
              </Stack>
            </Stack>
          ) : null}

          {contactError ? <Alert severity="error">{contactError}</Alert> : null}
          {contactSuccess ? (
            <Alert severity="success">{contactSuccess}</Alert>
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
