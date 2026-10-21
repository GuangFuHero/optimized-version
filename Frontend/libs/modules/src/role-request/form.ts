import type {
  RoleRequestRole,
  SubmitRoleRequestInput,
} from '@rescue-frontend/data-access';

import { applicantNameProblem } from './applicant';
import {
  findTeamNamed,
  NEW_TEAM,
  TEAM_NAME_MAX_LENGTH,
  teamNoun,
  teamTypeForRole,
  type TeamOption,
} from './team';

// The backend's limit (Backend `models/role_request.py`); checked here too, in the site's words.
export const REASON_MAX_LENGTH = 500;

/**
 * What an applicant may ask to become, as the prototype words it (`ROLE_REQUEST_OPTIONS`,
 * `Design/前台/js/site/site-actions.jsx:144-156`). Super admin is not on the list (2026-09-11).
 */
export const ROLE_REQUEST_OPTIONS: ReadonlyArray<{
  value: RoleRequestRole;
  label: string;
  hint: string;
}> = [
  {
    value: 'government',
    label: '政府單位人員',
    hint: '縣市政府、鄉鎮公所、各級應變中心的編制人員。需選擇所屬單位。',
  },
  {
    value: 'ngo',
    label: '社福團體人員',
    hint: '社福團體、基金會、協會等民間組織的工作人員。需選擇所屬團隊。',
  },
  {
    value: 'data_auditor',
    label: '資料檢核員',
    hint: '協助檢查重複通報與資料正確性，唯讀為主。審核者：超級管理員。',
  },
];

export const ROLE_REQUEST_LABELS: Record<RoleRequestRole, string> = {
  government: '政府單位人員',
  ngo: '社福團體人員',
  data_auditor: '資料檢核員',
};

/** The free-text 可聯絡到你的方式 is gone: a reviewer calls the verified phone instead (G-2). */
export interface RoleRequestFormValues {
  role: RoleRequestRole | null;
  /** An existing team's uuid, or `NEW_TEAM`; government and NGO only. */
  team: string | null;
  /** The team to found, when `team` is `NEW_TEAM`. */
  newTeamName: string;
  reason: string;
  /** The name the application is made in; starts from the nickname, which it never changes. */
  name: string;
}

type RoleRequestField =
  | 'role'
  | 'team'
  | 'newTeamName'
  | 'name'
  | 'phone'
  | 'reason';
export type RoleRequestFormErrors = Partial<Record<RoleRequestField, string>>;

// Characters as the backend counts them (Python's `len`): an emoji is one, not two UTF-16 units.
const characters = (text: string) => [...text].length;

/**
 * The problems to show under each field; empty when the application can be sent. `phoneVerified`:
 * the account has a verified phone, from before or from this form. `teams`: the ones the picker
 * lists, or null until they are read.
 */
export function validateRoleRequestForm(
  values: RoleRequestFormValues,
  {
    phoneVerified,
    teams,
  }: { phoneVerified: boolean; teams: readonly TeamOption[] | null },
): RoleRequestFormErrors {
  const errors: RoleRequestFormErrors = {};
  const reason = values.reason.trim();
  const nameProblem = applicantNameProblem(values.name);

  if (!values.role) {
    errors.role = '請選擇一種身分';
  }

  if (teamTypeForRole(values.role)) {
    const noun = teamNoun(values.role);

    if (values.team === NEW_TEAM) {
      const newTeamName = values.newTeamName.trim();
      const taken = teams && findTeamNamed(teams, newTeamName);

      if (!newTeamName) {
        errors.newTeamName = `請填新${noun}的名稱`;
      } else if (characters(newTeamName) > TEAM_NAME_MAX_LENGTH) {
        errors.newTeamName = `${noun}名稱最多 ${TEAM_NAME_MAX_LENGTH} 字`;
      } else if (taken) {
        errors.newTeamName = `已經有「${taken.name}」了，請直接在上面選它`;
      }
    } else if (
      !values.team ||
      // Picked before the list was read again, and no longer on it: suspended meanwhile, say.
      (teams && !teams.some((team) => team.uuid === values.team))
    ) {
      errors.team = `請選擇你所屬的${noun}`;
    }
  }

  if (nameProblem) {
    errors.name = nameProblem;
  }

  if (!phoneVerified) {
    errors.phone = '請先完成手機驗證';
  }

  if (!reason) {
    errors.reason = '必填';
  } else if (characters(reason) > REASON_MAX_LENGTH) {
    errors.reason = `申請理由最多 ${REASON_MAX_LENGTH} 字`;
  }

  return errors;
}

const fieldLabels = (
  noun: string,
): ReadonlyArray<[RoleRequestField, string]> => [
  ['role', '要申請的身分'],
  ['team', `所屬${noun}`],
  ['newTeamName', `新${noun}名稱`],
  ['name', '你的名字'],
  ['phone', '手機驗證'],
  ['reason', '申請理由'],
];

/** The fields left to fix, in the order of the form — the summary above the submit button. */
export function roleRequestFormProblems(
  errors: RoleRequestFormErrors,
  role: RoleRequestRole | null,
): string[] {
  return fieldLabels(teamNoun(role))
    .filter(([field]) => errors[field])
    .map(([, label]) => label);
}

/**
 * The application as the backend takes it, trimmed: the team, or the new one, only for an identity
 * that names one. No phone: the backend reads the account's verified one. No email: the form does
 * not ask for one (phone only, by the team's decision).
 */
export function toSubmitRoleRequestInput(
  values: RoleRequestFormValues & { role: RoleRequestRole },
): SubmitRoleRequestInput {
  const input: SubmitRoleRequestInput = {
    requestedRole: values.role,
    reason: values.reason.trim(),
    name: values.name.trim(),
  };

  if (!teamTypeForRole(values.role)) {
    return input;
  }

  return values.team === NEW_TEAM
    ? { ...input, newTeamName: values.newTeamName.trim() }
    : { ...input, teamUuid: values.team };
}
