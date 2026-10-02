'use client';

import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import MyLocationRoundedIcon from '@mui/icons-material/MyLocationRounded';
import OpenWithRoundedIcon from '@mui/icons-material/OpenWithRounded';
import PlaceRoundedIcon from '@mui/icons-material/PlaceRounded';
import { Box, Button, Stack, Typography } from '@mui/material';
import dynamic from 'next/dynamic';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

import type { PickedPoint } from './types';

export type { PickedPoint };

const { color, radius, shadow } = designTokens;

const LocationPickerCanvas = dynamic(
  () =>
    import('./location-picker-canvas').then(
      (module) => module.LocationPickerCanvas,
    ),
  { ssr: false },
);

const SOURCE_LABEL: Record<PickedPoint['source'], string> = {
  seed: '地圖上選的位置',
  gps: '目前定位',
  manual: '手動標記',
};

type LocateStatus = 'idle' | 'locating' | 'error';

interface LocationPickerProps {
  value: PickedPoint | null;
  onChange: (next: PickedPoint) => void;
  invalid?: boolean;
  height?: number;
}

/** Pinned over the map's lower left. It takes no taps: the map under it must stay tappable. */
function HintPill({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box
      sx={{
        position: 'absolute',
        left: 10,
        bottom: 10,
        zIndex: 500,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        maxWidth: 'calc(100% - 20px)',
        height: 28,
        px: 1.375,
        borderRadius: `${radius.full}px`,
        bgcolor: color.bg.neutral.default,
        boxShadow: shadow.sm,
        color: color.fg.neutral.subtle,
        pointerEvents: 'none',
        '& svg': { fontSize: 13, color: color.fg.neutral.muted, flexShrink: 0 },
      }}
    >
      {icon}
      <Typography
        component="span"
        sx={{
          fontSize: displayTextSize[12],
          lineHeight: 1,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {children}
      </Typography>
    </Box>
  );
}

/**
 * Where help is needed, marked on a small map (prototype `LocationPicker`,
 * `Design/前台/js/admin/ticket/tk-locpicker.jsx`). With no point to start from it asks the device
 * once; after that only 用目前定位 asks again and overwrites a point marked by hand.
 */
export function LocationPicker({
  value,
  onChange,
  invalid = false,
  height = 176,
}: LocationPickerProps) {
  const [status, setStatus] = useState<LocateStatus>('idle');
  const onChangeRef = useRef(onChange);
  const mountedRef = useRef(true);
  const initialValueRef = useRef(value);
  const pickedByHandRef = useRef(false);

  onChangeRef.current = onChange;

  /** `asked`: pressed 用目前定位, which overwrites; the first, automatic look does not. */
  const locate = useCallback((asked: boolean) => {
    if (!('geolocation' in navigator)) {
      setStatus('error');
      return;
    }

    setStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!mountedRef.current) {
          return;
        }

        setStatus('idle');

        // A pin placed by hand while the device was still looking stays where it was put.
        if (!asked && pickedByHandRef.current) {
          return;
        }

        onChangeRef.current({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          source: 'gps',
        });
      },
      () => {
        if (mountedRef.current) {
          setStatus('error');
        }
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
    );
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    // Opened from a button, there is no point yet: start from where the person is.
    if (!initialValueRef.current) {
      locate(false);
    }

    return () => {
      mountedRef.current = false;
    };
  }, [locate]);

  const handlePick = useCallback((point: { lat: number; lng: number }) => {
    pickedByHandRef.current = true;
    // Marked by hand, the point no longer waits on the device: what failed no longer matters.
    setStatus((current) => (current === 'error' ? 'idle' : current));
    onChangeRef.current({ ...point, source: 'manual' });
  }, []);

  return (
    <Stack spacing={1.25}>
      <Box
        sx={{
          position: 'relative',
          height,
          borderRadius: `${radius.md}px`,
          overflow: 'hidden',
          border: `${invalid ? 1.5 : 1}px solid ${invalid ? color.bg.danger.default : color.border.default}`,
          bgcolor: color.bg.neutral.sunken,
        }}
      >
        <LocationPickerCanvas value={value} onPick={handlePick} />
        {/* Said while there is a pin too: that it drags is otherwise told nowhere (designer, a004385). */}
        {status === 'locating' ? (
          <HintPill icon={<MyLocationRoundedIcon />}>
            正在取得目前定位…
          </HintPill>
        ) : value ? (
          <HintPill icon={<OpenWithRoundedIcon />}>
            可拖曳大頭針微調，或點地圖其他位置
          </HintPill>
        ) : (
          <HintPill icon={<PlaceRoundedIcon />}>
            點地圖任一處放置大頭針
          </HintPill>
        )}
      </Box>

      <Stack
        direction="row"
        sx={{ alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}
      >
        <Button
          variant="outlined"
          size="small"
          startIcon={<MyLocationRoundedIcon sx={{ fontSize: 16 }} />}
          onClick={() => locate(true)}
          disabled={status === 'locating'}
        >
          {status === 'locating' ? '定位中…' : '用目前定位'}
        </Button>
        <Typography
          sx={{
            minWidth: 0,
            color: value ? color.fg.neutral.subtle : color.fg.neutral.muted,
            fontSize: displayTextSize[12],
            lineHeight: 1.5,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {value
            ? `座標 ${value.lat.toFixed(5)}, ${value.lng.toFixed(5)} · ${SOURCE_LABEL[value.source]}`
            : '尚未標記地標'}
        </Typography>
      </Stack>

      {status === 'error' ? (
        <Stack
          direction="row"
          sx={{ alignItems: 'center', gap: 0.75, color: color.fg.danger }}
        >
          <ErrorOutlineRoundedIcon sx={{ fontSize: 14 }} />
          <Typography sx={{ fontSize: displayTextSize[12], lineHeight: 1.5 }}>
            拿不到定位，請在地圖上點一下
          </Typography>
        </Stack>
      ) : null}
    </Stack>
  );
}
