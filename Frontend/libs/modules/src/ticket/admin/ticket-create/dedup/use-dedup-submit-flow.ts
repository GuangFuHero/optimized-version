'use client';

import { useEffect, useRef, useState } from 'react';
import type { Geometry } from 'geojson';
import { useClient } from 'urql';

import { DedupHintOutcome } from '@rescue-frontend/data-access';

import { findDuplicateCandidate, type DedupHint } from './dedup-check';
import { TicketCreatedButTasksFailedError, type CreatedTasks } from './errors';
import { recordHintOutcome } from './record-outcome';

/** 一個要送出的草稿 task。 */
export type DraftTask = {
  id: string;
  taskType: string;
  taskName: string;
  taskDescription: string;
};

/** 某個草稿 task 拿到的提示。 */
export type TaskHint = { taskId: string; hint: DedupHint };

/** 依草稿順序逐一看過的提示，以及使用者決定不送出的 task。 */
type Review = {
  taskIds: string[];
  hints: TaskHint[];
  index: number;
  dropped: string[];
};

export type DedupFlowState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'hint'; review: Review }
  | { phase: 'creating'; shown: TaskHint | null }
  | { phase: 'done' }
  | { phase: 'nothingFiled' }
  | { phase: 'error'; message: string };

/** dialog 該顯示的提示；建立中仍顯示最後保留的那個，dialog 才會停在 busy。 */
export function shownHint(state: DedupFlowState): TaskHint | null {
  if (state.phase === 'hint') {
    return state.review.hints[state.review.index];
  }
  return state.phase === 'creating' ? state.shown : null;
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : String(error);
}

/**
 * 開單前的去重流程：submit 時每個草稿 task 平行查重（各自 fail-open），
 * 有提示的 task 依草稿順序一次問一個：
 * - 另外開單：照樣送出這個 task，建好後記 ignored_hint。
 * - 去看舊單：這個 task 不送出，記 accepted_hint。
 * - 回去修改：整次送出取消，草稿不動。
 * 看完之後送出剩下的 task；一個都不剩就不建單。
 */
export function useDedupSubmitFlow(
  createTicket: (taskIds: string[]) => Promise<CreatedTasks>,
) {
  const client = useClient();
  const [state, setState] = useState<DedupFlowState>({ phase: 'idle' });

  // 同一時間只跑一個查重或建單，擋連點。
  const busyRef = useRef(false);
  // reset 或 unmount 時 +1：還在等回應的舊流程看到編號不同，就不再動 state。
  const runIdRef = useRef(0);
  const createTicketRef = useRef(createTicket);
  createTicketRef.current = createTicket;

  useEffect(
    () => () => {
      runIdRef.current += 1;
    },
    [],
  );

  const exclusive = async (task: (runId: number) => Promise<void>) => {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    const runId = runIdRef.current;
    try {
      await task(runId);
    } finally {
      if (runIdRef.current === runId) {
        busyRef.current = false;
      }
    }
  };

  const recordIgnored = (hints: TaskHint[], created: CreatedTasks) =>
    Promise.all(
      hints
        .filter(({ taskId }) => created[taskId])
        .map(({ taskId, hint }) =>
          recordHintOutcome(client, {
            candidateUuid: hint.relatedTaskUuid,
            outcome: DedupHintOutcome.IgnoredHint,
            submittedUuid: created[taskId],
          }),
        ),
    );

  const file = async (
    review: Review,
    runId: number,
    shown: TaskHint | null,
  ) => {
    const isKept = (taskId: string) => !review.dropped.includes(taskId);
    const taskIds = review.taskIds.filter(isKept);
    if (taskIds.length === 0) {
      setState({ phase: 'nothingFiled' });
      return;
    }

    const ignored = review.hints.filter(({ taskId }) => isKept(taskId));
    setState({ phase: 'creating', shown });
    try {
      const created = await createTicketRef.current(taskIds);
      await recordIgnored(ignored, created);
      if (runIdRef.current === runId) {
        setState({ phase: 'done' });
      }
    } catch (error) {
      // 單已建好、只是部分 task 失敗：建好的那些一樣要記。
      if (error instanceof TicketCreatedButTasksFailedError) {
        await recordIgnored(ignored, error.createdTasks);
      }
      if (runIdRef.current === runId) {
        setState({ phase: 'error', message: messageOf(error) });
      }
    }
  };

  const submit = async (geometry: Geometry, tasks: DraftTask[]) => {
    if (state.phase === 'hint') {
      return;
    }
    await exclusive(async (runId) => {
      setState({ phase: 'checking' });
      const found = await Promise.all(
        tasks.map((task) =>
          findDuplicateCandidate(client, { geometry, ...task }),
        ),
      );
      if (runIdRef.current !== runId) {
        return;
      }

      const hints = tasks.flatMap((task, index) => {
        const hint = found[index];
        return hint ? [{ taskId: task.id, hint }] : [];
      });
      const review: Review = {
        taskIds: tasks.map((task) => task.id),
        hints,
        index: 0,
        dropped: [],
      };
      if (hints.length > 0) {
        setState({ phase: 'hint', review });
      } else {
        await file(review, runId, null);
      }
    });
  };

  // 對目前的提示做決定；drop = 這個 task 不送出。最後一個看完就開始建單。
  const decide = async (drop: boolean) => {
    if (state.phase !== 'hint') {
      return;
    }
    const { review } = state;
    const current = review.hints[review.index];
    const next: Review = {
      ...review,
      index: review.index + 1,
      dropped: drop ? [...review.dropped, current.taskId] : review.dropped,
    };
    if (next.index < next.hints.length) {
      setState({ phase: 'hint', review: next });
      return;
    }
    await exclusive((runId) => file(next, runId, drop ? null : current));
  };

  const proceedAnyway = () => decide(false);

  const viewCandidate = () => {
    if (state.phase !== 'hint') {
      return;
    }
    const { hint } = state.review.hints[state.review.index];
    // 不 await：連結要馬上在新分頁打開；紀錄失敗也不影響使用者。
    void recordHintOutcome(client, {
      candidateUuid: hint.relatedTaskUuid,
      outcome: DedupHintOutcome.AcceptedHint,
    });
    void decide(true);
  };

  const dismissHint = () => {
    if (state.phase === 'hint') {
      setState({ phase: 'idle' });
    }
  };

  const reset = () => {
    runIdRef.current += 1;
    busyRef.current = false;
    setState({ phase: 'idle' });
  };

  return [
    state,
    { submit, proceedAnyway, viewCandidate, dismissHint, reset },
  ] as const;
}
