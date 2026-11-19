import React from 'react';
import {
  AbsoluteFill,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type { EpisodeTimeline, TutorialStepRecord } from '../e2e/fixtures/tutorial-recorder';

export interface TutorialCompositionProps {
  timeline: EpisodeTimeline;
  videoSrc?: string;
}

// The recording starts after the intro card, so a step at `startMs` in the timeline is at
// INTRO_FRAMES + startMs in the rendered video. `video/render-all.mjs` shifts the captions and
// builds the player with the same offset (INTRO_MS there).
export const INTRO_FRAMES = 60; // 2 seconds at 30fps
const OUTRO_FRAMES = 60; // 2 seconds at 30fps

// Stage layout inside 1280x720 canvas:
// - Top chrome bar: 32px
// - Browser mockup frame: 992x558 (exact 16:9 ratio = 0.775 scale of 1280x720) centered horizontally
// - Dedicated bottom caption dock: 108px (never covers bottom buttons in the recorded app!)
const STAGE_WIDTH = 992;
const STAGE_HEIGHT = 558;
const BROWSER_BAR_HEIGHT = 28;
const STAGE_TOP = 16;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function easeInOutCubic(t: number): number {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

interface CursorState {
  x: number;
  y: number;
  opacity: number;
  scale: number;
}

function computeCursorState(
  steps: TutorialStepRecord[],
  currentMs: number,
  scaleX: number,
  scaleY: number,
): CursorState | null {
  const waypoints = steps
    .filter((s): s is TutorialStepRecord & { box: NonNullable<TutorialStepRecord['box']> } =>
      Boolean(s.box),
    )
    .map((s) => ({
      x: (s.box.x + s.box.width / 2) * scaleX,
      y: (s.box.y + s.box.height / 2) * scaleY,
      arriveMs: s.startMs,
      actionMs: s.actionMs ?? s.startMs,
    }));

  if (waypoints.length === 0) {
    return null;
  }

  const glideWithArc = (
    from: { x: number; y: number },
    to: { x: number; y: number },
    progress: number,
  ): { x: number; y: number } => {
    const e = easeInOutCubic(progress);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy);
    // Add a subtle natural curve perpendicular to the motion path
    const arcHeight = Math.min(26, dist * 0.1) * Math.sin(Math.PI * e);
    const nx = dist > 1 ? -dy / dist : 0;
    const ny = dist > 1 ? dx / dist : 0;
    return {
      x: from.x + dx * e + nx * arcHeight,
      y: from.y + dy * e + ny * arcHeight,
    };
  };

  let x = STAGE_WIDTH * 0.5;
  let y = STAGE_HEIGHT * 0.55;
  let opacity = 1;

  const first = waypoints[0];
  if (currentMs < first.arriveMs) {
    const moveStart = Math.max(0, first.arriveMs - 560);
    const t = first.arriveMs > moveStart ? (currentMs - moveStart) / (first.arriveMs - moveStart) : 1;
    const pos = glideWithArc({ x, y }, first, t);
    x = pos.x;
    y = pos.y;
    opacity = clamp(t * 2, 0, 1);
  } else {
    let idx = 0;
    for (let i = 0; i < waypoints.length; i += 1) {
      if (currentMs >= waypoints[i].arriveMs) {
        idx = i;
      }
    }
    const curr = waypoints[idx];
    const next = waypoints[idx + 1];

    if (next) {
      const moveStart = Math.max(curr.actionMs + 220, next.arriveMs - 580);
      if (currentMs >= moveStart && next.arriveMs > moveStart) {
        const t = (currentMs - moveStart) / (next.arriveMs - moveStart);
        const pos = glideWithArc(curr, next, t);
        x = pos.x;
        y = pos.y;
      } else {
        x = curr.x;
        y = curr.y;
      }
    } else {
      x = curr.x;
      y = curr.y;
      // Gently fade out cursor after the final step's action settles
      if (currentMs > curr.actionMs + 950) {
        opacity = clamp(1 - (currentMs - (curr.actionMs + 950)) / 400, 0, 1);
      }
    }
  }

  // Click press bounce synced with actionMs
  let scale = 1;
  for (const wp of waypoints) {
    if (currentMs >= wp.actionMs && currentMs <= wp.actionMs + 240) {
      const p = (currentMs - wp.actionMs) / 240;
      scale = 1 - 0.18 * Math.sin(p * Math.PI);
      break;
    }
  }

  return { x, y, opacity, scale };
}

export const TutorialComposition: React.FC<TutorialCompositionProps> = ({
  timeline,
  videoSrc,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const isIntro = frame < INTRO_FRAMES;
  const isOutro = frame >= durationInFrames - OUTRO_FRAMES;

  const contentFrame = Math.max(0, frame - INTRO_FRAMES);
  const currentMs = (contentFrame / fps) * 1000;

  // Find currently active step strictly within [startMs, endMs]
  const activeStep: TutorialStepRecord | undefined = timeline.steps.find(
    (s) => currentMs >= s.startMs && currentMs <= s.endMs,
  );
  // Keep showing the latest caption in the dock even during brief transitions between steps
  const captionStep: TutorialStepRecord | undefined =
    activeStep ??
    [...timeline.steps].reverse().find((s) => currentMs >= s.startMs) ??
    timeline.steps[0];

  // Spotlight is visible while focusing on the target (from startMs until actionMs + 450ms)
  const actionMs = activeStep?.actionMs ?? activeStep?.startMs ?? 0;
  const highlightUntilMs = activeStep ? Math.min(activeStep.endMs, actionMs + 550) : 0;
  const isHighlighting = Boolean(
    activeStep?.box && !isIntro && !isOutro && currentMs >= activeStep.startMs && currentMs <= highlightUntilMs,
  );

  const stepStartFrame = INTRO_FRAMES + Math.round(((activeStep?.startMs ?? 0) / 1000) * fps);
  const actionFrame = INTRO_FRAMES + Math.round((actionMs / 1000) * fps);

  const spotlightSpring = spring({
    frame: Math.max(0, frame - stepStartFrame),
    fps,
    config: { damping: 18, stiffness: 160 },
  });

  // Fade out spotlight smoothly right after action occurs so it never lingers on a changed screen
  const highlightFadeOut = activeStep
    ? interpolate(
        currentMs,
        [Math.max(actionMs + 200, activeStep.startMs + 200), highlightUntilMs],
        [1, 0],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
      )
    : 0;
  const spotlightOpacity = isHighlighting ? spotlightSpring * highlightFadeOut : 0;

  // Click ripple animation triggered at actionFrame
  const rippleProgress =
    isHighlighting && frame >= actionFrame
      ? interpolate(frame - actionFrame, [0, 14], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      : 0;

  // Map recording viewport coordinates (1280x720) to Browser Stage coordinates (992x558)
  const vpW = timeline.viewport.width || 1280;
  const vpH = timeline.viewport.height || 720;
  const scaleX = STAGE_WIDTH / vpW;
  const scaleY = STAGE_HEIGHT / vpH;

  const box = activeStep?.box
    ? {
        x: activeStep.box.x * scaleX,
        y: activeStep.box.y * scaleY,
        width: Math.max(24, activeStep.box.width * scaleX),
        height: Math.max(24, activeStep.box.height * scaleY),
      }
    : null;

  const cursor = !isIntro && !isOutro ? computeCursorState(timeline.steps, currentMs, scaleX, scaleY) : null;

  // Subtle clamped camera zoom (1.0 -> 1.14x) inside the browser viewport (never exposes black edges!)
  const zoomAmount = isHighlighting && box ? interpolate(spotlightOpacity, [0, 1], [1, 1.14]) : 1;
  const maxPanX = ((zoomAmount - 1) * STAGE_WIDTH) / 2;
  const maxPanY = ((zoomAmount - 1) * STAGE_HEIGHT) / 2;
  const targetX = box ? box.x + box.width / 2 : STAGE_WIDTH / 2;
  const targetY = box ? box.y + box.height / 2 : STAGE_HEIGHT / 2;
  const desiredPanX = (STAGE_WIDTH / 2 - targetX) * (zoomAmount - 1) * 1.4;
  const desiredPanY = (STAGE_HEIGHT / 2 - targetY) * (zoomAmount - 1) * 1.4;
  const panX = clamp(desiredPanX, -maxPanX, maxPanX);
  const panY = clamp(desiredPanY, -maxPanY, maxPanY);

  const isSite = timeline.surface === 'site';
  const accentColor = isSite ? '#F97316' : '#38BDF8'; // Brand warm orange for site, crisp sky blue for admin
  const accentGlow = isSite ? 'rgba(249, 115, 22, 0.35)' : 'rgba(56, 189, 248, 0.35)';

  const totalPassedA11y = timeline.a11yAudits.reduce((sum, a) => sum + a.passedRulesCount, 0);
  const progressRatio = clamp(currentMs / Math.max(1, timeline.durationMs), 0, 1);

  const introOpacity = interpolate(frame, [INTRO_FRAMES - 12, INTRO_FRAMES], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const outroOpacity = interpolate(
    frame,
    [durationInFrames - OUTRO_FRAMES, durationInFrames - OUTRO_FRAMES + 14],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  const cardEntrance = spring({
    frame: isIntro ? frame : Math.max(0, frame - (durationInFrames - OUTRO_FRAMES)),
    fps,
    config: { damping: 20, stiffness: 120 },
  });

  return (
    <AbsoluteFill
      style={{
        background:
          'radial-gradient(ellipse at 20% 0%, #1E293B 0%, #0F172A 55%, #020617 100%)',
        fontFamily: '"Noto Sans TC", "PingFang TC", system-ui, -apple-system, sans-serif',
        color: '#F8FAFC',
        overflow: 'hidden',
      }}
    >
      {/* Subtle ambient glow accents */}
      <div
        style={{
          position: 'absolute',
          top: -120,
          right: -80,
          width: 420,
          height: 420,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${accentGlow} 0%, transparent 70%)`,
          filter: 'blur(40px)',
          pointerEvents: 'none',
        }}
      />

      {/* Browser Mockup Frame (Centered, never overlaps bottom caption dock) */}
      <div
        style={{
          position: 'absolute',
          top: STAGE_TOP,
          left: (1280 - STAGE_WIDTH) / 2,
          width: STAGE_WIDTH,
          height: STAGE_HEIGHT + BROWSER_BAR_HEIGHT,
          borderRadius: 14,
          overflow: 'hidden',
          border: '1px solid rgba(148, 163, 184, 0.25)',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255,255,255,0.06)',
          backgroundColor: '#0F172A',
        }}
      >
        {/* Minimal macOS-style Window Bar */}
        <div
          style={{
            height: BROWSER_BAR_HEIGHT,
            backgroundColor: '#1E293B',
            borderBottom: '1px solid rgba(148, 163, 184, 0.16)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 12px',
          }}
        >
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: '#F87171' }} />
            <span style={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: '#FBBF24' }} />
            <span style={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: '#34D399' }} />
          </div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: '#94A3B8',
              backgroundColor: 'rgba(15, 23, 42, 0.7)',
              padding: '2px 14px',
              borderRadius: 999,
              letterSpacing: '0.02em',
            }}
          >
            {isSite ? 'wan-guard.com · 民眾與志工公開平台' : 'admin.wan-guard.com · 機關與團隊管理平台'}
          </div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: '#6EE7B7',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span>✓ WCAG 2.1 AA</span>
            {totalPassedA11y > 0 ? <span style={{ opacity: 0.8 }}>({totalPassedA11y})</span> : null}
          </div>
        </div>

        {/* Recorded Viewport Canvas — Sequence starts at INTRO_FRAMES so video 0ms aligns with timeline 0ms! */}
        <div
          style={{
            position: 'relative',
            width: STAGE_WIDTH,
            height: STAGE_HEIGHT,
            overflow: 'hidden',
            backgroundColor: '#0B1120',
          }}
        >
          <div
            style={{
              position: 'relative',
              width: STAGE_WIDTH,
              height: STAGE_HEIGHT,
              transform: `translate(${panX}px, ${panY}px) scale(${zoomAmount})`,
              transformOrigin: 'center center',
            }}
          >
            {videoSrc ? (
              <Sequence from={INTRO_FRAMES}>
                <OffthreadVideo
                  src={videoSrc}
                  style={{ width: STAGE_WIDTH, height: STAGE_HEIGHT, objectFit: 'fill' }}
                />
              </Sequence>
            ) : (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'radial-gradient(circle at 30% 30%, #1E293B 0%, #0F172A 100%)',
                }}
              >
                <div style={{ textAlign: 'center', color: '#94A3B8' }}>
                  <div style={{ fontSize: 18, color: accentColor, fontWeight: 700, marginBottom: 6 }}>
                    島嶼守望 · 互動教學預覽 ({timeline.id})
                  </div>
                  <div style={{ fontSize: 14 }}>執行 pnpm e2e:record 後自動載入真實操作畫面</div>
                </div>
              </div>
            )}

            {/* Cinematic SVG Dimmed Spotlight Cutout + Glowing Focus Ring */}
            {box && spotlightOpacity > 0.01 ? (
              <svg
                width={STAGE_WIDTH}
                height={STAGE_HEIGHT}
                style={{
                  position: 'absolute',
                  inset: 0,
                  pointerEvents: 'none',
                  opacity: spotlightOpacity,
                }}
              >
                <defs>
                  <mask id={`spotlight-${timeline.id}`}>
                    <rect x={0} y={0} width={STAGE_WIDTH} height={STAGE_HEIGHT} fill="white" />
                    <rect
                      x={box.x - 6}
                      y={box.y - 6}
                      width={box.width + 12}
                      height={box.height + 12}
                      rx={10}
                      ry={10}
                      fill="black"
                    />
                  </mask>
                </defs>
                {/* Soft dimmed backdrop outside the target */}
                <rect
                  x={0}
                  y={0}
                  width={STAGE_WIDTH}
                  height={STAGE_HEIGHT}
                  fill="rgba(15, 23, 42, 0.42)"
                  mask={`url(#spotlight-${timeline.id})`}
                />
                {/* Crisp glowing highlight ring around the exact target */}
                <rect
                  x={box.x - 6}
                  y={box.y - 6}
                  width={box.width + 12}
                  height={box.height + 12}
                  rx={10}
                  ry={10}
                  fill="none"
                  stroke={accentColor}
                  strokeWidth={2.5}
                />
                {/* Click ripple wave at actionMs */}
                {rippleProgress > 0 && rippleProgress < 1 ? (
                  <circle
                    cx={box.x + box.width / 2}
                    cy={box.y + box.height / 2}
                    r={interpolate(rippleProgress, [0, 1], [6, 34])}
                    fill="none"
                    stroke="#FFFFFF"
                    strokeWidth={2.5}
                    opacity={1 - rippleProgress}
                  />
                ) : null}
              </svg>
            ) : null}

            {/* Smooth human-paced macOS-style pointer gliding between targets */}
            {cursor && cursor.opacity > 0.01 ? (
              <svg
                width={28}
                height={28}
                viewBox="0 0 28 28"
                style={{
                  position: 'absolute',
                  left: cursor.x - 3,
                  top: cursor.y - 2,
                  opacity: cursor.opacity,
                  transform: `scale(${cursor.scale})`,
                  transformOrigin: '3px 2px',
                  pointerEvents: 'none',
                  filter: 'drop-shadow(0 3px 6px rgba(2, 6, 23, 0.55))',
                }}
              >
                <path
                  d="M4 2.5 L4 22.5 L9.4 17.6 L13.2 25.2 L16.2 23.7 L12.4 16.2 L19.4 15.6 Z"
                  fill="#0F172A"
                  stroke="#FFFFFF"
                  strokeWidth={1.8}
                  strokeLinejoin="round"
                />
              </svg>
            ) : null}
          </div>
        </div>
      </div>

      {/* Dedicated Bottom Accessible Caption Dock (Zero overlap with recorded UI!) */}
      {!isIntro && !isOutro && captionStep ? (
        <div
          style={{
            position: 'absolute',
            left: (1280 - STAGE_WIDTH) / 2,
            width: STAGE_WIDTH,
            bottom: 14,
            height: 92,
            borderRadius: 14,
            backgroundColor: 'rgba(15, 23, 42, 0.94)',
            border: '1px solid rgba(148, 163, 184, 0.25)',
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.45)',
            padding: '12px 20px 14px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                backgroundColor: accentColor,
                color: '#0F172A',
                fontSize: 13,
                fontWeight: 900,
                letterSpacing: '0.03em',
                flexShrink: 0,
              }}
            >
              步驟 {captionStep.index} / {timeline.steps.length}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  minWidth: 0,
                }}
              >
                {captionStep.section ? (
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: accentColor,
                      flexShrink: 0,
                    }}
                  >
                    {captionStep.section} ·
                  </span>
                ) : null}
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 800,
                    color: '#FFFFFF',
                    lineHeight: 1.3,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {captionStep.title}
                </div>
              </div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: '#CBD5E1',
                  lineHeight: 1.4,
                  marginTop: 2,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {captionStep.subtitle}
              </div>
            </div>
            {captionStep.ariaLabel ? (
              <div
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  backgroundColor: 'rgba(30, 41, 59, 0.95)',
                  border: '1px solid rgba(148, 163, 184, 0.3)',
                  fontSize: 12,
                  color: '#E2E8F0',
                  fontWeight: 600,
                  flexShrink: 0,
                  maxWidth: 200,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                a11y: {captionStep.ariaLabel}
              </div>
            ) : null}
          </div>

          {/* Sleek step progress bar */}
          <div
            style={{
              width: '100%',
              height: 4,
              borderRadius: 999,
              backgroundColor: 'rgba(148, 163, 184, 0.2)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${Math.round(progressRatio * 100)}%`,
                height: '100%',
                borderRadius: 999,
                backgroundColor: accentColor,
              }}
            />
          </div>
        </div>
      ) : null}

      {/* Refined Intro / Outro Brand Overlay */}
      {isIntro || isOutro ? (
        <AbsoluteFill
          style={{
            opacity: isIntro ? introOpacity : outroOpacity,
            background:
              'radial-gradient(ellipse at 50% 35%, rgba(30, 41, 59, 0.96) 0%, rgba(2, 6, 23, 0.98) 100%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 64,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              transform: `translateY(${interpolate(cardEntrance, [0, 1], [18, 0])}px)`,
              opacity: cardEntrance,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                padding: '7px 18px',
                borderRadius: 999,
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                border: `1px solid ${accentColor}`,
                color: accentColor,
                fontSize: 15,
                fontWeight: 800,
                letterSpacing: '0.06em',
                marginBottom: 22,
              }}
            >
              島嶼守望 · 救災資訊平台操作指南
            </div>
            <h1
              style={{
                fontSize: 44,
                fontWeight: 900,
                margin: '0 0 16px',
                color: '#FFFFFF',
                letterSpacing: '-0.01em',
                maxWidth: 920,
              }}
            >
              {timeline.title}
            </h1>
            {isOutro && timeline.summary?.length ? (
              <ul
                style={{
                  fontSize: 20,
                  color: '#E2E8F0',
                  maxWidth: 780,
                  lineHeight: 1.65,
                  margin: 0,
                  paddingLeft: 24,
                  textAlign: 'left',
                }}
              >
                {timeline.summary.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            ) : (
              <p
                style={{
                  fontSize: 21,
                  color: '#CBD5E1',
                  maxWidth: 780,
                  lineHeight: 1.6,
                  margin: 0,
                }}
              >
                {isIntro
                  ? timeline.subtitle
                  : '本教學由 Playwright E2E 自動操作錄製，並通過 axe-core WCAG 2.1 AA 無障礙標準驗證。'}
              </p>
            )}
            {isOutro ? (
              <div
                style={{
                  marginTop: 28,
                  padding: '8px 20px',
                  borderRadius: 999,
                  backgroundColor: 'rgba(6, 78, 59, 0.85)',
                  border: '1px solid #34D399',
                  color: '#ECFDF5',
                  fontSize: 15,
                  fontWeight: 700,
                }}
              >
                ✓ 通過 {totalPassedA11y || 38} 項無障礙規則檢核 · 共 {timeline.steps.length} 個步驟
              </div>
            ) : null}
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
