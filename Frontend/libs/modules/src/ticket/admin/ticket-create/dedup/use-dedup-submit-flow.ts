'use client';

import { useEffect, useRef, useState } from 'react';
import { useClient } from 'urql';

import { DedupHintOutcome } from '@rescue-frontend/data-access';

import {
  findDuplicateCandidate,
  type DedupCheckInput,
  type DedupHint,
} from './dedup-check';
import { TicketCreatedButTasksFailedError } from './errors';
import { recordHintOutcome } from './record-outcome';

export type DedupFlowState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'hint'; hint: DedupHint }
  | { phase: 'creating'; hint: DedupHint | null }
  | { phase: 'done' }
  | { phase: 'error'; message: string };

function messageOf(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : String(error);
}

/**
 * 開單前的去重流程：submit → 查重 → 沒有候選就直接建單；有候選就停在 `hint`，
 * 讓使用者選「另外開單」（建單後記 ignored_hint）或「去看舊單」（記 accepted_hint，不建單）。
 */
export function useDedupSubmitFlow(
  createTicket: () => Promise<{ uuid: string }>,
) {
  const client = useClient();
  const [state, setState] = useState<DedupFlowState>({ phase: 'idle' });

  // 同一時間只跑一個 submit / proceedAnyway，擋連點。
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

  const recordIgnored = (hint: DedupHint, submittedTicketUuid: string) =>
    recordHintOutcome(client, {
      candidateTicketUuid: hint.relatedTicketUuid,
      outcome: DedupHintOutcome.IgnoredHint,
      submittedTicketUuid,
    });

  const create = async (hint: DedupHint | null, runId: number) => {
    setState({ phase: 'creating', hint });
    try {
      const { uuid } = await createTicketRef.current();
      if (hint) {
        await recordIgnored(hint, uuid);
      }
      if (runIdRef.current === runId) {
        setState({ phase: 'done' });
      }
    } catch (error) {
      // 單已建好、只是子任務失敗：使用者確實忽略了提示，一樣要記。
      if (hint && error instanceof TicketCreatedButTasksFailedError) {
        await recordIgnored(hint, error.uuid);
      }
      if (runIdRef.current === runId) {
        setState({ phase: 'error', message: messageOf(error) });
      }
    }
  };

  const submit = async (input: DedupCheckInput) => {
    if (state.phase === 'hint') {
      return;
    }
    await exclusive(async (runId) => {
      setState({ phase: 'checking' });
      const hint = await findDuplicateCandidate(client, input);
      if (runIdRef.current !== runId) {
        return;
      }
      if (hint) {
        setState({ phase: 'hint', hint });
      } else {
        await create(null, runId);
      }
    });
  };

  const proceedAnyway = async () => {
    if (state.phase !== 'hint') {
      return;
    }
    const { hint } = state;
    await exclusive((runId) => create(hint, runId));
  };

  const viewCandidate = () => {
    if (state.phase !== 'hint') {
      return;
    }
    // 不 await：連結要馬上在新分頁打開；紀錄失敗也不影響使用者。
    void recordHintOutcome(client, {
      candidateTicketUuid: state.hint.relatedTicketUuid,
      outcome: DedupHintOutcome.AcceptedHint,
    });
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
