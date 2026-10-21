'use client';

import { ButtonBase, Menu, MenuItem } from '@mui/material';
import {
  useAssignStation,
  useTeams,
  useUnassignStation,
  useUpdateStation,
} from '@rescue-frontend/data-access/admin';
import { ChevronsUpDown } from 'lucide-react';
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

/** A cell control that opens a menu without opening the row's drawer. */
function CellMenu({
  label,
  trigger,
  children,
}: {
  label: string;
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
          gap: '4px',
          borderRadius: 1,
        }}
      >
        {trigger}
        <ChevronsUpDown size={13} />
      </ButtonBase>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        onClick={stop}
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
            `已更新為「${getOperationalStatusMeta(status).label}」`,
          ),
      },
    );
  };
  return (
    <CellMenu
      label="快速變更營運狀態"
      trigger={<StatusBadge status={row.operationalStatus} />}
    >
      {(close) =>
        OPERATIONAL_STATUS_OPTIONS.map((option) => (
          <MenuItem
            key={option.value}
            selected={option.value === row.operationalStatus}
            onClick={() => {
              close();
              choose(option.value);
            }}
          >
            {option.label}
          </MenuItem>
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
      trigger={<TeamText name={row.teamName} />}
    >
      {(close) => [
        <MenuItem
          key="__none__"
          selected={!row.teamUuid}
          onClick={() => {
            close();
            choose(null, '');
          }}
        >
          未指派
        </MenuItem>,
        ...(teams.data ?? [])
          .filter((team) => team.status === 'active')
          .map((team) => (
            <MenuItem
              key={team.uuid}
              selected={team.uuid === row.teamUuid}
              onClick={() => {
                close();
                choose(team.uuid, team.name);
              }}
            >
              {team.name}
            </MenuItem>
          )),
      ]}
    </CellMenu>
  );
}
