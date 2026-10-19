'use client';

import { useEffect, useRef } from 'react';

import { Box } from '@mui/material';
import type { Config, Data, Layout } from 'plotly.js-dist-min';

import type { AnalyticsChartFigure } from '@rescue-frontend/data-access/admin';

type PlotlyModule = typeof import('plotly.js-dist-min').default;

/**
 * Draws a JSON figure from the analytics `/chart` endpoints with plotly.js.
 *
 * plotly.js is imported on mount, not at module load: it is about 4.8 MB minified and touches
 * `window`, so it stays out of the server render and out of every admin page that has no chart.
 * The version is pinned to the one the backend's Plotly bundles, so the figure JSON matches.
 */
export function AnalyticsChart({
  figure,
  height,
  label,
}: {
  figure: AnalyticsChartFigure;
  height: number;
  /** Read out in place of the plot, which is an SVG with no accessible text. */
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let cancelled = false;
    let plotly: PlotlyModule | undefined;

    void import('plotly.js-dist-min').then((module) => {
      if (cancelled) return;
      plotly = module.default;
      // The figure is Plotly's own JSON, typed loosely by OpenAPI as plain objects.
      void plotly.react(
        element,
        figure.data as Data[],
        { ...(figure.layout as Partial<Layout>), height, autosize: true },
        figure.config as Partial<Config>,
      );
    });

    return () => {
      cancelled = true;
      plotly?.purge(element);
    };
  }, [figure, height]);

  return (
    <Box
      ref={ref}
      role="img"
      aria-label={label}
      sx={{ width: '100%', minHeight: height }}
    />
  );
}
