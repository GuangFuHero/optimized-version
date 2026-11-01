'use client';

/**
 * SplitButton —— 「新增站點 ▾」「新增任務 ▾」。設計稿：Design/後台/元件 Components.html 第 3 節。
 *
 * BTN-112 左右兩塊中間留 2px；外側膠囊、相接那一側小圓角 radius.sm（6px）。
 *         選單打開時右邊那塊變成整顆圓（Material 3 拆分按鈕的做法）、深一階的橘，分隔線不見是預期的。
 *         選單白色實心，不用 theme 的毛玻璃 Paper；選項 44px、14px 字、padding 0 12px、圖示跟字距 8px。
 *   ⚠️ 外側半徑用「高度的一半」，不要用 radius.full（9999）：同一顆上 9999 和 6 加起來超過寬度時，
 *      瀏覽器會把四個角按比例一起縮，6px 會被縮到幾乎 0，接縫看起來是方的。
 *   ⚠️ 用 class 選，不要用 :first-child／:last-child —— 選單打開後後面會多出節點。
 * 主體點了直接做最常用的事（新增一筆）；箭頭才開選單（匯入）。
 *   ❌ 不要把主體改成開選單：最常用的動作會多一次點擊。
 * 沒有 items（例：沒有匯入權限）→ 只剩一顆一般按鈕，連箭頭都不 render。
 */

import { Box, Menu, MenuItem } from '@mui/material';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { type ReactNode, useId, useRef, useState } from 'react';

import { designTokens } from '../../theme';
import { Button, type ButtonSize } from '../Button';

const { color, radius, typography } = designTokens;

const HALF_HEIGHT: Record<ButtonSize, number> = { sm: 18, md: 22, lg: 26 };

export interface SplitButtonItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
}

export interface SplitButtonProps {
  label: ReactNode;
  startIcon?: ReactNode;
  onClick: () => void;
  /** 選單項目。沒給或空陣列 → 一般按鈕。 */
  items?: readonly SplitButtonItem[];
  /** 箭頭的 aria-label */
  menuLabel?: string;
  size?: ButtonSize;
  disabled?: boolean;
}

export function SplitButton({
  label,
  startIcon,
  onClick,
  items,
  menuLabel = '更多新增方式',
  size = 'md',
  disabled = false,
}: SplitButtonProps) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const menuId = useId();

  if (!items || items.length === 0) {
    return (
      <Button
        size={size}
        startIcon={startIcon}
        onClick={onClick}
        disabled={disabled}
      >
        {label}
      </Button>
    );
  }

  const half = HALF_HEIGHT[size];

  return (
    <Box
      ref={anchorRef}
      sx={{
        display: 'inline-flex',
        gap: '2px',
        '& > .WgSplit-main': {
          borderRadius: `${half}px ${radius.sm}px ${radius.sm}px ${half}px`,
        },
        '& > .WgSplit-arrow': {
          borderRadius: `${radius.sm}px ${half}px ${half}px ${radius.sm}px`,
        },
        '& > .WgSplit-arrow[aria-expanded="true"]': {
          borderRadius: `${half}px`,
        },
        // 兩塊是一個整體，不各自上浮。&& 讓這條贏過 Button 自己的 :hover:not([aria-busy])。
        '&& > .MuiButton-root:hover, && > .MuiButton-root:active': {
          transform: 'none',
        },
      }}
    >
      <Button
        className="WgSplit-main"
        size={size}
        startIcon={startIcon}
        onClick={onClick}
        disabled={disabled}
      >
        {label}
      </Button>
      <Button
        className="WgSplit-arrow"
        size={size}
        iconOnly
        aria-label={menuLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? (
          <ChevronUp size={18} aria-hidden />
        ) : (
          <ChevronDown size={18} aria-hidden />
        )}
      </Button>
      <Menu
        id={menuId}
        anchorEl={anchorRef.current}
        open={open}
        onClose={() => setOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            // 白色實心（BTN-112），蓋掉 theme Paper 的毛玻璃；框線和陰影 theme 的 MuiMenu 已經給了。
            sx: {
              mt: '6px',
              minWidth: 220,
              borderRadius: `${radius.md}px`,
              background: color.bg.neutral.default,
              backdropFilter: 'none',
              WebkitBackdropFilter: 'none',
            },
          },
        }}
      >
        {items.map((item) => (
          <MenuItem
            key={item.label}
            onClick={() => {
              setOpen(false);
              item.onClick();
            }}
            sx={(theme) => ({
              gap: '8px',
              minHeight: 44,
              // MenuItem 在 600px 以上把 minHeight 設回 auto，同一個斷點再設一次才會是 44px。
              [theme.breakpoints.up('sm')]: { minHeight: 44 },
              mx: '6px',
              px: '12px',
              py: 0,
              borderRadius: `${radius.sm}px`,
              ...typography.label[400],
              fontWeight: 400,
              color: color.fg.neutral.default,
              '& > svg': { flexShrink: 0 },
            })}
          >
            {item.icon}
            {item.label}
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
}
