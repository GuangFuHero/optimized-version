import {
  Box,
  FormControlLabel,
  Radio,
  RadioGroup,
  Typography,
} from '@mui/material';
import { designTokens } from '@rescue-frontend/ui';
import type { ReactNode } from 'react';

const { color, radius, shadow, typography } = designTokens;

export type ExportFormat = 'csv' | 'xlsx';

export const EXPORT_FORMATS: { value: ExportFormat; label: string }[] = [
  { value: 'csv', label: 'CSV' },
  { value: 'xlsx', label: 'Excel' },
];

/** The 匯出 popover's paper: a raised card under the button. */
export const exportPaperSx = {
  mt: '8px',
  borderRadius: `${radius.lg}px`,
  boxShadow: shadow.lg,
  border: `1px solid ${color.border.default}`,
};

/** A bordered radio choice; the checked one takes the primary subtle fill. */
export function exportOptionSx(active: boolean) {
  return {
    m: 0,
    pr: '12px',
    borderRadius: `${radius.md}px`,
    border: `1px solid ${active ? color.bg.primary.default : color.border.default}`,
    bgcolor: active ? color.bg.primary.subtle : color.bg.neutral.default,
    '& .MuiRadio-root': { p: '7px', ml: '3px' },
  };
}

export function ExportSectionLabel({ children }: { children: ReactNode }) {
  return (
    <Typography sx={{ ...typography.label[400], flexShrink: 0 }}>
      {children}
    </Typography>
  );
}

/** 格式: CSV or Excel, as a row of bordered radios. */
export function ExportFormatChoice({
  value,
  onChange,
}: {
  value: ExportFormat;
  onChange: (format: ExportFormat) => void;
}) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <ExportSectionLabel>格式</ExportSectionLabel>
      <RadioGroup
        row
        aria-label="格式"
        value={value}
        onChange={(e) => onChange(e.target.value as ExportFormat)}
        sx={{ gap: '8px' }}
      >
        {EXPORT_FORMATS.map((option) => (
          <FormControlLabel
            key={option.value}
            value={option.value}
            control={<Radio size="small" />}
            label={option.label}
            sx={[
              exportOptionSx(value === option.value),
              {
                pr: '16px',
                '& .MuiFormControlLabel-label': {
                  ...typography.body[300],
                  color: color.fg.neutral.default,
                },
              },
            ]}
          />
        ))}
      </RadioGroup>
    </Box>
  );
}
