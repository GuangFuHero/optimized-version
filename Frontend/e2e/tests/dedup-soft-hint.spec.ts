import { expect, test, type Page } from '@playwright/test';

import {
  MOCK_ADDRESS,
  MOCK_CANDIDATE_TICKET_UUID,
  MOCK_CANDIDATE_TITLE,
  MOCK_CREATED_TICKET_UUID,
  MOCK_SESSION_USER,
  callsNamed,
  installMocks,
  operationNames,
  type DedupErrorKind,
  type NetworkMocks,
} from '../support/mock-network';

const DRAFT_TITLE = '光復鄉測試抽水機需求';
const FORBIDDEN_COPY = ['重複', '%', '機率', '同一戶'] as const;
const CREATE_FLOW_OPS = [
  'TicketDedupCandidates',
  'CreateTicket',
  'CreateTicketTask',
  'RecordDedupHintOutcome',
] as const;

function assertNoBackendLeak(mocks: NetworkMocks) {
  const backendLeaks = mocks.leakedRequests.filter((url) =>
    url.includes('127.0.0.1:9'),
  );
  expect(backendLeaks, `backend leaks: ${backendLeaks.join(', ')}`).toEqual([]);
  expect(
    mocks.leakedRequests,
    `unmocked requests: ${mocks.leakedRequests.join(', ')}`,
  ).toEqual([]);
}

async function openTicketCreateDrawer(page: Page) {
  await page.goto('/map/osm-direct/ticket', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('button.MuiFab-root')).toBeVisible();
  await page.locator('button.MuiFab-root').click();
  await page.getByRole('button', { name: '新增任務' }).click();
  await expect(
    page.getByRole('button', { name: '關閉新增任務' }),
  ).toBeVisible();
}

async function fillRequiredFields(page: Page, title: string) {
  await page.getByRole('textbox', { name: '任務標題' }).fill(title);
  await page
    .getByRole('textbox', { name: '現場聯絡人' })
    .fill(MOCK_SESSION_USER.name);
  await page.getByRole('textbox', { name: '地址' }).fill(MOCK_ADDRESS);

  const latitude = page.getByRole('textbox', { name: '緯度' });
  const longitude = page.getByRole('textbox', { name: '經度' });

  if (!(await latitude.inputValue()).trim()) {
    await latitude.fill('23.884000');
  }
  if (!(await longitude.inputValue()).trim()) {
    await longitude.fill('121.000000');
  }
}

async function submitCreate(page: Page) {
  await page.getByRole('button', { name: '建立任務' }).click();
}

function createFlowOps(mocks: NetworkMocks): string[] {
  return operationNames(mocks).filter((name) =>
    (CREATE_FLOW_OPS as readonly string[]).includes(name),
  );
}

