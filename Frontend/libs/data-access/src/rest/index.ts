import loginAsync from './v1/auth/login/post';
import registerAsync from './v1/auth/register/post';
import getUserSaltAsync from './v1/auth/salt/[username]/get';
import verifyAsync from './v1/auth/verify/post';
import resendVerificationAsync from './v1/auth/resend-verification/post';
import refreshAsync from './v1/auth/refresh/post';
import logoutAsync from './v1/auth/logout/post';
import logoutAllAsync from './v1/auth/logout-all/post';
import forgotPasswordAsync from './v1/auth/forgot-password/post';
import resetPasswordAsync from './v1/auth/reset-password/post';
import googleSsoAsync from './v1/auth/sso/google/post';
import lineSsoAsync from './v1/auth/sso/line/post';
import linkGoogleAsync from './v1/auth/link/google/post';
import linkLineAsync from './v1/auth/link/line/post';
import changePasswordAsync from './v1/auth/change-password/post';
import setPasswordAsync from './v1/auth/set-password/post';
import addContactAsync from './v1/auth/contacts/post';
import verifyContactAsync from './v1/auth/contacts/verify/post';
import resendContactAsync from './v1/auth/contacts/resend/post';

export {
  getUserSaltAsync,
  loginAsync,
  registerAsync,
  verifyAsync,
  resendVerificationAsync,
  refreshAsync,
  logoutAsync,
  logoutAllAsync,
  forgotPasswordAsync,
  resetPasswordAsync,
  googleSsoAsync,
  lineSsoAsync,
  linkGoogleAsync,
  linkLineAsync,
  changePasswordAsync,
  setPasswordAsync,
  addContactAsync,
  verifyContactAsync,
  resendContactAsync,
};

import getCurrentUserAsync from './v1/users/me/get';
import patchCurrentUserAsync from './v1/users/me/patch';

export { getCurrentUserAsync, patchCurrentUserAsync };

export type {
  AuthIdentityType,
  IAuthIdentifierPayload,
  IChangePasswordPayload,
  IIdTokenPayload,
  IPasswordResetPayload,
  IRefreshPayload,
  IRegisterPayload,
  ISetPasswordPayload,
  ITokenPair,
  IUser,
  IUserUpdatePayload,
  IVerifyPayload,
} from './types';
