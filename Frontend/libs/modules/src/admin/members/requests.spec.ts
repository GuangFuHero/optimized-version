import { describe, expect, it } from 'vitest';

import {
  applicantContact,
  decisionConflict,
  newTeamHref,
  requestKind,
  teamUuidByName,
  type RoleRequest,
} from './requests';

function request(overrides: Partial<RoleRequest>): RoleRequest {
  return {
    uuid: 'rq-1',
    requested_role: 'ngo',
    reason: '想幫忙',
    contact: null,
    status: 'pending',
    review_note: null,
    reviewed_by: null,
    created_at: '2026-10-22T00:00:00Z',
    closed_at: null,
    applicant_uuid: 'u-1',
    applicant_name: '小明',
    team_uuid: null,
    new_team_name: null,
    via_invite: false,
    applicant_details: null,
    team_name: null,
    ...overrides,
  };
}

describe('requestKind', () => {
  it('tells the three kinds of Spec 026 apart', () => {
    expect(requestKind(request({ team_uuid: 't-1', team_name: '慈濟' }))).toBe(
      'member',
    );
    expect(requestKind(request({ new_team_name: '新的隊' }))).toBe('new_team');
    expect(requestKind(request({ requested_role: 'data_auditor' }))).toBe(
      'data_auditor',
    );
  });

  it('marks a government / NGO request naming no team as legacy, which cannot be approved', () => {
    expect(requestKind(request({ requested_role: 'government' }))).toBe(
      'legacy',
    );
  });
});

describe('applicantContact', () => {
  it('joins what the applicant sent, skipping what they left out', () => {
    expect(
      applicantContact(
        request({
          applicant_details: {
            name: '王曉明',
            phone: '+886912345678',
            email: null,
          },
        }),
      ),
    ).toBe('王曉明 · +886912345678');
  });

  it('falls back to the free-text contact of a Spec 019 request', () => {
    expect(applicantContact(request({ contact: 'LINE: abc' }))).toBe(
      'LINE: abc',
    );
    expect(applicantContact(request({}))).toBeNull();
  });
});

describe('decisionConflict', () => {
  it('reads a request decided in the other queue as gone, not as a failure', () => {
    expect(decisionConflict('Role request is no longer pending')).toEqual({
      message: '這筆申請已由其他人處理，已從佇列移除。',
      decided: true,
    });
  });

  it('keeps a request that is still pending when approval is refused for another reason', () => {
    expect(
      decisionConflict('A team with this name already exists').decided,
    ).toBe(false);
  });

  it('passes an unknown message through rather than hide it', () => {
    expect(decisionConflict('Something new').message).toBe(
      '無法完成審核：Something new',
    );
  });
});

describe('newTeamHref', () => {
  it('opens the new team on 團隊 with its applicant marked', () => {
    expect(newTeamHref('t-1', 'u-2')).toBe('/teams?team=t-1&member=u-2');
  });
});

describe('teamUuidByName', () => {
  const teams = [
    { uuid: 't-1', name: '光復清淤志工隊' },
    { uuid: 't-2', name: 'Red Cross Hualien' },
  ];

  it('finds the new team the way the backend compares names: trimmed, ignoring case', () => {
    expect(teamUuidByName(teams, ' 光復清淤志工隊 ')).toBe('t-1');
    expect(teamUuidByName(teams, 'red cross hualien')).toBe('t-2');
  });

  it('finds nothing for an unknown or empty name', () => {
    expect(teamUuidByName(teams, '不存在的隊')).toBeNull();
    expect(teamUuidByName(teams, null)).toBeNull();
    expect(teamUuidByName(teams, '  ')).toBeNull();
  });
});
