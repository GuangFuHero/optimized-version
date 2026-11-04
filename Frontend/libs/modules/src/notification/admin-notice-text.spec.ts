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
      summary: '站點「糖廠加水站」有一筆修改建議待審',
      detail: '要改：營運狀態',
    });
  });

  it('suggestion on a live-status property names it', () => {
    expect(
      adminNoticeText(
        notice('station_suggestion_created', {
          station_name: '光復鄉衛生所醫療站',
          field: 'quantity',
          property_name: 'capacity_available',
        }),
      ).detail,
    ).toBe('要改：可收治量');
  });

  it('suggestion on any other property names the field', () => {
    expect(
      adminNoticeText(
        notice('station_suggestion_created', {
          station_name: '糖廠加水站',
          field: 'quantity',
          property_name: '礦泉水',
        }),
      ).detail,
    ).toBe('要改：數量');
  });

  it('suggestion on an unnamed station', () => {
    expect(
      adminNoticeText(
        notice('station_suggestion_created', {
          station_name: null,
          field: 'operational_status',
        }),
      ),
    ).toEqual({ summary: '有一筆站點修改建議待審', detail: '要改：營運狀態' });
  });

  it('unknown field shows its code', () => {
    expect(
      adminNoticeText(
        notice('station_suggestion_created', {
          station_name: '糖廠加水站',
          field: 'level',
        }),
      ).detail,
    ).toBe('要改：level');
  });

  it('writes the dedup count in 組, including 0', () => {
    expect(
      adminNoticeText(notice('dedup_review_pending', { count: 3 })),
    ).toEqual({
      summary: '有 3 組資料疑似重複，待審',
      detail: '可能是任務單或站點，到「重複審核」判斷',
    });
    expect(
      adminNoticeText(notice('dedup_review_pending', { count: 0 })).summary,
    ).toBe('有 0 組資料疑似重複，待審');
  });

  it('role request joining a team names the team first', () => {
    const join = (requested_role: string) =>
      adminNoticeText(
        notice('role_request_submitted', {
          requested_role,
          team_name: '壯闊台灣',
          new_team_name: null,
          applicant_name: '王志豪',
        }),
      );

    expect(join('ngo')).toEqual({
      summary: '王志豪申請加入團隊「壯闊台灣」',
      detail: '身分：非政府組織',
    });
    expect(join('government').detail).toBe('身分：政府');
  });

  it('role request founding a team', () => {
    expect(
      adminNoticeText(
        notice('role_request_submitted', {
          requested_role: 'ngo',
          new_team_name: '花蓮青年志工隊',
          applicant_name: '王志豪',
        }),
      ),
    ).toEqual({
      summary: '王志豪申請成立團隊「花蓮青年志工隊」',
      detail: '通過後他是這一隊的管理員',
    });
  });

  it('role request for a role alone', () => {
    expect(
      adminNoticeText(
        notice('role_request_submitted', {
          requested_role: 'data_auditor',
          applicant_name: '林佩珊',
        }),
      ),
    ).toEqual({ summary: '林佩珊申請成為資料檢核員', detail: null });
  });

  it('assignments name the team', () => {
    expect(
      adminNoticeText(
        notice('station_assigned', {
          station_name: '糖廠加水站',
          team_name: '壯闊台灣',
        }),
      ),
    ).toEqual({
      summary: '「壯闊台灣」被指派負責站點「糖廠加水站」',
      detail: '可以編輯這個站點、審修改建議',
    });
    expect(
      adminNoticeText(
        notice('station_unassigned', {
          station_name: '糖廠加水站',
          team_name: '壯闊台灣',
        }),
      ),
    ).toEqual({
      summary: '「壯闊台灣」不再負責站點「糖廠加水站」',
      detail: null,
    });
    expect(
      adminNoticeText(
        notice('zone_assigned', { zone_name: '大平村', team_name: '壯闊台灣' }),
      ),
    ).toEqual({
      summary: '「壯闊台灣」被指派負責責任區「大平村」',
      detail: '點這裡看範圍',
    });
    expect(
      adminNoticeText(
        notice('zone_unassigned', {
          zone_name: '大平村',
          team_name: '壯闊台灣',
        }),
      ),
    ).toEqual({
      summary: '「壯闊台灣」不再負責責任區「大平村」',
      detail: null,
    });
  });

  it('an assignment without the team falls back', () => {
    expect(
      adminNoticeText(notice('station_assigned', { station_name: '甲站' })),
    ).toEqual(FALLBACK);
    expect(
      adminNoticeText(notice('zone_unassigned', { zone_name: '大平村' })),
    ).toEqual(FALLBACK);
  });

  it('writes the team member sentence', () => {
    expect(
      adminNoticeText(
        notice('team_member_added', {
          team_name: '慈濟基金會',
          role: 'member',
        }),
      ),
    ).toEqual({
      summary: '你已加入團隊「慈濟基金會」，身分是成員',
      detail: '從右上角的名字切換到這一隊',
    });
    expect(
      adminNoticeText(
        notice('team_member_added', { team_name: '慈濟', role: 'lead' }),
      ).summary,
    ).toBe('你已加入團隊「慈濟」，身分是lead');
  });

  it('writes the suspended sentence', () => {
    expect(
      adminNoticeText(notice('team_suspended', { team_name: '花蓮縣志工隊' })),
    ).toEqual({
      summary: '團隊「花蓮縣志工隊」已暫停',
      detail: '你在這一隊的身分暫時不能用',
    });
  });

  it('station status names each live-status property, and says 狀態 for any other', () => {
    const status = (property_name: unknown) =>
      adminNoticeText(
        notice('resource_station_updated', {
          station_name: '甲站',
          change: 'status',
          property_name,
        }),
      );

    expect(
      [
        'beds_available',
        'capacity_available',
        'water_level',
        'is_open',
        'supply_rationed',
        'power_stable',
      ].map((property) => status(property).summary),
    ).toEqual([
      '站點「甲站」的剩餘床位有更新',
      '站點「甲站」的可收治量有更新',
      '站點「甲站」的供水充足程度有更新',
      '站點「甲站」的是否營業有更新',
      '站點「甲站」的是否限量有更新',
      '站點「甲站」的供電是否穩定有更新',
    ]);
    expect(status('beds_available').detail).toBeNull();
    expect(status('restroom').summary).toBe('站點「甲站」的狀態有更新');
    expect(status(null).summary).toBe('站點「甲站」的狀態有更新');
  });

  it('station created says its type, and an unknown change falls back', () => {
    const created = (station_type: unknown) =>
      adminNoticeText(
        notice('resource_station_updated', {
          station_name: '糖廠加水站',
          station_type,
          change: 'created',
        }),
      );

    expect(created('water')).toEqual({
      summary: '新增了站點「糖廠加水站」',
      detail: '類型：加水',
    });
    expect(created(null).detail).toBeNull();
    expect(created('spaceport').detail).toBeNull();
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
