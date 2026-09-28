'use client';

import { Alert, AlertTitle, Button, Stack } from '@mui/material';
import { useRouter, useSearchParams } from 'next/navigation';
import { startTransition, useState } from 'react';

import {
  AuthField,
  authHref,
  AuthIdentityToggle,
  AuthReturnHint,
  normalizeIdentityValue,
  validateIdentityValue,
  type AuthIdentityType,
} from './utils/identity-validation';
import { forgotPasswordAsync } from '../api/client';
import { resolveAuthErrorMessage } from '../api/error-messages';
import { AuthActionCard } from '../shared/auth-action-card';

/**
 * 忘記密碼 (design `site-auth.jsx` `ForgotView`). The backend answers alike whether the account
 * exists or not, so once sent the page only says a code is on its way if there is an account — and
 * locks the form, the next step being the code. 重新取得驗證碼 unlocks it again — ours, not the
 * design's: its words offer another code but its form has no way to ask, and a mistyped address
 * needs a way back. The backend's three-a-minute limit answers anyone who presses too often.
 */
export function ForgotPasswordFormClient() {
  const router = useRouter();
  // The page the sign-in should end on, carried through the reset and back to login.
  const callbackUrl = useSearchParams().get('callbackUrl');
  const [identityType, setIdentityType] = useState<AuthIdentityType>('email');
  const [identity, setIdentity] = useState('');
  // Checked when sent, not while typed.
  const [identityError, setIdentityError] = useState<string>();
  const [errorMessage, setErrorMessage] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  /** The account a code was asked for, as sent; the form is locked while there is one. */
  const [sentTo, setSentTo] = useState<string>();

  async function handleSubmitAsync() {
    const validation = validateIdentityValue(identityType, identity);

    if (validation !== true) {
      setIdentityError(validation);
      return;
    }

    setIsSubmitting(true);
    setIdentityError(undefined);
    setErrorMessage(undefined);

    try {
      const resolvedIdentity = normalizeIdentityValue(identityType, identity);

      await forgotPasswordAsync({
        type: identityType,
        value: resolvedIdentity,
      });

      setSentTo(resolvedIdentity);
    } catch (error) {
      setErrorMessage(
        resolveAuthErrorMessage(error, '無法送出重設密碼請求，請稍後再試。'),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const locked = isSubmitting || sentTo !== undefined;

  return (
    <Stack spacing={2}>
      <AuthActionCard
        title="忘記密碼"
        description="輸入你的登入識別，我們會發送一次性驗證碼供你重設密碼。"
      >
        <AuthIdentityToggle
          value={identityType}
          disabled={locked}
          onChange={(value) => {
            setIdentityType(value);
            setIdentity('');
            setIdentityError(undefined);
            setErrorMessage(undefined);
          }}
        />

        <AuthField
          label={identityType === 'email' ? '電子郵件' : '手機號碼'}
          placeholder={
            identityType === 'email' ? 'name@example.com' : '0912345678'
          }
          autoComplete="username"
          value={identity}
          onChange={(value) => {
            setIdentity(value);
            setIdentityError(undefined);
            setErrorMessage(undefined);
          }}
          errorText={identityError}
          disabled={locked}
        />

        {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}

        {sentTo ? (
          <Alert severity="success">
            <AlertTitle>驗證碼已送出</AlertTitle>
            若這組識別有對應的帳號，驗證碼會在幾分鐘內送到。沒收到請檢查垃圾信件匣，或重新取得一組。
          </Alert>
        ) : null}

        {sentTo ? (
          <Button
            variant="contained"
            onClick={() => {
              startTransition(() => {
                router.push(
                  authHref('/reset-password', {
                    callbackUrl,
                    identity: { type: identityType, value: sentTo },
                  }),
                  { scroll: false },
                );
              });
            }}
            sx={{ minHeight: 44, borderRadius: '999px' }}
          >
            我收到驗證碼了，去重設密碼
          </Button>
        ) : (
          <Button
            variant="contained"
            disabled={isSubmitting || identity.trim().length === 0}
            onClick={() => {
              void handleSubmitAsync();
            }}
            sx={{ minHeight: 44, borderRadius: '999px' }}
          >
            {isSubmitting ? '送出中⋯' : '寄送驗證碼'}
          </Button>
        )}

        {sentTo ? (
          <Button variant="text" onClick={() => setSentTo(undefined)}>
            重新取得驗證碼
          </Button>
        ) : null}

        <Button
          variant="text"
          onClick={() => {
            startTransition(() => {
              router.push(authHref('/login', { callbackUrl }), {
                scroll: false,
              });
            });
          }}
        >
          回到登入
        </Button>
      </AuthActionCard>

      <AuthReturnHint />
    </Stack>
  );
}
