/**
 * Rosters, platform roles and the last-admin rule. A super admin's pages work them out from
 * `/admin/users` and `/admin/teams` — membership is a team-scoped role grant (ADR-072), so a
 * team's roster is every account holding a role in it — which also gives every team's head
 * count. A team identity reads its own team from `/admin/teams/{uuid}/members` (ADR-362).
 */

import type { components } from '@rescue-frontend/data-access/openapi';

export type AdminUser = components['schemas']['AdminUserListItem'];
export type Team = components['schemas']['TeamResponse'];
export type TeamMemberItem = components['schemas']['TeamMemberItem'];

export type TeamRole = 'admin' | 'member';

/**
 * What the prototype's 平台角色 column shows. `super_admin` and `data_auditor` are platform
 * roles; 政府 and 非政府組織 are not roles at all but follow from the type of team the account
 * is in (2026-08-14 ruling); an account with neither is a plain `user`.
 */
export type PlatformKey =
  | 'super_admin'
  | 'data_auditor'
  | 'gov'
  | 'ngo'
  | 'user';

export interface RosterMember {
  uuid: string;
  name: string;
  role: TeamRole;
  /** `null` when unknown: the team member list says nothing about other identities. */
  platform: PlatformKey | null;
  /** The name confirmed on approval (ADR-355); only admins and reviewers receive it. */
  realName: string | null;
  lastActivityAt: string | null;
}

export interface TeamMembership {
  teamUuid: string;
  teamName: string;
  role: TeamRole;
}

export interface DirectoryPerson {
  uuid: string;
  name: string;
  realName: string | null;
  platform: PlatformKey;
  teams: TeamMembership[];
  lastActivityAt: string | null;
  activeSessionCount: number | null;
}

function teamRoleOf(role: string): TeamRole | null {
  return role === 'admin' || role === 'member' ? role : null;
}

export function membershipsOf(user: AdminUser): TeamMembership[] {
  return (user.identities ?? []).flatMap((identity) => {
    const role = teamRoleOf(identity.role);
    return identity.team_uuid && role
      ? [{ teamUuid: identity.team_uuid, teamName: identity.team ?? '', role }]
      : [];
  });
}

/** A gov team outranks an NGO one: someone in both acts for the government somewhere. */
export function platformOf(
  user: AdminUser,
  teamTypes: ReadonlyMap<string, string>,
): PlatformKey {
  if (user.platform_role === 'super_admin') return 'super_admin';
  if (user.platform_role === 'data_auditor') return 'data_auditor';
  const types = membershipsOf(user).map((m) => teamTypes.get(m.teamUuid));
  if (types.includes('gov')) return 'gov';
  if (types.length > 0) return 'ngo';
  return 'user';
}

export function teamTypesOf(teams: readonly Team[]): Map<string, string> {
  return new Map(teams.map((team) => [team.uuid, team.type]));
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, 'zh-Hant');

const adminsFirst = (a: RosterMember, b: RosterMember) =>
  a.role === b.role ? byName(a, b) : a.role === 'admin' ? -1 : 1;

/** Admins first, as the prototype lists them, then by name. */
export function teamRoster(
  users: readonly AdminUser[],
  teamUuid: string,
  teamTypes: ReadonlyMap<string, string>,
): RosterMember[] {
  return users
    .flatMap((user) => {
      const membership = membershipsOf(user).find(
        (m) => m.teamUuid === teamUuid,
      );
      return membership
        ? [
            {
              uuid: user.uuid,
              name: user.name,
              role: membership.role,
              platform: platformOf(user, teamTypes),
              realName: user.real_name ?? null,
              lastActivityAt: user.last_activity_at ?? null,
            },
          ]
        : [];
    })
    .sort(adminsFirst);
}

/** A team identity's own roster, from `GET /admin/teams/{uuid}/members`. */
export function rosterFromMembers(
  members: readonly TeamMemberItem[],
): RosterMember[] {
  return members
    .flatMap((member) => {
      const role = teamRoleOf(member.role);
      return role
        ? [
            {
              uuid: member.uuid,
              name: member.name,
              role,
              platform: null,
              realName: member.real_name ?? null,
              lastActivityAt: null,
            },
          ]
        : [];
    })
    .sort(adminsFirst);
}

export function memberCounts(users: readonly AdminUser[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const user of users) {
    for (const { teamUuid } of membershipsOf(user)) {
      counts.set(teamUuid, (counts.get(teamUuid) ?? 0) + 1);
    }
  }
  return counts;
}

export function adminCount(roster: readonly RosterMember[]): number {
  return roster.filter((member) => member.role === 'admin').length;
}

/**
 * Whether demoting or removing `member` would leave the team without an admin (system rule EA1:
 * every running team keeps at least one). The backend refuses it too (409, ADR-356); asking
 * first lets the page explain why instead of showing the backend's message.
 */
export function isLastAdmin(
  roster: readonly RosterMember[],
  member: RosterMember,
): boolean {
  return member.role === 'admin' && adminCount(roster) <= 1;
}

/** Super admins and data auditors: the global roles that no team grants. */
export function platformStaff(users: readonly AdminUser[]): AdminUser[] {
  return users
    .filter(
      (user) =>
        user.platform_role === 'super_admin' ||
        user.platform_role === 'data_auditor',
    )
    .sort((a, b) =>
      a.platform_role === b.platform_role
        ? byName(a, b)
        : a.platform_role === 'super_admin'
          ? -1
          : 1,
    );
}

export function superAdminCount(users: readonly AdminUser[]): number {
  return users.filter((user) => user.platform_role === 'super_admin').length;
}

export function directory(
  users: readonly AdminUser[],
  teamTypes: ReadonlyMap<string, string>,
): DirectoryPerson[] {
  return users
    .map((user) => ({
      uuid: user.uuid,
      name: user.name,
      realName: user.real_name ?? null,
      platform: platformOf(user, teamTypes),
      teams: membershipsOf(user),
      lastActivityAt: user.last_activity_at ?? null,
      activeSessionCount: user.active_session_count ?? null,
    }))
    .sort(byName);
}

/** Case-insensitive substring match on the name; a blank query matches everyone. */
export function matchesName(name: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return !needle || name.toLowerCase().includes(needle);
}

const UBN_WEIGHTS = [1, 2, 1, 2, 1, 2, 4, 1];

/**
 * A Taiwan Uniform Business Number (統一編號), checked as the backend does (`is_valid_ubn`,
 * `app/schemas/admin.py`) so the form says why before the API answers 422: 8 ASCII digits, the
 * digit sums of each weighted digit adding up to a multiple of 5 — or, when the 7th digit is 7,
 * one short of a multiple of 5.
 */
export function isValidTaxId(value: string): boolean {
  if (!/^[0-9]{8}$/.test(value)) return false;
  const total = [...value].reduce((sum, char, index) => {
    const product = Number(char) * UBN_WEIGHTS[index];
    return sum + Math.floor(product / 10) + (product % 10);
  }, 0);
  return total % 5 === 0 || (value[6] === '7' && (total + 1) % 5 === 0);
}
