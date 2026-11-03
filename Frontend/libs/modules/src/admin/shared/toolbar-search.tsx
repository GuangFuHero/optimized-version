'use client';

import { Box } from '@mui/material';
import { Button, SearchField } from '@rescue-frontend/ui';
import { ChevronDown, ChevronUp, SlidersHorizontal } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
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
  /** Says the rule too, such as the 2 characters a search needs (INP-104): there is no other note. */
  placeholder: string;
  /**
   * The rule alone, shown while `placeholder` doesn't fit the box (INP-105), so the rule is never
   * cut short: a search that ignores one character would look broken.
   */
  shortPlaceholder: string;
  ariaLabel: string;
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
  shortPlaceholder,
  ariaLabel,
}: ToolbarSearchProps) {
  const [box, setBox] = useState(() => initialSearchBox(query));
  const inputRef = useRef<HTMLInputElement>(null);
  const placeholderFits = useFitsInput(inputRef, placeholder);
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

      {/* 140–320px (INP-103): the box shrinks first, down to 140px, before the row wraps.
          `AdminToolbar` counts it at 140px when it decides whether the count drops. */}
      <Box
        data-toolbar-search
        sx={{ flex: '1 1 140px', minWidth: 140, maxWidth: 320 }}
      >
        <SearchField
          fullWidth
          inputRef={inputRef}
          value={followed.draft}
          onChange={(event) => changeDraft(event.target.value)}
          placeholder={placeholderFits ? placeholder : shortPlaceholder}
          aria-label={ariaLabel}
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

/**
 * Whether `text` fits the input, followed as the box resizes: a placeholder that doesn't is cut
 * where the box ends.
 */
function useFitsInput(
  inputRef: RefObject<HTMLInputElement | null>,
  text: string,
): boolean {
  const [fits, setFits] = useState(true);

  useLayoutEffect(() => {
    const input = inputRef.current;
    const context = document.createElement('canvas').getContext('2d');
    if (!input || !context) {
      return undefined;
    }

    const measure = () => {
      const style = getComputedStyle(input);
      const fontSize = Number.parseFloat(style.fontSize);
      context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      // Chrome and Safari keep room for the search box's × even while it is empty and hidden:
      // about one character.
      const room =
        input.getBoundingClientRect().width -
        Number.parseFloat(style.paddingLeft) -
        Number.parseFloat(style.paddingRight) -
        fontSize;
      setFits(context.measureText(text).width <= room);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(input);
    // The web font can land after the first measure, widening the text but not the box.
    let cancelled = false;
    void document.fonts.ready.then(() => {
      if (!cancelled) measure();
    });

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [inputRef, text]);

  return fits;
}
