'use client';

import { useCallback, useEffect, useState } from 'react';

import type { RescueMapMarkerItem } from '../../map/types';
import {
  claimTaskMatch,
  readTaskMatchStates,
  resolveTaskMatchState,
  writeTaskMatchStates,
  type TaskMatchState,
} from './model';

export function useTaskMatches() {
  const [storedStates, setStoredStates] = useState<
    Record<string, TaskMatchState>
  >({});

  useEffect(() => {
    setStoredStates(readTaskMatchStates());
  }, []);

  const getTaskMatchState = useCallback(
    (task: RescueMapMarkerItem) =>
      resolveTaskMatchState(task, storedStates[task.id]),
    [storedStates],
  );

  const claimTask = useCallback((task: RescueMapMarkerItem) => {
    let nextState: TaskMatchState | null = null;

    setStoredStates((currentStates) => {
      nextState = claimTaskMatch(task, currentStates[task.id]);
      const nextStates = { ...currentStates, [task.id]: nextState };

      writeTaskMatchStates(nextStates);
      return nextStates;
    });

    return nextState;
  }, []);

  const deleteMatchSheet = useCallback((task: RescueMapMarkerItem) => {
    setStoredStates((currentStates) => {
      const nextStates = { ...currentStates };

      delete nextStates[task.id];

      writeTaskMatchStates(nextStates);
      return nextStates;
    });

    return task.id;
  }, []);

  return {
    storedStates,
    getTaskMatchState,
    claimTask,
    deleteMatchSheet,
  };
}
