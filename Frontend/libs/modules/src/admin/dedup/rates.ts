import type { DuplicateHintRates } from '@rescue-frontend/data-access/admin';

import type { PairTab } from './model';

/**
 * Reviewed pair cards needed before 誤報率 is worked out from the auditors' verdicts instead of
 * counting every 仍要建立 as a false alarm. Not settled yet (handoff for #242).
 */
export const REVIEWED_ENOUGH = 10;

/** The rows the API returns: one per kind, task and station. */
export const RATE_KIND: Record<PairTab, DuplicateHintRates['entity_kind']> = {
  ticket: 'ticket_task',
  station: 'station',
};

const NOUN: Record<PairTab, string> = { ticket: '需求', station: '站點' };

/** A share as a whole percent, or one decimal while it would round to 0; null reads —. */
export function percentText(rate: number | null | undefined): string {
  if (rate == null) return '—';
  const whole = Math.round(rate * 100);
  if (whole === 0 && rate > 0) return `${Math.round(rate * 1000) / 10}%`;
  return `${whole}%`;
}

export type FalseAlarmBasis = 'auditors' | 'overrides';

/**
 * One 誤報率 on the page: the auditors' estimate once enough cards are reviewed (A), otherwise every
 * 仍要建立 counted as a false alarm (B).
 */
export function falseAlarm(row: DuplicateHintRates): {
  rate: number | null;
  basis: FalseAlarmBasis;
} {
  if (
    row.reviewed >= REVIEWED_ENOUGH &&
    row.false_alarm_rate_with_auditors != null
  ) {
    return { rate: row.false_alarm_rate_with_auditors, basis: 'auditors' };
  }
  return {
    rate: row.false_alarm_rate_without_auditors ?? null,
    basis: 'overrides',
  };
}

export interface RateTexts {
  hint: { value: string; line: string; notes: string[] };
  falseAlarm: { value: string; line: string; basis: string; notes: string[] };
}

/** What the two tiles, their lines and their ⓘ say (handoff for #242). */
export function rateTexts(row: DuplicateHintRates, tab: PairTab): RateTexts {
  const noun = NOUN[tab];
  const hint = percentText(row.hint_rate);
  const alarm = falseAlarm(row);
  const alarmText = percentText(alarm.rate);
  return {
    hint: {
      value: hint,
      line:
        row.hint_rate == null
          ? `提示率 —：最近 30 天沒有民眾新增${noun}`
          : `提示率 ${hint}：最近 30 天民眾新增${noun} ${row.submissions} 次，有 ${row.hinted} 次跳出「可能重複」提示`,
      notes: [
        '上線前拿 2025 光復的舊資料試算，提示率約 4.5%，可以當參考',
        '太高：民眾常被打斷，容易沒看內容就直接送出；太低：可能漏掉重複的資料',
        '後台不能直接調。覺得太常跳，請告訴工程團隊',
      ],
    },
    falseAlarm: {
      value: alarm.rate == null ? '—' : `約 ${alarmText}`,
      line:
        alarm.rate == null
          ? '誤報率 —：最近 30 天沒有跳出提示'
          : `誤報率 約 ${alarmText}：跳出的提示裡，每 100 次有 ${alarmText.replace('%', '')} 次其實不是重複`,
      basis:
        alarm.basis === 'auditors'
          ? `依檢核員審過的 ${row.reviewed} 張配對卡推算`
          : '審過的配對卡還不多，先把看到提示還是送出的全部算成誤報。多審幾張就會改用審核結果，比較準',
      notes: [
        '上線前拿 2025 光復的舊資料試算，誤報率約 16%，可以當參考',
        '為什麼比你審卡時感覺的低：審核頁只看得到「看到提示還是送出」的。「看到提示就沒送出」的不會變成配對卡，你看不到，但這裡也一起算，而且多半是提示對了，所以整體錯的比例比較低',
        // Only beside the auditors' estimate: the other one already counts every override as a
        // false alarm (too high), so "it may be higher still" would contradict it.
        ...(alarm.basis === 'auditors'
          ? [
              '看到提示就沒送出的，先一律算提示對了；但有些人可能只是嫌麻煩、乾脆不填了，所以實際的誤報率可能更高',
            ]
          : []),
        '後台不能直接調。覺得太常錯，請告訴工程團隊，附幾張配對卡，說說是哪種錯，例如「常把同一條街上不同的需求當成重複」。提示跳得越多，抓到的重複越多，但錯的也越多，只能取捨',
      ],
    },
  };
}
