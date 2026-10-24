'use client';

import { Badge, type BadgeTone } from '@rescue-frontend/ui';

import {
  ROLE_DISPLAY_NAMES,
  TEAM_TYPE_DISPLAY_NAMES,
} from '../../constants/roles';
import type { PlatformKey, TeamRole } from './roster';

/** Labels come from `constants/roles`; tones follow the prototype's `wg-terms.js`. */
const PLATFORM: Record<PlatformKey, { label: string; tone: BadgeTone }> = {
  super_admin: {
    label: ROLE_DISPLAY_NAMES.get('super_admin') ?? 'super_admin',
    tone: 'primary',
  },
  data_auditor: {
    label: ROLE_DISPLAY_NAMES.get('data_auditor') ?? 'data_auditor',
    tone: 'warning',
  },
  gov: {
    label: TEAM_TYPE_DISPLAY_NAMES.get('gov') ?? 'gov',
    tone: 'secondary',
  },
  ngo: { label: TEAM_TYPE_DISPLAY_NAMES.get('ngo') ?? 'ngo', tone: 'info' },
  user: { label: ROLE_DISPLAY_NAMES.get('user') ?? 'user', tone: 'neutral' },
};

export function platformLabel(platform: PlatformKey) {
  return PLATFORM[platform].label;
}

export function PlatformBadge({ platform }: { platform: PlatformKey }) {
  const { label, tone } = PLATFORM[platform];
  // A super admin is the one role the prototype fills in, so it stands out in a column of them.
  return (
    <Badge
      tone={tone}
      variant={platform === 'super_admin' ? 'solid' : 'subtle'}
    >
      {label}
    </Badge>
  );
}

/**
 * Only where a column heading names the team: a team role is never shown on its own elsewhere
 * (`wg-terms.js`, 2026-08-17) — use `identityLabel` for that.
 */
export function TeamRoleBadge({ role }: { role: TeamRole }) {
  return (
    <Badge tone={role === 'admin' ? 'primary' : 'neutral'}>
      {ROLE_DISPLAY_NAMES.get(role) ?? role}
    </Badge>
  );
}

export function TeamTypeBadge({ type }: { type: string }) {
  return (
    <Badge tone={type === 'gov' ? 'secondary' : 'info'}>
      {TEAM_TYPE_DISPLAY_NAMES.get(type) ?? type}
    </Badge>
  );
}

const TEAM_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  active: { label: '運作中', tone: 'success' },
  suspended: { label: '已暫停', tone: 'danger' },
};

export function TeamStatusBadge({ status }: { status: string }) {
  const { label, tone } = TEAM_STATUS[status] ?? TEAM_STATUS.active;
  return (
    <Badge tone={tone} variant={status === 'suspended' ? 'solid' : 'subtle'}>
      {label}
    </Badge>
  );
}
