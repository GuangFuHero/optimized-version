/**
 * Which team a 政府單位人員 or 社福團體人員 applicant names (prototype `TeamPicker`,
 * `Design/前台/js/site/site-actions.jsx:160-233`; backend Spec/026, ADR-350 point 2): one of the
 * teams of their identity's type, or a new one. A 資料檢核員 names none.
 */

import type {
  RoleRequestRole,
  RoleRequestTeamType,
} from '@rescue-frontend/data-access';

/** The picker's last option, 「＋ 清單裡沒有，建立新的…」: never a team's uuid. */
export const NEW_TEAM = 'new';

/** More teams than this, and a search box shortens the list (the designer, 2026-10-05). */
export const TEAM_SEARCH_THRESHOLD = 8;

// The backend's limit (Backend `models/role_request.py`); checked here too, in the site's words.
export const TEAM_NAME_MAX_LENGTH = 100;

/** One entry of `roleRequestTeams`. */
export interface TeamOption {
  uuid: string;
  name: string;
}

// ADR-352 point 1: the identity sets the team's type; the applicant does not choose it.
const TEAM_TYPES: Record<RoleRequestRole, RoleRequestTeamType | null> = {
  government: 'GOV',
  ngo: 'NGO',
  data_auditor: null,
};

/** The type of team the identity picks from, or null when it names none. */
export function teamTypeForRole(
  role: RoleRequestRole | null,
): RoleRequestTeamType | null {
  return role ? TEAM_TYPES[role] : null;
}

/** 單位 for a government applicant, 團隊 otherwise, as the prototype words it (`teamNoun`). */
export function teamNoun(role: RoleRequestRole | null): string {
  return role === 'government' ? '單位' : '團隊';
}

/**
 * The team already called `name`, compared as the backend does (ADR-352 point 3): trimmed, ignoring
 * case. Only among the teams listed — a suspended team, or one of the other type, keeps its name
 * too, and only the backend can say so.
 */
export function findTeamNamed(
  teams: readonly TeamOption[],
  name: string,
): TeamOption | null {
  const wanted = name.trim().toLowerCase();

  if (!wanted) {
    return null;
  }

  return (
    teams.find((team) => team.name.trim().toLowerCase() === wanted) ?? null
  );
}

export interface TeamPickerOptions {
  /** Whether there are enough teams for the search box. */
  searchable: boolean;
  /** The teams the select lists, in the backend's order (by name). */
  options: TeamOption[];
  /** A search that matches nothing: the select says so. */
  noMatch: boolean;
}

/**
 * What the select lists for `query`. The team already picked stays even when the search leaves it
 * out, or the select would show nothing picked.
 */
export function teamPickerOptions(
  teams: readonly TeamOption[],
  query: string,
  picked: string | null,
): TeamPickerOptions {
  const searchable = teams.length > TEAM_SEARCH_THRESHOLD;
  const wanted = searchable ? query.trim().toLowerCase() : '';
  const matches = wanted
    ? teams.filter((team) => team.name.toLowerCase().includes(wanted))
    : [...teams];
  const kept = teams.find((team) => team.uuid === picked);
  const options =
    kept && !matches.includes(kept) ? [kept, ...matches] : matches;

  return { searchable, options, noMatch: Boolean(wanted) && !matches.length };
}

/**
 * Who decides it, said under the drawer's title (prototype `reviewerText`; ADR-350 point 5): a team's
 * own admins or a super admin for an existing team, a super admin for the rest.
 */
export function reviewerText(
  role: RoleRequestRole | null,
  team: string | null,
  teams: readonly TeamOption[] | null,
): string {
  if (!teamTypeForRole(role)) {
    return '送出後由超級管理員審核。';
  }

  const noun = teamNoun(role);

  if (team === NEW_TEAM) {
    return `新${noun}由超級管理員審核，通過後你會是它的管理員。`;
  }

  const picked = teams?.find((option) => option.uuid === team);

  return picked
    ? `送出後由「${picked.name}」的管理員或超級管理員審核，任一人通過即可。`
    : `送出後由該${noun}的管理員或超級管理員審核。`;
}
