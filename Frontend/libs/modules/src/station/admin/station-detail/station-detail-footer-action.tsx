'use client';

import { Box, ButtonBase, Typography } from '@mui/material';

import { useStationDetailColorScheme } from './constants';
import { StationDetailIconSlot } from './station-detail-primitives';
import type { StationDetailActionProps } from './types';

export interface StationDetailFooterActionProps {
  actions?: readonly (StationDetailActionProps | undefined)[];
}

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
            <ButtonBase
              key={action.label}
              disableRipple
              aria-label={action.ariaLabel ?? action.label}
              onClick={action.onClick}
              sx={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1,
                px: 1,
                py: '9px',
                borderRadius: 0,
                bgcolor: stationDetailPalette.editActionBackground,
                border: `1px solid ${stationDetailPalette.border}`,
                color: stationDetailPalette.editActionText,
                '&:hover': {
                  bgcolor: stationDetailPalette.editActionHover,
                },
              }}
            >
              <StationDetailIconSlot
                icon={action.icon}
                width={14}
                height={14}
                color={stationDetailPalette.editActionText}
              />
              <Typography
                sx={{
                  color: 'inherit',
                  fontSize: 12,
                  lineHeight: '16px',
                  fontWeight: 600,
                  letterSpacing: '0.6px',
                  textAlign: 'center',
                }}
              >
                {action.label}
              </Typography>
            </ButtonBase>
          ))}
        </Box>
      ) : null}

      {blockActions.length > 0 ? (
        <Box sx={{ display: 'grid', gap: 2, mt: inlineActions.length ? 2 : 0 }}>
          {blockActions.map((action) => (
            <ButtonBase
              key={action.label}
              disableRipple
              aria-label={action.ariaLabel ?? action.label}
              onClick={action.onClick}
              sx={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1,
                px: 1,
                py: '9px',
                borderRadius: 0,
                border: `1px solid ${stationDetailPalette.destructiveActionBorder}`,
                color: stationDetailPalette.destructiveActionText,
                '&:hover': {
                  bgcolor: stationDetailPalette.destructiveActionHover,
                },
              }}
            >
              <StationDetailIconSlot
                icon={action.icon}
                width={14}
                height={14}
                color={stationDetailPalette.destructiveActionText}
              />
              <Typography
                sx={{
                  color: 'inherit',
                  fontSize: 12,
                  lineHeight: '16px',
                  fontWeight: 600,
                  letterSpacing: '0.6px',
                  textAlign: 'center',
                }}
              >
                {action.label}
              </Typography>
            </ButtonBase>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}
