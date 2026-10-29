import { describe, expect, it } from 'vitest';

import {
  findTeamNamed,
  inviteHint,
  NEW_TEAM,
  reviewerText,
  teamPickerOptions,
  teamTypeForRole,
} from './team';

const team = (n: number) => ({ uuid: `uuid-${n}`, name: `光復第${n}協會` });
const NINE = Array.from({ length: 9 }, (_, i) => team(i + 1));

describe('teamTypeForRole', () => {
  it('has government pick government teams, NGO pick NGO teams, and a data auditor none', () => {
    expect(teamTypeForRole('government')).toBe('GOV');
    expect(teamTypeForRole('ngo')).toBe('NGO');
    expect(teamTypeForRole('data_auditor')).toBeNull();
    expect(teamTypeForRole(null)).toBeNull();
  });
});

describe('findTeamNamed', () => {
  it('compares as the backend does: trimmed, ignoring case', () => {
    const teams = [{ uuid: 'a', name: 'Hualien Rescue ' }];

    expect(findTeamNamed(teams, '  hualien rescue')).toEqual(teams[0]);
    expect(findTeamNamed(teams, 'Hualien')).toBeNull();
    expect(findTeamNamed(teams, '   ')).toBeNull();
  });
});

describe('teamPickerOptions', () => {
  it('lists up to 8 teams without a search box, whatever was typed', () => {
    const eight = NINE.slice(0, 8);

    expect(teamPickerOptions(eight, '第3', null)).toEqual({
      searchable: false,
      options: eight,
      noMatch: false,
    });
  });

  it('narrows more than 8 teams to the names holding the search, ignoring case', () => {
    expect(teamPickerOptions(NINE, ' 第3 ', null)).toEqual({
      searchable: true,
      options: [team(3)],
      noMatch: false,
    });
  });

  it('keeps the team picked first when the search leaves it out', () => {
    expect(teamPickerOptions(NINE, '第3', 'uuid-7').options).toEqual([
      team(7),
      team(3),
    ]);
  });

  it('says when nothing matches', () => {
    expect(teamPickerOptions(NINE, '台東', null)).toEqual({
      searchable: true,
      options: [],
      noMatch: true,
    });
  });
});

describe('inviteHint', () => {
  it('says an invite only picks the team, in the words of the identity picked', () => {
    expect(inviteHint('government')).toBe(
      '如果單位已經給你邀請碼，掃碼會直接帶到那個單位，不用自己找；一樣要等管理員核准。',
    );
    expect(inviteHint('ngo')).toBe(
      '如果團隊已經給你邀請碼，掃碼會直接帶到那個團隊，不用自己找；一樣要等管理員核准。',
    );
  });

  it('says nothing for an identity that names no team, or before one is picked', () => {
    expect(inviteHint('data_auditor')).toBeNull();
    expect(inviteHint(null)).toBeNull();
  });
});

describe('reviewerText', () => {
  it('names the super admin for a data auditor, and before an identity is picked', () => {
    expect(reviewerText('data_auditor', null, null)).toBe(
      '送出後由超級管理員審核。',
    );
    expect(reviewerText(null, null, null)).toBe('送出後由超級管理員審核。');
  });

  it("names the team's admins or a super admin for an existing team", () => {
    expect(reviewerText('ngo', 'uuid-2', NINE)).toBe(
      '送出後由「光復第2協會」的管理員或超級管理員審核，任一人通過即可。',
    );
    expect(reviewerText('government', null, NINE)).toBe(
      '送出後由該單位的管理員或超級管理員審核。',
    );
  });

  it('names the super admin for a new team, which has no admin yet', () => {
    expect(reviewerText('government', NEW_TEAM, NINE)).toBe(
      '新單位由超級管理員審核，通過後你會是它的管理員。',
    );
  });
});
