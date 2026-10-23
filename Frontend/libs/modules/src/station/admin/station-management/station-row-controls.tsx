'use client';

import { Box, ButtonBase, Menu, MenuItem } from '@mui/material';
import {
  useAssignStation,
  useTeams,
  useUnassignStation,
  useUpdateStation,
} from '@rescue-frontend/data-access/admin';
import { designTokens, type BadgeTone } from '@rescue-frontend/ui';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useState, type MouseEvent, type ReactNode } from 'react';
import { toast } from 'sonner';

import type { StationRow } from './model/station-row';
import {
  getOperationalStatusMeta,
  OPERATIONAL_STATUS_OPTIONS,
  type OperationalStatus,
} from '../../operational-status';
import { StatusBadge } from './station-cells';
import { TeamText } from './station-table';

const { color, radius, shadow, typography } = designTokens;

/** A status dot's fill: the tone's solid, except neutral, which reads as an empty grey. */
function dotColor(tone: BadgeTone): string {
  return tone === 'neutral' ? color.bg.neutral.sunken : color.bg[tone].default;
}

/** One menu row: optional status dot, the label, and a check on the current value. */
function CellMenuItem({
  label,
  selected,
  dot,
  onClick,
}: {
  label: string;
  selected: boolean;
  dot?: BadgeTone;
  onClick: () => void;
}) {
  return (
    <MenuItem
      selected={selected}
      onClick={onClick}
      sx={{
        gap: '10px',
        p: '9px 11px',
        borderRadius: `${radius.sm}px`,
        ...typography.label[400],
        color: color.fg.neutral.default,
        '&:hover': { bgcolor: color.bg.neutral.subtle },
        '&.Mui-selected, &.Mui-selected:hover': {
          bgcolor: color.bg.primary.subtle,
        },
      }}
    >
      {dot ? (
        <Box
          component="span"
          sx={{
            width: 9,
            height: 9,
            borderRadius: '50%',
            flexShrink: 0,
            bgcolor: dotColor(dot),
          }}
        />
      ) : null}
      <Box component="span" sx={{ flex: 1 }}>
        {label}
      </Box>
      {selected ? <Check size={15} color={color.bg.primary.default} /> : null}
    </MenuItem>
  );
}

/** A cell control that opens a menu without opening the row's drawer. */
function CellMenu({
  label,
  width,
  trigger,
  children,
}: {
  label: string;
  /** The menu's minimum width, px. */
  width: number;
  trigger: ReactNode;
  children: (close: () => void) => ReactNode;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const stop = (event: MouseEvent) => event.stopPropagation();
  return (
    <>
      <ButtonBase
        title={label}
        aria-label={label}
        onClick={(event) => {
          event.stopPropagation();
          setAnchor(event.currentTarget);
        }}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          maxWidth: '100%',
          borderRadius: 1,
        }}
      >
        {trigger}
        <ChevronsUpDown
          size={13}
          color={color.fg.neutral.muted}
          style={{ flexShrink: 0 }}
        />
      </ButtonBase>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        onClick={stop}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              mt: '8px',
              minWidth: width,
              border: `1px solid ${color.border.default}`,
              borderRadius: `${radius.md}px`,
              boxShadow: shadow.lg,
            },
          },
          list: { sx: { p: '6px' } },
        }}
      >
        {children(() => setAnchor(null))}
      </Menu>
    </>
  );
}

export function QuickStatusCell({ row }: { row: StationRow }) {
  const updateStation = useUpdateStation();
  const choose = (status: OperationalStatus) => {
    if (status === row.operationalStatus) return;
    updateStation.mutate(
      { uuid: row.uuid, input: { operationalStatus: status } },
      {
        onSuccess: () =>
          toast.success(
            `已即時更新為「${getOperationalStatusMeta(status).label}」，未排入審核佇列`,
          ),
      },
    );
  };
  return (
    <CellMenu
      label="快速變更營運狀態（不排審）"
      width={150}
      trigger={<StatusBadge status={row.operationalStatus} />}
    >
      {(close) =>
        OPERATIONAL_STATUS_OPTIONS.map((option) => (
          <CellMenuItem
            key={option.value}
            label={option.label}
            dot={option.tone}
            selected={option.value === row.operationalStatus}
            onClick={() => {
              close();
              choose(option.value);
            }}
          />
        ))
      }
    </CellMenu>
  );
}

export function TeamAssignCell({ row }: { row: StationRow }) {
  const teams = useTeams();
  const assign = useAssignStation();
  const unassign = useUnassignStation();
  const choose = (teamUuid: string | null, teamName: string) => {
    if (teamUuid === row.teamUuid) return;
    if (teamUuid) {
      assign.mutate(
        { stationUuid: row.uuid, teamUuid },
        { onSuccess: () => toast.success(`已指派給 ${teamName}`) },
      );
    } else {
      unassign.mutate(
        { stationUuid: row.uuid },
        { onSuccess: () => toast.success('已取消指派') },
      );
    }
  };
  return (
    <CellMenu
      label={row.teamName ? '變更指派 Team' : '指派 Team'}
      width={180}
      trigger={<TeamText name={row.teamName} />}
    >
      {(close) => [
        <CellMenuItem
          key="__none__"
          label="未指派"
          dot="neutral"
          selected={!row.teamUuid}
          onClick={() => {
            close();
            choose(null, '');
          }}
        />,
        ...(teams.data ?? [])
          .filter((team) => team.status === 'active')
          .map((team) => (
            <CellMenuItem
              key={team.uuid}
              label={team.name}
              selected={team.uuid === row.teamUuid}
              onClick={() => {
                close();
                choose(team.uuid, team.name);
              }}
            />
          )),
      ]}
    </CellMenu>
  );
}
