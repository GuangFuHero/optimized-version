/**
 * What a review card says about a role request (Spec/026). One table holds three kinds
 * (ADR-350): joining an existing team, founding a new one, becoming a data auditor.
 */

import type { components } from '@rescue-frontend/data-access/openapi';

export type RoleRequest = components['schemas']['RoleRequestReviewItem'];

export type RequestKind = 'member' | 'new_team' | 'data_auditor' | 'legacy';

/**
 * `legacy`: a government / NGO request from before Spec 026 that names no team. The backend
 * answers 409 to approving one (ADR-359 point 2), so it can only be turned down.
 */
export function requestKind(request: RoleRequest): RequestKind {
  if (request.requested_role === 'data_auditor') return 'data_auditor';
  if (request.team_uuid) return 'member';
  if (request.new_team_name) return 'new_team';
  return 'legacy';
}

/** The applicant's details as one line, from what they sent; a Spec 019 row only has `contact`. */
export function applicantContact(request: RoleRequest): string | null {
  const details = request.applicant_details;
  if (!details) return request.contact ?? null;
  return (
    [details.name, details.phone, details.email].filter(Boolean).join(' · ') ||
    null
  );
}

export interface DecisionConflict {
  message: string;
  /** The request has left the queue: someone decided it first. */
  decided: boolean;
}

/** The backend's 409 messages on approve / reject (`RoleRequestConflictError`); the message is the contract. */
const CONFLICTS: Record<string, DecisionConflict> = {
  'Role request is no longer pending': {
    message: '這筆申請已由其他人處理，已從佇列移除。',
    decided: true,
  },
  'A team with this name already exists': {
    message:
      '已有同名的團隊，無法以這個名稱建立。申請仍待審，可拒絕並請申請人改名後重新申請。',
    decided: false,
  },
  'The applicant is already a member of this team': {
    message: '申請人已經是本隊成員，不需要再核准；可直接拒絕這筆申請。',
    decided: false,
  },
  'The applicant has another back-office identity now': {
    message: '申請人已經有其他後台身份，不能再成為資料稽核員；請拒絕這筆申請。',
    decided: false,
  },
  'The team cannot be joined now': {
    message: '這個團隊目前無法加入（可能已暫停）；請拒絕或等團隊恢復後再審。',
    decided: false,
  },
  'This application names no team; the applicant should apply again': {
    message: '這是舊版申請，沒有指定團隊，無法核准；請拒絕並請申請人重新送出。',
    decided: false,
  },
};

export function decisionConflict(backendMessage: string): DecisionConflict {
  return (
    CONFLICTS[backendMessage] ?? {
      message: `無法完成審核：${backendMessage}`,
      decided: false,
    }
  );
}

/**
 * Where an approved new-team application leads (ADMIN-027 Story 5 step 3): the new team on 團隊,
 * with the applicant — its first admin — marked in its 成員名單.
 */
export function newTeamHref(teamUuid: string, applicantUuid: string): string {
  const query = new URLSearchParams({ team: teamUuid, member: applicantUuid });
  return `/teams?${query.toString()}`;
}

/**
 * The team an approved new-team application created, found by its name. The approval's response
 * should name it in `team_uuid` (Spec 026 API handover), but the backend leaves that field as the
 * team the request asked to join — empty for a new team — and keeps the new one in
 * `granted_team_uuid`, which it does not return. Team names are unique, compared trimmed and
 * ignoring case (ADR-352 point 3), so the name identifies it.
 */
export function teamUuidByName(
  teams: readonly { uuid: string; name: string }[],
  name: string | null | undefined,
): string | null {
  const wanted = name?.trim().toLowerCase();
  if (!wanted) return null;
  return (
    teams.find((team) => team.name.trim().toLowerCase() === wanted)?.uuid ??
    null
  );
}
