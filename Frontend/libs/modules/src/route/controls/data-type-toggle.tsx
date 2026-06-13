'use client';

import { ButtonBase, Stack, Typography } from '@mui/material';

import { SITE_DATA_TYPES, SITE_DATA_TYPE_LABELS } from '../constants';
import type { RescueMapDataType } from '../types';
import { SiteControlSurface } from './control-surface';

interface SiteDataTypeToggleProps {
  value: RescueMapDataType;
  onChange: (next: RescueMapDataType) => void;
}

/**
 * 站點 / 任務 維度切換。一次只顯示一種維度，地圖與列表模組共用。
 */
export function SiteDataTypeToggle({
  value,
  onChange,
}: SiteDataTypeToggleProps) {
  return (
    <SiteControlSurface
      sx={{ display: 'inline-flex', alignItems: 'center', p: '5px' }}
    >
      <Stack direction="row" spacing={0.5}>
        {SITE_DATA_TYPES.map((dataType) => {
          const active = dataType === value;

          return (
            <ButtonBase
              key={dataType}
              disableRipple
              aria-pressed={active}
              onClick={() => onChange(dataType)}
              sx={{
                borderRadius: 999,
                bgcolor: active ? '#D8F2FF' : 'transparent',
                border: active ? '1px solid #8ED8F8' : '1px solid transparent',
                color: active ? '#151c22' : '#564337',
                px: 2,
                py: '6px',
              }}
            >
              <Typography
                sx={{
                  fontSize: 12,
                  fontWeight: 700,
                  lineHeight: '16px',
                  whiteSpace: 'nowrap',
                }}
              >
                {SITE_DATA_TYPE_LABELS[dataType]}
              </Typography>
            </ButtonBase>
          );
        })}
      </Stack>
    </SiteControlSurface>
  );
}
