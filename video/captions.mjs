// Captions and chapters for the rendered MP4, on the video's clock.

/** Where the recording starts in the rendered video: INTRO_FRAMES / fps in TutorialComposition.tsx. */
export const INTRO_MS = 2000;

function vttTime(ms) {
  const t = Math.max(0, Math.round(ms));
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${pad(Math.floor(t / 3_600_000))}:${pad(Math.floor((t % 3_600_000) / 60_000))}:${pad(
    Math.floor((t % 60_000) / 1000),
  )}.${pad(t % 1000, 3)}`;
}

/** The captions on the rendered video's clock (the recorder writes them on the recording's). */
export function captionsVtt(timeline, offsetMs = INTRO_MS) {
  const lines = ['WEBVTT', ''];
  timeline.steps.forEach((step) => {
    lines.push(String(step.index));
    lines.push(`${vttTime(step.startMs + offsetMs)} --> ${vttTime(step.endMs + offsetMs)}`);
    lines.push(`【步驟 ${step.index}：${step.title}】${step.subtitle}`);
    lines.push('');
  });
  return lines.join('\n');
}

/** WebVTT chapters on the rendered video's clock; null without chapters. */
export function chaptersVtt(timeline, offsetMs = INTRO_MS) {
  if (!timeline.chapters?.length) return null;
  const lines = ['WEBVTT', ''];
  timeline.chapters.forEach((chapter, i) => {
    lines.push(String(i + 1));
    lines.push(`${vttTime(chapter.startMs + offsetMs)} --> ${vttTime(chapter.endMs + offsetMs)}`);
    lines.push(chapter.title);
    lines.push('');
  });
  return lines.join('\n');
}
