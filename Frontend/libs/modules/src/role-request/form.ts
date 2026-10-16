import type {
  RoleRequestRole,
  SubmitRoleRequestInput,
} from '@rescue-frontend/data-access';

// The backend's limits (Backend `models/role_request.py`); checked here too, in the site's words.
export const REASON_MAX_LENGTH = 500;
export const CONTACT_MAX_LENGTH = 100;

/**
 * What an applicant may ask to become, as the prototype words it (`ROLE_REQUEST_OPTIONS`,
 * `Design/前台/js/site/site-actions.jsx:134-149`). Super admin is not on the list (2026-09-11).
 */
export const ROLE_REQUEST_OPTIONS: ReadonlyArray<{
  value: RoleRequestRole;
  label: string;
  hint: string;
}> = [
  {
    value: 'government',
    label: '政府單位人員',
    hint: '縣市政府、鄉鎮公所、各級應變中心的編制人員。審核者：超級管理員。',
  },
  {
    value: 'ngo',
    label: '社福團體人員',
    hint: '社福團體、基金會、協會等民間組織的工作人員。審核者：超級管理員。',
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

export interface RoleRequestFormValues {
  role: RoleRequestRole | null;
  reason: string;
  contact: string;
}

type RoleRequestField = 'role' | 'reason' | 'contact';
export type RoleRequestFormErrors = Partial<Record<RoleRequestField, string>>;

// Characters as the backend counts them (Python's `len`): an emoji is one, not two UTF-16 units.
const characters = (text: string) => [...text].length;

/** The problems to show under each field; empty when the application can be sent. */
export function validateRoleRequestForm(
  values: RoleRequestFormValues,
): RoleRequestFormErrors {
  const errors: RoleRequestFormErrors = {};
  const reason = values.reason.trim();

  if (!values.role) {
    errors.role = '請選擇一種身分';
  }

  if (!reason) {
    errors.reason = '必填';
  } else if (characters(reason) > REASON_MAX_LENGTH) {
    errors.reason = `申請理由最多 ${REASON_MAX_LENGTH} 字`;
  }

  if (characters(values.contact.trim()) > CONTACT_MAX_LENGTH) {
    errors.contact = `聯絡方式最多 ${CONTACT_MAX_LENGTH} 字`;
  }

  return errors;
}

const FIELD_LABELS: ReadonlyArray<[RoleRequestField, string]> = [
  ['role', '要申請的身分'],
  ['reason', '申請理由'],
  ['contact', '聯絡方式'],
];

/** The fields left to fix, in the order of the form — the summary above the submit button. */
export function roleRequestFormProblems(
  errors: RoleRequestFormErrors,
): string[] {
  return FIELD_LABELS.filter(([field]) => errors[field]).map(
    ([, label]) => label,
  );
}

/** The application as the backend takes it: trimmed, and no contact rather than an empty one. */
export function toSubmitRoleRequestInput(
  values: RoleRequestFormValues & { role: RoleRequestRole },
): SubmitRoleRequestInput {
  return {
    requestedRole: values.role,
    reason: values.reason.trim(),
    contact: values.contact.trim() || null,
  };
}
