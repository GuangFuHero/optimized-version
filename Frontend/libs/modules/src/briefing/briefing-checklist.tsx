'use client';

import { useCallback, useMemo, useState } from 'react';
import { useLocalStorage } from 'usehooks-ts';

import type { MarkdownTask } from '@rescue-frontend/ui';

import {
  BRIEFING_CHECKLIST_KEY,
  dismissUpdates,
  NO_MARKS,
  NO_RECORD,
  parseChecklistRecord,
  readChecklist,
  recordChecklist,
  toggleItem,
  type ChecklistMarks,
} from './checklist';

export interface BriefingChecklist {
  items: readonly string[];
  checked: ReadonlySet<string>;
  updated: ReadonlySet<string>;
  toggle: (item: string) => void;
  dismissUpdates: () => void;
  clear: () => void;
}

const CHECKLIST_STORE = { deserializer: parseChecklistRecord };

export function useBriefingChecklist() {
  const [tasks, setTasks] = useState<readonly MarkdownTask[]>([]);
  const [record, setRecord] = useLocalStorage(
    BRIEFING_CHECKLIST_KEY,
    NO_RECORD,
    CHECKLIST_STORE,
  );
  const items = useMemo(() => tasks.map((task) => task.label), [tasks]);
  const marks = useMemo(() => readChecklist(record, items), [record, items]);
  const save = useCallback(
    (next: ChecklistMarks) => setRecord(recordChecklist(items, next)),
    [items, setRecord],
  );
  const setTaskItems = useCallback((next: readonly MarkdownTask[]) => {
    setTasks((current) =>
      current.length === next.length &&
      current.every(
        (task, index) =>
          task.key === next[index].key && task.label === next[index].label,
      )
        ? current
        : next,
    );
  }, []);

  return useMemo(
    () => ({
      items,
      checked: new Set(marks.checked),
      updated: new Set(marks.updated),
      toggle: (item: string) => save(toggleItem(marks, item)),
      dismissUpdates: () => save(dismissUpdates(marks)),
      clear: () => save(NO_MARKS),
      setTaskItems,
    }),
    [items, marks, save, setTaskItems],
  );
}
