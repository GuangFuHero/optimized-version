import { describe, expect, it } from 'vitest';

import {
  directory,
  isValidTaxId,
  isLastAdmin,
  matchesName,
  memberCounts,
  platformOf,
  platformStaff,
  rosterFromMembers,
  superAdminCount,
  teamRoster,
  teamTypesOf,
  type AdminUser,
  type Team,
} from './roster';

const teams: Team[] = [
  { uuid: 't-gov', name: '花蓮縣政府', type: 'gov', status: 'active' },
  { uuid: 't-ngo', name: '慈濟基金會', type: 'ngo', status: 'active' },
];
const types = teamTypesOf(teams);

function user(
  uuid: string,
  name: string,
  platform_role: string,
  identities: AdminUser['identities'] = [],
): AdminUser {
  return { uuid, name, platform_role, identities, last_activity_at: null };
}

const grant = (role: string, team_uuid?: string, team?: string) => ({
  role_uuid: `r-${role}`,
  role,
  team_uuid: team_uuid ?? null,
  team: team ?? null,
});

const lin = user('u-lin', '林承翰', 'super_admin', [grant('super_admin')]);
const carol = user('u-carol', 'Carol', 'data_auditor', [grant('data_auditor')]);
const wang = user('u-wang', '王小明', 'user', [
  grant('user'),
  grant('admin', 't-ngo', '慈濟基金會'),
]);
const chen = user('u-chen', '陳大文', 'user', [
  grant('user'),
  grant('member', 't-ngo', '慈濟基金會'),
  grant('member', 't-gov', '花蓮縣政府'),
]);
const citizen = user('u-zhang', '張三', 'user', [grant('user')]);
const users = [lin, carol, wang, chen, citizen];

describe('platformOf', () => {
  it('reads the platform roles straight off the account', () => {
    expect(platformOf(lin, types)).toBe('super_admin');
    expect(platformOf(carol, types)).toBe('data_auditor');
  });

  it('derives 政府 / 非政府組織 from the type of team, gov winning over ngo', () => {
    expect(platformOf(wang, types)).toBe('ngo');
    expect(platformOf(chen, types)).toBe('gov');
  });

  it('leaves an account in no team as a plain user', () => {
    expect(platformOf(citizen, types)).toBe('user');
  });
});

describe('teamRoster', () => {
  it('lists the accounts holding a role in the team, admins first', () => {
    expect(
      teamRoster(users, 't-ngo', types).map((m) => [m.name, m.role]),
    ).toEqual([
      ['王小明', 'admin'],
      ['陳大文', 'member'],
    ]);
  });

  it('is empty for a team nobody has joined', () => {
    expect(teamRoster(users, 't-unknown', types)).toEqual([]);
  });
});

describe('memberCounts', () => {
  it('counts each account once per team it is in', () => {
    const counts = memberCounts(users);
    expect(counts.get('t-ngo')).toBe(2);
    expect(counts.get('t-gov')).toBe(1);
  });
});

describe('isLastAdmin', () => {
  it('refuses to demote or remove the only admin', () => {
    const roster = teamRoster(users, 't-ngo', types);
    expect(isLastAdmin(roster, roster[0])).toBe(true);
  });

  it('lets an admin go once another admin is there', () => {
    const second = user('u-li', '李四', 'user', [
      grant('admin', 't-ngo', '慈濟基金會'),
    ]);
    const roster = teamRoster([...users, second], 't-ngo', types);
    expect(isLastAdmin(roster, roster[0])).toBe(false);
  });

  it('never blocks a plain member', () => {
    const roster = teamRoster(users, 't-ngo', types);
    expect(isLastAdmin(roster, roster[1])).toBe(false);
  });
});

describe('platformStaff', () => {
  it('keeps only super admins and data auditors, super admins first', () => {
    expect(platformStaff(users).map((u) => u.name)).toEqual([
      '林承翰',
      'Carol',
    ]);
    expect(superAdminCount(users)).toBe(1);
  });
});

describe('directory', () => {
  it('gives every account its platform role and teams', () => {
    const chenRow = directory(users, types).find((p) => p.uuid === 'u-chen');
    expect(chenRow?.platform).toBe('gov');
    expect(chenRow?.teams.map((t) => t.teamName)).toEqual([
      '慈濟基金會',
      '花蓮縣政府',
    ]);
  });
});

describe('matchesName', () => {
  it('matches a substring, ignoring case and surrounding blanks', () => {
    expect(matchesName('Carol Wu', ' carol ')).toBe(true);
    expect(matchesName('王小明', '小明')).toBe(true);
    expect(matchesName('王小明', '大文')).toBe(false);
    expect(matchesName('王小明', '  ')).toBe(true);
  });
});

describe('isValidTaxId', () => {
  it('accepts numbers passing the checksum, as the backend does', () => {
    expect(isValidTaxId('04595257')).toBe(true);
    expect(isValidTaxId('10000073')).toBe(true); // 7th digit 7: total + 1 counts
  });

  it('refuses a bad checksum, the wrong length and full-width digits', () => {
    expect(isValidTaxId('12345678')).toBe(false);
    expect(isValidTaxId('1234567')).toBe(false);
    expect(isValidTaxId('０４５９５２５７')).toBe(false);
  });
});

describe('rosterFromMembers', () => {
  const item = (
    uuid: string,
    name: string,
    role: string,
    real_name: string | null = null,
  ) => ({ uuid, name, role, role_uuid: `r-${role}`, real_name });

  it('puts admins first, keeps the real name, and knows nothing of other identities', () => {
    const roster = rosterFromMembers([
      item('u-chen', '陳大文', 'member'),
      item('u-wang', '王小明', 'admin', '王曉明'),
    ]);
    expect(roster.map((m) => [m.uuid, m.role, m.realName])).toEqual([
      ['u-wang', 'admin', '王曉明'],
      ['u-chen', 'member', null],
    ]);
    expect(roster.every((m) => m.platform === null)).toBe(true);
  });

  it('drops a row whose role is not a team role', () => {
    expect(rosterFromMembers([item('u-x', 'X', 'custom')])).toEqual([]);
  });
});
