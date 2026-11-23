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
  /** The chapter this step belongs to, when the story is split with `tutorial.section()`. */
  section?: string;
  title: string;
  subtitle: string;
  ariaLabel?: string;
  startMs: number;
  /** 操作觸發的時間點（用於觸發點擊波紋與聚光燈淡出） */
  actionMs?: number;
  endMs: number;
  box: TutorialStepBox | null;
}

export interface A11yAuditRecord {
  context: string;
  timestampMs: number;
  passedRulesCount: number;
  violationIds: string[];
}

/** One chapter of a story: a short, self-contained part such as 「登入」 or 「送出求助」. */
export interface TutorialChapterRecord {
  title: string;
  /** One or two sentences on what this chapter shows; shown on the chapter card. */
  intro?: string;
  startMs: number;
  endMs: number;
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
  /** Present when the story uses `tutorial.section()`. */
  chapters?: TutorialChapterRecord[];
  /** Key points for the closing card, in the viewer's everyday words. */
  summary?: string[];
}

interface InitEpisodeOptions {
  id: string;
  title: string;
  subtitle: string;
  surface: 'site' | 'admin';
  /** Key points for the closing card. Leave out for the generic closing line. */
  summary?: string[];
}

interface StepOptions {
  title: string;
  subtitle: string;
  target?: Locator;
  /** 點擊前停頓讓觀眾看清楚聚光燈位置 */
  preActionMs?: number;
  /** 點擊後停頓讓觀眾看清楚畫面結果 */
  holdMs?: number;
  action?: () => Promise<void>;
}

type TutorialPaceMode = 'fast' | 'normal' | 'slow';

interface PaceProfile {
  mode: TutorialPaceMode;
  preActionMs: number;
  minHoldMs: number;
  maxHoldMs: number;
  msPerChar: number;
  hoverSettleMs: number;
  scrollSettleMs: number;
  typeDelayMs: number;
  cursorMoveSteps: number;
  smoothScroll: boolean;
}

const PACE_PROFILES: Record<TutorialPaceMode, PaceProfile> = {
  fast: {
    mode: 'fast',
    preActionMs: 0,
    minHoldMs: 0,
    maxHoldMs: 0,
    msPerChar: 0,
    hoverSettleMs: 0,
    scrollSettleMs: 0,
    typeDelayMs: 0,
    cursorMoveSteps: 0,
    smoothScroll: false,
  },
  normal: {
    mode: 'normal',
    preActionMs: 750,
    minHoldMs: 1350,
    maxHoldMs: 2600,
    msPerChar: 45,
    hoverSettleMs: 220,
    scrollSettleMs: 360,
    typeDelayMs: 55,
    cursorMoveSteps: 20,
    smoothScroll: true,
  },
  slow: {
    mode: 'slow',
    preActionMs: 1100,
    minHoldMs: 1800,
    maxHoldMs: 3200,
    msPerChar: 60,
    hoverSettleMs: 280,
    scrollSettleMs: 450,
    typeDelayMs: 80,
    cursorMoveSteps: 28,
    smoothScroll: true,
  },
};

function resolvePace(): PaceProfile {
  const explicit = process.env.TUTORIAL_PACE;
  if (explicit === 'fast' || explicit === 'normal' || explicit === 'slow') {
    return PACE_PROFILES[explicit];
  }
  return process.env.RECORD_TUTORIAL === '1' ? PACE_PROFILES.normal : PACE_PROFILES.fast;
}

const PACE = resolvePace();

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

/**
 * WebVTT chapters (`<track kind="chapters">`): lets an HTML player list the story's chapters and
 * jump between them. Null when the story has no chapters.
 */
export function buildChaptersVtt(timeline: EpisodeTimeline): string | null {
  if (!timeline.chapters?.length) {
    return null;
  }
  const lines = ['WEBVTT', `NOTE ${timeline.id} - ${timeline.title} chapters`, ''];
  timeline.chapters.forEach((chapter, i) => {
    lines.push(`${i + 1}`);
    lines.push(`${formatVttTimestamp(chapter.startMs)} --> ${formatVttTimestamp(chapter.endMs)}`);
    lines.push(chapter.title);
    lines.push('');
  });
  return lines.join('\n');
}

export class TutorialRecorder {
  private readonly page: Page;
  /** Playwright 在建立 page 時即啟動 recordVideo，因此時間基準必須從 constructor 開始算 */
  private readonly recordingStartedAt: number;
  private meta: InitEpisodeOptions | null = null;
  private readonly steps: TutorialStepRecord[] = [];
  private readonly a11yAudits: A11yAuditRecord[] = [];
  private readonly chapters: TutorialChapterRecord[] = [];

  constructor(page: Page) {
    this.page = page;
    this.recordingStartedAt = Date.now();
  }

  init(options: InitEpisodeOptions): void {
    this.meta = options;
  }

  private nowMs(): number {
    return Math.max(0, Date.now() - this.recordingStartedAt);
  }

  private async scrollToTarget(targetEl: Locator): Promise<void> {
    if (PACE.smoothScroll) {
      await targetEl
        .evaluate((el) => {
          el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        })
        .catch(() => targetEl.scrollIntoViewIfNeeded().catch(() => {}));
      if (PACE.scrollSettleMs > 0) {
        await this.page.waitForTimeout(PACE.scrollSettleMs);
      }
      return;
    }
    await targetEl.scrollIntoViewIfNeeded().catch(() => {});
  }

  private async glideCursorTo(targetEl: Locator): Promise<void> {
    if (PACE.cursorMoveSteps <= 0) {
      return;
    }
    const rawBox = await targetEl.boundingBox().catch(() => null);
    if (!rawBox) {
      return;
    }
    const cx = rawBox.x + rawBox.width / 2;
    const cy = rawBox.y + rawBox.height / 2;
    await this.page.mouse.move(cx, cy, { steps: PACE.cursorMoveSteps }).catch(() => {});
  }

