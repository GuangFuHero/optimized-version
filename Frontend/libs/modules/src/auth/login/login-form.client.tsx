'use client';

import { Alert, Stack } from '@mui/material';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { startTransition, useEffect, useState } from 'react';

import {
  AuthFormError,
  authHref,
  AuthReturnHint,
  LoginForm,
  signedInMessage,
} from './index';
import { useAuthSession } from '../../session/auth-session';
import { sessionStorageOrNull } from '../../session/end-expired-session';
import { takeSessionExpired } from '@rescue-frontend/modules/session';
import { resolveHashedCredentialAsync } from './credentials';
import { LOGIN_FALLBACK_MESSAGE, loginErrorMessage } from './utils/login-error';

export function LoginFormClient({
  defaultCallbackUrl = '/map',
}: {
  defaultCallbackUrl?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refetch: refetchSession } = useAuthSession();
  // Set by the page that sent the user here — a guest's 「登入後接」 among them — and kept if they
  // register instead, or go through a forgotten password.
  const requestedCallbackUrl = searchParams.get('callbackUrl');
  const callbackUrl = requestedCallbackUrl ?? defaultCallbackUrl;
  const authErrorMessage = loginErrorMessage(searchParams.get('error'));
  // Sent here by a page only a signed-in person sees (帳號安全) after the session ended there: the
  // site shell's notice never got to say why, so this page does.
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    if (takeSessionExpired(sessionStorageOrNull())) {
      setSessionExpired(true);
    }
  }, []);

  return (
    <Stack spacing={2}>
      {sessionExpired ? (
        <Alert severity="warning">你的登入狀態已失效，請重新登入。</Alert>
      ) : null}

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
              loginErrorMessage(result.error) ?? LOGIN_FALLBACK_MESSAGE,
            );
          }

          // Nothing else tells this tab it is signed in now (next-auth's provider used to).
          await refetchSession();
          startTransition(() => {
            router.replace(result?.url ?? callbackUrl, { scroll: false });
          });
        }}
        successMessage={signedInMessage(requestedCallbackUrl)}
        secondaryActionLabel="註冊帳號"
        onForgotPasswordAsync={() => {
          startTransition(() => {
            router.push(
              authHref('/forgot-password', {
                callbackUrl: requestedCallbackUrl,
              }),
              { scroll: false },
            );
          });
        }}
        onSecondaryAction={() => {
          startTransition(() => {
            router.push(
              authHref('/register', { callbackUrl: requestedCallbackUrl }),
              { scroll: false },
            );
          });
        }}
      />

      <AuthReturnHint />
    </Stack>
  );
}
