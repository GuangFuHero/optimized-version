'use client';

import AddLocationAltRoundedIcon from '@mui/icons-material/AddLocationAltRounded';
import AssignmentRoundedIcon from '@mui/icons-material/AssignmentRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import PlaceRoundedIcon from '@mui/icons-material/PlaceRounded';
import { Box, ButtonBase, Stack, Typography } from '@mui/material';
import { useSession } from 'next-auth/react';
import { useMemo, useState } from 'react';

import {
  Map,
  readRescueMapMarkers,
  StationCreateDrawer,
  TicketCreateDrawer,
  type RescueMapMarkerItem,
} from '@rescue-frontend/modules';

type CreateMode = 'idle' | 'station' | 'ticket';

function formatCoordinate(value: number) {
  return value.toFixed(6);
}

function ControlChip({
  label,
  active,
  icon,
  onClick,
}: {
  label: string;
  active?: boolean;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <ButtonBase
      disableRipple
      onClick={onClick}
      sx={{
        height: 38,
        px: 1.5,
        borderRadius: '999px',
        border: `1px solid ${active ? '#E3791E' : '#DCC1B1'}`,
        bgcolor: active ? '#FFF1E5' : '#F6FAFF',
        color: active ? '#7A3E00' : '#151C22',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
      }}
    >
      <Box sx={{ display: 'grid', placeItems: 'center' }}>{icon}</Box>
      <Typography sx={{ fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' }}>
        {label}
      </Typography>
    </ButtonBase>
  );
}

function AdminMapCreateControls({
  mode,
  pendingPosition,
  onToggleMode,
  onCancel,
}: {
  mode: CreateMode;
  pendingPosition: [number, number] | null;
  onToggleMode: (mode: CreateMode) => void;
  onCancel: () => void;
}) {
  const helperText =
    mode === 'station'
      ? '點擊地圖放置新站點圖釘'
      : mode === 'ticket'
        ? '點擊地圖放置新任務圖釘'
        : '選擇新增模式後，直接點地圖落點';

  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        zIndex: 1400,
        pointerEvents: 'none',
      }}
    >
      <Stack
        spacing={1}
        sx={{
          position: 'absolute',
          top: 16,
          left: 16,
          pointerEvents: 'auto',
          maxWidth: { mobile: 'calc(100vw - 32px)', tablet: 420 },
        }}
      >
        <Box
          sx={{
            p: 1,
            borderRadius: 4,
            bgcolor: 'rgba(246, 250, 255, 0.94)',
            backdropFilter: 'blur(8px)',
            border: '1px solid #DCC1B1',
            boxShadow: '0 12px 30px rgba(21, 28, 34, 0.12)',
          }}
        >
          <Stack spacing={1}>
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
              <ControlChip
                label="新增站點"
                active={mode === 'station'}
                icon={<PlaceRoundedIcon sx={{ fontSize: 18 }} />}
                onClick={() =>
                  onToggleMode(mode === 'station' ? 'idle' : 'station')
                }
              />
              <ControlChip
                label="新增任務"
                active={mode === 'ticket'}
                icon={<AssignmentRoundedIcon sx={{ fontSize: 18 }} />}
                onClick={() => onToggleMode(mode === 'ticket' ? 'idle' : 'ticket')}
              />
              {mode !== 'idle' ? (
                <ControlChip
                  label="取消"
                  icon={<CloseRoundedIcon sx={{ fontSize: 18 }} />}
                  onClick={onCancel}
                />
              ) : null}
            </Stack>
            <Typography sx={{ fontSize: 12, color: '#564337' }}>
              {helperText}
            </Typography>
            {pendingPosition ? (
              <Typography sx={{ fontSize: 12, color: '#7A3E00', fontWeight: 700 }}>
                目前落點：{formatCoordinate(pendingPosition[0])},{' '}
                {formatCoordinate(pendingPosition[1])}
              </Typography>
            ) : null}
          </Stack>
        </Box>
      </Stack>
    </Box>
  );
}

export function AdminMapPageClient() {
  const { status: authStatus } = useSession();
  const [markers, setMarkers] = useState<readonly RescueMapMarkerItem[]>(() =>
    readRescueMapMarkers(),
  );
  const [createMode, setCreateMode] = useState<CreateMode>('idle');
  const [pendingPosition, setPendingPosition] = useState<[number, number] | null>(
    null,
  );
  const [stationDrawerOpen, setStationDrawerOpen] = useState(false);
  const [ticketDrawerOpen, setTicketDrawerOpen] = useState(false);

  const currentInitialPosition = useMemo(() => pendingPosition, [pendingPosition]);
  const canCreate = authStatus === 'authenticated';

  const handleMapClick = (position: [number, number]) => {
    if (!canCreate || createMode === 'idle') {
      return;
    }

    setPendingPosition(position);

    if (createMode === 'station') {
      setStationDrawerOpen(true);
      return;
    }

    if (createMode === 'ticket') {
      setTicketDrawerOpen(true);
    }
  };

  const resetCreateFlow = () => {
    setCreateMode('idle');
    setPendingPosition(null);
  };

  return (
    <>
      <Box sx={{ width: '100%', height: '100%', minHeight: '100dvh' }}>
        <Map
          markers={markers}
          showScale
          onMapClick={handleMapClick}
          renderControls={() => (
            canCreate ? (
              <AdminMapCreateControls
                mode={createMode}
                pendingPosition={pendingPosition}
                onToggleMode={setCreateMode}
                onCancel={resetCreateFlow}
              />
            ) : null
          )}
        />
      </Box>

      <StationCreateDrawer
        open={stationDrawerOpen}
        onClose={() => {
          setStationDrawerOpen(false);
          resetCreateFlow();
        }}
        initialPosition={currentInitialPosition}
        onCreatedMarker={(marker) => {
          setMarkers((current) => [marker, ...current]);
        }}
      />

      <TicketCreateDrawer
        open={ticketDrawerOpen}
        onClose={() => {
          setTicketDrawerOpen(false);
          resetCreateFlow();
        }}
        initialPosition={currentInitialPosition}
        onCreatedMarker={(marker) => {
          setMarkers((current) => [marker, ...current]);
        }}
      />
    </>
  );
}
