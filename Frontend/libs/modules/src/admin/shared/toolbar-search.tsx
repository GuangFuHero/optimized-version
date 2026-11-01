'use client';

import { Box } from '@mui/material';
import { Button, SearchField } from '@rescue-frontend/ui';
import { ChevronDown, ChevronUp, SlidersHorizontal } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDebounceCallback } from 'usehooks-ts';

import { followUrl, initialSearchBox } from './model/search-box';

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
  /** The note in the box for what is typed, if any (a query too short to send, say). */
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
  // The last query this box sent, as the page writes it to `?q=`.
  const lastSent = useRef(query);
  const send = useCallback((value: string) => {
    lastSent.current = value.trim();
    setBox((current) => ({ ...current, sent: value.trim() }));
    latestOnQueryChange.current(value);
  }, []);
  const sendQuery = useDebounceCallback(send, 300);

  // `?q=` changed from elsewhere (back, a link): a query still waiting on the debounce was typed
  // over what the URL now says, and sending it would undo the navigation.
  useEffect(() => {
    if (query !== lastSent.current) {
      sendQuery.cancel();
      lastSent.current = query;
    }
  }, [query, sendQuery]);

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
  const hintText = hint(followed.draft);

  return (
    <>
      {/* The count of filters applied sits in the button (BTN-110); open, the button shows it (BTN-111). */}
      <Button
        variant="neutral"
        onClick={onToggleFilter}
        aria-expanded={filterOpen}
        startIcon={<SlidersHorizontal size={16} />}
        endIcon={
          filterOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />
        }
        count={activeFilterCount}
      >
        篩選
      </Button>

      {/* 180–320px (INP-103): the box gives up its extra width first, but once the row is short of
          180px for it, the row wraps and the last items (新增) go to a second line. Narrow widths wait
          on the designer. */}
      <Box sx={{ flex: '1 1 180px', minWidth: 180, maxWidth: 320 }}>
        {/* The hint sits inside the box, so typing never makes the row taller. */}
        <SearchField
          fullWidth
          value={followed.draft}
          onChange={(event) => changeDraft(event.target.value)}
          placeholder={placeholder}
          aria-label={ariaLabel}
          hint={hintText}
          inputProps={{
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
        <Button variant="ghost" size="sm" onClick={clear}>
          清除
        </Button>
      ) : null}
    </>
  );
}
