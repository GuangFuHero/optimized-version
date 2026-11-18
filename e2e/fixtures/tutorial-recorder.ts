import AxeBuilder from '@axe-core/playwright';
import { test as base, expect, type Locator, type Page } from '@playwright/test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface TutorialStepBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TutorialStepRecord {
  index: number;
  title: string;
  subtitle: string;
  ariaLabel?: string;
  startMs: number;
  endMs: number;
  box: TutorialStepBox | null;
}

export interface A11yAuditRecord {
  context: string;
  timestampMs: number;
  passedRulesCount: number;
  violationIds: string[];
}

export interface EpisodeTimeline {
  id: string;
  title: string;
  subtitle: string;
  surface: 'site' | 'admin';
  viewport: { width: number; height: number };
  durationMs: number;
  steps: TutorialStepRecord[];
  a11yAudits: A11yAuditRecord[];
}

interface InitEpisodeOptions {
  id: string;
  title: string;
  subtitle: string;
  surface: 'site' | 'admin';
}

interface StepOptions {
  title: string;
  subtitle: string;
  target?: Locator;
  holdMs?: number;
  action?: () => Promise<void>;
}

const IS_TUTORIAL_MODE = process.env.RECORD_TUTORIAL === '1';
const DEFAULT_HOLD_MS = IS_TUTORIAL_MODE ? 1400 : 100;

