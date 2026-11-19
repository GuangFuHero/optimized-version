import React from 'react';
import { Composition, staticFile } from 'remotion';
import type { EpisodeTimeline } from '../e2e/fixtures/tutorial-recorder';
import { EPISODE_CATALOG } from './episodes';
import { TutorialComposition, type TutorialCompositionProps } from './TutorialComposition';

const FPS = 30;
const INTRO_OUTRO_SECONDS = 4;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {EPISODE_CATALOG.map((episode) => {
        const durationSeconds = Math.ceil(episode.durationMs / 1000) + INTRO_OUTRO_SECONDS;
        const defaultProps: TutorialCompositionProps = {
          timeline: episode,
        };
        return (
          <Composition
            key={episode.id}
            id={episode.id}
            component={TutorialComposition as React.ComponentType<unknown>}
            durationInFrames={durationSeconds * FPS}
            fps={FPS}
            width={episode.viewport.width}
            height={episode.viewport.height}
            defaultProps={defaultProps as unknown as Record<string, unknown>}
            calculateMetadata={async ({ props }) => {
              const typedProps = props as unknown as TutorialCompositionProps;
              try {
                const res = await fetch(staticFile(`recordings/${episode.id}.timeline.json`));
                if (res.ok) {
                  const recordedTimeline = (await res.json()) as EpisodeTimeline;
                  const recordedSeconds =
                    Math.ceil(recordedTimeline.durationMs / 1000) + INTRO_OUTRO_SECONDS;
                  return {
                    durationInFrames: recordedSeconds * FPS,
                    props: {
                      ...typedProps,
                      timeline: recordedTimeline,
                      videoSrc: staticFile(`recordings/${episode.id}.webm`),
                    } as unknown as Record<string, unknown>,
                  };
                }
              } catch {
                // Fallback to preview timeline when recording does not exist yet
              }
              return {
                durationInFrames: durationSeconds * FPS,
                props: typedProps as unknown as Record<string, unknown>,
              };
            }}
          />
        );
      })}
    </>
  );
};
