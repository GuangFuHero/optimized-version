'use client';

/**
 * Progress —— 承接進度（已有幾人／需要幾人）。設計稿：Design/後台/元件 Components.html 第 7 節。
 *
 * PRG-101 一律膠囊、只有兩種粗細：sm 4px（後台表格）｜md 6px（前台卡片、詳情）。原本有 4／6／8px、圓角 2px 與膠囊。
 * PRG-102 tone：brand（前台，橘）｜neutral（後台列表，灰 —— 任務管理那頁只讓優先級與待處理兩處有顏色）。
 *         完成一律綠色，兩邊相同。
 *   ⚠️「人數滿了」≠「做完了」：後台的「在途 3/3」是都有人接、還沒做完 → 傳 complete={false}，不變綠。
 * PRG-103 數字一定要有（3/8 · 還缺 5 人），寫在條的上方右側。進度條只是輔助。
 * PRG-104 沒有總數（數量留空）→ 不畫條，只寫「已有 N 人」。看不出比例的條比沒有條更誤導。
 * PRG-105 文字三種：還在招人「3/8 · 還缺 5 人」｜人數夠了（含超過）「已滿 8/8」「已滿 10/8」｜
 *         已結束但沒滿（ended）「已結束 · 3/8」。「已滿」只看人數。
 *   ❌ 不要用 complete 決定文字 —— complete 只管顏色（綠不綠）。
 */

import { Box } from '@mui/material';
import { type ReactNode, useId } from 'react';

import { designTokens } from '../../theme';

const { color, motion, radius, typography } = designTokens;

export interface ProgressProps {
  value: number;
  /** 0 或 undefined＝沒有總數（PRG-104） */
  max?: number;
  tone?: 'brand' | 'neutral';
  size?: 'sm' | 'md';
  label?: ReactNode;
  /** 右側文字；不給就自動寫「3/8 · 還缺 5 人」「已滿 4/4」「已結束 · 3/8」「已有 2 人」（PRG-105） */
  valueText?: ReactNode;
  /** 變不變綠；不給＝人數到齊（value >= max）就變綠。只管顏色，不管文字（PRG-105）。 */
  complete?: boolean;
  /** 已經結束、不再招人：人數沒滿時寫「已結束 · 3/8」（PRG-105）。 */
  ended?: boolean;
}

/**
 * 完成了沒、條畫多長、右側預設寫什麼（PRG-102、PRG-104、PRG-105）。`complete` 有給就照它：人數滿了不等於
 * 做完了；文字只看人數和 `ended`。
 */
export function readProgress(
  value: number,
  max?: number,
  complete?: boolean,
  ended?: boolean,
): { hasMax: boolean; done: boolean; percent: number; text: string } {
  if (typeof max !== 'number' || max <= 0) {
    return {
      hasMax: false,
      done: complete ?? false,
      percent: 0,
      text: `已有 ${value} 人`,
    };
  }

  const full = value >= max;

  return {
    hasMax: true,
    done: complete ?? full,
    percent: Math.min(100, Math.round((value / max) * 100)),
    text: full
      ? `已滿 ${value}/${max}`
      : ended
        ? `已結束 · ${value}/${max}`
        : `${value}/${max} · 還缺 ${max - value} 人`,
  };
}

export function Progress({
  value,
  max,
  tone = 'brand',
  size = 'md',
  label,
  valueText,
  complete,
  ended,
}: ProgressProps) {
  const reading = readProgress(value, max, complete, ended);
  const { hasMax, done } = reading;
  const text = valueText ?? reading.text;
  // 進度條的名字：有 label 用 label，沒有就用右側的數字（同原型 WGProgress 的 aria-label）。
  const labelId = useId();
  const textId = useId();
  const fill = done
    ? color.bg.success.default
    : tone === 'neutral'
      ? color.fg.neutral.subtle
      : color.bg.primary.default;

  return (
    <Box
      sx={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'baseline',
          gap: '8px',
          ...typography.data[300],
          color: color.fg.neutral.subtle,
        }}
      >
        {label ? <span id={labelId}>{label}</span> : null}
        <Box
          component="b"
          id={textId}
          sx={{
            ml: 'auto',
            whiteSpace: 'nowrap',
            color: done ? color.fg.success : color.fg.neutral.default,
          }}
        >
          {text}
        </Box>
      </Box>
      {hasMax ? (
        <Box
          role="progressbar"
          aria-labelledby={label ? labelId : textId}
          // 超過總數（5/4）時 aria-valuenow 不能大於 aria-valuemax。
          aria-valuenow={Math.min(Math.max(value, 0), max ?? 0)}
          aria-valuemin={0}
          aria-valuemax={max}
          sx={{
            height: size === 'sm' ? 4 : 6,
            borderRadius: `${radius.full}px`,
            bgcolor: color.bg.neutral.sunken,
            overflow: 'hidden',
          }}
        >
          <Box
            sx={{
              width: `${reading.percent}%`,
              height: '100%',
              borderRadius: `${radius.full}px`,
              bgcolor: fill,
              transition: `width ${motion.transition.base}`,
            }}
          />
        </Box>
      ) : null}
    </Box>
  );
}
