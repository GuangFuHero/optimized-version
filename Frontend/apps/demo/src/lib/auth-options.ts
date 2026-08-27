import {
  ApiError,
  getCurrentUserAsync,
  googleSsoAsync,
  lineSsoAsync,
  loginAsync,
  type ITokenPair,
} from '@rescue-frontend/data-access';
import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import LineProvider from 'next-auth/providers/line';
import {
  applyTokenPairToBackendAuthToken,
  AUTH_SESSION_MAX_AGE_SECONDS,
  refreshBackendAuthTokenAsync,
  type BackendAuthToken,
} from './server-backend-auth';
import { withClientIpAsync } from './client-ip';

/** `account` with the slot `signIn` uses to hand its result to `jwt`. */
type OAuthAccountWithBackendUser = {
  backendUser?: AuthenticatedUser;
};

type AuthenticatedUser = {
  id: string;
  email?: string | null;
  loginIdentity?: string | null;
  name?: string | null;
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
};

/**
 * Carries a backend error code out of `authorize` / the `signIn` callback so the login page can say
 * what actually happened.
 *
 * Returning `null` collapses every failure into next-auth's fixed `CredentialsSignin`, which the
 * login page renders as "wrong password" — including a 429. next-auth v4 propagates a *thrown*
 * error's message instead (`core/routes/callback.js`), so the code travels as the message.
 *
 * Every failure on these paths must exit through here. next-auth puts the message straight into
 * `?error=`, so letting a raw `ApiError` escape would park the backend's English prose in the URL,
 * the browser history and the access logs.
 */
class ClassifiedAuthError extends Error {}

/** The code the backend classified this failure as, or a generic one if it never got that far. */
function authErrorCode(error: unknown) {
  return error instanceof ApiError && error.code ? error.code : 'login_failed';
}

async function loginWithCredentials(
  username: string,
  password: string,
): Promise<AuthenticatedUser> {
  let payload: ITokenPair;

  try {
    payload = await withClientIpAsync(() => loginAsync(username, password));
  } catch (error) {
    throw new ClassifiedAuthError(authErrorCode(error));
  }

  if (!payload.access_token) {
    throw new ClassifiedAuthError('login_failed');
  }

  let currentUser: Awaited<ReturnType<typeof getCurrentUserAsync>>;

  try {
    currentUser = await getCurrentUserAsync(payload.access_token);
  } catch (error) {
    throw new ClassifiedAuthError(authErrorCode(error));
  }

  return {
    id: currentUser.uuid,
    email: username,
    loginIdentity: username,
    name: currentUser.name,
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    tokenType: payload.token_type ?? 'bearer',
    expiresIn: payload.expires_in,
  };
}

