/** What the site was called before it named the event, and still is until one is set. */
export const PLATFORM_NAME = '島嶼守望';

interface CurrentDisaster {
  name: string;
  shortName?: string | null;
}

/**
 * The name beside the logo (prototype `site-shell.jsx` `BrandLockup`): the event's short name, or its
 * full name when it has none, with the full name to hover. The prototype's back-office sidebar names it
 * the same way (`wg-event.js` `wgEventShortName`), so one person crossing over sees one system. Until
 * the event is set, or when it cannot be read, the platform's name stays (`前台視覺對齊.md` §3).
 *
 * While the event is `loading` the name is blank: the platform's name first and the event's a moment
 * later would read as two names. The platform's name shows, as a map opens as if the event could not
 * be read, when the read is held back because the browser is offline (it is then not loading), or is
 * still out once `waitedOut` (`EVENT_MAP_VIEW_WAIT_MS`). An answer that comes later still names the event.
 */
export function siteBrandName(
  disaster: CurrentDisaster | null | undefined,
  {
    loading = false,
    waitedOut = false,
  }: { loading?: boolean; waitedOut?: boolean } = {},
): {
  label: string;
  fullName: string | null;
} {
  if (loading && !waitedOut) {
    return { label: '', fullName: null };
  }

  if (!disaster) {
    return { label: PLATFORM_NAME, fullName: null };
  }

  return {
    label: disaster.shortName?.trim() || disaster.name,
    fullName: disaster.name,
  };
}
