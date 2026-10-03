import { describe, expect, it } from 'vitest';

import {
  roleRequestFormProblems,
  toSubmitRoleRequestInput,
  validateRoleRequestForm,
} from './form';

const REASON = '我是光復鄉公所民政課，要協助檢查重複通報';

describe('validateRoleRequestForm', () => {
  it('asks for the identity and the reason, and leaves the contact optional', () => {
    expect(
      validateRoleRequestForm({ role: null, reason: '', contact: '' }),
    ).toEqual({
      role: '請選擇一種身分',
      reason: '必填',
    });
  });

  it('counts a reason of only spaces as none, as the backend does', () => {
    expect(
      validateRoleRequestForm({ role: 'ngo', reason: '   ', contact: '' }),
    ).toEqual({
      reason: '必填',
    });
  });

  it('holds the reason and the contact to the backend limits of 500 and 100 characters', () => {
    expect(
      validateRoleRequestForm({
        role: 'ngo',
        reason: '字'.repeat(500),
        contact: '9'.repeat(100),
      }),
    ).toEqual({});
    expect(
      validateRoleRequestForm({
        role: 'ngo',
        reason: '字'.repeat(501),
        contact: '9'.repeat(101),
      }),
    ).toEqual({
      reason: '申請理由最多 500 字',
      contact: '聯絡方式最多 100 字',
    });
  });

  it('counts an emoji as one character, as the backend does, not as two', () => {
    expect(
      validateRoleRequestForm({
        role: 'ngo',
        reason: '🙏'.repeat(500),
        contact: '',
      }),
    ).toEqual({});
    expect(
      validateRoleRequestForm({
        role: 'ngo',
        reason: '🙏'.repeat(501),
        contact: '',
      }),
    ).toEqual({
      reason: '申請理由最多 500 字',
    });
  });

  it('finds nothing wrong with a complete application', () => {
    expect(
      validateRoleRequestForm({
        role: 'data_auditor',
        reason: REASON,
        contact: '03-8701234',
      }),
    ).toEqual({});
  });
});

describe('roleRequestFormProblems', () => {
  it('names what is left to fix, in the order of the form', () => {
    expect(
      roleRequestFormProblems({
        contact: '聯絡方式最多 100 字',
        role: '請選擇一種身分',
        reason: '必填',
      }),
    ).toEqual(['要申請的身分', '申請理由', '聯絡方式']);
  });
});

describe('toSubmitRoleRequestInput', () => {
  it('sends the words trimmed, and no contact rather than an empty one', () => {
    expect(
      toSubmitRoleRequestInput({
        role: 'government',
        reason: `  ${REASON}  `,
        contact: '   ',
      }),
    ).toEqual({
      requestedRole: 'government',
      reason: REASON,
      contact: null,
    });
  });
});
