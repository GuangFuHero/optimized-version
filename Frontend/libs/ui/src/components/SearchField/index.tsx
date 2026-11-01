'use client';

/**
 * SearchField —— 工具列的搜尋框。設計稿：Design/後台/元件 Components.html 第 4 節。
 *
 * INP-103 搜尋框是膠囊、44px（sm 36px），跟旁邊的按鈕同形同高。
 *   它住在工具列、旁邊都是按鈕，所以跟按鈕同一家。
 *   ❌ 表單裡的欄位（手機、驗證碼、地址）不要用這個：那些用一般輸入框，radius.md（12px）。
 * 寬度建議 flex: '1 1 180px'，minWidth 180、maxWidth 320：工具列放不下時先縮搜尋框，不要把「新增」擠到第二行。
 * 字一律 16px（iOS 小於 16px 會整頁放大）。
 */

import { InputBase, type InputBaseProps } from '@mui/material';
import { Search } from 'lucide-react';

import { designTokens } from '../../theme';

const { color, radius, typography } = designTokens;

export interface SearchFieldProps
  extends Omit<InputBaseProps, 'size' | 'startAdornment' | 'type'> {
  size?: 'sm' | 'md';
}

export function SearchField({ size = 'md', sx, ...rest }: SearchFieldProps) {
  const small = size === 'sm';

  return (
    <InputBase
      type="search"
      startAdornment={
        <Search size={17} color={color.fg.neutral.muted} aria-hidden />
      }
      {...rest}
      sx={[
        {
          height: small ? 36 : 44,
          px: small ? '12px' : '16px',
          gap: '8px',
          boxSizing: 'border-box',
          borderRadius: `${radius.full}px`,
          bgcolor: color.bg.neutral.subtle,
          boxShadow: `inset 0 0 0 1px ${color.border.default}`,
          ...typography.body[400],
          color: color.fg.neutral.default,
          '&.Mui-focused': {
            boxShadow: `inset 0 0 0 1.5px ${color.brand.secondary.default}`,
          },
          '& input': { p: 0, height: '100%' },
          '& input::placeholder': { color: color.fg.neutral.muted, opacity: 1 },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    />
  );
}
