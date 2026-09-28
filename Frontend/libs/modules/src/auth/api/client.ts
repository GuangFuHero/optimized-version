'use client';

import type {
  IAuthIdentifierPayload,
  IChangePasswordPayload,
  IIdTokenPayload,
  IPasswordResetPayload,
  IRegisterPayload,
  ISetPasswordPayload,
  ITokenPair,
  IVerifyPayload,
} from '@rescue-frontend/data-access';

import { requestFrontendJsonAsync } from './request-async';

const AUTH_API_BASE_PATH = '/api/bff/auth';

export async function getUserSaltAsync(value: string) {
  const response = await requestFrontendJsonAsync<{ salt_frontend: string }>(
    `${AUTH_API_BASE_PATH}/salt/${encodeURIComponent(value)}`,
  );

  return response.salt_frontend;
}

export function registerAsync(payload: IRegisterPayload) {
  return requestFrontendJsonAsync<void>(`${AUTH_API_BASE_PATH}/register`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function verifyAsync(payload: IVerifyPayload) {
  return requestFrontendJsonAsync<ITokenPair>(`${AUTH_API_BASE_PATH}/verify`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function resendVerificationAsync(payload: IAuthIdentifierPayload) {
  return requestFrontendJsonAsync<void>(
    `${AUTH_API_BASE_PATH}/resend-verification`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

export function forgotPasswordAsync(payload: IAuthIdentifierPayload) {
  return requestFrontendJsonAsync<void>(
    `${AUTH_API_BASE_PATH}/forgot-password`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

export function resetPasswordAsync(payload: IPasswordResetPayload) {
  return requestFrontendJsonAsync<void>(
    `${AUTH_API_BASE_PATH}/reset-password`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

export function logoutAsync() {
  return requestFrontendJsonAsync<void>(`${AUTH_API_BASE_PATH}/logout`, {
    method: 'POST',
  });
}

export function logoutAllAsync() {
  return requestFrontendJsonAsync<void>(`${AUTH_API_BASE_PATH}/logout-all`, {
    method: 'POST',
  });
}

export function changePasswordAsync(payload: IChangePasswordPayload) {
  return requestFrontendJsonAsync<void>(
    `${AUTH_API_BASE_PATH}/change-password`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

export function setPasswordAsync(payload: ISetPasswordPayload) {
  return requestFrontendJsonAsync<void>(`${AUTH_API_BASE_PATH}/set-password`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function addContactAsync(payload: IAuthIdentifierPayload) {
  return requestFrontendJsonAsync<void>(`${AUTH_API_BASE_PATH}/contacts`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function verifyContactAsync(payload: IVerifyPayload) {
  return requestFrontendJsonAsync<void>(
    `${AUTH_API_BASE_PATH}/contacts/verify`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

export function resendContactAsync(payload: IAuthIdentifierPayload) {
  return requestFrontendJsonAsync<void>(
    `${AUTH_API_BASE_PATH}/contacts/resend`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

export function googleSsoAsync(payload: IIdTokenPayload) {
  return requestFrontendJsonAsync<ITokenPair>(
    `${AUTH_API_BASE_PATH}/sso/google`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

export function lineSsoAsync(payload: IIdTokenPayload) {
  return requestFrontendJsonAsync<ITokenPair>(
    `${AUTH_API_BASE_PATH}/sso/line`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}
