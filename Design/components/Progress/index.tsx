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
 */

import { Box } from '@mui/material';
import { type ReactNode } from 'react';

import { designTokens } from '../../theme';

const { color, motion, radius, typography } = designTokens;

export interface ProgressProps {
  value: number;
  /** 0 或 undefined＝沒有總數（PRG-104） */
  max?: number;
  tone?: 'brand' | 'neutral';
  size?: 'sm' | 'md';
  label?: ReactNode;
  /** 右側文字；不給就自動寫「3/8」「已滿 4/4」「已有 2 人」 */
  valueText?: ReactNode;
  /** 不給＝value >= max 視為完成 */
  complete?: boolean;
}

export function Progress({ value, max, tone = 'brand', size = 'md', label, valueText, complete }: ProgressProps) {
  const hasMax = typeof max === 'number' && max > 0;
  const done = complete ?? (hasMax && value >= max);
  const pct = hasMax ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const text = valueText ?? (hasMax ? (done ? `已滿 ${value}/${max}` : `${value}/${max}`) : `已有 ${value} 人`);
  const fill = done ? color.bg.success.default : tone === 'neutral' ? color.fg.neutral.subtle : color.bg.primary.default;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: '8px', ...typography.data[300], color: color.fg.neutral.subtle }}>
        {label ? <span>{label}</span> : null}
        <Box component="b" sx={{ ml: 'auto', whiteSpace: 'nowrap', color: done ? color.fg.success : color.fg.neutral.default }}>
          {text}
        </Box>
      </Box>
      {hasMax ? (
        <Box
          role="progressbar"
          aria-valuenow={value}
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
              width: `${pct}%`,
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
