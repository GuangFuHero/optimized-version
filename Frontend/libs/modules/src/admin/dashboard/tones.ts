import { designTokens } from '@rescue-frontend/ui';

import type { DashboardKpiAccent } from './kpis';

const { color } = designTokens;

/**
 * A card's left bar, and the colour of a chart drawn for one card, by token role — `kpis.ts` and
 * `charts.ts` name the role, this file resolves it.
 */
export const ACCENT_COLORS: Record<DashboardKpiAccent, string> = {
  primary: color.bg.primary.default,
  secondary: color.bg.secondary.default,
  success: color.bg.success.default,
  warning: color.bg.warning.default,
  muted: color.fg.neutral.muted,
};
