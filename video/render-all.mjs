#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const e2eOutputDir = path.join(repoRoot, 'e2e', 'output');
const publicRecDir = path.join(__dirname, 'public', 'recordings');
const outDir = path.join(__dirname, 'out');

fs.mkdirSync(publicRecDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

if (!fs.existsSync(e2eOutputDir)) {
  console.error('尚未找到 e2e/output/ 錄影產物，請先執行：pnpm e2e:record');
  process.exit(1);
}

const episodes = fs
  .readdirSync(e2eOutputDir, { withFileTypes: true })
  .filter((d) => d.isDirectory());

for (const dir of episodes) {
  const episodeId = dir.name;
  const timelinePath = path.join(e2eOutputDir, episodeId, 'timeline.json');
  const videoPath = path.join(e2eOutputDir, episodeId, 'recording.webm');
  const vttPath = path.join(e2eOutputDir, episodeId, 'captions.vtt');

  if (!fs.existsSync(timelinePath)) continue;

  const timeline = JSON.parse(fs.readFileSync(timelinePath, 'utf8'));
  let videoSrc;
  if (fs.existsSync(videoPath)) {
    const destVideo = path.join(publicRecDir, `${episodeId}.webm`);
    fs.copyFileSync(videoPath, destVideo);
    videoSrc = `/recordings/${episodeId}.webm`;
  }

  if (fs.existsSync(vttPath)) {
    fs.copyFileSync(vttPath, path.join(outDir, `${episodeId}.vtt`));
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
    ],
    { cwd: repoRoot, stdio: 'inherit' },
  );
}
