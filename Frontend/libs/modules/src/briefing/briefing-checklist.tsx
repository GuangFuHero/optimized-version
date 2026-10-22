'use client';

import { Box } from '@mui/material';
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';

import { Badge } from '@rescue-frontend/ui';

import {
  dismissUpdates,
  localChecklistStorage,
  NO_MARKS,
  readChecklist,
  toggleItem,
  writeChecklist,
  type ChecklistMarks,
} from './checklist';
import { taskItems, type TaskItem, type TaskNode } from './task-items';

export interface BriefingChecklist {
  /** The items' words, in order. Empty until the article has drawn. */
  items: readonly string[];
  checked: ReadonlySet<string>;
  updated: ReadonlySet<string>;
  toggle: (item: string) => void;
  /** 知道了. */
  dismissUpdates: () => void;
  /** 全部清除. */
  clear: () => void;
}

interface ChecklistContextValue extends BriefingChecklist {
  /** The words of the item a label carries the key of. */
  labelOf: (key: string) => string | undefined;
  setTaskItems: (items: TaskItem[]) => void;
}

const ChecklistContext = createContext<ChecklistContextValue | null>(null);

function sameItems(a: readonly TaskItem[], b: readonly TaskItem[]): boolean {
  return (
    a.length === b.length &&
    a.every((item, i) => item.key === b[i].key && item.label === b[i].label)
  );
}

/**
 * The page's one copy of the checklist's state: the progress line above the article and the boxes in
 * it read the same marks, as the prototype's `useBriefChecklist` learned the hard way — read twice,
 * the progress lagged the boxes. The items come from the article as drawn (`TaskList` below), so
 * they are the words libs/ui's Markdown gives each box, and nothing else decides what an item is.
 */
export function useBriefingChecklist(): ChecklistContextValue {
  const [taskList, setTaskList] = useState<readonly TaskItem[]>([]);
  const [marks, setMarks] = useState<ChecklistMarks>(NO_MARKS);

  const items = useMemo(() => taskList.map((item) => item.label), [taskList]);
  const labels = useMemo(
    () => new Map(taskList.map((item) => [item.key, item.label])),
    [taskList],
  );

  // Read again whenever the list is new — a republished briefing marks what changed at once.
  // Before paint, so a ticked box never flashes empty.
  useLayoutEffect(() => {
    setMarks(readChecklist(localChecklistStorage(), items));
  }, [items]);

  const save = useCallback(
    (next: ChecklistMarks) => {
      writeChecklist(localChecklistStorage(), items, next);
      setMarks(next);
    },
    [items],
  );

  const setTaskItems = useCallback((next: TaskItem[]) => {
    setTaskList((current) => (sameItems(current, next) ? current : next));
  }, []);

  return useMemo(
    () => ({
      items,
      checked: new Set(marks.checked),
      updated: new Set(marks.updated),
      toggle: (item: string) => save(toggleItem(marks, item)),
      dismissUpdates: () => save(dismissUpdates(marks)),
      clear: () => save(NO_MARKS),
      labelOf: (key: string) => labels.get(key),
      setTaskItems,
    }),
    [items, labels, marks, save, setTaskItems],
  );
}

export function BriefingChecklistProvider({
  checklist,
  children,
}: {
  checklist: ChecklistContextValue;
  children: ReactNode;
}) {
  return (
    <ChecklistContext.Provider value={checklist}>
      {children}
    </ChecklistContext.Provider>
  );
}

interface NodeProps {
  node?: unknown;
  children?: ReactNode;
}

/** The whole article, as `rehypeCheckboxKey` wraps it: hands its items up to the page. */
function TaskList({ node, children }: NodeProps) {
  const checklist = useContext(ChecklistContext);
  const items = taskItems(node as TaskNode | undefined);

  useLayoutEffect(() => {
    checklist?.setTaskItems(items);
  });

  return children;
}

/** An item's words, with 已更新 beside them while it is new to this device. */
function TaskLabel({ node, children }: NodeProps) {
  const checklist = useContext(ChecklistContext);
  const key = String(
    (node as TaskNode | undefined)?.properties?.['data-task-key'] ?? '',
  );
  const item = checklist?.labelOf(key);
  const checked = item ? checklist?.checked.has(item) : false;
  const updated = item ? checklist?.updated.has(item) : false;

  return (
    // The data attributes are the ones libs/ui's Markdown styles: a ticked item's words go muted.
    <Box
      data-task-key={key}
      data-task-checked={Boolean(checked)}
      sx={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>
      {updated ? (
        // Information, not warning: a list being updated is ordinary (prototype VB-BR-194b).
        <Badge
          tone="info"
          data-briefing-updated=""
          sx={{ flexShrink: 0, mt: '4px' }}
        >
          已更新
        </Badge>
      ) : null}
    </Box>
  );
}

/** The box, ticked from this page's state rather than libs/ui's own store. */
function TaskCheckbox({ node, ...props }: ComponentProps<'input'> & NodeProps) {
  const checklist = useContext(ChecklistContext);
  const item = (node as TaskNode | undefined)?.properties?.ariaLabel;

  if (props.type !== 'checkbox' || !checklist || typeof item !== 'string') {
    return <input {...props} />;
  }

  return (
    <input
      {...props}
      disabled={false}
      checked={checklist.checked.has(item)}
      onChange={() => checklist.toggle(item)}
    />
  );
}

/**
 * libs/ui's Markdown with these in `components` draws its checklist from the page's state instead of
 * its own `article:<id>:checkboxes` store, which has no record of what was seen and so cannot mark
 * what changed (H-1). The Markdown itself is unchanged.
 */
export const BRIEFING_MARKDOWN_COMPONENTS = {
  'task-list': TaskList,
  'task-label': TaskLabel,
  input: TaskCheckbox,
};
