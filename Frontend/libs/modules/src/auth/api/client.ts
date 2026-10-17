'use client';

import { createRestClient, responseData } from '@rescue-frontend/data-access';
import type { components } from '@rescue-frontend/data-access/openapi';

import { sessionExpiryFetch } from '../../session/end-expired-session';

const authApiClient = createRestClient(sessionExpiryFetch);

export async function getUserSaltAsync(value: string) {
  const data = await authApiClient
    .GET('/api/v1/auth/salt/{value}', { params: { path: { value } } })
    .then(responseData);
  return data.salt_frontend;
}

export function registerAsync(
  payload: components['schemas']['RegisterRequest'],
) {
  return authApiClient
    .POST('/api/v1/auth/register', { body: payload })
    .then(() => undefined);
}

export function verifyAsync(payload: components['schemas']['VerifyRequest']) {
  return authApiClient
    .POST('/api/v1/auth/verify', { body: payload })
    .then(responseData);
}

/** Signs this browser in: the backend sets the `{p}_at` and `{p}_rt` cookies on its answer. */
export function signInAsync(
  payload: components['schemas']['SessionSignInRequest'],
) {
  return authApiClient
    .POST('/api/v1/auth/session', { body: payload })
    .then(responseData);
}

/** Finishes a registration with its code and signs the new account in, as `signInAsync` does. */
export function verifyAndSignInAsync(
  payload: components['schemas']['VerifyRequest'],
) {
  return authApiClient
    .POST('/api/v1/auth/session/verify', { body: payload })
    .then(responseData);
}

export function resendVerificationAsync(
  payload: components['schemas']['ResendVerificationRequest'],
) {
  return authApiClient
    .POST('/api/v1/auth/resend-verification', { body: payload })
    .then(() => undefined);
}

export function forgotPasswordAsync(
  payload: components['schemas']['ForgotPasswordRequest'],
) {
  return authApiClient
    .POST('/api/v1/auth/forgot-password', { body: payload })
    .then(() => undefined);
}

export function resetPasswordAsync(
  payload: components['schemas']['ResetPasswordRequest'],
) {
  return authApiClient
    .POST('/api/v1/auth/reset-password', { body: payload })
    .then(() => undefined);
}

export function logoutAsync() {
  return authApiClient.POST('/api/v1/auth/logout').then(() => undefined);
}

export function logoutAllAsync() {
  return authApiClient.POST('/api/v1/auth/logout-all').then(() => undefined);
}

export function changePasswordAsync(
  payload: components['schemas']['ChangePasswordRequest'],
) {
  return authApiClient
    .POST('/api/v1/auth/change-password', { body: payload })
    .then(() => undefined);
}

export function setPasswordAsync(
  payload: components['schemas']['SetPasswordRequest'],
) {
  return authApiClient
    .POST('/api/v1/auth/set-password', { body: payload })
    .then(() => undefined);
}

export function addContactAsync(
  payload: components['schemas']['AddContactRequest'],
) {
  return authApiClient
    .POST('/api/v1/auth/contacts', { body: payload })
    .then(() => undefined);
}

export function verifyContactAsync(
  payload: components['schemas']['VerifyContactRequest'],
) {
  return authApiClient
    .POST('/api/v1/auth/contacts/verify', { body: payload })
    .then(() => undefined);
}

export function resendContactAsync(
  payload: components['schemas']['AddContactRequest'],
) {
  return authApiClient
    .POST('/api/v1/auth/contacts/resend', { body: payload })
    .then(() => undefined);
}
