'use client';

import { Box, ButtonBase } from '@mui/material';
import { CountBadge, designTokens, TextInput } from '@rescue-frontend/ui';
import {
  ChevronDown,
  ChevronUp,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDebounceCallback } from 'usehooks-ts';

import { followUrl, initialSearchBox } from './model/search-box';
import { ToolbarButton } from './toolbar-button';

const { color, typography } = designTokens;

interface ToolbarSearchProps {
  /** The URL's `?q=`. */
  query: string;
  onQueryChange: (query: string) => void;
  activeFilterCount: number;
  filterOpen: boolean;
  onToggleFilter: () => void;
  /** 清除: empties the filters and the query. */
  onClear: () => void;
  placeholder: string;
  ariaLabel: string;
  /** The note under the box for what is typed, if any (a query too short to send, say). */
  hint: (draft: string) => string | undefined;
}

/**
 * The start of an admin toolbar: the 篩選 toggle, the search box and 清除. Rendered as siblings so
 * they sit in the toolbar's own flex row. Typing reaches `onQueryChange` 300ms after the last key,
 * and not while an IME is mid-word.
 */
export function ToolbarSearch({
  query,
  onQueryChange,
  activeFilterCount,
  filterOpen,
  onToggleFilter,
  onClear,
  placeholder,
  ariaLabel,
  hint,
}: ToolbarSearchProps) {
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

  const showClear = activeFilterCount > 0 || followed.draft.trim().length > 0;

  return (
    <>
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
          placeholder={placeholder}
          leadingIcon={<Search size={16} />}
          helperText={hint(followed.draft)}
          inputProps={{
            'aria-label': ariaLabel,
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
    </>
  );
}
