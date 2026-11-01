import { describe, expect, it } from 'vitest';

import { backOfficeIdentities } from './roles';

const identity = (role: string, team: string | null = null) => ({
  role_uuid: `${role}-uuid`,
  role,
  team_uuid: team ? `${team}-uuid` : null,
  team,
});

describe('backOfficeIdentities', () => {
  it('leaves out the site identity, which the back office does not act as', () => {
    expect(
      backOfficeIdentities([
        identity('user'),
        identity('super_admin'),
        identity('admin', '花蓮縣政府'),
      ]).map((option) => option.role),
    ).toEqual(['super_admin', 'admin']);
  });

  it('keeps every back-office identity, in order', () => {
    const identities = [
      identity('data_auditor'),
      identity('member', '慈濟'),
      identity('admin', '花蓮縣政府'),
    ];

    expect(backOfficeIdentities(identities)).toEqual(identities);
  });
});
