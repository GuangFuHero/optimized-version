'use client';

import MoreHorizRoundedIcon from '@mui/icons-material/MoreHorizRounded';
import {
  ButtonBase,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';

import {
  StationCapacityMeter,
  StationStatusBadge,
} from './station-list-primitives';
import {
  useStationListColorScheme,
  type StationListColorScheme,
} from './constants';
import type { StationListRow } from './types';

interface StationListTableProps {
  rows: readonly StationListRow[];
}

const columns = [
  { key: 'status', label: '狀態', width: '118px' },
  { key: 'code', label: '站點', width: '170px' },
  { key: 'type', label: '類型', width: '132px' },
  { key: 'address', label: '位置', width: '220px' },
  { key: 'capacity', label: '容量', width: '170px' },
  { key: 'supplies', label: '主要資源', width: '150px' },
  { key: 'commander', label: '負責人', width: '160px' },
  { key: 'updatedAt', label: '更新', width: '112px' },
  { key: 'actions', label: '', width: '48px' },
] as const;

function HeadingCell({
  label,
  width,
  stationListPalette,
}: {
  label: string;
  width: string;
  stationListPalette: StationListColorScheme;
}) {
  return (
    <TableCell
      sx={{
        width,
        px: 2,
        py: 1.25,
        borderBottom: `1px solid ${stationListPalette.border}`,
      }}
    >
      <Typography
        sx={{
          color: stationListPalette.bodyText,
          fontSize: 10,
          lineHeight: '12px',
          fontWeight: 700,
          letterSpacing: '0.8px',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </Typography>
    </TableCell>
  );
}

function TextCell({
  value,
  strong,
  muted,
  stationListPalette,
}: {
  value: string;
  strong?: boolean;
  muted?: boolean;
  stationListPalette: StationListColorScheme;
}) {
  return (
    <Typography
      sx={{
        color: muted
          ? stationListPalette.mutedText
          : strong
            ? stationListPalette.heading
            : stationListPalette.bodyText,
        fontSize: 14,
        lineHeight: '20px',
        fontWeight: strong ? 700 : 400,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {value}
    </Typography>
  );
}

export function StationListTable({ rows }: StationListTableProps) {
  const stationListPalette = useStationListColorScheme();

  return (
    <TableContainer
      sx={{
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
        bgcolor: stationListPalette.canvas,
      }}
    >
      <Table sx={{ minWidth: 1280, tableLayout: 'fixed' }}>
        <TableHead>
          <TableRow sx={{ bgcolor: stationListPalette.surface }}>
            {columns.map((column) => (
              <HeadingCell
                key={column.key}
                label={column.label}
                width={column.width}
                stationListPalette={stationListPalette}
              />
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.id}
              sx={{
                bgcolor: stationListPalette.canvas,
                '& td': {
                  borderBottom: `1px solid ${stationListPalette.divider}`,
                },
              }}
            >
              <TableCell sx={{ px: 2, py: 1.5 }}>
                <StationStatusBadge status={row.status} />
              </TableCell>
              <TableCell sx={{ px: 2, py: 1.5 }}>
                <TextCell
                  value={row.code}
                  strong
                  stationListPalette={stationListPalette}
                />
                <TextCell
                  value={row.name}
                  muted
                  stationListPalette={stationListPalette}
                />
              </TableCell>
              <TableCell sx={{ px: 2, py: 1.5 }}>
                <TextCell
                  value={row.type}
                  stationListPalette={stationListPalette}
                />
              </TableCell>
              <TableCell sx={{ px: 2, py: 1.5 }}>
                <TextCell
                  value={row.address}
                  stationListPalette={stationListPalette}
                />
              </TableCell>
              <TableCell sx={{ px: 2, py: 1.5 }}>
                <StationCapacityMeter
                  current={row.currentOccupancy}
                  total={row.capacity}
                />
              </TableCell>
              <TableCell sx={{ px: 2, py: 1.5 }}>
                <TextCell
                  value={row.suppliesLabel}
                  strong
                  stationListPalette={stationListPalette}
                />
              </TableCell>
              <TableCell sx={{ px: 2, py: 1.5 }}>
                <TextCell
                  value={row.commander}
                  stationListPalette={stationListPalette}
                />
              </TableCell>
              <TableCell sx={{ px: 2, py: 1.5 }}>
                <TextCell
                  value={row.updatedAt}
                  muted
                  stationListPalette={stationListPalette}
                />
              </TableCell>
              <TableCell sx={{ px: 1, py: 1.5 }}>
                <ButtonBase
                  disableRipple
                  aria-label={`${row.code} 操作`}
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: '999px',
                    color: stationListPalette.bodyText,
                  }}
                >
                  <MoreHorizRoundedIcon sx={{ fontSize: 18 }} />
                </ButtonBase>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
