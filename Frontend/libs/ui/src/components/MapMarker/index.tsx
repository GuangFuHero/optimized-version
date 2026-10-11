import { Building2 } from 'lucide-react';
import { Box, Stack } from '@mui/material';
import type { ReactNode } from 'react';

import { designTokens, withAlpha } from '../../theme';

const { color, radius, shadow, typography, motion } = designTokens;

export type MapMarkerTone = 'ticket' | 'station';

const TONES: Record<
  MapMarkerTone,
  { fill: string; glyph: string; labelBorder: string }
> = {
  ticket: {
    fill: color.bg.primary.default,
    glyph: color.fg.onPrimary,
    labelBorder: color.border.accent,
  },
  station: {
    fill: color.brand.secondary.default,
    glyph: color.fg.onSecondary,
    labelBorder: color.brand.secondary.default,
  },
};

const springTransition = `transform ${motion.transition.spring}, box-shadow ${motion.transition.spring}`;

function MapMarkerLabel({
  tone,
  children,
}: {
  tone: MapMarkerTone;
  children: ReactNode;
}) {
  return (
    <Box
      component="span"
      sx={{
        maxWidth: 168,
        p: '3px 10px',
        borderRadius: `${radius.full}px`,
        bgcolor: color.bg.neutral.default,
        border: `1px solid ${TONES[tone].labelBorder}`,
        boxShadow: shadow.sm,
        fontFamily: typography.label[400].fontFamily,
        fontSize: 11,
        fontWeight: 700,
        lineHeight: 1.35,
        color: color.fg.neutral.default,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {children}
    </Box>
  );
}

export interface MapPinProps {
  tone: MapMarkerTone;
  icon: ReactNode;
  label?: ReactNode;
  active?: boolean;
}

export function MapPin({ tone, icon, label, active = false }: MapPinProps) {
  const t = TONES[tone];

  return (
    <Stack sx={{ alignItems: 'center', gap: '4px' }}>
      <Box
        sx={{
          display: 'grid',
          placeItems: 'center',
          width: 36,
          height: 36,
          boxSizing: 'border-box',
          borderRadius: `${radius.full}px`,
          border: `2px solid ${color.bg.neutral.default}`,
          bgcolor: t.fill,
          color: t.glyph,
          boxShadow: active ? shadow.lg : shadow.md,
          transform: active ? 'scale(1.18)' : 'none',
          outline: active
            ? `3px solid ${color.brand.secondary.default}`
            : 'none',
          outlineOffset: 2,
          transition: springTransition,
          '&:hover': active
            ? undefined
            : { transform: 'translateY(-2px) scale(1.06)' },
          '& .MuiSvgIcon-root, & .lucide': {
            width: 19,
            height: 19,
            fontSize: 19,
          },
        }}
      >
        {icon}
      </Box>
      {label ? <MapMarkerLabel tone={tone}>{label}</MapMarkerLabel> : null}
    </Stack>
  );
}

export interface MapClusterMarkerProps {
  count: number;
  tone?: MapMarkerTone;
}

export function MapClusterMarker({
  count,
  tone = 'ticket',
}: MapClusterMarkerProps) {
  const t = TONES[tone];
  const [size, fontSize] =
    count >= 100 ? [58, 15] : count >= 10 ? [50, 14] : [42, 13];

  return (
    <Box
      sx={{
        display: 'grid',
        placeItems: 'center',
        width: size,
        height: size,
        boxSizing: 'border-box',
        borderRadius: `${radius.full}px`,
        border: `3px solid ${color.bg.neutral.default}`,
        bgcolor: t.fill,
        color: t.glyph,
        boxShadow: shadow.lg,
        fontFamily: typography.data[400].fontFamily,
        fontSize,
        fontWeight: 800,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {count}
    </Box>
  );
}

export interface MapCellLabelProps {
  count: number;
  unit?: ReactNode;
  active?: boolean;
}

export function MapCellLabel({
  count,
  unit = '求助',
  active = false,
}: MapCellLabelProps) {
  return (
    <Stack
      direction="row"
      sx={{
        alignItems: 'baseline',
        gap: '4px',
        color: color.fg.inverse,
        fontWeight: 800,
        lineHeight: 1,
        whiteSpace: 'nowrap',
        transform: active ? 'scale(1.12)' : 'none',
        transition: springTransition,
        '&:hover': active ? undefined : { transform: 'scale(1.06)' },
      }}
    >
      <Box
        component="span"
        sx={{ fontFamily: typography.data[400].fontFamily, fontSize: 24 }}
      >
        {count}
      </Box>
      <Box
        component="span"
        sx={{ fontFamily: typography.body[400].fontFamily, fontSize: 14 }}
      >
        {unit}
      </Box>
    </Stack>
  );
}

export interface MapBuildingMarkerProps {
  count: number;
  lacking?: number;
  label?: ReactNode;
  active?: boolean;
}

export function MapBuildingMarker({
  count,
  lacking = 0,
  label,
  active = false,
}: MapBuildingMarkerProps) {
  return (
    <Stack sx={{ alignItems: 'center', gap: '4px' }}>
      <Stack
        direction="row"
        sx={{
          alignItems: 'center',
          gap: '6px',
          p: '6px 10px',
          borderRadius: `${radius.sm}px`,
          bgcolor: color.bg.neutral.default,
          border: `2px solid ${active ? color.brand.secondary.default : color.bg.primary.default}`,
          boxShadow: shadow.md,
          color: color.fg.neutral.default,
          transform: active ? 'scale(1.06)' : 'none',
          transition: springTransition,
          '&:hover': active ? undefined : { transform: 'scale(1.04)' },
        }}
      >
        <Box component={Building2} sx={{ width: 18, height: 18 }} />
        <Box
          component="span"
          sx={{
            fontFamily: typography.data[400].fontFamily,
            fontSize: 13,
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          {count} 件
        </Box>
        {lacking > 0 ? (
          <Box
            component="span"
            sx={{
              p: '2px 6px',
              borderRadius: `${radius.full}px`,
              bgcolor: color.bg.danger.default,
              color: color.fg.onDanger,
              fontFamily: typography.data[400].fontFamily,
              fontSize: 11,
              fontWeight: 700,
              lineHeight: 1.3,
            }}
          >
            缺 {lacking}
          </Box>
        ) : null}
      </Stack>
      {label ? <MapMarkerLabel tone="ticket">{label}</MapMarkerLabel> : null}
    </Stack>
  );
}

export type MapTicketPriority = 'critical' | 'high' | 'medium' | 'low';

const PRIORITY_FILL: Record<MapTicketPriority, string> = {
  critical: color.bg.danger.default,
  high: color.bg.warning.default,
  medium: color.brand.secondary.default,
  low: color.fg.neutral.muted,
};

const DOT_SHADOW = '0 1px 4px rgba(15, 23, 42, 0.45)';

export interface MapTicketDotProps {
  priority: MapTicketPriority;
  approximate?: boolean;
  selected?: boolean;
  dimmed?: boolean;
}

export function MapTicketDot({
  priority,
  approximate = false,
  selected = false,
  dimmed = false,
}: MapTicketDotProps) {
  const size = approximate ? 11 : 14;

  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: `${radius.full}px`,
        bgcolor: PRIORITY_FILL[priority],
        boxShadow: selected
          ? `0 0 0 2px ${color.bg.neutral.default}, 0 0 0 4px ${color.fg.neutral.default}`
          : `0 0 0 2px ${color.bg.neutral.default}, ${DOT_SHADOW}`,
        opacity: dimmed ? 0.22 : 1,
      }}
    />
  );
}

export interface MapStationSquareProps {
  icon: ReactNode;
  dimmed?: boolean;
}

export function MapStationSquare({
  icon,
  dimmed = false,
}: MapStationSquareProps) {
  return (
    <Box
      sx={{
        display: 'grid',
        placeItems: 'center',
        width: 24,
        height: 24,
        boxSizing: 'border-box',
        borderRadius: '7px',
        bgcolor: color.fg.neutral.default,
        border: `2px solid ${color.bg.neutral.default}`,
        boxShadow: '0 2px 7px rgba(15, 23, 42, 0.4)',
        color: color.fg.inverse,
        opacity: dimmed ? 0.3 : 1,
        '& .MuiSvgIcon-root, & .lucide': {
          width: 13,
          height: 13,
          fontSize: 13,
        },
      }}
    >
      {icon}
    </Box>
  );
}

export interface MapZoneLabelProps {
  name: ReactNode;
  detail?: ReactNode;
  zoneColor?: string;
  hazard?: boolean;
  selected?: boolean;
  dimmed?: boolean;
}

export function MapZoneLabel({
  name,
  detail,
  zoneColor,
  hazard = false,
  selected = false,
  dimmed = false,
}: MapZoneLabelProps) {
  const border = hazard
    ? color.bg.warning.hover
    : (zoneColor ?? color.border.default);
  const detailText = detail ?? (hazard ? '危險區' : undefined);

  return (
    <Stack
      direction="row"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '7px',
        p: '5px 11px 5px 8px',
        borderRadius: '8px',
        bgcolor: color.bg.neutral.default,
        color: color.fg.neutral.default,
        border: `${selected ? 2 : 1.5}px solid ${border}`,
        boxShadow: '0 2px 10px rgba(15, 23, 42, 0.22)',
        fontFamily: typography.body[400].fontFamily,
        fontSize: 13,
        fontWeight: 700,
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
        opacity: dimmed ? 0.55 : 1,
      }}
    >
      <Box
        sx={{
          width: 12,
          height: 12,
          flexShrink: 0,
          borderRadius: '3px',
          ...(hazard
            ? {
                background: `repeating-linear-gradient(45deg, ${color.bg.warning.default} 0 4px, ${color.bg.neutral.default} 4px 8px)`,
                boxShadow: `inset 0 0 0 1px ${color.bg.warning.hover}`,
              }
            : { bgcolor: zoneColor }),
        }}
      />
      <span>{name}</span>
      {detailText ? (
        <Box
          component="span"
          sx={{ fontSize: 12, fontWeight: 500, color: color.fg.neutral.subtle }}
        >
          {detailText}
        </Box>
      ) : null}
    </Stack>
  );
}

export function MapLocationPin() {
  return (
    <Box
      sx={{
        width: 24,
        height: 24,
        boxSizing: 'border-box',
        borderRadius: '50% 50% 50% 0',
        transform: 'rotate(-45deg)',
        bgcolor: color.bg.primary.default,
        border: `2px solid ${color.bg.neutral.default}`,
        boxShadow: `0 4px 12px ${withAlpha(color.bg.primary.default, 0.42)}`,
        cursor: 'grab',
      }}
    />
  );
}

export function MapCrosshair() {
  const ticks = ['M22 2V13', 'M22 31V42', 'M2 22H13', 'M31 22H42'];

  return (
    <Box
      component="svg"
      viewBox="0 0 44 44"
      sx={{ display: 'block', width: 44, height: 44, cursor: 'grab' }}
    >
      <g
        stroke={color.bg.neutral.default}
        strokeWidth={4}
        strokeOpacity={0.9}
        fill="none"
        strokeLinecap="round"
      >
        <circle cx={22} cy={22} r={13} />
        {ticks.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <g
        stroke={color.bg.primary.default}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
      >
        <circle cx={22} cy={22} r={13} />
        {ticks.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <circle cx={22} cy={22} r={2.5} fill={color.bg.primary.default} />
    </Box>
  );
}
