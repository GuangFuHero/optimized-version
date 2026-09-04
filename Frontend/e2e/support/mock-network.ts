import type { Page, Request, Route } from '@playwright/test';

export const MOCK_CANDIDATE_TICKET_UUID =
  '11111111-1111-4111-8111-111111111111';
export const MOCK_CREATED_TICKET_UUID = '22222222-2222-4222-8222-222222222222';
export const MOCK_AUDIT_EVENT_UUID = '33333333-3333-4333-8333-333333333333';
export const MOCK_PAIR_UUID = '44444444-4444-4444-8444-444444444444';
export const MOCK_CANDIDATE_TITLE = '光復國小旁淹水需要抽水機';
export const MOCK_ADDRESS = '花蓮縣光復鄉測試路 1 號';
export const MOCK_SESSION_USER = {
  name: 'E2E 測試員',
  email: 'e2e@example.invalid',
  id: 'e2e-user',
};

export type DedupMockMode = 'none' | 'hint' | 'error';
export type DedupErrorKind = 'abort' | 'http500' | 'graphql';

export type GraphqlCall = {
  operationName: string;
  variables: Record<string, unknown>;
};

export type NetworkMocks = {
  graphqlCalls: GraphqlCall[];
  leakedRequests: string[];
};

export type InstallMocksOptions = {
  dedup: DedupMockMode;
  recordFails?: boolean;
  errorKind?: DedupErrorKind;
};

type GraphqlBody = {
  operationName?: string | null;
  query?: string;
  variables?: Record<string, unknown>;
};

const JSON_HEADERS = { 'content-type': 'application/json' };
const EMPTY_PAGE_INFO = {
  __typename: 'PageInfo',
  totalCount: 0,
  hasNextPage: false,
  hasPreviousPage: false,
};

function isLocalApp(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    const localHost =
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname === '[::1]' ||
      url.hostname === '::1';
    const port =
      url.port ||
      (url.protocol === 'https:' || url.protocol === 'wss:' ? '443' : '80');
    return localHost && port === '3000';
  } catch {
    return false;
  }
}

function isAllowedAbort(urlString: string): boolean {
  return /tile\.openstreetmap\.org|\/api\/map\/(tile|attribution)/.test(
    urlString,
  );
}

function parseGraphql(postData: string | null): GraphqlCall {
  if (!postData) {
    return { operationName: '', variables: {} };
  }

  try {
    const body = JSON.parse(postData) as GraphqlBody;
    const named = body.operationName?.trim();
    const fromQuery = body.query?.match(
      /\b(?:query|mutation|subscription)\s+(\w+)/,
    )?.[1];

    return {
      operationName: named || fromQuery || '',
      variables:
        body.variables && typeof body.variables === 'object'
          ? body.variables
          : {},
    };
  } catch {
    return { operationName: '', variables: {} };
  }
}

function parseGraphqlGet(urlString: string): GraphqlCall {
  try {
    const url = new URL(urlString);
    const named = url.searchParams.get('operationName')?.trim();
    const fromQuery = url.searchParams
      .get('query')
      ?.match(/\b(?:query|mutation|subscription)\s+(\w+)/)?.[1];
    const rawVariables = url.searchParams.get('variables');
    const variables = rawVariables ? JSON.parse(rawVariables) : {};
    return {
      operationName: named || fromQuery || '',
      variables:
        variables && typeof variables === 'object'
          ? (variables as Record<string, unknown>)
          : {},
    };
  } catch {
    return { operationName: '', variables: {} };
  }
}

function ticketFields(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'TicketType',
    uuid: MOCK_CANDIDATE_TICKET_UUID,
    propertyName: 'ticket',
    geometry: {
      type: 'Point',
      coordinates: [121.4212, 23.6698],
    },
    title: MOCK_CANDIDATE_TITLE,
    description: '附近積水，需要抽水機支援。',
    contactName: '現場志工',
    contactEmail: null,
    contactPhone: null,
    status: 'open',
    priority: 'medium',
    taskType: 'rescue',
    visibility: 'public',
    verificationStatus: null,
    reviewNote: null,
    createdBy: 'seed-user',
    createdAt: '2026-09-04T10:15:00+08:00',
    updatedAt: '2026-09-04T10:15:00+08:00',
    ...overrides,
  };
}

