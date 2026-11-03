import { describe, expect, it } from 'vitest';

import type { DuplicateHintRates } from '@rescue-frontend/data-access/admin';

import { falseAlarm, percentText, rateTexts, REVIEWED_ENOUGH } from './rates';

function row(over: Partial<DuplicateHintRates> = {}): DuplicateHintRates {
  // #242's own example: 8 sent, 6 hinted, 4 still created, 2 reviewed, 1 not a duplicate.
  return {
    entity_kind: 'ticket_task',
    submissions: 8,
    hinted: 6,
    hint_rate: 0.75,
    overridden: 4,
    reviewed: 2,
    judged_not_duplicate: 1,
    false_alarm_rate_without_auditors: 0.667,
    false_alarm_rate_with_auditors: 0.333,
    review_coverage: 0.5,
    ...over,
  };
}

describe('percentText', () => {
  it('reads a share as a whole percent, a tiny one with a decimal, and null as —', () => {
    expect(percentText(0.75)).toBe('75%');
    expect(percentText(0.667)).toBe('67%');
    expect(percentText(0.004)).toBe('0.4%');
    expect(percentText(0)).toBe('0%');
    expect(percentText(null)).toBe('—');
  });
});

describe('falseAlarm', () => {
  it('counts every 仍要建立 as a false alarm until enough cards are reviewed', () => {
    expect(falseAlarm(row())).toEqual({ rate: 0.667, basis: 'overrides' });
    expect(falseAlarm(row({ reviewed: REVIEWED_ENOUGH }))).toEqual({
      rate: 0.333,
      basis: 'auditors',
    });
  });

  it('stays on the override count when the auditors estimate is missing', () => {
    expect(
      falseAlarm(row({ reviewed: 20, false_alarm_rate_with_auditors: null })),
    ).toEqual({ rate: 0.667, basis: 'overrides' });
  });
});

describe('rateTexts', () => {
  it('says what the numbers mean for the tab', () => {
    const texts = rateTexts(row(), 'ticket');
    expect(texts.hint.line).toBe(
      '提示率 75%：最近 30 天民眾新增需求 8 次，有 6 次跳出「可能重複」提示',
    );
    expect(texts.falseAlarm.value).toBe('約 67%');
    expect(texts.falseAlarm.line).toBe(
      '誤報率 約 67%：跳出的提示裡，每 100 次有 67 次其實不是重複',
    );
    expect(texts.falseAlarm.basis).toMatch(/^審過的配對卡還不多/);
    expect(rateTexts(row(), 'station').hint.line).toContain('新增站點');
  });

  it('adds "may be higher still" only beside the auditors estimate', () => {
    const higher = /實際的誤報率可能更高/;
    expect(
      rateTexts(row(), 'ticket').falseAlarm.notes.some((n) => higher.test(n)),
    ).toBe(false);
    const reviewed = rateTexts(row({ reviewed: 12 }), 'ticket').falseAlarm;
    expect(reviewed.notes.some((n) => higher.test(n))).toBe(true);
    expect(reviewed.basis).toBe('依檢核員審過的 12 張配對卡推算');
  });

  it('reads — when there is nothing to divide by', () => {
    const empty = rateTexts(
      row({
        submissions: 0,
        hinted: 0,
        hint_rate: null,
        false_alarm_rate_without_auditors: null,
        false_alarm_rate_with_auditors: null,
      }),
      'ticket',
    );
    expect(empty.hint.value).toBe('—');
    expect(empty.falseAlarm.value).toBe('—');
    expect(empty.hint.line).toBe('提示率 —：最近 30 天沒有民眾新增需求');
  });
});
