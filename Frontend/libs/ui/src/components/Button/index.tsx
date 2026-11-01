'use client';

/**
 * Button。設計稿：Design/後台/元件 Components.html 第 2、3 節。
 *
 * 規則（BTN-1xx，與原型 js/shared/wg-button.css 同編號）
 * BTN-101 圓角只在這裡定義：膠囊。呼叫端不要在 sx 寫 borderRadius（原本各頁寫了 999px、16、12、8…）。
 *         唯一例外是 SplitButton，由它的外層用選擇器改，不靠呼叫端。
 * BTN-102 variant：primary｜secondary｜outline｜ghost｜danger｜neutral。一個畫面最多一顆 primary。
 * BTN-103 tone="danger" 配 outline／ghost＝紅字的次要破壞性動作（丟棄草稿、從前台下架）。
 *         實心紅 variant="danger" 只給「確認對話框裡真正執行刪除」那一顆。
 * BTN-104 sm 36px 的可點範圍用 ::after 補到 44px 高，視覺不變（手機、戴手套）。
 * BTN-105 loading：轉圈、點了沒反應、寬度不變（文字與圖示 visibility:hidden）。
 *         ❌ 不要用 MUI 自己的 loading／disabled —— 會套上停用的灰色，看起來像「不能按」而不是「正在送」。
 * BTN-106 iconOnly：正方形，一定要給 aria-label。
 * BTN-107 selected：分段／切換用（aria-pressed），不是另一種 variant。
 * BTN-109 neutral＝工具鈕（篩選、審查、匯出、開啟空間）：白底灰框、1px、滑過只換底色、不上浮。
 *         橘色留給「新增」這種主要動作；工具列整排都橘框，眼睛找不到主要動作。
 * BTN-110 count：按鈕內的小數字。篩選＝套了幾個條件（淡橘）；審查＝待處理幾筆（countTone="warning"，黃）。0 不顯示。
 *         ❌ 不要寫成「篩選 (2)」：括號像文字的一部分，一掃而過看不到。
 * BTN-111 會展開東西的按鈕帶 aria-expanded；打開時淡橘底＋橘框，圖示與字一起變橘（只有字變橘看起來像只亮一半）。
 * BTN-113 工具列一律 md 44px：按鈕、SearchField、SplitButton 同高。
 */

import {
  Box,
  Button as MuiButton,
  CircularProgress,
  type ButtonProps as MuiButtonProps,
} from '@mui/material';
import { type MouseEvent } from 'react';

import { designTokens } from '../../theme';

const { color, motion, primitives, radius, shadow, typography } = designTokens;

const VARIANTS = {
  primary: {
    bg: color.bg.primary.default,
    hover: color.bg.primary.hover,
    fg: color.fg.onPrimary,
    border: 'transparent',
  },
  secondary: {
    bg: color.bg.secondary.default,
    hover: primitives.color.blue[500],
    fg: color.fg.inverse,
    border: 'transparent',
  },
  danger: {
    bg: color.bg.danger.default,
    hover: color.bg.danger.hover,
    fg: color.fg.onDanger,
    border: 'transparent',
  },
  outline: {
    bg: 'transparent',
    hover: color.bg.primary.subtle,
    fg: color.brand.primary.subtle,
    border: color.border.accent,
  },
  ghost: {
    bg: 'transparent',
    hover: color.bg.neutral.sunken,
    fg: color.fg.neutral.default,
    border: 'transparent',
  },
  // BTN-109
  neutral: {
    bg: color.bg.neutral.default,
    hover: color.bg.neutral.subtle,
    fg: color.fg.neutral.default,
    border: color.border.default,
  },
};

const SIZES = {
  sm: { height: 36, px: '14px', gap: '6px', font: typography.label[400] },
  md: { height: 44, px: '20px', gap: '8px', font: typography.label[500] },
  lg: { height: 52, px: '24px', gap: '8px', font: typography.label[500] },
};

export type ButtonVariant = keyof typeof VARIANTS;
export type ButtonSize = keyof typeof SIZES;

export interface ButtonProps
  extends Omit<MuiButtonProps, 'variant' | 'size' | 'color' | 'loading'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** BTN-103：只對 outline／ghost 有效。 */
  tone?: 'danger';
  /** BTN-105 */
  loading?: boolean;
  /** BTN-106：要配 aria-label。 */
  iconOnly?: boolean;
  /** BTN-107：給了就會輸出 aria-pressed。 */
  selected?: boolean;
  /** BTN-110：0 或 undefined 不顯示。 */
  count?: number;
  countTone?: 'default' | 'warning';
}