test.describe('dedup soft hint', () => {
  test('dedup returns no candidates → creates once, no dialog', async ({
    page,
  }) => {
    const mocks = await installMocks(page, { dedup: 'none' });
    await openTicketCreateDrawer(page);
    await fillRequiredFields(page, DRAFT_TITLE);
    await submitCreate(page);

    await expect.poll(() => callsNamed(mocks, 'CreateTicket').length).toBe(1);
    expect(callsNamed(mocks, 'RecordDedupHintOutcome')).toHaveLength(0);
    await expect(page.getByTestId('dedup-hint-dialog')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: '關閉新增任務' }),
    ).toBeHidden();
    assertNoBackendLeak(mocks);
  });

  test('dedup returns a candidate → shows safe copy and summary, draft preserved', async ({
    page,
  }) => {
    const mocks = await installMocks(page, { dedup: 'hint' });
    await openTicketCreateDrawer(page);
    await fillRequiredFields(page, DRAFT_TITLE);
    await submitCreate(page);

    const dialog = page.getByTestId('dedup-hint-dialog');
    await expect(dialog).toBeVisible();
    await expect(
      page.getByRole('dialog', { name: '附近可能有相同需求' }),
    ).toBeVisible();

    const body = await dialog.innerText();
    for (const word of FORBIDDEN_COPY) {
      expect(body, `dialog must not contain "${word}"`).not.toContain(word);
    }

    await expect(dialog.getByText(MOCK_CANDIDATE_TITLE)).toBeVisible();
    await expect(dialog.getByText('待處理')).toBeVisible();

    const candidateLink = page.getByRole('link', {
      name: '去看看這張求助單',
    });
    await expect(candidateLink).toHaveAttribute(
      'href',
      new RegExp(MOCK_CANDIDATE_TICKET_UUID),
    );
    await expect(candidateLink).toHaveAttribute('target', '_blank');

    await page.getByRole('button', { name: '回去修改' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('textbox', { name: '任務標題' })).toHaveValue(
      DRAFT_TITLE,
    );
    await expect(page.getByRole('textbox', { name: '需要什麼' })).toHaveValue(
      DRAFT_TITLE,
    );
    await expect(page.getByText('子任務 1')).toBeVisible();
    expect(callsNamed(mocks, 'CreateTicket')).toHaveLength(0);
    assertNoBackendLeak(mocks);
  });

  test('另外開單 → createTicket then recordDedupHintOutcome(submitted_anyway) once each, in that order', async ({
    page,
  }) => {
    const mocks = await installMocks(page, { dedup: 'hint' });
    await openTicketCreateDrawer(page);
    await fillRequiredFields(page, DRAFT_TITLE);
    await submitCreate(page);

    await expect(page.getByTestId('dedup-hint-dialog')).toBeVisible();
    await page.getByRole('button', { name: '不是同一件事，另外開單' }).click();

    await expect
      .poll(() => callsNamed(mocks, 'RecordDedupHintOutcome').length)
      .toBe(1);

    const flow = createFlowOps(mocks);
    expect(flow[0]).toBe('TicketDedupCandidates');
    expect(
      flow.filter((name) => name === 'TicketDedupCandidates'),
    ).toHaveLength(1);
    expect(flow.filter((name) => name === 'CreateTicket')).toHaveLength(1);
    expect(
      flow.filter((name) => name === 'RecordDedupHintOutcome'),
    ).toHaveLength(1);

    const createIndex = flow.indexOf('CreateTicket');
    const recordIndex = flow.indexOf('RecordDedupHintOutcome');
    expect(createIndex).toBeGreaterThan(flow.indexOf('TicketDedupCandidates'));
    expect(recordIndex).toBeGreaterThan(createIndex);

    const taskIndex = flow.indexOf('CreateTicketTask');
    if (taskIndex !== -1) {
      expect(taskIndex).toBeGreaterThan(createIndex);
      expect(taskIndex).toBeLessThan(recordIndex);
      expect(flow.filter((name) => name === 'CreateTicketTask')).toHaveLength(
        1,
      );
    }

    const recordCall = callsNamed(mocks, 'RecordDedupHintOutcome')[0];
    expect(recordCall.variables).toEqual({
      input: {
        candidateTicketUuid: MOCK_CANDIDATE_TICKET_UUID,
        submittedTicketUuid: MOCK_CREATED_TICKET_UUID,
        outcome: 'submitted_anyway',
      },
    });

    await expect(
      page.getByRole('button', { name: '關閉新增任務' }),
    ).toBeHidden();
    assertNoBackendLeak(mocks);
  });

  test('另外開單 → record 500 still succeeds, no error shown', async ({
    page,
  }) => {
    const mocks = await installMocks(page, {
      dedup: 'hint',
      recordFails: true,
    });
    await openTicketCreateDrawer(page);
    await fillRequiredFields(page, DRAFT_TITLE);
    await submitCreate(page);

    await expect(page.getByTestId('dedup-hint-dialog')).toBeVisible();
    await page.getByRole('button', { name: '不是同一件事，另外開單' }).click();

    await expect.poll(() => callsNamed(mocks, 'CreateTicket').length).toBe(1);
    await expect
      .poll(() => callsNamed(mocks, 'RecordDedupHintOutcome').length)
      .toBe(1);
    await expect(
      page.getByRole('button', { name: '關閉新增任務' }),
    ).toBeHidden();
    await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toHaveCount(
      0,
    );
    assertNoBackendLeak(mocks);
  });

  for (const errorKind of [
    'abort',
    'http500',
    'graphql',
  ] as const satisfies readonly DedupErrorKind[]) {
    test(`dedup transport/server error → fail-open (${errorKind})`, async ({
      page,
    }) => {
      const mocks = await installMocks(page, { dedup: 'error', errorKind });
      await openTicketCreateDrawer(page);
      await fillRequiredFields(page, DRAFT_TITLE);
      await submitCreate(page);

      await expect.poll(() => callsNamed(mocks, 'CreateTicket').length).toBe(1);
      await expect(page.getByTestId('dedup-hint-dialog')).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: '關閉新增任務' }),
      ).toBeHidden();

      const alerts = page.getByRole('alert').filter({ hasText: /\S/ });
      if ((await alerts.count()) > 0) {
        const texts = await alerts.allInnerTexts();
        expect(texts.join('\n')).not.toMatch(/去重|dedup|重複檢查/i);
      }

      expect(callsNamed(mocks, 'RecordDedupHintOutcome')).toHaveLength(0);
      assertNoBackendLeak(mocks);
    });
  }

  test('mobile: dialog is full-screen, controls reachable by role/name, Escape returns to form', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'mobile-chromium',
      'mobile project only',
    );

    const mocks = await installMocks(page, { dedup: 'hint' });
    await openTicketCreateDrawer(page);
    await fillRequiredFields(page, DRAFT_TITLE);
    await submitCreate(page);

    const dialog = page.getByRole('dialog', { name: '附近可能有相同需求' });
    await expect(dialog).toBeVisible();

    const viewport = page.viewportSize();
    expect(viewport).toBeTruthy();
    const box = await dialog.boundingBox();
    expect(box).toBeTruthy();
    // dialog 掛在 Drawer 內（disablePortal），Drawer paper 有 1px 邊框，容許 4px 誤差
    expect(box!.width).toBeGreaterThanOrEqual((viewport?.width ?? 0) - 4);

    await expect(
      page.getByRole('link', { name: '去看看這張求助單' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: '不是同一件事，另外開單' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: '回去修改' })).toBeVisible();

    await expect
      .poll(async () =>
        page.evaluate(() => {
          const node = document.querySelector(
            '[data-testid="dedup-hint-dialog"]',
          );
          return Boolean(node && node.contains(document.activeElement));
        }),
      )
      .toBe(true);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await expect
      .poll(async () =>
        page.evaluate(() => {
          const papers = Array.from(
            document.querySelectorAll('.MuiDrawer-paper'),
          );
          const createPaper = papers.find(
            (paper) =>
              paper.textContent?.includes('新增任務') &&
              paper.textContent?.includes('建立任務'),
          );
          return Boolean(
            createPaper && createPaper.contains(document.activeElement),
          );
        }),
      )
      .toBe(true);

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth);

    assertNoBackendLeak(mocks);
  });
});
