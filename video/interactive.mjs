// Builds the interactive tutorial page for one recorded episode: the scripted-demo player
// (video/scripted-demo/player.js) with the raw recording as its stage.
//
// The stage is the recording.webm Playwright made, with one invisible hotspot per step laid over it
// at the box the recorder measured. On each step, `render(state)` plays that step's recorded clip
// (`from` -> `to`) and pauses cleanly at the end of the segment, so typing, clicking, and page
// transitions play back smoothly while chapters, prev/next, and narration stay synchronized.

const escapeHtml = (text) =>
  String(text ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

// A `<script>` body must not contain `</script`; JSON.stringify leaves `<` as is.
const scriptJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

/** The second the stage rests on before a step's action starts (after scroll/layout settle). */
function freezeAt(step) {
  return Math.max(0, step.startMs) / 1000;
}

/** The second where a step's recorded action begins (typing, clicking, etc.). */
function clipStart(step) {
  const start = step.actionMs ?? step.startMs;
  return Math.max(0, start - 80) / 1000;
}

/**
 * The second where a step's own recorded action settles.
 * Stops strictly at `step.endMs` so playback never bleeds into the next step's hover/scroll.
 */
function clipEnd(step) {
  return Math.max(clipStart(step), Math.max(0, step.endMs - 50) / 1000);
}

/**
 * The player's sections from the timeline: one per chapter (or one for the whole episode), each
 * step plays its own recorded clip (`from` -> `to`) when entered.
 */
export function toSections(timeline) {
  const steps = timeline.steps;
  const groups = [];
  steps.forEach((step) => {
    const title = step.section ?? null;
    let group = groups[groups.length - 1];
    if (!group || group.key !== title) {
      const chapter = timeline.chapters?.find((c) => c.title === title);
      group = {
        key: title,
        title: title ?? timeline.title,
        intro: chapter?.intro ?? (groups.length === 0 ? timeline.subtitle : undefined),
        steps: [],
      };
      groups.push(group);
    }
    const from = clipStart(step);
    const to = clipEnd(step);
    group.steps.push({
      target: `h${step.index}`,
      say: step.subtitle || step.title,
      set: { from, to, play: true, stepId: step.index },
    });
  });

  return groups.map((group, gi) => {
    const first = steps.find((s) => `h${s.index}` === group.steps[0].target);
    const rest = freezeAt(first);
    const section = {
      title: group.title,
      ...(group.intro ? { intro: group.intro } : {}),
      keyframe: { from: rest, to: rest, play: false, stepId: 0 },
      steps: group.steps,
    };
    if (gi === groups.length - 1 && timeline.summary?.length) {
      section.summary = { title: '重點', points: timeline.summary };
    }
    return section;
  });
}

/**
 * @param timeline  the recorded EpisodeTimeline
 * @param files     { video }: the recording's file name next to the HTML
 * @param playerJs  the text of video/scripted-demo/player.js, inlined so the page is one file
 */
export function buildInteractiveHtml(timeline, files, playerJs) {
  if (!timeline.steps.length) throw new Error(`${timeline.id}: no steps to build a page from`);
  const { width, height } = timeline.viewport;
  const phone = width < 600;
  const hotspots = timeline.steps
    .filter((s) => s.box)
    .map((s) => {
      const pct = (v, total) => `${((v / total) * 100).toFixed(3)}%`;
      return `<div class="hot" data-demo="h${s.index}" data-i="${s.index}" style="left:${pct(s.box.x, width)};top:${pct(
        s.box.y,
        height,
      )};width:${pct(s.box.width, width)};height:${pct(s.box.height, height)}"></div>`;
    })
    .join('\n      ');

  const firstRest = freezeAt(timeline.steps[0]);
  const config = {
    sections: toSections(timeline),
    initialState: { from: firstRest, to: firstRest, play: false, stepId: 0 },
    restByTarget: Object.fromEntries(timeline.steps.map((s) => [`h${s.index}`, freezeAt(s)])),
    device: phone ? 'phone' : 'desktop',
  };

  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(timeline.title)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; background: #0b1220; color: #e2e8f0;
    font: 16px/1.5 "Noto Sans TC", "PingFang TC", system-ui, sans-serif; }
  .wrap { max-width: ${phone ? 430 : 1120}px; margin: 0 auto; padding: 20px 16px 32px; }
  h1 { font-size: 20px; margin: 0 0 4px; color: #f8fafc; }
  .sub { margin: 0 0 14px; color: #94a3b8; font-size: 14px; }
  #stage { position: relative; width: 100%; aspect-ratio: ${width} / ${height}; overflow: hidden;
    background: #000; border-radius: ${phone ? '28px; border: 10px solid #1e293b' : '10px'}; }
  #rec { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: fill; display: block; }
  .hot { position: absolute; border-radius: 6px; pointer-events: none; }
  /* Fade out spotlight, dark backdrop, and static cursor once the step's clip starts playing
     so the changing UI is completely unobstructed and no stale highlight lingers after navigation. */
  #stage.clip-reveal .sd-spot,
  #stage.clip-reveal .sd-cursor {
    opacity: 0 !important;
    transition: opacity 280ms ease !important;
  }
  /* Hide practice mode ("自己點點看") and theme switch (recording has a single light theme). */
  .sd-free, .sd-theme { display: none !important; }
</style>
</head>
<body>
<div class="wrap">
  <h1>${escapeHtml(timeline.title)}</h1>
  <p class="sub">${escapeHtml(timeline.subtitle)}</p>
  <div id="stage">
    <video id="rec" src="${escapeHtml(files.video)}" muted playsinline preload="auto"></video>
      ${hotspots}
  </div>
  <div id="tour-controls"></div>
</div>
<script>
${playerJs.replace(/<\/script/gi, '<\\/script')}
</script>
<script>
(function () {
  var config = ${scriptJson(config)};
  var video = document.getElementById('rec');
  var stopAt = null;
  var rafId = 0;
  var lastKey = '';
  var demo = null;

  function stopClip() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    stopAt = null;
    if (!video.paused) video.pause();
  }

  function tickClip() {
    if (stopAt === null) return;
    if (video.currentTime >= stopAt - 0.02 || video.ended) {
      video.pause();
      if (Math.abs(video.currentTime - stopAt) > 0.02) {
        try { video.currentTime = stopAt; } catch (_) {}
      }
      stopAt = null;
      rafId = 0;
      return;
    }
    rafId = requestAnimationFrame(tickClip);
  }

  function playSegment(from, to, shouldPlay) {
    stopClip();
    var start = Math.max(0, Number(from) || 0);
    var end = Math.max(start, Number(to) || start);

    var begin = function () {
      try { video.currentTime = start; } catch (_) {}
      if (!shouldPlay || end - start <= 0.05) {
        video.pause();
        return;
      }
      video.playbackRate = (demo && demo.speed) ? demo.speed : 1;
      stopAt = end;
      var p = video.play();
      if (p && typeof p.catch === 'function') p.catch(function () {});
      rafId = requestAnimationFrame(tickClip);
    };

    if (video.readyState >= 1) {
      begin();
    } else {
      video.addEventListener('loadedmetadata', begin, { once: true });
    }
  }

  var stageEl = document.getElementById('stage');

  function render(state) {
    var frame = demo && demo.idx >= 0 ? demo.frames[demo.idx] : null;
    var activeTarget = frame && frame.type === 'step' && frame.step ? frame.step.target : null;
    var isCurrentStepAction = Boolean(state.play && activeTarget === 'h' + state.stepId);
    var gen = demo ? demo.gen : 0;
    var key = gen + ':' + state.stepId + ':' + (isCurrentStepAction ? 'play' : 'rest');
    if (key === lastKey) return;
    lastKey = key;

    if (isCurrentStepAction) {
      stageEl.classList.add('clip-reveal');
      playSegment(state.from, state.to, true);
    } else {
      // Restoring the resting screen BEFORE the current step runs so spotlight & cursor match the UI
      stageEl.classList.remove('clip-reveal');
      var restTime =
        activeTarget && typeof config.restByTarget[activeTarget] === 'number'
          ? config.restByTarget[activeTarget]
          : state.to;
      playSegment(restTime, restTime, false);
    }
  }

  demo = ScriptedDemo.create({
    stage: '#stage',
    controls: '#tour-controls',
    device: config.device,
    initialState: config.initialState,
    render: render,
    sections: config.sections
  });
})();
</script>
</body>
</html>
`;
}
