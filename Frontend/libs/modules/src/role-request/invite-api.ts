'use client';

import { createRestClient, responseData } from '@rescue-frontend/data-access';
import type { components } from '@rescue-frontend/data-access/openapi';

import { sessionExpiryFetch } from '../session/end-expired-session';

export type OpenedInvite = components['schemas']['OpenedInviteResponse'];
export type InviteApplication = components['schemas']['InviteJoinRequest'];

const client = createRestClient(sessionExpiryFetch);

/** The site's API proxy supplies the site realm, even for someone with a team identity. */
export function openTeamInvite(token: string, signal?: AbortSignal) {
  return client
    .GET('/api/v1/invites/{token}', {
      params: { path: { token } },
      signal,
    })
    .then(responseData);
}

export function joinThroughInvite(token: string, body: InviteApplication) {
  return client
    .POST('/api/v1/invites/{token}/requests', {
      params: { path: { token } },
      body,
    })
    .then(responseData);
}