export function Button({
  variant = 'primary',
  size = 'md',
  tone,
  loading = false,
  iconOnly = false,
  selected,
  count,
  countTone = 'default',
  children,
  onClick,
  sx,
  ...rest
}: ButtonProps) {
  const base = VARIANTS[variant];
  const redText =
    tone === 'danger' && (variant === 'outline' || variant === 'ghost');
  const v = redText
    ? {
        ...base,
        fg: color.fg.danger,
        hover: color.bg.danger.subtle,
        border: variant === 'outline' ? color.fg.danger : 'transparent',
      }
    : base;
  const s = SIZES[size];
  const flat = variant === 'neutral';

  if (
    process.env.NODE_ENV !== 'production' &&
    iconOnly &&
    !rest['aria-label']
  ) {
    console.warn('Button iconOnly 需要 aria-label（BTN-106）');
  }

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (loading) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };

  const opened = {
    bgcolor:
      variant === 'primary' ? color.bg.primary.hover : color.bg.primary.subtle,
    color:
      variant === 'primary' ? color.fg.onPrimary : color.brand.primary.subtle,
    borderColor: variant === 'primary' ? 'transparent' : color.border.accent,
  };

  return (
    <MuiButton
      disableElevation
      disableRipple
      {...rest}
      // loading、selected 有給才輸出；沒給時呼叫端自己寫的 aria-busy、aria-pressed 照樣保留。
      {...(loading ? { 'aria-busy': true } : {})}
      {...(selected === undefined ? {} : { 'aria-pressed': selected })}
      onClick={handleClick}
      sx={[
        {
          position: 'relative',
          gap: s.gap,
          minWidth: iconOnly ? s.height : 0,
          width: iconOnly ? s.height : undefined,
          minHeight: s.height,
          height: s.height,
          px: iconOnly ? 0 : s.px,
          ...s.font,
          whiteSpace: 'nowrap',
          // BTN-101
          borderRadius: `${radius.full}px`,
          border: `${flat ? 1 : 1.5}px solid ${v.border}`,
          bgcolor: v.bg,
          color: v.fg,
          boxShadow: variant === 'primary' ? shadow.sm : 'none',
          transition: `transform ${motion.transition.spring}, background-color ${motion.transition.fast}, box-shadow ${motion.transition.base}`,
          '& .MuiButton-startIcon, & .MuiButton-endIcon': { m: 0 },
          ...(flat && {
            '&:not([aria-expanded="true"]) .MuiButton-startIcon, &:not([aria-expanded="true"]) .MuiButton-endIcon':
              { color: color.fg.neutral.subtle },
          }),
          '&:hover': {
            bgcolor: v.hover,
            transform: flat ? 'none' : 'translateY(-2px)',
            boxShadow: variant === 'primary' ? shadow.md : 'none',
          },
          '&:active': { transform: flat ? 'none' : 'scale(0.97)' },
          // BTN-111
          '&[aria-expanded="true"], &[aria-expanded="true"]:hover': opened,
          '&[aria-expanded="true"] .WgButton-count:not(.WgButton-count--warning)':
            {
              bgcolor: color.bg.neutral.default,
            },
          // BTN-107
          '&[aria-pressed="true"], &[aria-pressed="true"]:hover': {
            bgcolor: color.bg.primary.subtle,
            color: color.brand.primary.subtle,
            borderColor: color.border.accent,
          },
          // BTN-104
          ...(size === 'sm' && {
            '&::after': {
              content: '""',
              position: 'absolute',
              left: 0,
              right: 0,
              top: '50%',
              height: 44,
              transform: 'translateY(-50%)',
            },
          }),
          // BTN-105
          '&[aria-busy="true"]': { cursor: 'progress' },
          '&[aria-busy="true"] .MuiButton-startIcon, &[aria-busy="true"] .MuiButton-endIcon':
            {
              visibility: 'hidden',
            },
          '&.Mui-disabled': {
            bgcolor: color.bg.disable,
            color: color.fg.disable,
            borderColor: 'transparent',
            boxShadow: 'none',
          },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Box
        component="span"
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: s.gap,
          visibility: loading ? 'hidden' : 'visible',
        }}
      >
        {children}
        {count ? (
          <Box
            component="span"
            className={
              countTone === 'warning'
                ? 'WgButton-count WgButton-count--warning'
                : 'WgButton-count'
            }
            sx={{
              minWidth: 18,
              height: 18,
              px: '5px',
              // 緊貼文字：離字 4px、離後面的箭頭 6px
              ml: '-4px',
              mr: '-2px',
              boxSizing: 'border-box',
              borderRadius: `${radius.full}px`,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              ...typography.data[300],
              fontWeight: 700,
              lineHeight: 1,
              bgcolor:
                countTone === 'warning'
                  ? color.bg.warning.default
                  : color.bg.primary.subtle,
              color:
                countTone === 'warning'
                  ? color.fg.onWarning
                  : color.brand.primary.subtle,
            }}
          >
            {count}
          </Box>
        ) : null}
      </Box>
      {loading ? (
        <CircularProgress
          aria-hidden
          color="inherit"
          size={18}
          thickness={5}
          sx={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            mt: '-9px',
            ml: '-9px',
          }}
        />
      ) : null}
    </MuiButton>
  );
}
