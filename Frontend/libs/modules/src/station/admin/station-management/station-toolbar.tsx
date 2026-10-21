'use client';

import {
  Box,
  ButtonBase,
  IconButton,
  Menu,
  MenuItem,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import {
  Button,
  CountBadge,
  designTokens,
  TextInput,
} from '@rescue-frontend/ui';
import {
  ChevronDown,
  ChevronUp,
  GitPullRequestArrow,
  List,
  Map as MapIcon,
  Plus,
  Search,
  SlidersHorizontal,
  Upload,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import type { StationCapabilities } from './hooks/use-station-capabilities';

const { color, typography } = designTokens;

export type StationView = 'table' | 'map';

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
  view: StationView;
  onViewChange: (view: StationView) => void;
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
  view,
  onViewChange,
  onOpenReview,
  onNew,
  onImport,
  exportControl,
}: StationToolbarProps) {
  const [draft, setDraft] = useState(query);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const latestQuery = useRef(query);

  // The URL is the source of truth; follow it when it changes from elsewhere (e.g. 清除).
  useEffect(() => {
    if (query !== latestQuery.current) {
      latestQuery.current = query;
      setDraft(query);
    }
  }, [query]);

  useEffect(() => {
    if (draft === latestQuery.current) return;
    const timer = setTimeout(() => {
      latestQuery.current = draft;
      onQueryChange(draft);
    }, 300);
    return () => clearTimeout(timer);
  }, [draft, onQueryChange]);

  const trimmed = draft.trim();
  const showClear = activeFilterCount > 0 || trimmed.length > 0;

  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '10px',
      }}
    >
      <Button
        variant="outline"
        size="sm"
        onClick={onToggleFilter}
        aria-expanded={filterOpen}
        startIcon={<SlidersHorizontal size={16} />}
        endIcon={
          filterOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />
        }
      >
        篩選
        {activeFilterCount > 0 ? (
          <CountBadge count={activeFilterCount} />
        ) : null}
      </Button>

      <Box sx={{ width: 300 }}>
        <TextInput
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="搜尋站名／地址…"
          leadingIcon={<Search size={16} />}
          helperText={trimmed.length === 1 ? '至少輸入 2 個字' : undefined}
          inputProps={{ 'aria-label': '搜尋站點' }}
        />
      </Box>

      {showClear ? (
        <ButtonBase
          onClick={onClear}
          sx={{
            ...typography.label[400],
            color: color.fg.neutral.subtle,
            textDecoration: 'underline',
          }}
        >
          清除
        </ButtonBase>
      ) : null}

      <Typography
        sx={{
          ...typography.data[300],
          color: color.fg.neutral.muted,
          ml: 'auto',
        }}
      >
        {count} 站
      </Typography>

      {caps.canReview ? (
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenReview}
          title="前台修改建議審查"
          startIcon={<GitPullRequestArrow size={16} />}
        >
          審查
          {pendingStationCount > 0 ? (
            <CountBadge count={pendingStationCount} tone="warning" />
          ) : null}
        </Button>
      ) : null}

      {caps.canExport ? exportControl : null}

      {caps.canAdd ? (
        <Box sx={{ display: 'inline-flex', alignItems: 'center' }}>
          <Button size="sm" onClick={onNew} startIcon={<Plus size={16} />}>
            新增站點
          </Button>
          {caps.canImport ? (
            <>
              <IconButton
                size="small"
                aria-label="更多新增方式"
                onClick={(event) => setMenuAnchor(event.currentTarget)}
                sx={{ ml: '2px' }}
              >
                <ChevronDown size={18} />
              </IconButton>
              <Menu
                anchorEl={menuAnchor}
                open={Boolean(menuAnchor)}
                onClose={() => setMenuAnchor(null)}
              >
                <MenuItem
                  onClick={() => {
                    setMenuAnchor(null);
                    onNew();
                  }}
                >
                  <Plus size={16} style={{ marginRight: 8 }} />
                  新增一個
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setMenuAnchor(null);
                    onImport();
                  }}
                >
                  <Upload size={16} style={{ marginRight: 8 }} />從 CSV／Excel
                  匯入多個
                </MenuItem>
              </Menu>
            </>
          ) : null}
        </Box>
      ) : null}

      <ToggleButtonGroup
        size="small"
        exclusive
        value={view}
        onChange={(_, next: StationView | null) => next && onViewChange(next)}
        aria-label="檢視方式"
      >
        <ToggleButton value="table" aria-label="列表視圖">
          <List size={16} style={{ marginRight: 6 }} />
          列表視圖
        </ToggleButton>
        <ToggleButton value="map" aria-label="地圖視圖">
          <MapIcon size={16} style={{ marginRight: 6 }} />
          地圖視圖
        </ToggleButton>
      </ToggleButtonGroup>
    </Box>
  );
}