function emptyConnection(typename: string) {
  return {
    __typename: typename,
    items: [],
    pageInfo: EMPTY_PAGE_INFO,
  };
}

function graphqlJson(data: unknown) {
  return {
    status: 200,
    headers: JSON_HEADERS,
    body: JSON.stringify({ data }),
  };
}

function fulfillGraphql(route: Route, data: unknown) {
  return route.fulfill(graphqlJson(data));
}

function dispatchGraphql(
  call: GraphqlCall,
  opts: InstallMocksOptions,
):
  | { kind: 'json'; data: unknown }
  | { kind: 'abort' }
  | { kind: 'http'; status: number; body: unknown } {
  const { operationName, variables } = call;

  if (operationName === 'TicketDedupCandidates') {
    if (opts.dedup === 'none') {
      return { kind: 'json', data: { ticketDedupCandidates: [] } };
    }

    if (opts.dedup === 'hint') {
      return {
        kind: 'json',
        data: {
          ticketDedupCandidates: [
            {
              __typename: 'TicketDedupHint',
              relatedTicketUuid: MOCK_CANDIDATE_TICKET_UUID,
              similarity: 0.83,
              scoreComponents: [
                {
                  __typename: 'DedupScoreComponent',
                  name: 'distance',
                  score: 0.9,
                  weight: 0.4,
                  passed: true,
                },
                {
                  __typename: 'DedupScoreComponent',
                  name: 'text',
                  score: 0.7,
                  weight: 0.3,
                  passed: true,
                },
              ],
            },
          ],
        },
      };
    }

    const errorKind = opts.errorKind ?? 'abort';
    if (errorKind === 'abort') {
      return { kind: 'abort' };
    }
    if (errorKind === 'http500') {
      return {
        kind: 'http',
        status: 500,
        body: { errors: [{ message: 'internal' }] },
      };
    }
    return {
      kind: 'http',
      status: 200,
      body: { errors: [{ message: 'forbidden' }] },
    };
  }

  if (operationName === 'GetTicket') {
    const uuid =
      typeof variables.uuid === 'string'
        ? variables.uuid
        : MOCK_CANDIDATE_TICKET_UUID;

    return {
      kind: 'json',
      data: {
        ticket: {
          ...ticketFields({ uuid }),
          photos: [],
          tasks: [],
        },
      },
    };
  }

  if (operationName === 'CreateTicket') {
    const input =
      variables.input && typeof variables.input === 'object'
        ? (variables.input as Record<string, unknown>)
        : {};

    return {
      kind: 'json',
      data: {
        createTicket: ticketFields({
          uuid: MOCK_CREATED_TICKET_UUID,
          title:
            typeof input.title === 'string'
              ? input.title
              : 'E2E created ticket',
          contactName:
            typeof input.contactName === 'string'
              ? input.contactName
              : MOCK_SESSION_USER.name,
          description:
            typeof input.description === 'string' ? input.description : null,
          taskType:
            typeof input.taskType === 'string' ? input.taskType : 'rescue',
          geometry: input.geometry ?? {
            type: 'Point',
            coordinates: [121.0, 23.884],
          },
          createdBy: MOCK_SESSION_USER.id,
          createdAt: '2026-09-05T12:00:00+08:00',
          updatedAt: '2026-09-05T12:00:00+08:00',
        }),
      },
    };
  }

  if (operationName === 'CreateTicketTask') {
    const input =
      variables.input && typeof variables.input === 'object'
        ? (variables.input as Record<string, unknown>)
        : {};

    return {
      kind: 'json',
      data: {
        createTicketTask: {
          __typename: 'TicketTaskType',
          uuid: '55555555-5555-4555-8555-555555555555',
          ticketUuid:
            typeof input.ticketUuid === 'string'
              ? input.ticketUuid
              : MOCK_CREATED_TICKET_UUID,
          taskType:
            typeof input.taskType === 'string' ? input.taskType : 'rescue',
          taskName:
            typeof input.taskName === 'string' ? input.taskName : 'task',
          taskDescription:
            typeof input.taskDescription === 'string'
              ? input.taskDescription
              : null,
          quantity: typeof input.quantity === 'number' ? input.quantity : null,
          status: 'open',
          source: typeof input.source === 'string' ? input.source : 'user',
          progressNote: null,
          visibility:
            typeof input.visibility === 'string' ? input.visibility : 'public',
          moderationStatus: 'approved',
          reviewNote: null,
          createdAt: '2026-09-05T12:00:00+08:00',
          updatedAt: '2026-09-05T12:00:00+08:00',
        },
      },
    };
  }

  if (operationName === 'RecordDedupHintOutcome') {
    if (opts.recordFails) {
      return {
        kind: 'http',
        status: 500,
        body: { errors: [{ message: 'record failed' }] },
      };
    }

    return {
      kind: 'json',
      data: {
        recordDedupHintOutcome: {
          __typename: 'RecordDedupHintOutcomeResult',
          auditEventUuid: MOCK_AUDIT_EVENT_UUID,
          hintOutcome: 'ignored_hint',
          pairUuid: MOCK_PAIR_UUID,
        },
      },
    };
  }

  if (operationName === 'GetTickets') {
    return {
      kind: 'json',
      data: { tickets: emptyConnection('TicketConnection') },
    };
  }

  if (operationName === 'GetStations') {
    return {
      kind: 'json',
      data: { stations: emptyConnection('StationConnection') },
    };
  }

  if (operationName === 'GetClosureAreas') {
    return {
      kind: 'json',
      data: { closureAreas: emptyConnection('ClosureAreaConnection') },
    };
  }

  if (operationName === 'GetTicketTasks') {
    return { kind: 'json', data: { ticketTasks: [] } };
  }

  return { kind: 'json', data: {} };
}

