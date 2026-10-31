'use client';

import { Box, Menu, MenuItem, Typography } from '@mui/material';
import { Button, designTokens } from '@rescue-frontend/ui';
import { ChevronDown, Plus, Upload } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { ToolbarButton } from '../../../admin/shared/toolbar-button';
import { ToolbarSearch } from '../../../admin/shared/toolbar-search';
import { boardCountLine } from '../space/board-count';
import type { TicketCapabilities } from './hooks/use-ticket-capabilities';
import { searchHint } from './model/ticket-filters';

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
 * and 新增任務 — split, its ▾ holding 匯入任務單.
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
        placeholder="搜尋標題／描述／需求…"
        ariaLabel="搜尋任務單"
        hint={(draft) => searchHint(draft) ?? undefined}
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
        <CreateSplitButton
          onCreate={onCreate}
          onImport={caps.canImport ? onImport : undefined}
        />
      ) : caps.canImport ? (
        <ToolbarButton onClick={onImport}>
          <Upload size={16} />
          匯入任務單
        </ToolbarButton>
      ) : null}
    </Box>
  );
}

/** 新增任務, with a ▾ for 匯入任務單 when the viewer may import; the plain button otherwise. */
function CreateSplitButton({
  onCreate,
  onImport,
}: {
  onCreate: () => void;
  onImport?: () => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const create = (
    <Button
      onClick={onCreate}
      startIcon={<Plus size={17} />}
      sx={
        onImport
          ? {
              borderTopRightRadius: 0,
              borderBottomRightRadius: 0,
              '&:hover': { transform: 'none' },
            }
          : undefined
      }
    >
      新增任務
    </Button>
  );
  if (!onImport) return create;
  return (
    <Box sx={{ display: 'inline-flex' }}>
      {create}
      <Button
        aria-label="更多新增方式"
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        onClick={(event) => setAnchor(event.currentTarget)}
        sx={{
          px: '12px',
          borderTopLeftRadius: 0,
          borderBottomLeftRadius: 0,
          borderLeft: `1px solid ${color.bg.primary.hover}`,
          '&:hover': { transform: 'none' },
        }}
      >
        <ChevronDown size={17} />
      </Button>
      <Menu
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem
          onClick={() => {
            setAnchor(null);
            onImport();
          }}
          sx={{ gap: '8px' }}
        >
          <Upload size={16} />
          匯入任務單
        </MenuItem>
      </Menu>
    </Box>
  );
}
