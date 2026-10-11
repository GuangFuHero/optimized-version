'use client';

import AssignmentRoundedIcon from '@mui/icons-material/AssignmentRounded';
import Inventory2RoundedIcon from '@mui/icons-material/Inventory2Rounded';
import { ButtonBase, Stack } from '@mui/material';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

import { SITE_DATA_TYPES, SITE_DATA_TYPE_LABELS } from '../constants';
import type { RescueMapDataType } from '../types';
import { SiteControlSurface } from './control-surface';

const { color, radius, spacing, typography, motion } = designTokens;

const DATA_TYPE_ICONS: Record<RescueMapDataType, typeof AssignmentRoundedIcon> = {
  station: Inventory2RoundedIcon,
  ticket: AssignmentRoundedIcon,
};

/**
 * Selected segment carries a visible border, not just a fill. On a map the pill sits over
 * arbitrary terrain, and fill alone stops reading as "selected" once the tiles behind it are busy.
 */
function segmentSx(active: boolean) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: `${spacing[1]}px`,
    minHeight: 30,
    px: 2,
    py: '6px',
    border: `1px solid ${active ? color.brand.secondary.default : 'transparent'}`,
    borderRadius: `${radius.full}px`,
    background: active ? color.bg.secondary.subtle : 'transparent',
    color: active ? color.fg.neutral.default : color.fg.neutral.subtle,
    fontFamily: typography.label[400].fontFamily,
    fontSize: displayTextSize[14],
    lineHeight: 1.33,
    fontWeight: 700,
    whiteSpace: 'nowrap',
    transition: `background ${motion.transition.fast}, color ${motion.transition.fast}`,
  } as const;
}

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
      <Stack
        direction="row"
        spacing={0.5}
        role="group"
        aria-label="資料維度"
      >
        {SITE_DATA_TYPES.map((dataType) => {
          const active = dataType === value;
          const Icon = DATA_TYPE_ICONS[dataType];

          return (
            <ButtonBase
              key={dataType}
              disableRipple
              aria-pressed={active}
              onClick={() => onChange(dataType)}
              sx={segmentSx(active)}
            >
              <Icon sx={{ fontSize: 14 }} />
              {SITE_DATA_TYPE_LABELS[dataType]}
            </ButtonBase>
          );
        })}
      </Stack>
    </SiteControlSurface>
  );
}
