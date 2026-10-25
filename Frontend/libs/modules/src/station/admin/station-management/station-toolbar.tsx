'use client';

import { Box, ButtonBase, Menu, MenuItem, Typography } from '@mui/material';
import {
  Badge,
  Button,
  CountBadge,
  designTokens,
  TextInput,
} from '@rescue-frontend/ui';
import {
  ChevronDown,
  ChevronUp,
  CircleHelp,
  GitPullRequestArrow,
  List,
  Map as MapIcon,
  Plus,
  Search,
  SlidersHorizontal,
  Upload,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useDebounceCallback } from 'usehooks-ts';

import type { StationCapabilities } from './hooks/use-station-capabilities';
import { ToolbarButton } from './toolbar-button';

const { color, radius, shadow, typography } = designTokens;

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
  const [draft, setDraft] = useState(query);
  // The last query this box sent, to tell the URL changing elsewhere from its own update landing.
  const [sent, setSent] = useState(query);
  const sendQuery = useDebounceCallback((value: string) => {
    setSent(value);
    onQueryChange(value);
  }, 300);

  // The URL is the source of truth; follow it when it changes from elsewhere (e.g. 清除, back).
  if (query !== sent) {
    setSent(query);
    setDraft(query);
  }

  const changeDraft = (value: string) => {
    setDraft(value);
    sendQuery(value);
  };
  const clear = () => {
    sendQuery.cancel();
    onClear();
  };

  const trimmed = draft.trim();
  const showClear = activeFilterCount > 0 || trimmed.length > 0;

  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '8px',
      }}
    >
      <ToolbarButton
        onClick={onToggleFilter}
        aria-expanded={filterOpen}
        sx={filterOpen ? { bgcolor: color.bg.neutral.subtle } : undefined}
      >
        <SlidersHorizontal size={16} color={color.fg.neutral.subtle} />
        篩選
        {activeFilterCount > 0 ? (
          <CountBadge count={activeFilterCount} />
        ) : null}
        {filterOpen ? (
          <ChevronUp size={15} color={color.fg.neutral.muted} />
        ) : (
          <ChevronDown size={15} color={color.fg.neutral.muted} />
        )}
      </ToolbarButton>

      <Box
        sx={{
          width: 320,
          '& .MuiInputBase-root': { minHeight: 42, height: 42 },
        }}
      >
        <TextInput
          value={draft}
          onChange={(event) => changeDraft(event.target.value)}
          placeholder="搜尋站名／地址…"
          leadingIcon={<Search size={16} />}
          helperText={trimmed.length === 1 ? '至少輸入 2 個字' : undefined}
          inputProps={{ 'aria-label': '搜尋站點' }}
        />
      </Box>

      {showClear ? (
        <ButtonBase
          onClick={clear}
          sx={{
            ...typography.label[300],
            color: color.fg.neutral.subtle,
            textDecoration: 'underline',
          }}
        >
          清除
        </ButtonBase>
      ) : null}

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
          onImport={caps.canImport ? onImport : undefined}
        />
      ) : caps.canImport ? (
        // Without 新增 there is no split button to hang 匯入 on, so it stands alone.
        <ToolbarButton onClick={onImport} title="從 CSV／Excel 匯入站點名單">
          <Upload size={15} color={color.fg.neutral.subtle} />
          匯入
        </ToolbarButton>
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

/** What the header's ? explains: the page in one line. */
const PAGE_HELP = '維護資源站點並審查民眾送來的修改建議';

/**
 * The title-side controls the page renders into the admin header: a ? with the page's one-line
 * explanation, the `(N)` count, and the list/map switch.
 */
export function StationViewSwitch({
  count,
  view,
  onChange,
}: {
  count: number;
  view: StationView;
  onChange: (view: StationView) => void;
}) {
  const options = [
    { value: 'table', label: '列表視圖', Icon: List },
    { value: 'map', label: '地圖視圖', Icon: MapIcon },
  ] as const;
  return (
    <>
      <Box
        component="span"
        title={PAGE_HELP}
        aria-label={PAGE_HELP}
        role="img"
        sx={{ display: 'inline-flex', ml: '-8px', cursor: 'help' }}
      >
        <CircleHelp size={17} color={color.fg.neutral.muted} />
      </Box>
      <Typography
        component="span"
        sx={{ ...typography.data[300], color: color.fg.neutral.muted }}
      >
        ({count})
      </Typography>
      <Box
        role="group"
        aria-label="檢視方式"
        sx={{
          display: 'inline-flex',
          gap: '2px',
          p: '3px',
          borderRadius: '10px',
          border: `1px solid ${color.border.default}`,
          bgcolor: color.bg.neutral.sunken,
        }}
      >
        {options.map(({ value, label, Icon }) => {
          const on = view === value;
          const fg = on ? color.fg.neutral.default : color.fg.neutral.muted;
          return (
            <ButtonBase
              key={value}
              onClick={() => onChange(value)}
              aria-pressed={on}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                height: 30,
                px: '14px',
                borderRadius: '8px',
                whiteSpace: 'nowrap',
                bgcolor: on ? color.bg.neutral.default : 'transparent',
                boxShadow: on ? shadow.sm : 'none',
                ...typography.label[400],
                fontWeight: on ? 700 : 400,
                color: fg,
              }}
            >
              <Icon size={15} color={fg} />
              {label}
            </ButtonBase>
          );
        })}
      </Box>
    </>
  );
}
