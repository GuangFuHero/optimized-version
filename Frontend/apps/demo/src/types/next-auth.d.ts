import type { DefaultSession } from 'next-auth';
import type { JWT as DefaultJWT } from 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    authProvider?: 'credentials' | 'google' | 'line';
    loginIdentity?: string;
    user?: DefaultSession['user'] & {
      id?: string;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    accessToken?: string;
    refreshToken?: string;
    tokenType?: string;
    expiresIn?: number;
    accessTokenExpiresAt?: number;
    authError?: 'RefreshAccessTokenError';
    authProvider?: 'credentials' | 'google' | 'line';
    loginIdentity?: string;
  }
}
