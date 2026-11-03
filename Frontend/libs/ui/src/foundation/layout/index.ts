export const layoutSizes = {
  site: {
    desktopTopNavBarHeight: 64,
    mobileTopNavBarHeight: 56,
    collapsedSidebarWidth: 72,
    expandedSidebarWidth: 240,
  },
  admin: {
    topNavBarHeight: 68,
    collapsedSidebarWidth: 76,
    expandedSidebarWidth: 252,
  },
} as const;

/**
 * The site map's floating controls: 站點／任務 and 篩選 on the left, 列表 and 圖層 on the right, all
 * 44px, set in from the map's edges. A phone puts them in one row; on a screen narrower than
 * `oneRowMinWidth` that row does not fit, so 列表 goes back under 圖層.
 */
export const siteMapControls = {
  buttonSize: 44,
  gap: 8,
  top: { mobile: 12, tablet: 16 },
  left: { mobile: 12, tablet: 24 },
  right: { mobile: 12, tablet: 16 },
  /** 站點／任務, a gap and 篩選 as its icon (244px), beside 列表 and 圖層 in a row (128px). */
  oneRowMinWidth: 372,
} as const;

/**
 * How wide the controls on the left may grow, as a CSS width: the screen less the left inset, the
 * right inset, the buttons on the right (`columns` of them side by side) and `clearance` between.
 */
export function siteMapLeftControlsMaxWidth({
  left,
  right,
  columns,
  clearance,
}: {
  left: number;
  right: number;
  columns: number;
  clearance: number;
}): string {
  const buttons =
    columns * siteMapControls.buttonSize + (columns - 1) * siteMapControls.gap;

  return `calc(100vw - ${left + right + buttons + clearance}px)`;
}
