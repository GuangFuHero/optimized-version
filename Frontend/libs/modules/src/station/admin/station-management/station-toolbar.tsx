'use client';

import { Box, Typography } from '@mui/material';
import { Button, designTokens, SplitButton } from '@rescue-frontend/ui';
import { GitPullRequestArrow, Plus, Upload } from 'lucide-react';
import { type ReactNode } from 'react';

import { ToolbarSearch } from '../../../admin/shared/toolbar-search';
import type { StationCapabilities } from './hooks/use-station-capabilities';
import { offersImport } from './model/import';

const { color, typography } = designTokens;

interface StationToolbarProps {
  caps: StationCapabilities;
  query: string;
  onQueryChange: (query: string) => void;
  activeFilterCount: number;
  filterOpen: boolean;
  onToggleFilter: () => void;
  onClear: () => void;
  count: number;
  pendingStationCount: number;
  onOpenReview: () => void;
  onNew: () => void;
  onImport: () => void;
  exportControl?: ReactNode;
}

export function StationToolbar({
  caps,
  query,
  onQueryChange,
  activeFilterCount,
  filterOpen,
  onToggleFilter,
  onClear,
  count,
  pendingStationCount,
  onOpenReview,
  onNew,
  onImport,
  exportControl,
}: StationToolbarProps) {
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
        placeholder="搜尋站名／地址…"
        ariaLabel="搜尋站點"
        hint={(draft) =>
          draft.trim().length === 1 ? '至少輸入 2 個字' : undefined
        }
      />

      <Typography
        sx={{
          ...typography.body[300],
          color: color.fg.neutral.muted,
          ml: 'auto',
        }}
      >
        {count} 站
      </Typography>

      {caps.canReview ? (
        <Button
          variant="neutral"
          onClick={onOpenReview}
          title="前台修改建議審查"
          startIcon={<GitPullRequestArrow size={15} />}
          count={pendingStationCount}
          countTone="warning"
        >
          審查
        </Button>
      ) : null}

      {caps.canExport ? exportControl : null}

      {/* Its ▾ holds 新增一個 and the import, for a viewer who may import; a plain button otherwise. */}
      {caps.canAdd ? (
        <SplitButton
          label="新增站點"
          startIcon={<Plus size={17} />}
          onClick={onNew}
          items={
            offersImport(caps)
              ? [
                  {
                    label: '新增一個',
                    icon: <Plus size={16} />,
                    onClick: onNew,
                  },
                  {
                    label: '從 CSV／Excel 匯入多個',
                    icon: <Upload size={16} />,
                    onClick: onImport,
                  },
                ]
              : undefined
          }
        />
      ) : null}
    </Box>
  );
}
