'use client';

/**
 * Tag —— 說明用的標籤（不能點）。設計稿：Design/後台/元件 Components.html 第 6 節。
 *
 * TAG-101 Tag 是說明、沒有框、不能點；能點能選的是 Chip（篩選條件，有框、32px）。
 * TAG-102 一種高度 24px（表格裡擠時 sm 20px），字 12px 粗體。原本各處有 22／24／26、內距 8～11。
 * TAG-103 七種語氣（neutral／info／secondary／success／warning／danger／brand）× 三種填法：subtle（淡底深字，預設）｜solid（實心）｜quiet（只有灰字）。
 *         實心只給「要立刻看到」的那一種（優先級「生命危急」）。一個畫面的實心標籤越少越好。
 * TAG-104 dot：前面 7px 圓點，用在顏色本身就是資訊的地方（災害類型、待處理）。❌ 不能只靠顏色：一定有字。
 * TAG-105 quiet：優先級「一般／低」、任務狀態「處理中／已完成」。不重要的不要搶眼。strong 讓 quiet 變粗黑（「待處理」）。
 * TAG-106 onRemove：右側 ×，點擊範圍 24px。
 *
 * 對照：
 *   優先級   生命危急 <Tag tone="danger" fill="solid">｜緊急 <Tag tone="warning">｜一般、低 <Tag fill="quiet">
 *   任務狀態 待處理 <Tag fill="quiet" strong dot={color.bg.primary.default}>｜其他 <Tag fill="quiet">
 *   站點營運 開設中 success｜暫停服務 warning｜已關閉 neutral
 *   災害類型 <Tag hue="#2592B9" dot>水災</Tag>
 *   官方     <Tag tone="info" icon={<ShieldCheck size={13} />}>官方</Tag>
 */

import { Box } from '@mui/material';
import { X } from 'lucide-react';
import { type ReactNode } from 'react';

import { designTokens, withAlpha } from '../../theme';

const { color, radius, typography } = designTokens;

const TONES = {
  neutral: {
    subtleBg: color.bg.neutral.sunken,
    subtleFg: color.fg.neutral.subtle,
    solidBg: color.fg.neutral.subtle,
    solidFg: color.fg.inverse,
  },
  info: {
    subtleBg: color.bg.info.subtle,
    subtleFg: color.fg.info,
    solidBg: color.bg.info.default,
    solidFg: color.fg.onInfo,
  },
  success: {
    subtleBg: color.bg.success.subtle,
    subtleFg: color.fg.success,
    solidBg: color.bg.success.default,
    solidFg: color.fg.onSuccess,
  },
  warning: {
    subtleBg: color.bg.warning.subtle,
    subtleFg: color.fg.warning,
    solidBg: color.bg.warning.default,
    solidFg: color.fg.onWarning,
  },
  danger: {
    subtleBg: color.bg.danger.subtle,
    subtleFg: color.fg.danger,
    solidBg: color.bg.danger.default,
    solidFg: color.fg.onDanger,
  },
  // 設計系統 Badge 的 secondary（例：團隊類型「政府」）；跟 info 很像但字深一階，換過來時不要併成 info
  secondary: {
    subtleBg: color.bg.secondary.subtle,
    subtleFg: color.brand.secondary.subtle,
    solidBg: color.bg.secondary.default,
    solidFg: color.fg.onSecondary,
  },
  brand: {
    subtleBg: color.bg.primary.subtle,
    subtleFg: color.brand.primary.subtle,
    solidBg: color.bg.primary.default,
    solidFg: color.fg.onPrimary,
  },
};

export type TagTone = keyof typeof TONES;
export type TagFill = 'subtle' | 'solid' | 'quiet';

export interface TagProps {
  tone?: TagTone;
  fill?: TagFill;
  size?: 'sm' | 'md';
  /** true＝與字同色；字串＝指定圓點顏色 */
  dot?: boolean | string;
  icon?: ReactNode;
  /** quiet 時改粗黑字 */
  strong?: boolean;
  /** 自訂色（災害類型）：字與點用這個色，底是同色 10% */
  hue?: string;
  onRemove?: () => void;
  removeLabel?: string;
  children: ReactNode;
}

export function Tag({
  tone = 'neutral',
  fill = 'subtle',
  size = 'md',
  dot,
  icon,
  strong = false,
  hue,
  onRemove,
  removeLabel = '移除',
  children,
}: TagProps) {
  const t = TONES[tone];
  const quiet = fill === 'quiet';
  const fg = hue ?? (quiet ? (strong ? color.fg.neutral.default : color.fg.neutral.muted) : fill === 'solid' ? t.solidFg : t.subtleFg);
  const bg = hue ? withAlpha(hue, 0.1) : quiet ? 'transparent' : fill === 'solid' ? t.solidBg : t.subtleBg;

  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        boxSizing: 'border-box',
        height: size === 'sm' ? 20 : 24,
        px: quiet ? 0 : size === 'sm' ? '8px' : '10px',
        borderRadius: `${radius.full}px`,
        bgcolor: bg,
        color: fg,
        ...typography.data[300],
        fontWeight: quiet && !strong ? 400 : 700,
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
    >
      {dot ? (
        <Box
          component="span"
          aria-hidden
          sx={{
            width: 7,
            height: 7,
            borderRadius: `${radius.full}px`,
            flexShrink: 0,
            bgcolor: typeof dot === 'string' ? dot : 'currentColor',
          }}
        />
      ) : null}
      {icon}
      {children}
      {onRemove ? (
        <Box
          component="button"
          type="button"
          aria-label={removeLabel}
          onClick={onRemove}
          sx={{
            mr: '-6px',
            width: 24,
            height: 24,
            p: 0,
            border: 0,
            bgcolor: 'transparent',
            color: 'inherit',
            borderRadius: `${radius.full}px`,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            '&:hover': { bgcolor: withAlpha('#000000', 0.06) },
          }}
        >
          <X size={12} aria-hidden />
        </Box>
      ) : null}
    </Box>
  );
}
