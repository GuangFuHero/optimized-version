'use client';

import AssignmentRoundedIcon from '@mui/icons-material/AssignmentRounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import Inventory2RoundedIcon from '@mui/icons-material/Inventory2Rounded';
import MedicalServicesRoundedIcon from '@mui/icons-material/MedicalServicesRounded';
import SupportRoundedIcon from '@mui/icons-material/SupportRounded';
import { Box } from '@mui/material';

import { designTokens } from '@rescue-frontend/ui';

const { color, radius } = designTokens;

/** A glyph for each `task_type` that `formatTicketTypeLabel` names; anything else gets a clipboard. */
const NEED_TYPE_ICONS: Record<string, typeof AssignmentRoundedIcon> = {
  rescue: SupportRoundedIcon,
  hr: GroupsRoundedIcon,
  supply: Inventory2RoundedIcon,
  medical: MedicalServicesRoundedIcon,
};

export function needTypeIcon(taskType: string) {
  return NEED_TYPE_ICONS[taskType.trim().toLowerCase()] ?? AssignmentRoundedIcon;
}

interface NeedProgressBarProps {
  /** 0–1, from `formatNeedQuota`. */
  fraction: number;
  full: boolean;
  /** px — the drawer's rows are roomier than the list's lines. */
  height: number;
}

export function NeedProgressBar({ fraction, full, height }: NeedProgressBarProps) {
  return (
    <Box
      sx={{
        height,
        borderRadius: `${radius.full}px`,
        bgcolor: color.bg.neutral.sunken,
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          width: `${Math.round(fraction * 100)}%`,
          height: '100%',
          borderRadius: `${radius.full}px`,
          bgcolor: full ? color.bg.success.default : color.bg.primary.default,
        }}
      />
    </Box>
  );
}
