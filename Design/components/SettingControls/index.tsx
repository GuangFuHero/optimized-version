'use client';

/**
 * SettingRow／RadioCards／NativeSelect —— 設定頁的列與控制項。設計稿：Design/後台/元件 Components.html 第 5 節。
 *
 * SET-101 一列一件事：左邊名稱＋一句說明、右邊控制項（stack＝控制項太寬時上下排）。
 * SET-102 一按就生效的用 Switch（公開到前台）；要按「儲存」才生效的用 Checkbox（這次用哪幾種災害）。
 *         兩種不要混在同一個表單裡，不然使用者分不出哪些已經生效。
 * SET-103 2〜5 個互斥選項、需要一句說明 → RadioCards；6 個以上或選項很長 → NativeSelect。
 * SET-104 NativeSelect 跟輸入框同一家：radius.md（12px）、44px 高、原生 <select>
 *         （手機會跳系統滾輪，字 16px 以免 iOS 放大）。RadioCards 也是 12px。
 */

import { Box } from '@mui/material';
import { ChevronDown } from 'lucide-react';
import { type ChangeEvent, type ReactNode } from 'react';

import { designTokens, IOS_NO_ZOOM_INPUT_PX } from '../../theme';

const { color, radius, typography } = designTokens;

export interface SettingRowProps {
  title: ReactNode;
  description?: ReactNode;
  stack?: boolean;
  children: ReactNode;
}

export function SettingRow({ title, description, stack = false, children }: SettingRowProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: stack ? 'column' : 'row',
        alignItems: stack ? 'stretch' : 'center',
        gap: stack ? '10px' : '16px',
        py: '14px',
        borderBottom: `1px solid ${color.border.default}`,
        '&:last-of-type': { borderBottom: 0 },
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ ...typography.label[400], color: color.fg.neutral.default }}>{title}</Box>
        {description ? (
          <Box sx={{ ...typography.data[300], color: color.fg.neutral.subtle, mt: '2px' }}>{description}</Box>
        ) : null}
      </Box>
      {children}
    </Box>
  );
}

export interface RadioCardOption<T extends string> {
  value: T;
  title: ReactNode;
  description?: ReactNode;
}

export interface RadioCardsProps<T extends string> {
  name: string;
  value: T;
  options: readonly RadioCardOption<T>[];
  onChange: (value: T) => void;
}

export function RadioCards<T extends string>({ name, value, options, onChange }: RadioCardsProps<T>) {
  return (
    <Box
      role="radiogroup"
      sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px' }}
    >
      {options.map((option) => {
        const checked = option.value === value;

        return (
          <Box
            component="label"
            key={option.value}
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              p: '12px 14px',
              borderRadius: `${radius.md}px`,
              cursor: 'pointer',
              bgcolor: checked ? color.bg.primary.subtle : color.bg.neutral.default,
              boxShadow: checked
                ? `inset 0 0 0 1.5px ${color.border.accent}`
                : `inset 0 0 0 1px ${color.border.default}`,
              '&:has(input:focus-visible)': {
                outline: `3px solid ${color.brand.secondary.default}`,
                outlineOffset: '2px',
              },
            }}
          >
            <Box
              component="input"
              type="radio"
              name={name}
              checked={checked}
              onChange={() => onChange(option.value)}
              sx={{ m: '2px 0 0', width: 18, height: 18, flexShrink: 0, accentColor: color.bg.primary.default }}
            />
            <span>
              <Box sx={{ ...typography.label[400], color: color.fg.neutral.default }}>{option.title}</Box>
              {option.description ? (
                <Box sx={{ ...typography.data[300], color: color.fg.neutral.subtle, mt: '2px' }}>
                  {option.description}
                </Box>
              ) : null}
            </span>
          </Box>
        );
      })}
    </Box>
  );
}

export interface NativeSelectProps {
  options: readonly (readonly [value: string, label: string])[];
  value?: string;
  defaultValue?: string;
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
  disabled?: boolean;
  id?: string;
  name?: string;
  'aria-label'?: string;
  minWidth?: number;
}

export function NativeSelect({ options, minWidth = 180, ...selectProps }: NativeSelectProps) {
  return (
    <Box component="span" sx={{ position: 'relative', display: 'inline-flex', minWidth }}>
      <Box
        component="select"
        {...selectProps}
        sx={{
          appearance: 'none',
          width: '100%',
          height: 44,
          p: '0 40px 0 14px',
          boxSizing: 'border-box',
          border: 0,
          borderRadius: `${radius.md}px`,
          bgcolor: color.bg.neutral.subtle,
          boxShadow: `inset 0 0 0 1px ${color.border.default}`,
          ...typography.body[400],
          fontSize: IOS_NO_ZOOM_INPUT_PX,
          color: color.fg.neutral.default,
          cursor: 'pointer',
          '&:focus-visible': { outline: 'none', boxShadow: `inset 0 0 0 1.5px ${color.brand.secondary.default}` },
          '&:disabled': { bgcolor: color.bg.disable, color: color.fg.disable, cursor: 'not-allowed' },
        }}
      >
        {options.map(([optionValue, label]) => (
          <option key={optionValue} value={optionValue}>
            {label}
          </option>
        ))}
      </Box>
      <Box
        component="span"
        aria-hidden
        sx={{
          position: 'absolute',
          right: 12,
          top: '50%',
          transform: 'translateY(-50%)',
          pointerEvents: 'none',
          color: color.fg.neutral.muted,
          display: 'inline-flex',
        }}
      >
        <ChevronDown size={18} />
      </Box>
    </Box>
  );
}
