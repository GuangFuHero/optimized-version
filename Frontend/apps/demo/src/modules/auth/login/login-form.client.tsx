'use client';

import { Alert, Stack } from '@mui/material';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { startTransition } from 'react';

import { AuthFormError, LoginForm } from '@rescue-frontend/modules';
import { messageForCode } from '../api/error-messages';
import { resolveHashedCredentialAsync } from './credentials';

const LOGIN_FALLBACK_MESSAGE = '登入失敗，請確認帳號或密碼。';

/**
 * Resolve the `?error=` next-auth redirected with.
 *
 * Two vocabularies arrive on this one parameter: next-auth's own codes, and — since `authorize` and
 * the `signIn` callback now throw instead of returning null — our backend's. Backend codes are tried
 * first so a classified failure keeps its meaning; a 429 used to land here as `CredentialsSignin`
 * and be reported as a wrong password.
 */
function resolveAuthErrorMessage(errorCode: string | null) {
  const backendMessage = errorCode ? messageForCode(errorCode) : undefined;

  if (backendMessage) {
    return backendMessage;
  }

  switch (errorCode) {
    // `login_failed` is what `authorize` throws when the failure carried no code of its own
    // (network, gateway, a token-less 200). Same generic copy as next-auth's own fixed code.
    case 'login_failed':
    case 'CredentialsSignin':
      return LOGIN_FALLBACK_MESSAGE;
    case 'OAuthSignin':
      return '無法啟動第三方登入流程，請稍後再試。';
    case 'OAuthCallback':
    case 'Callback':
      return '第三方登入驗證失敗，請稍後再試。';
    case 'AccessDenied':
      return '第三方帳號未通過登入驗證。';
    case 'OAuthAccountNotLinked':
      return '這個帳號已綁定其他登入方式。';
    case 'SessionRequired':
      return '請先登入後再繼續。';
    default:
      return errorCode ? '登入流程發生錯誤，請稍後再試。' : undefined;
  }
}

export default function () {
  const router = useRouter();
  const searchParams = useSearchParams();
  const audience = searchParams.get('audience');
  const callbackUrl =
    searchParams.get('callbackUrl') ??
    (audience === 'admin' ? '/admin/map' : '/map');
  const authErrorMessage = resolveAuthErrorMessage(searchParams.get('error'));

  return (
    <Stack spacing={2}>
      {authErrorMessage ? (
        <Alert severity="error">{authErrorMessage}</Alert>
      ) : null}

      <LoginForm
        providerActions={[
          {
            provider: 'google',
            label: '使用 Google 繼續',
            onClick: async () => {
              await signIn('google', { callbackUrl });
            },
          },
          {
            provider: 'line',
            label: '使用 LINE 繼續',
            onClick: async () => {
              await signIn('line', { callbackUrl });
            },
          },
        ]}
        onSubmitAsync={async ({ normalizedIdentity, password }) => {
          const { hashedPassword } = await resolveHashedCredentialAsync(
            normalizedIdentity,
            password,
          );

          const result = await signIn('credentials', {
            username: normalizedIdentity,
            password: hashedPassword,
            callbackUrl,
            redirect: false,
          });

          if (result?.error) {
            throw new AuthFormError(
              resolveAuthErrorMessage(result.error) ?? LOGIN_FALLBACK_MESSAGE,
            );
          }

          startTransition(() => {
            router.replace(result?.url ?? callbackUrl, { scroll: false });
          });
        }}
        secondaryActionLabel="註冊帳號"
        onForgotPasswordAsync={() => {
          startTransition(() => {
            router.push('/forgot-password', { scroll: false });
          });
        }}
        onSecondaryAction={() => {
          startTransition(() => {
            router.push('/register', { scroll: false });
          });
        }}
      />
    </Stack>
  );
}
