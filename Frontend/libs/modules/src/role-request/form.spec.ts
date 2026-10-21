import { describe, expect, it } from 'vitest';

import {
  roleRequestFormProblems,
  toSubmitRoleRequestInput,
  validateRoleRequestForm,
} from './form';

const REASON = '我是光復鄉公所民政課，要協助檢查重複通報';
const VERIFIED = { phoneVerified: true };

describe('validateRoleRequestForm', () => {
  it('asks for the identity, a name, a verified phone and the reason', () => {
    expect(
      validateRoleRequestForm(
        { role: null, reason: '', name: '' },
        { phoneVerified: false },
      ),
    ).toEqual({
      role: '請選擇一種身分',
      name: '必填',
      phone: '請先完成手機驗證',
      reason: '必填',
    });
  });

  it('counts a reason or a name of only spaces as none', () => {
    expect(
      validateRoleRequestForm(
        { role: 'ngo', reason: '   ', name: '  ' },
        VERIFIED,
      ),
    ).toEqual({
      name: '必填',
      reason: '必填',
    });
  });

  it('holds the reason and the name to the backend limits of 500 and 100 characters', () => {
    expect(
      validateRoleRequestForm(
        { role: 'ngo', reason: '字'.repeat(500), name: '王'.repeat(100) },
        VERIFIED,
      ),
    ).toEqual({});
    expect(
      validateRoleRequestForm(
        { role: 'ngo', reason: '字'.repeat(501), name: '王'.repeat(101) },
        VERIFIED,
      ),
    ).toEqual({
      name: '名字最多 100 字',
      reason: '申請理由最多 500 字',
    });
  });

  it('counts an emoji as one character, as the backend does, not as two', () => {
    expect(
      validateRoleRequestForm(
        { role: 'ngo', reason: '🙏'.repeat(500), name: '王志豪' },
        VERIFIED,
      ),
    ).toEqual({});
    expect(
      validateRoleRequestForm(
        { role: 'ngo', reason: '🙏'.repeat(501), name: '王志豪' },
        VERIFIED,
      ),
    ).toEqual({
      reason: '申請理由最多 500 字',
    });
  });

  it('finds nothing wrong with a complete application', () => {
    expect(
      validateRoleRequestForm(
        { role: 'data_auditor', reason: REASON, name: '王志豪' },
        VERIFIED,
      ),
    ).toEqual({});
  });
});

describe('roleRequestFormProblems', () => {
  it('names what is left to fix, in the order of the form', () => {
    expect(
      roleRequestFormProblems({
        reason: '必填',
        phone: '請先完成手機驗證',
        role: '請選擇一種身分',
        name: '必填',
      }),
    ).toEqual(['要申請的身分', '你的名字', '手機驗證', '申請理由']);
  });
});

describe('toSubmitRoleRequestInput', () => {
  it('sends the words trimmed, and no phone: the backend reads the account', () => {
    expect(
      toSubmitRoleRequestInput({
        role: 'government',
        reason: `  ${REASON}  `,
        name: '王志豪',
      }),
    ).toEqual({
      requestedRole: 'government',
      reason: REASON,
    });
  });
});
