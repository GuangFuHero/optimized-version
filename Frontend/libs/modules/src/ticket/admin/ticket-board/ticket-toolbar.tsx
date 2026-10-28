'use client';

import { Box, ButtonBase, Typography } from '@mui/material';
import {
  Button,
  CountBadge,
  designTokens,
  TextInput,
} from '@rescue-frontend/ui';
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useDebounceCallback } from 'usehooks-ts';

import {
  followUrl,
  initialSearchBox,
} from '../../../station/admin/station-management/model/search-box';
import { ToolbarButton } from '../../../station/admin/station-management/toolbar-button';
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
  count: number;
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
  const [box, setBox] = useState(() => initialSearchBox(query));
  // An IME (注音, 倉頡) is mid-word: its keystrokes are not a query yet.
  const composing = useRef(false);
  // `useDebounceCallback` starts a new debouncer whenever its callback changes, so the callback
  // must stay the same across renders: otherwise each keystroke gets its own timer.
  const latestOnQueryChange = useRef(onQueryChange);
  useEffect(() => {
    latestOnQueryChange.current = onQueryChange;
  });
  const send = useCallback((value: string) => {
    setBox((current) => ({ ...current, sent: value.trim() }));
    latestOnQueryChange.current(value);
  }, []);
  const sendQuery = useDebounceCallback(send, 300);

  const followed = followUrl(box, query);
  if (followed !== box) setBox(followed);

  const changeDraft = (value: string) => {
    setBox((current) => ({ ...current, draft: value }));
    if (!composing.current) sendQuery(value);
  };
  const clear = () => {
    sendQuery.cancel();
    // A query still waiting on the debounce never reached the URL, so the URL can't clear it.
    setBox(initialSearchBox(''));
    onClear();
  };

  const trimmed = followed.draft.trim();
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
          value={followed.draft}
          onChange={(event) => changeDraft(event.target.value)}
          placeholder="搜尋標題／內容…"
          leadingIcon={<Search size={16} />}
          helperText={searchHint(followed.draft) ?? undefined}
          inputProps={{
            'aria-label': '搜尋求助單',
            onCompositionStart: () => {
              composing.current = true;
            },
            onCompositionEnd: (event) => {
              composing.current = false;
              sendQuery(event.currentTarget.value);
            },
          }}
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
        {count} 張
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
