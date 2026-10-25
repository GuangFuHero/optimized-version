'use client';

import { Box } from '@mui/material';

import { designTokens, RowAction } from '@rescue-frontend/ui';

import { useStationDetailColorScheme } from './constants';
import { StationDetailIconSlot } from './station-detail-primitives';
import type { StationDetailActionProps } from './types';

const { iconSize } = designTokens;

export interface StationDetailFooterActionProps {
  actions?: readonly (StationDetailActionProps | undefined)[];
}

/**
 * The drawer's foot. Its buttons are `RowAction`s, the pill a list row's 分享 is, so the same action
 * takes the same shape in the list and in the drawer (visual alignment item 1, 2026-10-25).
 */
export function StationDetailFooterAction({
  actions = [],
}: StationDetailFooterActionProps) {
  const stationDetailPalette = useStationDetailColorScheme();
  const availableActions = actions.filter(
    (action): action is StationDetailActionProps => Boolean(action),
  );
  const inlineActions = availableActions.filter(
    (action) => action.placement !== 'block' && action.intent !== 'danger',
  );
  const blockActions = availableActions.filter(
    (action) => action.placement === 'block' || action.intent === 'danger',
  );

  if (availableActions.length === 0) {
    return null;
  }

  return (
    <Box
      sx={{
        width: '100%',
        px: 2.5,
        pt: 2,
        pb: 2.25,
        bgcolor: stationDetailPalette.footerSurface,
        borderTop: `1px solid ${stationDetailPalette.border}`,
      }}
    >
      {inlineActions.length > 0 ? (
        <Box sx={{ display: 'flex', alignItems: 'stretch', gap: 1.5 }}>
          {inlineActions.map((action) => (
            <RowAction
              key={action.label}
              aria-label={action.ariaLabel ?? action.label}
              onClick={action.onClick}
              icon={
                <StationDetailIconSlot
                  icon={action.icon}
                  width={iconSize.sm}
                  height={iconSize.sm}
                  color="currentColor"
                />
              }
              label={action.label}
              sx={{ flex: 1, minWidth: 0, justifyContent: 'center' }}
            />
          ))}
        </Box>
      ) : null}

      {blockActions.length > 0 ? (
        <Box sx={{ display: 'grid', gap: 2, mt: inlineActions.length ? 2 : 0 }}>
          {blockActions.map((action) => (
            <RowAction
              key={action.label}
              tone="danger"
              aria-label={action.ariaLabel ?? action.label}
              onClick={action.onClick}
              icon={
                <StationDetailIconSlot
                  icon={action.icon}
                  width={iconSize.sm}
                  height={iconSize.sm}
                  color="currentColor"
                />
              }
              label={action.label}
              sx={{ width: '100%', justifyContent: 'center' }}
            />
          ))}
        </Box>
      ) : null}
    </Box>
  );
}
