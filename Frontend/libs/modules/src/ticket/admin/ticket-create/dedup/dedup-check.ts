import type { Geometry } from 'geojson';
import type { Client } from 'urql';

import {
  TicketDedupCandidatesDocument,
  type TicketDedupCandidatesQuery,
} from '@rescue-frontend/data-access';

export type DedupCheckInput = {
  geometry: Geometry;
  title: string;
  description?: string | null;
  taskType?: string | null;
};

export type DedupHint =
  TicketDedupCandidatesQuery['ticketDedupCandidates'][number];

const CHECK_TIMEOUT_MS = 4000;

/**
 * 回傳最像的一張既有單。沒有候選、逾時、403、網路或 GraphQL 錯誤都回 null：
 * 去重只是提示，任何失敗都不能擋住開單（fail-open）。永不 throw。
 */
export async function findDuplicateCandidate(
  client: Client,
  input: DedupCheckInput,
): Promise<DedupHint | null> {
  const query = Promise.resolve()
    .then(() =>
      client
        .query(
          TicketDedupCandidatesDocument,
          {
            input: {
              geometry: input.geometry,
              title: input.title.trim().slice(0, 200),
              description: input.description?.trim().slice(0, 2000),
              taskType: input.taskType,
            },
          },
          { requestPolicy: 'network-only' },
        )
        .toPromise(),
    )
    .then((result) =>
      result.error ? null : (result.data?.ticketDedupCandidates?.[0] ?? null),
    )
    .catch(() => null);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), CHECK_TIMEOUT_MS);
  });

  try {
    return await Promise.race([query, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