  /**
   * 依目前節奏輸入文字：一般 E2E 使用瞬間 fill()，錄製教學模式改為平滑移動並逐字輸入。
   */
  async type(locator: Locator, text: string): Promise<void> {
    const targetEl = locator.first();
    await expect(targetEl).toBeVisible();
    if (PACE.typeDelayMs <= 0) {
      await targetEl.fill(text);
      return;
    }
    await this.scrollToTarget(targetEl);
    await this.glideCursorTo(targetEl);
    await targetEl.click();
    await targetEl.fill('');
    await targetEl.pressSequentially(text, { delay: PACE.typeDelayMs });
  }

  /**
   * Starts a chapter: every step after this belongs to it until the next `section()`. Optional;
   * a story without chapters records as before.
   */
  section(title: string, intro?: string): void {
    const now = this.nowMs();
    const open = this.chapters[this.chapters.length - 1];
    if (open && open.endMs < 0) {
      open.endMs = now;
    }
    this.chapters.push({ title, intro, startMs: now, endMs: -1 });
  }

  async step(options: StepOptions): Promise<void> {
    let box: TutorialStepBox | null = null;
    let ariaLabel: string | undefined;

    // 先等目標出現、捲動至可視範圍並平滑移入游標（觸發 hover 展開），穩定後再開始計時與量測座標
    if (options.target) {
      const targetEl = options.target.first();
      await expect(targetEl).toBeVisible();
      await this.scrollToTarget(targetEl);
      await this.glideCursorTo(targetEl);
      await targetEl.hover().catch(() => {});
      if (PACE.hoverSettleMs > 0) {
        await this.page.waitForTimeout(PACE.hoverSettleMs);
      }

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

    const prevEnd = this.steps[this.steps.length - 1]?.endMs ?? 0;
    const startMs = Math.max(prevEnd, this.nowMs());

    // 操作前停頓，讓聚光燈與游標精準停在目標元件上（一般 E2E 模式為 0ms）
    const preWait = PACE.mode === 'fast' ? 0 : (options.preActionMs ?? PACE.preActionMs);
    if (preWait > 0 && options.target) {
      await this.page.waitForTimeout(preWait);
    }

    const actionMs = this.nowMs();
    if (options.action) {
      await options.action();
    }

    // 錄製模式依字幕長度自動計算停頓時間，確保觀眾來得及閱讀；一般 E2E 模式為 0ms
    const autoHold = Math.min(
      PACE.maxHoldMs,
      Math.max(PACE.minHoldMs, options.subtitle.length * PACE.msPerChar),
    );
    const hold = PACE.mode === 'fast' ? 0 : (options.holdMs ?? autoHold);
    if (hold > 0) {
      await this.page.waitForTimeout(hold);
    }

    const minStepDuration = PACE.mode === 'fast' ? 1 : 600;
    const endMs = Math.max(startMs + minStepDuration, this.nowMs());
    this.steps.push({
      index: this.steps.length + 1,
      section: this.chapters[this.chapters.length - 1]?.title,
      title: options.title,
      subtitle: options.subtitle,
      ariaLabel,
      startMs,
      actionMs,
      endMs,
      box,
    });
  }

  /**
   * 執行 WCAG 2.1 A/AA 無障礙掃描（排除第三方 Leaflet 圖磚內部 DOM），
   * 確保互動元件具備可辨識的無障礙名稱、表單標籤與語意角色。
   */
  async checkA11y(contextName: string, options?: { strict?: boolean }): Promise<void> {
    // Wait for Next.js App Router to finish reconciling <head> metadata after client-side navigation
    await expect(this.page).toHaveTitle(/\S/);

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
        await this.type(emailInput, email);
        await this.type(passwordInput, password);
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

    const durationMs = Math.max(this.nowMs(), 3000);
    const chapters = this.chapters.map((chapter) => ({
      ...chapter,
      endMs: chapter.endMs < 0 ? durationMs : chapter.endMs,
    }));
    const timeline: EpisodeTimeline = {
      id: this.meta.id,
      title: this.meta.title,
      subtitle: this.meta.subtitle,
      surface: this.meta.surface,
      viewport: this.page.viewportSize() ?? { width: 1280, height: 720 },
      durationMs,
      steps: this.steps,
      a11yAudits: this.a11yAudits,
      ...(chapters.length ? { chapters } : {}),
      ...(this.meta.summary?.length ? { summary: this.meta.summary } : {}),
    };

    const timelineJson = JSON.stringify(timeline, null, 2);
    await fs.writeFile(path.join(outputDir, 'timeline.json'), timelineJson, 'utf8');
    await fs.writeFile(
      path.join(studioPublicDir, `${this.meta.id}.timeline.json`),
      timelineJson,
      'utf8',
    );
    await fs.writeFile(path.join(outputDir, 'captions.vtt'), buildWebVtt(timeline), 'utf8');
    const chaptersVtt = buildChaptersVtt(timeline);
    if (chaptersVtt) {
      await fs.writeFile(path.join(outputDir, 'chapters.vtt'), chaptersVtt, 'utf8');
    }

    const video = this.page.video();
    if (video) {
      await this.page.close();
      // saveAs waits for Playwright to finish writing the file; video.path() can name a file that
      // is not there yet right after the page closes.
      const recording = path.join(outputDir, 'recording.webm');
      await video.saveAs(recording);
      await fs.copyFile(recording, path.join(studioPublicDir, `${this.meta.id}.webm`));
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
