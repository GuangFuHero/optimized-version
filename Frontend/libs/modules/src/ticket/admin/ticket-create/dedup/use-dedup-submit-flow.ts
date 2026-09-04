'use client';

import { useEffect, useRef, useState } from 'react';
import { useClient, type Client } from 'urql';

import {
  runDedupCheck,
  type DedupCheckInput,
  type DedupHint,
} from './dedup-check';
import { recordSubmittedAnyway } from './record-outcome';

export type DedupFlowState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'hint'; hint: DedupHint }
  | { phase: 'creating'; hint: DedupHint | null }
  | { phase: 'done'; createdTicketUuid: string }
  | { phase: 'error'; message: string };

export type DedupFlowActions = {
  submit: (input: DedupCheckInput) => Promise<void>;
  proceedAnyway: () => Promise<void>;
  dismissHint: () => void;
  reset: () => void;
};

export function useDedupSubmitFlow(opts: {
  createTicket: () => Promise<{ uuid: string }>;
  client?: Client;
  checkTimeoutMs?: number;
  enabled?: boolean;
}): [DedupFlowState, DedupFlowActions] {
  const urqlClient = useClient();
  const [state, setState] = useState<DedupFlowState>({ phase: 'idle' });

  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const generationRef = useRef(0);
  const recordedTicketRef = useRef<string | null>(null);
  const stateRef = useRef(state);
  const optsRef = useRef(opts);
  const clientRef = useRef(opts.client ?? urqlClient);

  stateRef.current = state;
  optsRef.current = opts;
  clientRef.current = opts.client ?? urqlClient;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const isCurrent = (generation: number) =>
    mountedRef.current && generationRef.current === generation;

  const runCreate = async (hint: DedupHint | null, generation: number) => {
    if (!isCurrent(generation)) {
      return;
    }

    setState({ phase: 'creating', hint });

    try {
      const created = await optsRef.current.createTicket();

      // create 成功後才 record；none / failed-open 的 hint 為 null，不呼叫。
      if (hint && recordedTicketRef.current !== created.uuid) {
        recordedTicketRef.current = created.uuid;
        const recorded = await recordSubmittedAnyway(clientRef.current, {
          candidateTicketUuid: hint.relatedTicketUuid,
          submittedTicketUuid: created.uuid,
        });
        if (!recorded.ok) {
          console.warn('recordSubmittedAnyway failed:', recorded.reason);
        }
      }

      if (isCurrent(generation)) {
        setState({ phase: 'done', createdTicketUuid: created.uuid });
      }
    } catch (error) {
      if (isCurrent(generation)) {
        setState({
          phase: 'error',
          message:
            error instanceof Error && error.message
              ? error.message
              : String(error),
        });
      }
    } finally {
      if (generationRef.current === generation) {
        inFlightRef.current = false;
      }
    }
  };

  const submit = async (input: DedupCheckInput) => {
    const phase = stateRef.current.phase;
    if (
      inFlightRef.current ||
      (phase !== 'idle' && phase !== 'error' && phase !== 'done')
    ) {
      return;
    }

    inFlightRef.current = true;
    const generation = generationRef.current;

    if (optsRef.current.enabled === false) {
      await runCreate(null, generation);
      return;
    }

    if (isCurrent(generation)) {
      setState({ phase: 'checking' });
    }

    const result = await runDedupCheck(clientRef.current, input, {
      timeoutMs: optsRef.current.checkTimeoutMs,
    });

    if (!isCurrent(generation)) {
      inFlightRef.current = false;
      return;
    }

    if (result.kind === 'hint') {
      inFlightRef.current = false;
      setState({ phase: 'hint', hint: result.hint });
      return;
    }

    await runCreate(null, generation);
  };

  const proceedAnyway = async () => {
    if (inFlightRef.current || stateRef.current.phase !== 'hint') {
      return;
    }
    inFlightRef.current = true;
    await runCreate(stateRef.current.hint, generationRef.current);
  };

  const dismissHint = () => {
    if (stateRef.current.phase === 'hint') {
      setState({ phase: 'idle' });
    }
  };

  const reset = () => {
    generationRef.current += 1;
    inFlightRef.current = false;
    setState({ phase: 'idle' });
  };

  return [state, { submit, proceedAnyway, dismissHint, reset }];
}