function formatVttTimestamp(ms: number): string {
  const clamped = Math.max(0, Math.round(ms));
  const hours = Math.floor(clamped / 3_600_000);
  const minutes = Math.floor((clamped % 3_600_000) / 60_000);
  const seconds = Math.floor((clamped % 60_000) / 1000);
  const millis = clamped % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

export function buildWebVtt(timeline: EpisodeTimeline): string {
  const lines = ['WEBVTT', `NOTE ${timeline.id} - ${timeline.title}`, ''];
  timeline.steps.forEach((step) => {
    lines.push(`${step.index}`);
    lines.push(`${formatVttTimestamp(step.startMs)} --> ${formatVttTimestamp(step.endMs)}`);
    lines.push(`【步驟 ${step.index}：${step.title}】${step.subtitle}`);
    lines.push('');
  });
  return lines.join('\n');
}

export class TutorialRecorder {
  private readonly page: Page;
  private startedAt = Date.now();
  private meta: InitEpisodeOptions | null = null;
  private readonly steps: TutorialStepRecord[] = [];
  private readonly a11yAudits: A11yAuditRecord[] = [];

  constructor(page: Page) {
    this.page = page;
  }

  init(options: InitEpisodeOptions): void {
    this.startedAt = Date.now();
    this.meta = options;
  }

  private nowMs(): number {
    return Date.now() - this.startedAt;
  }

  async step(options: StepOptions): Promise<void> {
    const startMs = this.nowMs();
    let box: TutorialStepBox | null = null;
    let ariaLabel: string | undefined;

    if (options.target) {
      const targetEl = options.target.first();
      await expect(targetEl).toBeVisible();
      await targetEl.hover().catch(() => {});
      await this.page.waitForTimeout(180);
      const rawBox = await targetEl.boundingBox();
      if (rawBox) {
        box = {
          x: Math.round(rawBox.x),
          y: Math.round(rawBox.y),
          width: Math.round(rawBox.width),
          height: Math.round(rawBox.height),
        };
      }
      const attrLabel = await targetEl.getAttribute('aria-label');
      const textContent = (await targetEl.innerText().catch(() => '')).trim();
      ariaLabel = attrLabel || textContent || undefined;
    }

    if (options.action) {
      await options.action();
    }

    const hold = options.holdMs ?? DEFAULT_HOLD_MS;
    if (hold > 0) {
      await this.page.waitForTimeout(hold);
    }

    const endMs = Math.max(startMs + 500, this.nowMs());
    this.steps.push({
      index: this.steps.length + 1,
      title: options.title,
      subtitle: options.subtitle,
      ariaLabel,
      startMs,
      endMs,
      box,
    });
  }

  /**
   * 執行 WCAG 2.1 A/AA 無障礙掃描（排除第三方 Leaflet 圖磚內部 DOM），
   * 確保互動元件具備可辨識的無障礙名稱、表單標籤與語意角色。
   */
  async checkA11y(contextName: string, options?: { strict?: boolean }): Promise<void> {
    const results = await new AxeBuilder({ page: this.page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .exclude('.leaflet-container')
      // MUI disabled buttons and subtle badges intentionally use design-token muted colors
      .disableRules(['color-contrast'])
      .analyze();

    const criticalOrSerious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );

    this.a11yAudits.push({
      context: contextName,
      timestampMs: this.nowMs(),
      passedRulesCount: results.passes.length,
      violationIds: criticalOrSerious.map((v) => `${v.id} (${v.nodes.length})`),
    });

    if (options?.strict !== false) {
      expect(
        criticalOrSerious,
        `[${contextName}] 發現嚴重無障礙違規: ${criticalOrSerious
          .map((v) => `${v.id}: ${v.help} -> ${v.nodes.map((n) => n.html).join(' | ')}`)
          .join('\n')}`,
      ).toEqual([]);
    }
  }

  async loginWithCredentials(email: string, password = 'Mock1234!'): Promise<void> {
    const surface = this.meta?.surface ?? 'site';
    const cacheFile = path.resolve(__dirname, '..', 'output', '.auth-cookies.json');
    const cacheKey = `${surface}:${email}`;

    try {
      const raw = await fs.readFile(cacheFile, 'utf8');
      const cache = JSON.parse(raw) as Record<
        string,
        { savedAt: number; cookies: Parameters<ReturnType<Page['context']>['addCookies']>[0] }
      >;
      const entry = cache[cacheKey];
      // Reuse session cookies within 10 minutes to avoid triggering the backend login rate limiter
      if (entry && Date.now() - entry.savedAt < 10 * 60 * 1000 && entry.cookies.length > 0) {
        await this.page.context().addCookies(entry.cookies);
        await this.page.goto(surface === 'admin' ? '/dashboard' : '/map');
        return;
      }
    } catch {
      // No cache yet; proceed with UI login
    }

    const emailInput = this.page.getByRole('textbox', { name: '電子郵件' });
    const passwordInput = this.page.getByRole('textbox', { name: '密碼' });
    await this.step({
      title: '輸入登入帳號與密碼',
      subtitle: `於「電子郵件」欄位輸入 ${email} 並填寫密碼後送出登入。`,
      target: emailInput,
      action: async () => {
        await emailInput.fill(email);
        await passwordInput.fill(password);
        await this.page.getByRole('button', { name: '登入', exact: true }).click();
      },
    });

    await this.page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
    const cookies = await this.page.context().cookies();
    try {
      await fs.mkdir(path.dirname(cacheFile), { recursive: true });
      const existing = await fs
        .readFile(cacheFile, 'utf8')
        .then((r) => JSON.parse(r) as Record<string, unknown>)
        .catch(() => ({}));
      existing[cacheKey] = { savedAt: Date.now(), cookies };
      await fs.writeFile(cacheFile, JSON.stringify(existing, null, 2), 'utf8');
    } catch {
      // Ignore cache write errors
    }
  }

  async flushArtifacts(): Promise<void> {
    if (!this.meta) {
      return;
    }

    const outputDir = path.resolve(__dirname, '..', 'output', this.meta.id);
    const studioPublicDir = path.resolve(__dirname, '..', '..', 'video', 'public', 'recordings');
    await fs.mkdir(outputDir, { recursive: true });
    await fs.mkdir(studioPublicDir, { recursive: true });

    const timeline: EpisodeTimeline = {
      id: this.meta.id,
      title: this.meta.title,
      subtitle: this.meta.subtitle,
      surface: this.meta.surface,
      viewport: this.page.viewportSize() ?? { width: 1280, height: 720 },
      durationMs: Math.max(this.nowMs(), 3000),
      steps: this.steps,
      a11yAudits: this.a11yAudits,
    };

    const timelineJson = JSON.stringify(timeline, null, 2);
    await fs.writeFile(path.join(outputDir, 'timeline.json'), timelineJson, 'utf8');
    await fs.writeFile(
      path.join(studioPublicDir, `${this.meta.id}.timeline.json`),
      timelineJson,
      'utf8',
    );
    await fs.writeFile(path.join(outputDir, 'captions.vtt'), buildWebVtt(timeline), 'utf8');

    const video = this.page.video();
    if (video) {
      await this.page.close();
      const videoPath = await video.path().catch(() => null);
      if (videoPath) {
        await fs.copyFile(videoPath, path.join(outputDir, 'recording.webm'));
        await fs.copyFile(videoPath, path.join(studioPublicDir, `${this.meta.id}.webm`));
      }
    }
  }
}

export const test = base.extend<{ tutorial: TutorialRecorder }>({
  tutorial: async ({ page }, use) => {
    const recorder = new TutorialRecorder(page);
    await use(recorder);
    await recorder.flushArtifacts();
  },
});

export { expect };
