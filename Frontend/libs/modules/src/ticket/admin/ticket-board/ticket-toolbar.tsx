'use client';

import { Box, Typography } from '@mui/material';
import { Button, designTokens, SplitButton } from '@rescue-frontend/ui';
import { Plus, Upload } from 'lucide-react';
import { type ReactNode } from 'react';

import { ToolbarSearch } from '../../../admin/shared/toolbar-search';
import { boardCountLine } from '../space/board-count';
import type { TicketCapabilities } from './hooks/use-ticket-capabilities';

const { color, typography } = designTokens;

interface TicketToolbarProps {
  caps: TicketCapabilities;
  query: string;
  onQueryChange: (query: string) => void;
  activeFilterCount: number;
  filterOpen: boolean;
  onToggleFilter: () => void;
  onClear: () => void;
  /** Matching tickets; null while unknown (loading, or failed). */
  count: number | null;
  /** The spaces listed with the tickets, counted after them: 「13 筆任務 · 1 個空間」. */
  spaceCount?: number;
  /** The spaces list stopped at its limit: the count reads 「200+ 個空間」. */
  moreSpaces?: boolean;
  /** 開啟空間 (BE-036); it decides itself whether the viewer may see it. */
  spaceControl?: ReactNode;
  /** 新增任務; the button shows only when the viewer may add and this is set. */
  onCreate?: () => void;
  /** 匯入任務單; offered only when the viewer may import. */
  onImport: () => void;
  /** Filled by the export task; shown only when the viewer may export. */
  exportControl?: ReactNode;
}

/**
 * The board's toolbar, per the prototype (tk-table.jsx): 篩選, the search box, the count, 匯出,
 * and 新增任務 — split, its ▾ holding 新增一張 and the import, for a viewer who may import.
 */
export function TicketToolbar({
  caps,
  query,
  onQueryChange,
  activeFilterCount,
  filterOpen,
  onToggleFilter,
  onClear,
  count,
  spaceCount = 0,
  moreSpaces = false,
  spaceControl,
  onCreate,
  onImport,
  exportControl,
}: TicketToolbarProps) {
  const canCreate = caps.canAdd && onCreate !== undefined;
  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '8px',
      }}
    >
      {/* `q` matches the title, the description, and the needs' names and properties — never
          the address or the contact, which it leaves out on purpose (tickets resolver). */}
      <ToolbarSearch
        query={query}
        onQueryChange={onQueryChange}
        activeFilterCount={activeFilterCount}
        filterOpen={filterOpen}
        onToggleFilter={onToggleFilter}
        onClear={onClear}
        placeholder="打 2 個字以上搜尋標題／描述／需求…"
        ariaLabel="搜尋任務單"
      />

      <Typography
        sx={{
          ...typography.body[300],
          color: color.fg.neutral.muted,
          ml: 'auto',
        }}
      >
        {count === null
          ? '— 筆任務'
          : boardCountLine(count, spaceCount, moreSpaces)}
      </Typography>

      {caps.canExport ? exportControl : null}
      {spaceControl}

      {canCreate ? (
        <SplitButton
          label="新增任務"
          startIcon={<Plus size={17} />}
          onClick={onCreate}
          items={
            caps.canImport
              ? [
                  {
                    label: '新增一張',
                    icon: <Plus size={16} />,
                    onClick: onCreate,
                  },
                  {
                    label: '從 CSV／Excel 匯入多張',
                    icon: <Upload size={16} />,
                    onClick: onImport,
                  },
                ]
              : undefined
          }
        />
      ) : caps.canImport ? (
        <Button
          variant="neutral"
          startIcon={<Upload size={16} />}
          onClick={onImport}
        >
          匯入任務單
        </Button>
      ) : null}
    </Box>
  );
}
