'use client';

import GestureOutlinedIcon from '@mui/icons-material/GestureOutlined';
import GridViewOutlinedIcon from '@mui/icons-material/GridViewOutlined';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import PanToolAltOutlinedIcon from '@mui/icons-material/PanToolAltOutlined';
import StraightenOutlinedIcon from '@mui/icons-material/StraightenOutlined';
import { Box, ButtonBase, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

import type { RescueMapControllerValue } from '../../types';

interface RescueMapTopBarProps {
  controller: RescueMapControllerValue;
}

function ControlSurface({
  children,
  sx,
}: {
  children: ReactNode;
  sx?: Record<string, unknown>;
}) {
  return (
    <Box
      sx={{
        backdropFilter: 'blur(6px)',
        bgcolor: '#F6FAFF',
        border: '1px solid #dcc1b1',
        borderRadius: 999,
        boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.05)',
        color: '#151c22',
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

function ToolbarButton({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <ButtonBase
      disableRipple
      sx={{
        borderRadius: 999,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        p: 0.5,
        color: '#151c22',
      }}
    >
      <Box sx={{ display: 'inline-flex', alignItems: 'center' }}>{icon}</Box>
      <Typography
        sx={{
          pr: 0.5,
          fontSize: 12,
          fontWeight: 700,
          lineHeight: '16px',
          letterSpacing: 0,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </Typography>
    </ButtonBase>
  );
}

function ToolbarDivider() {
  return <Box sx={{ width: 1, height: 16, bgcolor: '#dcc1b1' }} />;
}

function FloatingToolbar() {
  return (
    <ControlSurface
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        px: '9px',
        py: '5px',
        height: '40px',
      }}
    >
      <ToolbarButton
        icon={<PanToolAltOutlinedIcon sx={{ fontSize: 18 }} />}
        label="Pan"
      />
      <Box sx={{ display: { mobile: 'none', tablet: 'contents' } }}>
        <ToolbarDivider />
        <ToolbarButton
          icon={<GestureOutlinedIcon sx={{ fontSize: 18 }} />}
          label="繪製區域"
        />
        <ToolbarDivider />
        <ToolbarButton
          icon={<StraightenOutlinedIcon sx={{ fontSize: 18 }} />}
          label="Measure"
        />
      </Box>
    </ControlSurface>
  );
}

function LayerButton({ controller }: RescueMapTopBarProps) {
  return (
    <ControlSurface
      sx={{
        width: 40,
        height: 40,
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <ButtonBase
        disableRipple
        aria-label="開啟圖層控制"
        onClick={controller.openLayerPanel}
        sx={{
          width: '100%',
          height: '100%',
          borderRadius: 999,
          color: controller.layerPanelOpen ? '#151c22' : '#564337',
        }}
      >
        <LayersOutlinedIcon sx={{ fontSize: 18 }} />
      </ButtonBase>
    </ControlSurface>
  );
}

function ViewToggleButton({
  active,
  icon,
  label,
}: {
  active?: boolean;
  icon: ReactNode;
  label: string;
}) {
  return (
    <ButtonBase
      disableRipple
      sx={{
        borderRadius: 999,
        bgcolor: active ? '#dbe3ec' : 'transparent',
        color: active ? '#151c22' : '#564337',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        px: 2,
        py: '6px',
      }}
    >
      <Box
        sx={{ width: 12, height: 12, display: 'grid', placeItems: 'center' }}
      >
        {icon}
      </Box>
      <Typography
        sx={{
          fontSize: 12,
          fontWeight: 700,
          lineHeight: '16px',
          letterSpacing: 0,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </Typography>
    </ButtonBase>
  );
}

function ViewToggle() {
  return (
    <ControlSurface
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        p: '5px',
      }}
    >
      <ViewToggleButton
        active
        icon={<MapOutlinedIcon sx={{ fontSize: 14 }} />}
        label="Map"
      />
      <ViewToggleButton
        icon={<GridViewOutlinedIcon sx={{ fontSize: 14 }} />}
        label="Grid"
      />
    </ControlSurface>
  );
}

export function RescueMapTopBar({ controller }: RescueMapTopBarProps) {
  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        zIndex: 1200,
        pointerEvents: 'none',
      }}
    >
      <Stack
        spacing={1}
        sx={{ position: 'absolute', top: 16, left: 16, pointerEvents: 'auto' }}
      >
        <FloatingToolbar />
        <LayerButton controller={controller} />
      </Stack>

      <Box
        sx={{ position: 'absolute', top: 16, right: 16, pointerEvents: 'auto' }}
      >
        <ViewToggle />
      </Box>
    </Box>
  );
}
