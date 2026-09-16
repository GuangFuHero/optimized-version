import type { Geometry } from 'geojson';
import type { Client } from 'urql';

import { TicketDedupCandidatesDocument } from '@rescue-frontend/data-access';

export type DedupCheckInput = {
  geometry: Geometry;
  title: string;
  description?: string | null;
  taskType?: string | null;
};

export type DedupHint = {
  relatedTicketUuid: string;
  similarity: number;
  scoreComponents: Array<{
    name: string;
    score: number;
    weight: number;
    passed: boolean;
  }>;
};

export type DedupCheckResult =
  | { kind: 'none' }
  | { kind: 'hint'; hint: DedupHint }
  | { kind: 'failed-open'; reason: string };

export const DEDUP_CHECK_TIMEOUT_MS = 4000;

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message || error.name : String(error);
}

function failedOpen(reason: string): DedupCheckResult {
  return { kind: 'failed-open', reason };
}

/** 永不 throw/reject。逾時、403、網路或 GraphQL 錯誤都回 failed-open。 */
export async function runDedupCheck(
  client: Client,
  input: DedupCheckInput,
  opts?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<DedupCheckResult> {
  try {
    if (opts?.signal?.aborted) {
      return failedOpen('aborted');
    }

    const timeoutMs = opts?.timeoutMs ?? DEDUP_CHECK_TIMEOUT_MS;
    const controller = new AbortController();
    const onCallerAbort = () => controller.abort();
    opts?.signal?.addEventListener('abort', onCallerAbort);

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<DedupCheckResult>((resolve) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        resolve(failedOpen('timeout'));
      }, timeoutMs);
    });

    const queryPromise = Promise.resolve(
      client.query(
        TicketDedupCandidatesDocument,
        {
          input: {
            geometry: input.geometry,
            title: input.title.trim().slice(0, 200),
            description:
              input.description == null
                ? input.description
                : input.description.trim().slice(0, 2000),
            taskType: input.taskType,
          },
        },
        {
          requestPolicy: 'network-only',
          fetchOptions: { signal: controller.signal },
        },
      ),
    )
      .then((result): DedupCheckResult => {
        if (result.error) {
          return failedOpen(result.error.message);
        }

        const candidates = result.data?.ticketDedupCandidates;
        if (!candidates) {
          return failedOpen('missing ticketDedupCandidates');
        }
        if (candidates.length === 0) {
          return { kind: 'none' };
        }

        const candidate = candidates[0];
        return {
          kind: 'hint',
          hint: {
            relatedTicketUuid: candidate.relatedTicketUuid,
            similarity: candidate.similarity,
            scoreComponents: candidate.scoreComponents.map((component) => ({
              name: component.name,
              score: component.score,
              weight: component.weight,
              passed: component.passed,
            })),
          },
        };
      })
      .catch((error: unknown) => failedOpen(reasonOf(error)));

    try {
      return await Promise.race([queryPromise, timeoutPromise]);
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
      opts?.signal?.removeEventListener('abort', onCallerAbort);
    }
  } catch (error) {
    return failedOpen(reasonOf(error));
  }
}
