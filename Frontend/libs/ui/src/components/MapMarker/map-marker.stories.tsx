import { ClipboardX, Wrench, Package, Droplet } from 'lucide-react';
import { Box, Stack, Typography } from '@mui/material';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';

import { designTokens } from '../../theme';
import {
  MapBuildingMarker,
  MapCellLabel,
  MapClusterMarker,
  MapCrosshair,
  MapLocationPin,
  MapPin,
  MapStationSquare,
  MapTicketDot,
  MapZoneLabel,
} from './index';

const { color, primitives } = designTokens;

function Tile({
  children,
  bg = '#E8EEE4',
}: {
  children: ReactNode;
  bg?: string;
}) {
  return (
    <Stack
      direction="row"
      sx={{
        gap: 4,
        alignItems: 'center',
        justifyContent: 'center',
        p: 5,
        minWidth: 360,
        bgcolor: bg,
        borderRadius: 2,
      }}
    >
      {children}
    </Stack>
  );
}

function Caption({ children }: { children: ReactNode }) {
  return (
    <Typography
      sx={{
        mt: 1,
        fontSize: 12,
        textAlign: 'center',
        color: color.fg.neutral.subtle,
      }}
    >
      {children}
    </Typography>
  );
}

const meta = {
  title: 'Components/MapMarker',
  component: MapPin,
  args: {
    tone: 'ticket',
    icon: <Wrench />,
    label: '進行中',
    active: false,
  },
  argTypes: {
    tone: { control: 'inline-radio', options: ['ticket', 'station'] },
  },
  decorators: [
    (Story) => (
      <Tile>
        <Story />
      </Tile>
    ),
  ],
} satisfies Meta<typeof MapPin>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pin: Story = {};

export const PinStates: Story = {
  render: () => (
    <>
      <Box>
        <MapPin tone="ticket" icon={<ClipboardX />} label="緊急" />
        <Caption>ticket</Caption>
      </Box>
      <Box>
        <MapPin tone="station" icon={<Droplet />} label="飲用水" />
        <Caption>station</Caption>
      </Box>
      <Box>
        <MapPin tone="station" icon={<Package />} label="物資站" active />
        <Caption>active</Caption>
      </Box>
    </>
  ),
};

export const Clusters: Story = {
  render: () => (
    <>
      <MapClusterMarker count={7} />
      <MapClusterMarker count={42} />
      <MapClusterMarker count={318} />
      <MapClusterMarker count={24} tone="station" />
    </>
  ),
};

export const CellLabels: Story = {
  render: () => (
    <>
      <Box sx={{ p: 2, bgcolor: primitives.color.orange[600], opacity: 0.9 }}>
        <MapCellLabel count={12} />
      </Box>
      <Box sx={{ p: 2, bgcolor: color.bg.danger.default, opacity: 0.9 }}>
        <MapCellLabel count={3} active />
      </Box>
    </>
  ),
};

export const Buildings: Story = {
  render: () => (
    <>
      <MapBuildingMarker count={4} label="大華村中正路 12 號" />
      <MapBuildingMarker count={6} lacking={3} label="林森路 88 巷" />
      <MapBuildingMarker count={2} active />
    </>
  ),
};

export const TicketDots: Story = {
  render: () => (
    <>
      <Box>
        <MapTicketDot priority="critical" />
        <Caption>critical</Caption>
      </Box>
      <Box>
        <MapTicketDot priority="high" />
        <Caption>high</Caption>
      </Box>
      <Box>
        <MapTicketDot priority="medium" />
        <Caption>medium</Caption>
      </Box>
      <Box>
        <MapTicketDot priority="low" />
        <Caption>low</Caption>
      </Box>
      <Box>
        <MapTicketDot priority="critical" selected />
        <Caption>selected</Caption>
      </Box>
      <Box>
        <MapTicketDot priority="medium" approximate />
        <Caption>approximate</Caption>
      </Box>
      <Box>
        <MapTicketDot priority="high" dimmed />
        <Caption>dimmed</Caption>
      </Box>
    </>
  ),
};

export const StationSquares: Story = {
  render: () => (
    <>
      <MapStationSquare icon={<Droplet />} />
      <MapStationSquare icon={<Package />} />
      <MapStationSquare icon={<Package />} dimmed />
    </>
  ),
};

export const ZoneLabels: Story = {
  render: () => (
    <Stack sx={{ gap: 2, alignItems: 'flex-start' }}>
      <MapZoneLabel
        name="大華村責任區"
        detail="慈濟基金會"
        zoneColor="#7B5EA7"
      />
      <MapZoneLabel name="馬太鞍溪沿岸" hazard selected />
      <MapZoneLabel name="東富村集結區" zoneColor="#2E7D32" dimmed />
    </Stack>
  ),
};

export const LocationPin: Story = { render: () => <MapLocationPin /> };

export const Crosshair: Story = { render: () => <MapCrosshair /> };
