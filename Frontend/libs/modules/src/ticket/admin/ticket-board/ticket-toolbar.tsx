'use client';

import { Box, Typography } from '@mui/material';
import { Button, designTokens } from '@rescue-frontend/ui';
import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';

import { ToolbarSearch } from '../../../admin/shared/toolbar-search';
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
  /** 新增求助單; the button shows only when the viewer may add and this is set. */
  onCreate?: () => void;
  /** Filled by the export task; shown only when the viewer may export. */
  exportControl?: ReactNode;
  /** Filled by the import task; shown only when the viewer may import. */
  importControl?: ReactNode;
}

export function TicketToolbar({
  caps,
  query,
  onQueryChange,
  activeFilterCount,
  filterOpen,
  onToggleFilter,
  onClear,
  count,
  onCreate,
  exportControl,
  importControl,
}: TicketToolbarProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '8px',
      }}
    >
      <ToolbarSearch
        query={query}
        onQueryChange={onQueryChange}
        activeFilterCount={activeFilterCount}
        filterOpen={filterOpen}
        onToggleFilter={onToggleFilter}
        onClear={onClear}
        placeholder="搜尋標題／內容…"
        ariaLabel="搜尋求助單"
        hint={(draft) => searchHint(draft) ?? undefined}
      />

      <Typography
        sx={{
          ...typography.body[300],
          color: color.fg.neutral.muted,
          ml: 'auto',
        }}
      >
        {count ?? '—'} 張
      </Typography>

      {caps.canExport ? exportControl : null}
      {caps.canImport ? importControl : null}

      {caps.canAdd && onCreate ? (
        <Button onClick={onCreate} startIcon={<Plus size={17} />}>
          新增求助單
        </Button>
      ) : null}
    </Box>
  );
}
