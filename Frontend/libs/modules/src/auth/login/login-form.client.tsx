'use client';

import { Alert, Stack } from '@mui/material';
import { useRouter, useSearchParams } from 'next/navigation';
import { startTransition, useEffect, useState } from 'react';

import {
  AuthFormError,
  authHref,
  AuthReturnHint,
  LoginForm,
  signedInMessage,
} from './index';
import { signInAsync } from '../api/client';
import { sessionStorageOrNull } from '../../session/end-expired-session';
import { takeSessionExpired } from '@rescue-frontend/modules/session';
import { continueSignedIn } from './continue-signed-in';
import { resolveHashedCredentialAsync } from './credentials';
import { handOffIdentity } from './utils/identity-hand-off';
import {
  loginErrorMessage,
  passwordSignInErrorMessage,
} from './utils/login-error';
import { oauthStartHref, safeReturnPath } from './utils/return-path';

/** `app`: where the backend sends a Google or LINE sign-in back to. */
export function LoginFormClient({
  defaultCallbackUrl = '/map',
  app,
}: {
  defaultCallbackUrl?: string;
  app: 'site' | 'admin';
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Set by the page that sent the user here — a guest's 「登入後接」 among them — and kept if they
  // register instead, or go through a forgotten password.
  const requestedCallbackUrl = searchParams.get('callbackUrl');
  const authErrorMessage = loginErrorMessage(searchParams.get('error'));
  // Sent here by a page only a signed-in person sees (帳號安全) after the session ended there: the
  // site shell's notice never got to say why, so this page does.
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    if (takeSessionExpired(sessionStorageOrNull())) {
      setSessionExpired(true);
    }
  }, []);

  function signInWithProvider(provider: 'google' | 'line') {
    // A whole-page navigation: the backend sends the browser on to Google or LINE.
    window.location.assign(
      oauthStartHref(provider, {
        app,
        callbackUrl: requestedCallbackUrl,
        fallback: defaultCallbackUrl,
      }),
    );
  }

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
            onClick: () => signInWithProvider('google'),
          },
          {
            provider: 'line',
            label: '使用 LINE 繼續',
            onClick: () => signInWithProvider('line'),
          },
        ]}
        onSubmitAsync={async ({ normalizedIdentity, password }) => {
          const { hashedPassword } = await resolveHashedCredentialAsync(
            normalizedIdentity,
            password,
          );

          try {
            await signInAsync({
              username: normalizedIdentity,
              password: hashedPassword,
            });
          } catch (error) {
            throw new AuthFormError(passwordSignInErrorMessage(error));
          }

          continueSignedIn(
            safeReturnPath(requestedCallbackUrl, defaultCallbackUrl),
          );
        }}
        successMessage={signedInMessage(requestedCallbackUrl, app)}
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
        onSecondaryAction={(current) => {
          // Turned away for a wrong password or no such account, the person often registers next:
          // the register page opens on the same tab, with the address already typed.
          handOffIdentity(current);
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
