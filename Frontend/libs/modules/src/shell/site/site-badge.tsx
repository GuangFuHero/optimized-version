'use client';

import { Badge, displayTextSize, type BadgeProps } from '@rescue-frontend/ui';

/**
 * The design system's `Badge` on the site's text scale. The design system draws it at a fixed 12px
 * in a fixed 22px pill, which stays 12px on a phone while the text beside it grows to 16–19px; the
 * designer's test (2026-10-10) found the site's text too small. The pill grows with its text.
 */
export function SiteBadge({ sx, ...props }: BadgeProps) {
  return (
    <Badge
      {...props}
      sx={{
        fontSize: displayTextSize[12],
        lineHeight: 1.25,
        height: 'auto',
        minHeight: 22,
        py: '2px',
        ...sx,
      }}
    />
  );
}
