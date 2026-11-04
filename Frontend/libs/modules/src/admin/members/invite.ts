import type { components } from '@rescue-frontend/data-access/openapi';

/** Fixed by the backend (BE-038 step 1): no settings, no head count, no extension. */
export const INVITE_VALID_HOURS = 24;

export type InviteResponse = components['schemas']['InviteResponse'];

export interface TeamInvite {
  /** The one URL behind both the QR and the copied link (MEM-QR-112). */
  url: string;
  /** For the reminder only; the backend alone decides whether a code has expired (ADR-353). */
  expiresAt: string;
}

/**
 * The public site's origin is supplied by the server's SITE_APP_URL. The admin app runs on
 * a different origin, so its window.location must never become the invitation's destination.
 */
export function inviteUrl(token: string, siteUrl: string): string {
  const site = new URL(siteUrl);
  if (
    !['http:', 'https:'].includes(site.protocol) ||
    site.username ||
    site.password
  ) {
    throw new Error('Invalid public site URL');
  }
  return new URL(`/invites/${encodeURIComponent(token)}`, site.origin).href;
}

export function toTeamInvite(
  invite: InviteResponse,
  origin: string,
): TeamInvite {
  return { url: inviteUrl(invite.token, origin), expiresAt: invite.expires_at };
}

/**
 * `GET …/invites` lists the links still valid, newest first: show that one again rather than
 * issue a new link every time the sheet opens.
 */
export function currentInvite(
  invites: readonly InviteResponse[] | undefined,
): InviteResponse | null {
  return invites?.[0] ?? null;
}
