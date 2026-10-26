import assert from 'node:assert/strict';

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? 'playwright'
);

const baseUrl = process.env.TEAM_INVITE_TEST_URL ?? 'http://127.0.0.1:3320';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE,
  headless: true,
});
const userId = '00000000-0000-4000-8000-000000000001';
const teamId = '00000000-0000-4000-8000-000000000002';
const requestId = '00000000-0000-4000-8000-000000000003';
const user = {
  uuid: userId,
  name: '志工小明',
  contacts: [{ type: 'phone', value: '+886912345678', verified: true }],
  login_methods: [],
  identities: [],
  capabilities: [],
};
const invite = {
  team: { uuid: teamId, name: '光復救災隊', type: 'ngo' },
  expires_at: '2026-10-30T12:00:00Z',
  my_request: null,
  pending_elsewhere: null,
};
const errors = [];
async function scenario(name, options, run) {
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(`${name}: ${error.message}`));
  const state = {
    invite: structuredClone(invite),
    user: structuredClone(user),
    joins: [],
    opened: 0,
    verified: 0,
    ...options,
  };
  await context.route('**/api/**', async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    const json = (body, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    if (path === '/api/v1/users/me')
      return state.guest
        ? json({ detail: 'Not authenticated' }, 401)
        : json(state.user);
    if (path === '/api/v1/invites/test-token') {
      state.opened++;
      return state.expired
        ? json({ detail: 'Invite not found' }, 404)
        : json(state.invite);
    }
    if (path.endsWith('/invites/test-token/requests')) {
      state.joins.push(req.postDataJSON());
      if (state.conflict) {
        state.invite.pending_elsewhere = {
          uuid: requestId,
          team_name: '另一隊',
          requested_role: 'ngo',
          new_team_name: null,
          created_at: new Date().toISOString(),
        };
        return json({ detail: 'You already have a pending request' }, 409);
      }
      state.invite.my_request = {
        uuid: requestId,
        created_at: new Date().toISOString(),
      };
      return json(
        {
          uuid: requestId,
          team_uuid: teamId,
          status: 'pending',
          requested_role: 'ngo',
          created_at: new Date().toISOString(),
        },
        201,
      );
    }
    if (path === '/api/graphql') {
      const body = req.postDataJSON();
      if (body.query.includes('WithdrawRoleRequest')) {
        state.invite.my_request = null;
        state.invite.pending_elsewhere = null;
        return json({ data: { withdrawRoleRequest: { uuid: requestId } } });
      }
      return json({ data: {} });
    }
    if (path === '/api/v1/auth/contacts') return json({ ok: true });
    if (path === '/api/v1/auth/contacts/verify') {
      state.verified++;
      state.user.contacts = structuredClone(user.contacts);
      return json({ ok: true });
    }
    if (path === '/api/v1/auth/contacts/resend') return json({ ok: true });
    return json({ detail: `Unexpected API: ${path}` }, 500);
  });
  if (state.draft)
    await context.addInitScript(
      ({ userId, draft }) =>
        sessionStorage.setItem(
          'wg:role-request-draft',
          JSON.stringify({ userId, draft }),
        ),
      { userId, draft: state.draft },
    );
  await page.goto(`${baseUrl}/invites/test-token${state.query ?? ''}`, {
    waitUntil: 'networkidle',
    timeout: 90000,
  });
  await run(page, state);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
    false,
    `${name}: horizontal overflow`,
  );
  await context.close();
  console.log(`PASS ${name}`);
}
try {
  await scenario(
    'guest keeps invite through login and registration',
    { guest: true },
    async (page, state) => {
      await page.getByRole('link', { name: '登入後繼續' }).waitFor();
      assert.equal(
        await page
          .getByRole('link', { name: '登入後繼續' })
          .getAttribute('href'),
        '/login?callbackUrl=%2Finvites%2Ftest-token',
      );
      assert.equal(
        await page
          .getByRole('link', { name: '註冊帳號', exact: true })
          .getAttribute('href'),
        '/register?callbackUrl=%2Finvites%2Ftest-token',
      );
      assert.equal(state.opened, 0);
    },
  );
  await scenario(
    'verified applicant validates, submits, then withdraws',
    {},
    async (page, state) => {
      await page.getByRole('button', { name: '送出加入申請' }).click();
      await page
        .getByText('請確認名字、手機驗證與申請理由後再送出。')
        .waitFor();
      assert.equal(state.joins.length, 0);
      await page.getByRole('textbox', { name: '你的名字' }).fill('  王小明  ');
      await page
        .getByRole('textbox', { name: '申請理由' })
        .fill('  協助救災  ');
      if (process.env.TEAM_INVITE_SCREENSHOT)
        await page.screenshot({
          path: process.env.TEAM_INVITE_SCREENSHOT,
          fullPage: true,
        });
      await page.getByRole('button', { name: '送出加入申請' }).click();
      await page.getByText(/你的加入申請已送出/).waitFor();
      assert.deepEqual(state.joins, [{ name: '王小明', reason: '協助救災' }]);
      await page.getByRole('button', { name: '撤回申請', exact: true }).click();
      await page.getByRole('button', { name: '確定撤回', exact: true }).click();
      await page.getByRole('button', { name: '送出加入申請' }).waitFor();
    },
  );
  await scenario(
    'another pending request can be withdrawn before applying',
    {
      invite: {
        ...invite,
        pending_elsewhere: {
          uuid: requestId,
          team_name: '另一隊',
          new_team_name: null,
          requested_role: 'ngo',
          created_at: new Date().toISOString(),
        },
      },
    },
    async (page) => {
      await page.getByText(/你已有一筆「另一隊」申請/).waitFor();
      assert.equal(
        await page.getByRole('button', { name: '送出加入申請' }).count(),
        0,
      );
      await page.getByRole('button', { name: '撤回申請', exact: true }).click();
      await page.getByRole('button', { name: '確定撤回', exact: true }).click();
      await page.getByRole('button', { name: '送出加入申請' }).waitFor();
    },
  );
  await scenario(
    'expired invitation has a recovery message',
    { expired: true },
    async (page) => {
      await page.getByText(/邀請連結已失效/).waitFor();
      assert.equal(
        await page.getByRole('button', { name: '送出加入申請' }).count(),
        0,
      );
    },
  );
  await scenario(
    'existing member cannot apply again',
    { user: { ...user, identities: [{ team_uuid: teamId, role: 'member' }] } },
    async (page) => {
      await page.getByText(/你已經是這個團隊的成員/).waitFor();
      assert.equal(
        await page.getByRole('button', { name: '送出加入申請' }).count(),
        0,
      );
    },
  );
  await scenario(
    'phone must be verified before sending',
    { user: { ...user, contacts: [] } },
    async (page, state) => {
      await page.getByRole('textbox', { name: '申請理由' }).fill('協助救災');
      await page.getByRole('button', { name: '送出加入申請' }).click();
      assert.equal(state.joins.length, 0);
      await page
        .getByRole('textbox', { name: '手機號碼', exact: true })
        .fill('0912345678');
      await page
        .getByRole('button', { name: '傳送驗證碼', exact: true })
        .click();
      await page.getByRole('textbox', { name: '簡訊驗證碼' }).fill('123456');
      await page.getByRole('button', { name: '確認', exact: true }).click();
      await page.getByText('已驗證', { exact: true }).waitFor();
      await page.getByRole('button', { name: '送出加入申請' }).click();
      await page.getByText(/你的加入申請已送出/).waitFor();
      assert.equal(state.verified, 1);
      assert.equal(state.joins.length, 1);
    },
  );
  await scenario(
    'LINE return restores this account and team draft',
    {
      user: { ...user, contacts: [] },
      query: '?apply=1&step_up=ok',
      draft: {
        role: 'ngo',
        team: teamId,
        newTeamName: '',
        name: 'LINE 志工',
        reason: '原本填的理由',
        phone: '0912345678',
      },
    },
    async (page) => {
      await page.getByRole('textbox', { name: '簡訊驗證碼' }).waitFor();
      assert.equal(
        await page.getByRole('textbox', { name: '你的名字' }).inputValue(),
        'LINE 志工',
      );
      assert.equal(
        await page.getByRole('textbox', { name: '申請理由' }).inputValue(),
        '原本填的理由',
      );
      assert.equal(new URL(page.url()).search, '');
      assert.equal(
        await page.evaluate(() =>
          sessionStorage.getItem('wg:role-request-draft'),
        ),
        null,
      );
    },
  );
  await scenario(
    'concurrent pending request refreshes the actual state',
    { conflict: true },
    async (page) => {
      await page.getByRole('textbox', { name: '申請理由' }).fill('協助救災');
      await page.getByRole('button', { name: '送出加入申請' }).click();
      await page.getByText(/你已有一筆「另一隊」申請/).waitFor();
    },
  );
  assert.deepEqual(errors, []);
  console.log(
    'Browser checks passed: 8 scenarios, no page errors, mobile layout fits.',
  );
} finally {
  await browser.close();
}
