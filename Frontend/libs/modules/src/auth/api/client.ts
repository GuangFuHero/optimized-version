'use client';

import { responseData } from '@rescue-frontend/data-access';
import type { components } from '@rescue-frontend/data-access/openapi';

import { siteRestClient } from '../../session/site-clients';

export async function getUserSaltAsync(value: string) {
  const data = await siteRestClient
    .GET('/api/v1/auth/salt/{value}', { params: { path: { value } } })
    .then(responseData);
  return data.salt_frontend;
}

export function registerAsync(
  payload: components['schemas']['RegisterRequest'],
) {
  return siteRestClient
    .POST('/api/v1/auth/register', { body: payload })
    .then(() => undefined);
}

/** Signs this browser in: the backend sets the `{p}_at` and `{p}_rt` cookies on its answer. */
export function signInAsync(
  payload: components['schemas']['SessionSignInRequest'],
) {
  return siteRestClient
    .POST('/api/v1/auth/session', { body: payload })
    .then(responseData);
}

/** Finishes a registration with its code and signs the new account in, as `signInAsync` does. */
export function verifyAndSignInAsync(
  payload: components['schemas']['VerifyRequest'],
) {
  return siteRestClient
    .POST('/api/v1/auth/session/verify', { body: payload })
    .then(responseData);
}

/** The signed-in account, through the proxy, which refreshes a spent access token on the way. */
export function getCurrentUserAsync() {
  return siteRestClient.GET('/api/v1/users/me').then(responseData);
}

/** Signs this browser out: the backend ends its session and clears both cookies. */
export function signOutAsync() {
  return siteRestClient.DELETE('/api/v1/auth/session').then(() => undefined);
}

export function resendVerificationAsync(
  payload: components['schemas']['ResendVerificationRequest'],
) {
  return siteRestClient
    .POST('/api/v1/auth/resend-verification', { body: payload })
    .then(() => undefined);
}

export function forgotPasswordAsync(
  payload: components['schemas']['ForgotPasswordRequest'],
) {
  return siteRestClient
    .POST('/api/v1/auth/forgot-password', { body: payload })
    .then(() => undefined);
}

export function resetPasswordAsync(
  payload: components['schemas']['ResetPasswordRequest'],
) {
  return siteRestClient
    .POST('/api/v1/auth/reset-password', { body: payload })
    .then(() => undefined);
}

export function logoutAllAsync() {
  return siteRestClient.POST('/api/v1/auth/logout-all').then(() => undefined);
}

export function changePasswordAsync(
  payload: components['schemas']['ChangePasswordRequest'],
) {
  return siteRestClient
    .POST('/api/v1/auth/change-password', { body: payload })
    .then(() => undefined);
}

export function setPasswordAsync(
  payload: components['schemas']['SetPasswordRequest'],
) {
  return siteRestClient
    .POST('/api/v1/auth/set-password', { body: payload })
    .then(() => undefined);
}

export function addContactAsync(
  payload: components['schemas']['AddContactRequest'],
) {
  return siteRestClient
    .POST('/api/v1/auth/contacts', { body: payload })
    .then(() => undefined);
}

export function verifyContactAsync(
  payload: components['schemas']['VerifyContactRequest'],
) {
  return siteRestClient
    .POST('/api/v1/auth/contacts/verify', { body: payload })
    .then(() => undefined);
}

export function resendContactAsync(
  payload: components['schemas']['AddContactRequest'],
) {
  return siteRestClient
    .POST('/api/v1/auth/contacts/resend', { body: payload })
    .then(() => undefined);
}
