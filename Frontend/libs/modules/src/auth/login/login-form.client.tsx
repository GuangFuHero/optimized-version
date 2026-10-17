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
import { signInAsync } from '../api/client';
import { useAuthSession } from '../../session/auth-session';
import { sessionStorageOrNull } from '../../session/end-expired-session';
import { takeSessionExpired } from '@rescue-frontend/modules/session';
import { useContinueSignedIn } from './continue-signed-in';
import { resolveHashedCredentialAsync } from './credentials';
import {
  LOGIN_FALLBACK_MESSAGE,
  loginErrorMessage,
  passwordSignInErrorMessage,
} from './utils/login-error';
import { oauthStartHref, safeReturnPath } from './utils/return-path';

/**
 * Who signs the form in: next-auth by default, the back office's way until its own move to the
 * backend login (③); or the backend's cookies, for which Google and LINE need to know the app to
 * send the person back to.
 */
export type SignInWith =
  | { signInWith?: 'next-auth' }
  | { signInWith: 'backend'; app: 'site' | 'admin' };

export function LoginFormClient({
  defaultCallbackUrl = '/map',
  ...auth
}: {
  defaultCallbackUrl?: string;
} & SignInWith) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refetch: refetchSession } = useAuthSession();
  const continueSignedIn = useContinueSignedIn();
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

  async function signInWithProviderAsync(provider: 'google' | 'line') {
    if (auth.signInWith === 'backend') {
      // A whole-page navigation: the backend sends the browser on to Google or LINE.
      window.location.assign(
        oauthStartHref(provider, {
          app: auth.app,
          callbackUrl: requestedCallbackUrl,
          fallback: defaultCallbackUrl,
        }),
      );
      return;
    }

    await signIn(provider, { callbackUrl });
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
            onClick: () => signInWithProviderAsync('google'),
          },
          {
            provider: 'line',
            label: '使用 LINE 繼續',
            onClick: () => signInWithProviderAsync('line'),
          },
        ]}
        onSubmitAsync={async ({ normalizedIdentity, password }) => {
          const { hashedPassword } = await resolveHashedCredentialAsync(
            normalizedIdentity,
            password,
          );

          if (auth.signInWith === 'backend') {
            try {
              await signInAsync({
                username: normalizedIdentity,
                password: hashedPassword,
              });
            } catch (error) {
              throw new AuthFormError(passwordSignInErrorMessage(error));
            }

            // next-auth's redirect callback kept `?callbackUrl=` on this site; now nothing else does.
            await continueSignedIn(
              safeReturnPath(requestedCallbackUrl, defaultCallbackUrl),
            );
            return;
          }

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
