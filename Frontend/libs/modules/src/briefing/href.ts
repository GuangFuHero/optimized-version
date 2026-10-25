/**
 * Where a volunteer reads, before going, how to get there, what to bring and whom to find
 * (prototype `BRIEFING_HREF`, `site-actions.jsx:1925-1941`). The claim toast, the top of
 * 我的任務 › 我承接的, the sidebar's 出發前 and the not-found page all lead here; the page is
 * `site-briefing.tsx`.
 *
 * A file of its own, imported by its path: the module's entry (`index.ts`) brings the page's
 * Markdown renderer with it, which none of those links needs.
 */
export const BRIEFING_HREF = '/briefing';
