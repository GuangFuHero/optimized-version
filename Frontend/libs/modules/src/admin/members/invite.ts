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
 * The user site's invite page, on the same origin as the back office (the sidebar's 回到前台
 * links `/map`). The path mirrors `GET /api/v1/invites/{token}`, which that page reads.
 */
export function inviteUrl(token: string, origin: string): string {
  return `${origin}/invites/${encodeURIComponent(token)}`;
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
