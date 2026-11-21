// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CurrentUserProvider,
  createRestClient,
  useCurrentUser,
  useInvalidateCurrentUser,
} from '@rescue-frontend/data-access';
import { useCapability } from '@rescue-frontend/data-access/admin';
import { AuthSessionProvider, useAuthSession } from './session/auth-session';

const user = {
  uuid: 'user-1',
  name: '王小明',
  capabilities: ['work_zone.view'],
};

const get = vi.fn<typeof fetch>();
const client = createRestClient({ baseUrl: 'https://site.test', fetch: get });

let container: HTMLDivElement;
let root: Root;
let appQueryClient: QueryClient;

function Profile() {
  const { data } = useCurrentUser();
  return createElement('span', null, data?.uuid ?? 'signed-out');
}

function FreshProfile() {
  const { data } = useCurrentUser({ refetchOnMount: 'always' });
  return createElement('span', null, data?.uuid);
}

function Session() {
  const { status } = useAuthSession();
  return createElement('span', null, status);
}

function MayViewZones() {
  const { data } = useCapability('work_zone.view');
  return createElement('span', null, String(data));
}

function Refresh() {
  const refresh = useInvalidateCurrentUser();
  return createElement('button', {
    onClick: refresh,
    'aria-label': 'refresh',
  });
}

async function mount(extra?: ReactNode) {
  await act(async () => {
    root.render(
      createElement(CurrentUserProvider, {
        client,
        children: createElement(AuthSessionProvider, {
          children: createElement(
            QueryClientProvider,
            { client: appQueryClient },
            createElement(Session),
            createElement(Profile),
            createElement(MayViewZones),
            createElement(Refresh),
            extra,
          ),
        }),
      }),
    );
  });
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  get.mockReset();
  get.mockImplementation(async () => Response.json(user));
  appQueryClient = new QueryClient();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await mount();
  await flush();
});

afterEach(async () => {
  await act(async () => root.unmount());
  appQueryClient.clear();
  container.remove();
});

describe('CurrentUserProvider', () => {
  it('answers every reader of the session from one request', () => {
    expect(container.textContent).toBe('authenticateduser-1true');
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('asks again after an invalidate, so a changed identity or capability is read fresh', async () => {
    get.mockImplementation(async () =>
      Response.json({ ...user, uuid: 'user-2' }),
    );

    await act(async () =>
      container
        .querySelector('button')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true })),
    );
    await flush();

    expect(get).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('user-2');
  });

  it('reads again for a reader that opts into a fresh profile when it mounts', async () => {
    get.mockImplementation(async () =>
      Response.json({ ...user, uuid: 'user-2' }),
    );

    await mount(createElement(FreshProfile));
    await flush();

    expect(get).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('user-2');
  });

  it('shows an ended session as no user rather than a failed read', async () => {
    get.mockImplementation(async () => new Response(null, { status: 401 }));

    await act(async () => root.unmount());
    root = createRoot(container);
    await mount();
    await flush();

    expect(container.textContent).toBe('unauthenticatedsigned-outfalse');
    expect(get).toHaveBeenCalledTimes(2);
  });
});
