import { test, expect, type Page } from '@playwright/test';
const user = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'breno@example.test',
  user_metadata: { full_name: 'Breno' },
  aud: 'authenticated',
  created_at: '2026-01-01T00:00:00Z',
};
const space = {
  id: '44444444-4444-4444-8444-444444444444',
  name: 'Meu espaço',
  description: 'Finanças pessoais',
  color: 'amber',
  isDefault: true,
  role: 'owner',
};
const account = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Conta principal',
  institution: 'mercado_pago',
  type: 'checking',
  currency: 'BRL',
  openingBalance: 0,
  openingDate: '2026-01-01',
  balance: 1248650,
  version: 1,
  archived: false,
  balanceBasis: { kind: 'manual', referenceDate: '2026-11-01' },
};
const entries = [
  { id: 'a', description: 'Salário', amount: 650000, transactionType: 'income' },
  { id: 'b', description: 'Supermercado', amount: -18590, transactionType: 'expense' },
  { id: 'c', description: 'Café da manhã', amount: -2490, transactionType: 'expense' },
  { id: 'd', description: 'Assinatura de streaming', amount: -3990, transactionType: 'expense' },
].map((t) => ({
  ...t,
  accountId: account.id,
  categoryId: null,
  transactionDate: '2026-11-20',
  sourceKind: 'manual',
  reconciliationStatus: 'pending',
  version: 1,
  importBatchId: null,
  transferGroupId: null,
}));
async function fixture(page: Page, theme = 'dark') {
  await page.addInitScript(
    ({ user, space, theme }) => {
      localStorage.setItem(
        'sb-hlcrjoqmyohfbajvafhh-auth-token',
        JSON.stringify({
          access_token: 'synthetic-test-token',
          refresh_token: 'synthetic-refresh',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          expires_in: 3600,
          token_type: 'bearer',
          user,
        }),
      );
      localStorage.setItem('plannedwallet-workspace:' + user.id, space.id);
      localStorage.setItem('plannedwallet-theme', theme);
    },
    { user, space, theme },
  );
  await page.route('https://*.supabase.co/**', (r) => r.fulfill({ json: { user } }));
  await page.route('**/v1/**', (r) => {
    const u = new URL(r.request().url()),
      path = u.pathname;
    let data: unknown = [];
    const totals = {
      plannedIncome: 650000,
      plannedExpense: 400000,
      actualIncome: 650000,
      actualExpense: 248000,
      plannedResult: 250000,
      actualResult: 402000,
      incomeDifference: 0,
      expenseDifference: 152000,
      resultDifference: 152000,
      afterContribution: 200000,
      missingCategoryCount: 0,
      unclassifiedCount: 0,
      unclassifiedInflow: 0,
      unclassifiedOutflow: 0,
    };
    if (path === '/v1/workspaces') data = [space];
    else if (path === '/v1/accounts') data = [account];
    else if (path === '/v1/transactions') data = { items: entries, nextCursor: null };
    else if (path === '/v1/dashboard')
      data = {
        income: 650000,
        expense: 248000,
        balance: account.balance,
        benefitBalance: 70400,
        reserveBalance: 350000,
        recordedResources: 1669050,
        unclassified: 0,
        accounts: [account],
        expenseCategories: [
          {
            categoryId: 'food',
            name: 'Alimentação',
            groupName: 'Essenciais',
            amount: 148000,
            count: 8,
          },
          {
            categoryId: 'transport',
            name: 'Transporte',
            groupName: 'Essenciais',
            amount: 100000,
            count: 5,
          },
        ],
        expenseGroups: [
          { groupId: 'food', name: 'Alimentação', amount: 148000, count: 8 },
          { groupId: 'transport', name: 'Transporte', amount: 100000, count: 5 },
        ],
        coverage: 'tracked-accounts',
      };
    else if (path === '/v1/dashboard/history')
      data = {
        items: Array.from({ length: 7 }, (_, i) => ({
          month: `2026-${String(i + 5).padStart(2, '0')}`,
          income: 450000 + i * 30000,
          expense: 240000 + i * 9000,
          count: 12,
          unclassified: 0,
        })),
        months: 7,
        from: '2026-05-01',
        to: '2026-12-01',
      };
    else if (path.startsWith('/v1/planning/'))
      data = {
        month: path.split('/').pop(),
        version: 1,
        notes: '',
        contribution: 50000,
        lines: [],
        totals,
      };
    else if (path === '/v1/wealth/overview')
      data = { cardDebt: 140000, investments: 820000, netWorth: 2317650 };
    else if (path === '/v1/commitments')
      data = {
        month: '2026-11',
        today: '2026-11-21',
        through: '2026-11-30',
        items: [],
        schedules: [],
        projection: [],
        cardBills: [],
        totalItems: 0,
        overdueCount: 0,
        overdueIncome: 0,
        overdueExpense: 0,
      };
    else if (path === '/v1/goals')
      data = {
        allocated: 120000,
        accounts: [],
        goals: [
          {
            id: 'goal',
            name: 'Minha próxima viagem',
            target: 500000,
            allocated: 120000,
            remaining: 380000,
            progress: 24,
            deadline: '2027-07-01',
            priority: 2,
            status: 'active',
            version: 1,
            underfunded: false,
            monthlyPace: 50000,
            allocations: [],
          },
        ],
      };
    else if (path.startsWith('/v1/alerts'))
      data = {
        preferences: {
          dueDays: 3,
          budgetPercent: 100,
          bills: true,
          budgets: true,
          negativeBalance: true,
          goals: true,
        },
        items: [],
      };
    return r.fulfill({ json: data });
  });
}
for (const width of [320, 390, 768, 1440])
  for (const theme of ['dark', 'light'])
    test(`premium layout and financial navigation at ${width}px ${theme}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.setViewportSize({ width, height: 960 });
      await fixture(page, theme);
      await page.goto('/?month=2026-11');
      await expect(page.getByRole('region', { name: 'Saldos atuais', exact: true })).toBeVisible();
      await expect(page.locator('.hero-balance')).toHaveText('R$ 12.486,50');
      const dock = page.getByRole('navigation', { name: 'Navegação móvel' });
      if (width <= 1050) {
        await expect(dock).toBeVisible();
        await expect(dock.getByRole('link')).toHaveCount(5);
        const box = await dock.boundingBox();
        expect(box!.y + box!.height).toBeLessThan(960);
        const hero = await page.locator('.balance-hero').boundingBox();
        expect(hero!.width).toBeGreaterThan(width - 40);
      }
      await page
        .getByRole('button', { name: 'Ocultar valores', exact: true })
        .and(page.locator(':visible'))
        .click();
      await expect(page.locator('.hero-balance')).toHaveText('••••••');
      await expect(page.locator('.bento-dashboard')).not.toContainText('R$');
      await page
        .getByRole('button', { name: 'Mostrar valores', exact: true })
        .and(page.locator(':visible'))
        .click();
      await page.getByRole('button', { name: '6M', exact: true }).click();
      await expect(page.locator('.trend-summary')).toContainText('R$');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      if (theme === 'dark' && (width === 390 || width === 1440))
        await page.screenshot({
          path: `/tmp/plannedwallet-bento-home-${width}.png`,
          fullPage: true,
        });
      await page.goto('/analytics?month=2026-11');
      await expect(page.getByRole('heading', { name: 'Métricas', exact: true })).toBeVisible();
      await expect(page.getByText('Distribuição dos gastos', { exact: true })).toBeVisible();
      await expect(page.getByText('Minha próxima viagem', { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(errors).toEqual([]);
      if (theme === 'dark' && (width === 390 || width === 1440))
        await page.screenshot({
          path: `/tmp/plannedwallet-bento-analytics-${width}.png`,
          fullPage: true,
        });
    });
test('quick transfer opens the existing transfer flow and menus retain all destinations', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  await page.goto('/');
  await page.getByRole('link', { name: 'Transferir', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Transferência', exact: true })).toHaveClass(
    /selected/,
  );
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Menu do espaço/ }).click();
  for (const name of [
    'Contas',
    'Planejamento',
    'Cartões e faturas',
    'Metas e reservas',
    'Revisão assistida',
  ])
    await expect(
      page
        .getByRole('navigation', { name: 'Mais funções' })
        .getByRole('link', { name, exact: true }),
    ).toBeVisible();
});
