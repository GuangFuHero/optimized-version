import { describe, expect, it } from 'vitest';

import {
  roleRequestFormProblems,
  toSubmitRoleRequestInput,
  validateRoleRequestForm,
  type RoleRequestFormValues,
} from './form';
import { NEW_TEAM } from './team';

const REASON = '我是光復鄉公所民政課，要協助檢查重複通報';
const TEAMS = [
  { uuid: 'team-a', name: '光復在地互助協會' },
  { uuid: 'team-b', name: '花蓮縣光復鄉公所' },
];
const VERIFIED = { phoneVerified: true, teams: TEAMS };

const form = (
  values: Partial<RoleRequestFormValues>,
): RoleRequestFormValues => ({
  role: 'data_auditor',
  team: null,
  newTeamName: '',
  reason: REASON,
  name: '王志豪',
  ...values,
});

describe('validateRoleRequestForm', () => {
  it('asks for the identity, a name, a verified phone and the reason', () => {
    expect(
      validateRoleRequestForm(form({ role: null, reason: '', name: '' }), {
        phoneVerified: false,
        teams: null,
      }),
    ).toEqual({
      role: '請選擇一種身分',
      name: '必填',
      phone: '請先完成手機驗證',
      reason: '必填',
    });
  });

  it('counts a reason or a name of only spaces as none', () => {
    expect(
      validateRoleRequestForm(form({ reason: '   ', name: '  ' }), VERIFIED),
    ).toEqual({
      name: '必填',
      reason: '必填',
    });
  });

  it('holds the reason and the name to the backend limits of 500 and 100 characters', () => {
    expect(
      validateRoleRequestForm(
        form({ reason: '字'.repeat(500), name: '王'.repeat(100) }),
        VERIFIED,
      ),
    ).toEqual({});
    expect(
      validateRoleRequestForm(
        form({ reason: '字'.repeat(501), name: '王'.repeat(101) }),
        VERIFIED,
      ),
    ).toEqual({
      name: '名字最多 100 字',
      reason: '申請理由最多 500 字',
    });
  });

  it('counts an emoji as one character, as the backend does, not as two', () => {
    expect(
      validateRoleRequestForm(form({ reason: '🙏'.repeat(500) }), VERIFIED),
    ).toEqual({});
    expect(
      validateRoleRequestForm(form({ reason: '🙏'.repeat(501) }), VERIFIED),
    ).toEqual({
      reason: '申請理由最多 500 字',
    });
  });

  it('finds nothing wrong with a complete data auditor application, which names no team', () => {
    expect(validateRoleRequestForm(form({}), VERIFIED)).toEqual({});
  });

  it('asks government for its 單位 and NGO for its 團隊', () => {
    expect(
      validateRoleRequestForm(form({ role: 'government' }), VERIFIED),
    ).toEqual({ team: '請選擇你所屬的單位' });
    expect(validateRoleRequestForm(form({ role: 'ngo' }), VERIFIED)).toEqual({
      team: '請選擇你所屬的團隊',
    });
    expect(
      validateRoleRequestForm(form({ role: 'ngo', team: 'team-a' }), VERIFIED),
    ).toEqual({});
  });

  it('asks again for a team no longer on the list, and trusts the pick before the list is read', () => {
    expect(
      validateRoleRequestForm(form({ role: 'ngo', team: 'gone' }), VERIFIED),
    ).toEqual({ team: '請選擇你所屬的團隊' });
    expect(
      validateRoleRequestForm(form({ role: 'ngo', team: 'team-a' }), {
        phoneVerified: true,
        teams: null,
      }),
    ).toEqual({});
  });

  it("asks for a new team's name, up to 100 characters, and not one already listed", () => {
    const newTeam = (newTeamName: string) =>
      validateRoleRequestForm(
        form({ role: 'ngo', team: NEW_TEAM, newTeamName }),
        VERIFIED,
      );

    expect(newTeam('  ')).toEqual({ newTeamName: '請填新團隊的名稱' });
    expect(newTeam('會'.repeat(100))).toEqual({});
    expect(newTeam('會'.repeat(101))).toEqual({
      newTeamName: '團隊名稱最多 100 字',
    });
    expect(newTeam(' 光復在地互助協會 ')).toEqual({
      newTeamName: '已經有「光復在地互助協會」了，請直接在上面選它',
    });
  });
});

describe('roleRequestFormProblems', () => {
  it('names what is left to fix, in the order of the form', () => {
    expect(
      roleRequestFormProblems(
        {
          reason: '必填',
          phone: '請先完成手機驗證',
          team: '請選擇你所屬的單位',
          role: '請選擇一種身分',
          name: '必填',
        },
        'government',
      ),
    ).toEqual(['要申請的身分', '所屬單位', '你的名字', '手機驗證', '申請理由']);
  });

  it("names a new team's name in the identity's words", () => {
    expect(
      roleRequestFormProblems({ newTeamName: '請填新團隊的名稱' }, 'ngo'),
    ).toEqual(['新團隊名稱']);
  });
});

describe('toSubmitRoleRequestInput', () => {
  it('sends the words trimmed, and no phone: the backend reads the account', () => {
    expect(
      toSubmitRoleRequestInput({
        ...form({ reason: `  ${REASON}  `, name: ' 王志豪 ' }),
        role: 'data_auditor',
      }),
    ).toEqual({
      requestedRole: 'data_auditor',
      reason: REASON,
      name: '王志豪',
    });
  });

  it('sends the team picked, or the new one to found', () => {
    expect(
      toSubmitRoleRequestInput({
        ...form({ team: 'team-b', newTeamName: '沒選的名字' }),
        role: 'government',
      }),
    ).toEqual({
      requestedRole: 'government',
      reason: REASON,
      name: '王志豪',
      teamUuid: 'team-b',
    });
    expect(
      toSubmitRoleRequestInput({
        ...form({ team: NEW_TEAM, newTeamName: ' 光復青年志工隊 ' }),
        role: 'ngo',
      }),
    ).toEqual({
      requestedRole: 'ngo',
      reason: REASON,
      name: '王志豪',
      newTeamName: '光復青年志工隊',
    });
  });

  it('sends no team for a data auditor, even one picked before the identity changed', () => {
    expect(
      toSubmitRoleRequestInput({
        ...form({ team: 'team-a' }),
        role: 'data_auditor',
      }),
    ).not.toHaveProperty('teamUuid');
  });
});