export async function installMocks(
  page: Page,
  opts: InstallMocksOptions,
): Promise<NetworkMocks> {
  const mocks: NetworkMocks = {
    graphqlCalls: [],
    leakedRequests: [],
  };

  const rememberLeak = (request: Request) => {
    const url = request.url();
    if (!isLocalApp(url) && !isAllowedAbort(url)) {
      mocks.leakedRequests.push(url);
    }
  };

  await page.route('**/*', async (route) => {
    const url = route.request().url();

    if (isLocalApp(url)) {
      await route.continue();
      return;
    }

    if (isAllowedAbort(url)) {
      await route.abort();
      return;
    }

    rememberLeak(route.request());
    await route.abort();
  });

  await page.route(
    /tile\.openstreetmap\.org|\/api\/map\/(tile|attribution)/,
    (route) => route.abort(),
  );

  await page.route('**/api/auth/session', (route) =>
    route.fulfill({
      status: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({
        user: MOCK_SESSION_USER,
        expires: '2030-01-01T00:00:00.000Z',
      }),
    }),
  );

  await page.route('**/api/google/reverse-geocode**', (route) =>
    route.fulfill({
      status: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({
        address: MOCK_ADDRESS,
        county: '花蓮縣',
        city: '光復鄉',
        lane: '測試路',
        alley: '',
        no: '1號',
        floor: '',
        room: '',
      }),
    }),
  );

  // urql 會把 query 走 GET（operationName／variables 在 query string），mutation 走 POST。
  await page.route(/\/api\/graphql(\?|$)/, async (route) => {
    const request = route.request();
    const call =
      request.method() === 'GET'
        ? parseGraphqlGet(request.url())
        : parseGraphql(request.postData());
    mocks.graphqlCalls.push(call);

    const result = dispatchGraphql(call, opts);

    if (result.kind === 'abort') {
      await route.abort('failed');
      return;
    }

    if (result.kind === 'http') {
      await route.fulfill({
        status: result.status,
        headers: JSON_HEADERS,
        body: JSON.stringify(result.body),
      });
      return;
    }

    await fulfillGraphql(route, result.data);
  });

  return mocks;
}

export function operationNames(mocks: NetworkMocks): string[] {
  return mocks.graphqlCalls.map((call) => call.operationName);
}

export function callsNamed(
  mocks: NetworkMocks,
  operationName: string,
): GraphqlCall[] {
  return mocks.graphqlCalls.filter(
    (call) => call.operationName === operationName,
  );
}
