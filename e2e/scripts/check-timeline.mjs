#!/usr/bin/env node
// Checks what `pnpm e2e:record` left in e2e/output/<episode>/ before it is rendered into a video.
// Usage: node e2e/scripts/check-timeline.mjs [episode-id ...]   (no id: every recorded episode)
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const outputDir = path.join(repoRoot, 'e2e', 'output');
const catalog = fs.readFileSync(path.join(repoRoot, 'video', 'episodes.ts'), 'utf8');

// A caption longer than this is hard to read in the 1.4 s a recorded step stays on screen.
const MAX_CAPTION_CHARS = 60;
const MIN_STEP_MS = 500;

const ids = process.argv.slice(2).length
  ? process.argv.slice(2)
  : fs.existsSync(outputDir)
    ? fs
        .readdirSync(outputDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
    : [];

if (!ids.length) {
  console.error('No recorded episode in e2e/output/. Run `pnpm e2e:record` first.');
  process.exit(1);
}

let failed = 0;

for (const id of ids) {
  const dir = path.join(outputDir, id);
  const errors = [];
  const warnings = [];
  const file = (name) => path.join(dir, name);

  if (!fs.existsSync(file('timeline.json'))) {
    console.log(`✗ ${id}: no timeline.json (did the spec call tutorial.init with this id?)`);
    failed += 1;
    continue;
  }
  const timeline = JSON.parse(fs.readFileSync(file('timeline.json'), 'utf8'));
  const { width, height } = timeline.viewport;

  if (!fs.existsSync(file('recording.webm'))) errors.push('no recording.webm');
  if (!fs.existsSync(file('captions.vtt'))) errors.push('no captions.vtt');
  if (!catalog.includes(`'${id}'`)) {
    errors.push(`not registered in video/episodes.ts (add recordedEpisode({ id: '${id}', … }))`);
  }
  if (!timeline.steps.length) errors.push('no steps recorded');

  let previousEnd = 0;
  for (const step of timeline.steps) {
    const at = `step ${step.index}「${step.title}」`;
    if (!step.box) {
      errors.push(`${at}: no target box (pass \`target\` so the video can zoom and highlight)`);
    } else {
      const { x, y, width: w, height: h } = step.box;
      if (w <= 0 || h <= 0) errors.push(`${at}: target has no size`);
      if (x < 0 || y < 0 || x + w > width || y + h > height) {
        errors.push(`${at}: target is outside the ${width}×${height} viewport (scroll it into view)`);
      }
    }
    if (!step.subtitle?.trim()) errors.push(`${at}: empty subtitle`);
    if ((step.subtitle ?? '').length > MAX_CAPTION_CHARS) {
      warnings.push(`${at}: subtitle is ${step.subtitle.length} characters (keep it under ${MAX_CAPTION_CHARS})`);
    }
    if (step.endMs - step.startMs < MIN_STEP_MS) errors.push(`${at}: shorter than ${MIN_STEP_MS} ms`);
    if (step.startMs < previousEnd) errors.push(`${at}: starts before the previous step ends`);
    previousEnd = step.endMs;
  }

  if (timeline.chapters?.length) {
    const unplaced = timeline.steps.filter((s) => !s.section);
    if (unplaced.length) {
      warnings.push(`${unplaced.length} step(s) before the first tutorial.section() have no chapter`);
    }
    for (const chapter of timeline.chapters) {
      if (!timeline.steps.some((s) => s.section === chapter.title)) {
        errors.push(`chapter「${chapter.title}」has no steps`);
      }
    }
  }

  for (const audit of timeline.a11yAudits) {
    if (audit.violationIds.length) {
      errors.push(`a11y「${audit.context}」: ${audit.violationIds.join(', ')}`);
    }
  }
  if (!timeline.a11yAudits.length) warnings.push('no tutorial.checkA11y() call');

  const mark = errors.length ? '✗' : '✓';
  console.log(
    `${mark} ${id}: ${timeline.steps.length} steps, ${timeline.chapters?.length ?? 0} chapters, ` +
      `${(timeline.durationMs / 1000).toFixed(1)} s`,
  );
  for (const e of errors) console.log(`    error: ${e}`);
  for (const w of warnings) console.log(`    warn:  ${w}`);
  if (errors.length) failed += 1;
}

process.exit(failed ? 1 : 0);
