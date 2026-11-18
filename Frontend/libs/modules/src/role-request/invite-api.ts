'use client';

import { responseData } from '@rescue-frontend/data-access';
import type { components } from '@rescue-frontend/data-access/openapi';

import { siteRestClient } from '../session/site-clients';

export type OpenedInvite = components['schemas']['OpenedInviteResponse'];
export type InviteApplication = components['schemas']['InviteJoinRequest'];

/** The site's API proxy supplies the site realm, even for someone with a team identity. */
export function openTeamInvite(token: string, signal?: AbortSignal) {
  return siteRestClient
    .GET('/api/v1/invites/{token}', {
      params: { path: { token } },
      signal,
    })
    .then(responseData);
}

export function joinThroughInvite(token: string, body: InviteApplication) {
  return siteRestClient
    .POST('/api/v1/invites/{token}/requests', {
      params: { path: { token } },
      body,
    })
    .then(responseData);
}
