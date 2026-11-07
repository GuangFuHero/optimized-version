'use client';

import { useEffect, useState } from 'react';

import { readLinkedSelection, type LinkedTicket } from './linked-ticket';
import { useLinkedTicket } from './use-linked-ticket';

export interface LinkedSelectionOptions {
  selectedId: string | undefined;
  dataType: string;
  ready: boolean;
  hasItem: boolean;
  resolvedId?: string;
  select: (id: string | undefined) => void;
  resolve: (answer: Extract<LinkedTicket, { kind: 'ticket' | 'gone' }>) => void;
}

/** Resolves unseen links; a selection lost after being shown is simply released. */
export function useLinkedSelection({
  selectedId,
  dataType,
  ready,
  hasItem,
  resolvedId,
  select,
  resolve,
}: LinkedSelectionOptions) {
  const [seen, setSeen] = useState<string>();
  if (ready && hasItem && selectedId !== seen) setSeen(selectedId);
  const next =
    selectedId && ready && !hasItem && resolvedId !== selectedId
      ? readLinkedSelection({
          selectedId,
          dataType,
          seenLoaded: seen === selectedId,
        })
      : null;
  const answer = useLinkedTicket(
    next?.kind === 'look-up' ? (selectedId ?? null) : null,
  );
  const result = next?.kind === 'look-up' ? answer : next;

  useEffect(() => {
    if (!result) return;
    switch (result.kind) {
      case 'let-go':
      case 'unknown':
        select(undefined);
        break;
      case 'replace':
        select(result.uuid);
        break;
      case 'ticket':
      case 'gone':
        resolve(result);
        break;
    }
  }, [result, select, resolve]);
}
