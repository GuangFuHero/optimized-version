import type { Geometry } from 'geojson';
import type { Client } from 'urql';

import {
  TicketDedupCandidatesDocument,
  type TicketDedupCandidatesQuery,
} from '@rescue-frontend/data-access';

/** 一個即將送出的 task，加上新單的位置。 */
export type DedupCheckInput = {
  geometry: Geometry;
  taskType: string;
  taskName: string;
  taskDescription: string;
};

export type DedupHint =
  TicketDedupCandidatesQuery['ticketDedupCandidates'][number];

const CHECK_TIMEOUT_MS = 4000;

/**
 * 回傳附近最像這個 task 的既有 task（hint 帶著它和它的單）。沒有候選、逾時、403、
 * 網路或 GraphQL 錯誤都回 null：去重只是提示，任何失敗都不能擋住開單（fail-open）。
 * 永不 throw。
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
              taskType: input.taskType,
              taskName: input.taskName.trim().slice(0, 200),
              taskDescription: input.taskDescription.trim().slice(0, 2000),
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
