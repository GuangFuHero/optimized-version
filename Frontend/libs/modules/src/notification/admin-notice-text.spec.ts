import { describe, expect, it } from 'vitest';

import { adminNoticeText } from './admin-notice-text';

function notice(type: string, params: Record<string, unknown> | null) {
  return { type, title: '後端標題', body: '後端內文', params };
}

const FALLBACK = { summary: '後端標題', detail: '後端內文' };

describe('adminNoticeText', () => {
  it('writes the suggestion sentence', () => {
    expect(
      adminNoticeText(
        notice('station_suggestion_created', {
          station_name: '糖廠加水站',
          station_type: 'water',
          field: 'operational_status',
          property_name: null,
        }),
      ),
    ).toEqual({
      summary: '「糖廠加水站」有一筆修改建議待審',
      detail: '營運狀態',
    });
  });

  it('suggestion on an unnamed station', () => {
    expect(
      adminNoticeText(
        notice('station_suggestion_created', {
          station_name: null,
          field: 'name',
        }),
      ),
    ).toEqual({ summary: '有一筆站點修改建議待審', detail: '站點名稱' });
  });

  it('unknown field shows its code', () => {
    expect(
      adminNoticeText(
        notice('station_suggestion_created', {
          station_name: '糖廠加水站',
          field: 'level',
        }),
      ).detail,
    ).toBe('level');
  });

  it('writes the zone sentence', () => {
    expect(
      adminNoticeText(
        notice('zone_assigned', { zone_name: '大平村', team_name: '慈濟' }),
      ),
    ).toEqual({
      summary: '你的團隊被指派負責責任區「大平村」',
      detail: '請到任務管理篩選你的團隊，看區域內的任務',
    });
  });

  it('role request joining a team', () => {
    expect(
      adminNoticeText(
        notice('role_request_submitted', {
          requested_role: 'government',
          team_name: '光復鄉公所',
          new_team_name: null,
          applicant_name: '王志豪',
        }),
      ),
    ).toEqual({
      summary: '王志豪申請成為政府單位人員',
      detail: '申請加入：光復鄉公所',
    });
  });

  it('role request founding a team, or neither', () => {
    const base = { requested_role: 'ngo', applicant_name: '陳小美' };

    expect(
      adminNoticeText(
        notice('role_request_submitted', { ...base, new_team_name: '新團隊' }),
      ).detail,
    ).toBe('申請成立團隊：新團隊');
    expect(
      adminNoticeText(notice('role_request_submitted', base)).detail,
    ).toBeNull();
  });

  it('writes the dedup count, including 0', () => {
    expect(
      adminNoticeText(notice('dedup_review_pending', { count: 3 })).summary,
    ).toBe('3 筆資料疑似重複，待審核');
    expect(
      adminNoticeText(notice('dedup_review_pending', { count: 0 })).summary,
    ).toBe('0 筆資料疑似重複，待審核');
  });

  it('writes the team member role', () => {
    expect(
      adminNoticeText(
        notice('team_member_added', { team_name: '慈濟', role: 'admin' }),
      ),
    ).toEqual({ summary: '歡迎加入團隊「慈濟」', detail: '你的身分：管理員' });
    expect(
      adminNoticeText(
        notice('team_member_added', { team_name: '慈濟', role: 'lead' }),
      ).detail,
    ).toBe('你的身分：lead');
  });

  it('writes the unassigned and suspended sentences', () => {
    expect(
      adminNoticeText(notice('station_unassigned', { station_name: '甲站' })),
    ).toEqual({ summary: '你的團隊不再負責站點「甲站」', detail: null });
    expect(
      adminNoticeText(notice('zone_unassigned', { zone_name: '大平村' })),
    ).toEqual({ summary: '你的團隊不再負責責任區「大平村」', detail: null });
    expect(
      adminNoticeText(notice('team_suspended', { team_name: '慈濟' })),
    ).toEqual({ summary: '團隊「慈濟」已暫停', detail: null });
    expect(
      adminNoticeText(notice('station_assigned', { station_name: '甲站' })),
    ).toEqual({
      summary: '你的團隊被指派負責站點「甲站」',
      detail: '可以編輯這個站點、處理它的修改建議',
    });
  });

  it('station status update', () => {
    expect(
      adminNoticeText(
        notice('resource_station_updated', {
          station_name: '糖廠加水站',
          station_type: 'water',
          change: 'status',
          property_name: 'beds_available',
        }),
      ),
    ).toEqual({ summary: '「糖廠加水站」營運狀態更新', detail: null });
  });

  it('station created, and an unknown change falls back', () => {
    expect(
      adminNoticeText(
        notice('resource_station_updated', {
          station_name: '甲站',
          change: 'created',
        }),
      ).summary,
    ).toBe('新建站點「甲站」');
    expect(
      adminNoticeText(
        notice('resource_station_updated', {
          station_name: '甲站',
          change: 'resource',
        }),
      ),
    ).toEqual(FALLBACK);
  });

  it('falls back when params is null or missing', () => {
    expect(adminNoticeText(notice('zone_assigned', null))).toEqual(FALLBACK);
    expect(
      adminNoticeText({
        type: 'zone_assigned',
        title: '後端標題',
        body: '後端內文',
      }),
    ).toEqual(FALLBACK);
  });

  it('falls back when a named value is null', () => {
    expect(
      adminNoticeText(notice('zone_assigned', { zone_name: null })),
    ).toEqual(FALLBACK);
  });

  it.each([
    ['empty string', ''],
    ['undefined', undefined],
    ['NaN', Number.NaN],
    ['object', {}],
  ])('falls back when a named value is %s', (_label, value) => {
    expect(
      adminNoticeText(notice('team_suspended', { team_name: value })),
    ).toEqual(FALLBACK);
  });

  it('falls back for an unknown requested role', () => {
    expect(
      adminNoticeText(
        notice('role_request_submitted', {
          requested_role: 'root',
          applicant_name: '王志豪',
        }),
      ),
    ).toEqual(FALLBACK);
  });

  it('falls back for a type it does not write', () => {
    expect(
      adminNoticeText(notice('ticket_deleted', { ticket_name: 'x' })),
    ).toEqual(FALLBACK);
  });
});
