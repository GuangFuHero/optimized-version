#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { captionsVtt, chaptersVtt } from './captions.mjs';
import { buildInteractiveHtml } from './interactive.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const e2eOutputDir = path.join(repoRoot, 'e2e', 'output');
const publicRecDir = path.join(__dirname, 'public', 'recordings');
const outDir = path.join(__dirname, 'out');
const playerJs = fs.readFileSync(path.join(__dirname, 'scripted-demo', 'player.js'), 'utf8');

fs.mkdirSync(publicRecDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

if (!fs.existsSync(e2eOutputDir)) {
  console.error('尚未找到 e2e/output/ 錄影產物，請先執行：pnpm e2e:record');
  process.exit(1);
}

// `pnpm video:render <episode-id> ...` renders only those; no id renders every recorded episode.
// `--html-only` (`pnpm video:html`) writes the captions and interactive pages without the MP4.
const args = process.argv.slice(2);
const htmlOnly = args.includes('--html-only');
const only = new Set(args.filter((a) => !a.startsWith('--')));
const episodes = fs
  .readdirSync(e2eOutputDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && (only.size === 0 || only.has(d.name)));

for (const dir of episodes) {
  const episodeId = dir.name;
  const timelinePath = path.join(e2eOutputDir, episodeId, 'timeline.json');
  const videoPath = path.join(e2eOutputDir, episodeId, 'recording.webm');

  if (!fs.existsSync(timelinePath)) continue;

  const timeline = JSON.parse(fs.readFileSync(timelinePath, 'utf8'));
  let videoSrc;
  if (fs.existsSync(videoPath)) {
    const destVideo = path.join(publicRecDir, `${episodeId}.webm`);
    fs.copyFileSync(videoPath, destVideo);
    videoSrc = `/recordings/${episodeId}.webm`;
  }

  // e2e/output/<id>/captions.vtt is on the recording's clock; the MP4 starts with the intro card,
  // so the copies beside it are rebuilt on the video's clock.
  fs.writeFileSync(path.join(outDir, `${episodeId}.vtt`), captionsVtt(timeline));
  const chapters = chaptersVtt(timeline);
  if (chapters) {
    fs.writeFileSync(path.join(outDir, `${episodeId}.chapters.vtt`), chapters);
  }
  // The interactive page plays the raw recording (no burned-in overlays) under the player.
  if (fs.existsSync(videoPath) && timeline.steps.length) {
    fs.copyFileSync(videoPath, path.join(outDir, `${episodeId}.webm`));
    fs.writeFileSync(
      path.join(outDir, `${episodeId}.html`),
      buildInteractiveHtml(timeline, { video: `${episodeId}.webm` }, playerJs),
    );
  }

  if (htmlOnly) {
    console.log(`📄 ${episodeId}: ${path.join(outDir, `${episodeId}.html`)}`);
    continue;
  }

  const propsFile = path.join(outDir, `${episodeId}.props.json`);
  fs.writeFileSync(propsFile, JSON.stringify({ timeline, videoSrc }, null, 2));

  const outMp4 = path.join(outDir, `${episodeId}.mp4`);
  console.log(`\n🎬 正在算圖教學影片：${episodeId} -> ${outMp4}`);
  execFileSync(
    'npx',
    [
      'remotion',
      'render',
      'video/index.ts',
      episodeId,
      outMp4,
      `--props=${propsFile}`,
      '--public-dir=video/public',
      // A machine that cannot download Remotion's browser can point it at one already there.
      ...(process.env.REMOTION_BROWSER_EXECUTABLE
        ? [`--browser-executable=${process.env.REMOTION_BROWSER_EXECUTABLE}`]
        : []),
    ],
    { cwd: repoRoot, stdio: 'inherit' },
  );
}
