'use client';

import { Box, type SxProps, type Theme } from '@mui/material';
import {
  metaHelper,
  tableFeatures,
  useTable,
  type RowData,
  type TableOptions,
} from '@tanstack/react-table';
import type { ReactNode } from 'react';

import { designTokens } from '../../theme';

const { color, radius, shadow, typography, motion } = designTokens;

export interface DataTableColumnMeta {
  width?: string;
  align?: 'left' | 'right';
}

const dataTableFeatures = tableFeatures({
  columnMeta: metaHelper<DataTableColumnMeta>(),
});

export type DataTableFeatures = typeof dataTableFeatures;

export type DataTableDensity = 'regular' | 'compact';

export interface DataTableProps<TData extends RowData> {
  columns: TableOptions<DataTableFeatures, TData>['columns'];
  data: ReadonlyArray<TData>;
  getRowId?: (row: TData) => string;
  onRowClick?: (row: TData) => void;
  getRowSx?: (row: TData) => SxProps<Theme>;
  density?: DataTableDensity;
  minWidth?: number;
  empty?: ReactNode;
}

const ROW_PADDING: Record<DataTableDensity, string> = {
  regular: '14px 16px',
  compact: '10px 16px',
};

export function DataTable<TData extends RowData>({
  columns,
  data,
  getRowId,
  onRowClick,
  getRowSx,
  density = 'regular',
  minWidth,
  empty,
}: DataTableProps<TData>) {
  const table = useTable({
    features: dataTableFeatures,
    columns,
    data,
    getRowId,
  });
  const headerGroups = table.getHeaderGroups();
  const rows = table.getRowModel().rows;
  const leafHeaders = headerGroups[headerGroups.length - 1]?.headers ?? [];

  const gridSx = {
    display: 'grid',
    gridTemplateColumns: leafHeaders
      .map((header) => header.column.columnDef.meta?.width ?? 'minmax(0, 1fr)')
      .join(' '),
    columnGap: '12px',
    alignItems: 'center',
    borderBottom: `1px solid ${color.border.default}`,
  } as const;
  const cellSx = (meta?: DataTableColumnMeta) => ({
    minWidth: 0,
    textAlign: meta?.align ?? 'left',
    justifySelf: meta?.align === 'right' ? 'end' : 'stretch',
  });

  return (
    <Box
      sx={{
        overflowX: minWidth ? 'auto' : 'hidden',
        bgcolor: color.bg.neutral.default,
        border: `1px solid ${color.border.default}`,
        borderRadius: `${radius.lg}px`,
        boxShadow: shadow.md,
      }}
    >
      <Box role="table" sx={{ minWidth }}>
        {headerGroups.map((headerGroup) => (
          <Box
            key={headerGroup.id}
            role="row"
            sx={{ ...gridSx, p: '10px 16px' }}
          >
            {headerGroup.headers.map((header) => (
              <Box
                key={header.id}
                role="columnheader"
                sx={{
                  ...cellSx(header.column.columnDef.meta),
                  ...typography.body[300],
                  fontWeight: 700,
                  color: color.fg.neutral.muted,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {header.isPlaceholder ? null : (
                  <table.FlexRender header={header} />
                )}
              </Box>
            ))}
          </Box>
        ))}

        {rows.length === 0
          ? empty
          : rows.map((row) => (
              <Box
                key={row.id}
                role="row"
                tabIndex={onRowClick ? 0 : undefined}
                onClick={
                  onRowClick ? () => onRowClick(row.original) : undefined
                }
                onKeyDown={
                  onRowClick
                    ? (event) => {
                        if (event.key === 'Enter') onRowClick(row.original);
                      }
                    : undefined
                }
                sx={[
                  {
                    ...gridSx,
                    p: ROW_PADDING[density],
                    cursor: onRowClick ? 'pointer' : 'default',
                    transition: `background-color ${motion.transition.fast}`,
                    '&:hover': { bgcolor: color.bg.neutral.subtle },
                    '&:last-of-type': { borderBottom: 'none' },
                  },
                  ...(getRowSx ? [getRowSx(row.original)].flat() : []),
                ]}
              >
                {row.getAllCells().map((cell) => (
                  <Box
                    key={cell.id}
                    role="cell"
                    sx={cellSx(cell.column.columnDef.meta)}
                  >
                    <table.FlexRender cell={cell} />
                  </Box>
                ))}
              </Box>
            ))}
      </Box>
    </Box>
  );
}
