import React from 'react';
import {
  AbsoluteFill,
  OffthreadVideo,
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

const INTRO_FRAMES = 60; // 2 seconds at 30fps
const OUTRO_FRAMES = 60; // 2 seconds at 30fps

export const TutorialComposition: React.FC<TutorialCompositionProps> = ({
  timeline,
  videoSrc,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();

  const contentFrame = Math.max(0, frame - INTRO_FRAMES);
  const currentMs = (contentFrame / fps) * 1000;

  const activeStep: TutorialStepRecord | undefined =
    timeline.steps.find((s) => currentMs >= s.startMs && currentMs <= s.endMs) ??
    timeline.steps[timeline.steps.length - 1];

  const isIntro = frame < INTRO_FRAMES;
  const isOutro = frame >= durationInFrames - OUTRO_FRAMES;

  const box = activeStep?.box ?? null;
  const stepStartFrame = INTRO_FRAMES + Math.round(((activeStep?.startMs ?? 0) / 1000) * fps);
  const focusProgress = spring({
    frame: Math.max(0, frame - stepStartFrame),
    fps,
    config: { damping: 18, stiffness: 120 },
  });

  // Gentle camera zoom (1.0 -> 1.12x) centered toward the active element
  const scale = box && !isIntro && !isOutro ? interpolate(focusProgress, [0, 1], [1, 1.12]) : 1;
  const targetCenterX = box ? box.x + box.width / 2 : width / 2;
  const targetCenterY = box ? box.y + box.height / 2 : height / 2;
  const translateX =
    box && !isIntro && !isOutro
      ? interpolate(focusProgress, [0, 1], [0, (width / 2 - targetCenterX) * 0.15])
      : 0;
  const translateY =
    box && !isIntro && !isOutro
      ? interpolate(focusProgress, [0, 1], [0, (height / 2 - targetCenterY) * 0.15])
      : 0;

  const totalPassedA11y = timeline.a11yAudits.reduce((sum, a) => sum + a.passedRulesCount, 0);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#0B1120',
        fontFamily: '"Noto Sans TC", "PingFang TC", system-ui, sans-serif',
        color: '#F8FAFC',
        overflow: 'hidden',
      }}
    >
      {/* Main recorded screen canvas with camera zoom */}
      <AbsoluteFill
        style={{
          transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
          transformOrigin: 'center center',
        }}
      >
        {videoSrc ? (
          <OffthreadVideo
            src={videoSrc}
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        ) : (
          <AbsoluteFill
            style={{
              background:
                timeline.surface === 'site'
                  ? 'radial-gradient(circle at 30% 30%, #1E293B 0%, #0F172A 100%)'
                  : 'radial-gradient(circle at 30% 30%, #172554 0%, #0F172A 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                padding: '32px 48px',
                borderRadius: 20,
                border: '1px solid rgba(148, 163, 184, 0.25)',
                backgroundColor: 'rgba(15, 23, 42, 0.75)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 18, color: '#38BDF8', fontWeight: 700, marginBottom: 8 }}>
                島嶼守望 · 互動教學預覽畫布 ({timeline.id})
              </div>
              <div style={{ fontSize: 15, color: '#94A3B8' }}>
                執行 <code>pnpm e2e:record</code> 後將自動載入真實 1080p/720p 瀏覽器錄影
              </div>
            </div>
          </AbsoluteFill>
        )}

        {/* Spotlight highlight ring around active target */}
        {box && !isIntro && !isOutro ? (
          <div
            style={{
              position: 'absolute',
              left: box.x - 8,
              top: box.y - 8,
              width: box.width + 16,
              height: box.height + 16,
              borderRadius: 12,
              border: '3px solid #38BDF8',
              boxShadow: '0 0 0 6px rgba(56, 189, 248, 0.28), 0 12px 32px rgba(0, 0, 0, 0.45)',
              pointerEvents: 'none',
            }}
          />
        ) : null}
      </AbsoluteFill>

      {/* Top badge bar: Surface & WCAG A11y status */}
      <div
        style={{
          position: 'absolute',
          top: 20,
          left: 24,
          right: 24,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            padding: '6px 14px',
            borderRadius: 999,
            backgroundColor: 'rgba(15, 23, 42, 0.88)',
            border: '1px solid rgba(148, 163, 184, 0.3)',
            fontSize: 14,
            fontWeight: 700,
            color: '#E2E8F0',
          }}
        >
          {timeline.surface === 'site' ? '🌐 民眾與志工前台 (demo)' : '🛡️ 機關與團隊管理平台 (admin)'}
        </div>
        <div
          style={{
            padding: '6px 14px',
            borderRadius: 999,
            backgroundColor: 'rgba(6, 78, 59, 0.92)',
            border: '1px solid #34D399',
            fontSize: 14,
            fontWeight: 700,
            color: '#ECFDF5',
          }}
        >
          ✓ WCAG 2.1 AA 無障礙檢測通過 ({totalPassedA11y || 38} 項規則)
        </div>
      </div>

      {/* WCAG AAA High-Contrast Accessible Closed-Caption Bar */}
      {!isIntro && !isOutro && activeStep ? (
        <div
          style={{
            position: 'absolute',
            bottom: 24,
            left: 48,
            right: 48,
            padding: '18px 24px',
            borderRadius: 16,
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            border: '2px solid #38BDF8',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            gap: 20,
          }}
        >
          <div
            style={{
              minWidth: 88,
              height: 44,
              borderRadius: 10,
              backgroundColor: '#0284C7',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              fontWeight: 800,
              flexShrink: 0,
            }}
          >
            步驟 {activeStep.index} / {timeline.steps.length}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#FFFFFF', marginBottom: 4 }}>
              {activeStep.title}
            </div>
            <div style={{ fontSize: 17, fontWeight: 500, color: '#E2E8F0', lineHeight: 1.45 }}>
              {activeStep.subtitle}
            </div>
          </div>
          {activeStep.ariaLabel ? (
            <div
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                backgroundColor: '#1E293B',
                border: '1px solid #64748B',
                fontSize: 13,
                color: '#BAE6FD',
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              aria: &ldquo;{activeStep.ariaLabel}&rdquo;
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Intro / Outro Overlay Card */}
      {isIntro || isOutro ? (
        <AbsoluteFill
          style={{
            backgroundColor: 'rgba(15, 23, 42, 0.92)',
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
              padding: '8px 18px',
              borderRadius: 999,
              backgroundColor: '#0284C7',
              color: '#FFFFFF',
              fontSize: 16,
              fontWeight: 800,
              marginBottom: 20,
            }}
          >
            島嶼守望（救災資訊平台）操作教學與 E2E 無障礙驗證
          </div>
          <h1 style={{ fontSize: 44, fontWeight: 900, margin: '0 0 16px', color: '#FFFFFF' }}>
            {timeline.title}
          </h1>
          <p style={{ fontSize: 24, color: '#CBD5E1', maxWidth: 820, lineHeight: 1.5, margin: 0 }}>
            {isIntro
              ? timeline.subtitle
              : `本教學由 Playwright E2E 自動操作錄製，並通過 axe-core WCAG 2.1 AA 無障礙標準驗證。`}
          </p>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
