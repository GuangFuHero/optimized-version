import { describe, expect, it } from 'vitest';

import type { TicketNeed } from '../ticket/needs/need-claim';
import {
  describeStationForShare,
  describeTicketForShare,
} from './share-description';

const need = (overrides: Partial<TicketNeed>): TicketNeed => ({
  uuid: 'need',
  taskName: '清淤人力',
  taskType: 'hr',
  quantity: 3,
  status: 'pending',
  assignedCount: 1,
  ...overrides,
});

describe('describeTicketForShare', () => {
  it('names the platform and what is still short, as the designer asked (WG-002-2)', () => {
    expect(
      describeTicketForShare({
        taskType: 'hr',
        needs: [
          need({ taskName: '清淤人力', quantity: 3, assignedCount: 1 }),
          need({ taskName: '晚餐便當', quantity: 5, assignedCount: 2 }),
        ],
      }),
    ).toBe('島嶼守望｜需要：清淤人力 缺 2 人、晚餐便當 缺 3 人');
  });

  it('names a need with no headcount by itself', () => {
    expect(
      describeTicketForShare({
        needs: [
          need({ taskName: '受困救援', quantity: null, assignedCount: 0 }),
        ],
      }),
    ).toBe('島嶼守望｜需要：受困救援');
  });

  it('leaves out what needs nobody more: filled, stopped or cancelled', () => {
    expect(
      describeTicketForShare({
        needs: [
          need({ taskName: '已滿', quantity: 2, assignedCount: 2 }),
          need({
            taskName: '已停止',
            status: 'fulfilled',
            quantity: 4,
            assignedCount: 1,
          }),
          need({ taskName: '已取消', status: 'canceled' }),
          need({ taskName: '還要', quantity: 2, assignedCount: 0 }),
        ],
      }),
    ).toBe('島嶼守望｜需要：還要 缺 2 人');
  });

  it('lists three and counts the rest, so a chat preview is not cut off mid-need', () => {
    const needs = ['一', '二', '三', '四', '五'].map((taskName) =>
      need({ taskName, quantity: 1, assignedCount: 0 }),
    );

    expect(describeTicketForShare({ needs })).toBe(
      '島嶼守望｜需要：一 缺 1 人、二 缺 1 人、三 缺 1 人 等 5 項',
    );
  });

  it('falls back to the kind of help, never the raw enum, when nothing is short', () => {
    expect(describeTicketForShare({ taskType: 'hr', needs: [] })).toBe(
      '島嶼守望｜人力',
    );
    expect(describeTicketForShare({ taskType: 'hr' })).toBe('島嶼守望｜人力');
    expect(describeTicketForShare({})).toBe('島嶼守望｜救災任務');
  });
});

describe('describeStationForShare', () => {
  it("says the station's own words when it has them", () => {
    expect(
      describeStationForShare({
        type: 'supply',
        description: '  提供飲水與乾糧 ',
        opHour: '08:00-20:00',
      }),
    ).toBe('提供飲水與乾糧');
  });

  it('names the platform, the kind of station and its hours when it has no words of its own', () => {
    expect(
      describeStationForShare({ type: 'supply', opHour: '08:00-20:00' }),
    ).toBe('島嶼守望｜物資站點，服務時間 08:00-20:00');
    expect(
      describeStationForShare({
        type: 'water',
        description: ' ',
        opHour: 'unknown',
      }),
    ).toBe('島嶼守望｜加水站點');
  });

  it('never says its level, and calls a station of no known kind a 救災站點', () => {
    for (const station of [
      { level: 0 },
      { type: 'warehouse', level: 0 },
      { type: null, opHour: '-' },
    ]) {
      expect(describeStationForShare(station)).toBe('島嶼守望｜救災站點');
    }
  });
});
