'use client';

import { Box, Menu, MenuItem, Typography } from '@mui/material';
import { Badge, Button, designTokens } from '@rescue-frontend/ui';
import { ChevronDown, GitPullRequestArrow, Plus, Upload } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { ToolbarButton } from '../../../admin/shared/toolbar-button';
import { ToolbarSearch } from '../../../admin/shared/toolbar-search';
import type { StationCapabilities } from './hooks/use-station-capabilities';
import { offersImport } from './model/import';

const { color, radius, shadow, typography } = designTokens;

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
        <ToolbarButton onClick={onOpenReview} title="前台修改建議審查">
          <GitPullRequestArrow size={15} color={color.fg.neutral.subtle} />
          審查
          {pendingStationCount > 0 ? (
            <Badge tone="warning" variant="solid">
              {pendingStationCount}
            </Badge>
          ) : null}
        </ToolbarButton>
      ) : null}

      {caps.canExport ? exportControl : null}

      {caps.canAdd ? (
        <NewStationButton
          onNew={onNew}
          onImport={offersImport(caps) ? onImport : undefined}
        />
      ) : null}
    </Box>
  );
}

/**
 * 新增站點 as a split button: the main part creates one station, the chevron opens the other ways
 * in (one more 新增一個, and 從 CSV／Excel 匯入多個 when the viewer may import).
 */
function NewStationButton({
  onNew,
  onImport,
}: {
  onNew: () => void;
  onImport?: () => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const menuId = 'station-new-menu';
  // The parts sit flush, so neither lifts on hover the way a lone Button does.
  const still = { '&:hover': { transform: 'none' } };
  const choose = (action: () => void) => {
    setAnchor(null);
    action();
  };
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'stretch',
        borderRadius: `${radius.md}px`,
        boxShadow: shadow.sm,
      }}
    >
      <Button
        onClick={onNew}
        startIcon={<Plus size={17} />}
        sx={[
          still,
          {
            borderTopRightRadius: 0,
            borderBottomRightRadius: 0,
            boxShadow: 'none',
          },
        ]}
      >
        新增站點
      </Button>
      <Button
        aria-label="更多新增方式"
        aria-haspopup="menu"
        aria-controls={anchor ? menuId : undefined}
        aria-expanded={Boolean(anchor)}
        onClick={(event) => setAnchor(event.currentTarget.parentElement)}
        sx={[
          still,
          {
            px: '10px',
            borderTopLeftRadius: 0,
            borderBottomLeftRadius: 0,
            borderLeft: `1px solid color-mix(in srgb, ${color.fg.onPrimary} 18%, transparent)`,
            boxShadow: 'none',
          },
        ]}
      >
        <ChevronDown size={17} />
      </Button>
      <Menu
        id={menuId}
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: {
              mt: '8px',
              minWidth: 220,
              border: `1px solid ${color.border.default}`,
              borderRadius: `${radius.md}px`,
              boxShadow: shadow.lg,
            },
          },
          list: { sx: { p: '6px' } },
        }}
      >
        <NewMenuItem icon={<Plus size={16} />} onClick={() => choose(onNew)}>
          新增一個
        </NewMenuItem>
        {onImport ? (
          <NewMenuItem
            icon={<Upload size={16} />}
            onClick={() => choose(onImport)}
          >
            從 CSV／Excel 匯入多個
          </NewMenuItem>
        ) : null}
      </Menu>
    </Box>
  );
}

function NewMenuItem({
  icon,
  onClick,
  children,
}: {
  icon: ReactNode;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <MenuItem
      onClick={onClick}
      sx={{
        gap: '10px',
        p: '10px 12px',
        borderRadius: `${radius.sm}px`,
        ...typography.body[300],
        color: color.fg.neutral.default,
        '&:hover': { bgcolor: color.bg.neutral.subtle },
      }}
    >
      {icon}
      {children}
    </MenuItem>
  );
}