async function completeOAuthLoginAsync({
  provider,
  idToken,
  fallbackEmail,
  fallbackName,
}: {
  provider: 'google' | 'line';
  idToken: string;
  fallbackEmail?: string | null;
  fallbackName?: string | null;
}) {
  return withClientIpAsync(async () => {
    let tokenPair: ITokenPair;

    try {
      tokenPair =
        provider === 'google'
          ? await googleSsoAsync({ id_token: idToken })
          : await lineSsoAsync({ id_token: idToken });
    } catch (error) {
      throw new ClassifiedAuthError(authErrorCode(error));
    }

    let currentUser: Awaited<ReturnType<typeof getCurrentUserAsync>>;

    try {
      currentUser = await getCurrentUserAsync(tokenPair.access_token);
    } catch (error) {
      throw new ClassifiedAuthError(authErrorCode(error));
    }

    return {
      id: currentUser.uuid,
      email: fallbackEmail,
      loginIdentity: fallbackEmail,
      name: currentUser.name ?? fallbackName,
      accessToken: tokenPair.access_token,
      refreshToken: tokenPair.refresh_token,
      tokenType: tokenPair.token_type ?? 'bearer',
      expiresIn: tokenPair.expires_in,
    } satisfies AuthenticatedUser;
  });
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: 'jwt',
    maxAge: AUTH_SESSION_MAX_AGE_SECONDS,
  },
  pages: {
    signIn: '/login',
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    }),
    LineProvider({
      clientId: process.env.LINE_CLIENT_ID ?? '',
      clientSecret: process.env.LINE_CLIENT_SECRET ?? '',
    }),
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: {
          label: 'Email',
          type: 'text',
        },
        password: {
          label: 'Password',
          type: 'password',
        },
        accessToken: {
          label: 'Access Token',
          type: 'text',
        },
        refreshToken: {
          label: 'Refresh Token',
          type: 'text',
        },
        tokenType: {
          label: 'Token Type',
          type: 'text',
        },
        expiresIn: {
          label: 'Expires In',
          type: 'text',
        },
      },
      authorize: async (credentials) => {
        const username = credentials?.username?.trim();
        const password = credentials?.password?.trim();
        const accessToken = credentials?.accessToken?.trim();
        const refreshToken = credentials?.refreshToken?.trim();
        const tokenType = credentials?.tokenType?.trim();
        const expiresIn = Number(credentials?.expiresIn);

        if (
          username &&
          accessToken &&
          refreshToken &&
          Number.isFinite(expiresIn)
        ) {
          return {
            id: username,
            email: username,
            accessToken,
            refreshToken,
            tokenType: tokenType || 'bearer',
            expiresIn,
          };
        }

        if (!username || !password) {
          return null;
        }

        return loginWithCredentials(username, password);
      },
    }),
  ],
  callbacks: {
    /**
     * Exchange the provider's id_token here rather than in `jwt`, purely so failures keep their
     * message. next-auth v4 propagates a throw from `signIn` as `?error=<message>` but rewrites one
     * from `jwt` to a bare `?error=Callback`, which is why "this email is already registered, sign
     * in and link Google in settings" could never reach the login page.
     *
     * The result is stashed on `account`, the one object next-auth hands to both callbacks. That is
     * object identity in someone else's internals, so `jwt` recomputes when the stash is missing —
     * if a future version clones `account`, login keeps working and only the message degrades.
     */
    signIn: async ({ account, profile }) => {
      if (account?.provider !== 'google' && account?.provider !== 'line') {
        return true;
      }

      const idToken =
        typeof account.id_token === 'string' ? account.id_token : undefined;

      if (!idToken) {
        throw new ClassifiedAuthError('sso_token_invalid');
      }

      (account as OAuthAccountWithBackendUser).backendUser =
        await completeOAuthLoginAsync({
          provider: account.provider,
          idToken,
          fallbackEmail:
            typeof profile?.email === 'string' ? profile.email : undefined,
          fallbackName:
            typeof profile?.name === 'string' ? profile.name : undefined,
        });

      return true;
    },
    jwt: async ({ token, user, account, profile }) => {
      if (account?.provider === 'google' || account?.provider === 'line') {
        const idToken =
          typeof account.id_token === 'string' ? account.id_token : undefined;

        if (!idToken) {
          throw new ClassifiedAuthError('sso_token_invalid');
        }

        const authenticatedUser =
          (account as OAuthAccountWithBackendUser).backendUser ??
          (await completeOAuthLoginAsync({
            provider: account.provider,
            idToken,
            fallbackEmail:
              typeof profile?.email === 'string' ? profile.email : undefined,
            fallbackName:
              typeof profile?.name === 'string' ? profile.name : undefined,
          }));

        return applyTokenPairToBackendAuthToken(
          {
            ...token,
            sub: authenticatedUser.id,
            email: authenticatedUser.email ?? undefined,
            name: authenticatedUser.name ?? undefined,
            loginIdentity: authenticatedUser.loginIdentity ?? undefined,
            authProvider: account.provider,
          },
          {
            access_token: authenticatedUser.accessToken,
            refresh_token: authenticatedUser.refreshToken,
            token_type: authenticatedUser.tokenType,
            expires_in: authenticatedUser.expiresIn,
          },
        );
      }

      if (user) {
        const typedUser = user as AuthenticatedUser;

        return applyTokenPairToBackendAuthToken(
          {
            ...token,
            sub: typedUser.id,
            email: typedUser.email ?? undefined,
            name: typedUser.name ?? undefined,
            loginIdentity: typedUser.loginIdentity ?? undefined,
            authProvider: 'credentials',
          },
          {
            access_token: typedUser.accessToken,
            refresh_token: typedUser.refreshToken,
            token_type: typedUser.tokenType,
            expires_in: typedUser.expiresIn,
          },
        );
      }

      const typedToken = token as BackendAuthToken;

      if (
        typeof typedToken.accessToken === 'string' &&
        typeof typedToken.accessTokenExpiresAt === 'number' &&
        typedToken.accessTokenExpiresAt > Date.now() + 30_000
      ) {
        return token;
      }

      if (typeof typedToken.refreshToken === 'string') {
        return refreshBackendAuthTokenAsync(typedToken);
      }

      return token;
    },
    session: async ({ session, token }) => {
      if (session.user && typeof token.sub === 'string') {
        session.user.id = token.sub;
      }

      if (session.user) {
        session.user.email =
          typeof token.email === 'string' ? token.email : session.user.email;
        session.user.name =
          typeof token.name === 'string' ? token.name : session.user.name;
      }

      session.loginIdentity =
        typeof token.loginIdentity === 'string'
          ? token.loginIdentity
          : undefined;
      session.authProvider =
        token.authProvider === 'credentials' ||
        token.authProvider === 'google' ||
        token.authProvider === 'line'
          ? token.authProvider
          : undefined;

      return session;
    },
  },
};
