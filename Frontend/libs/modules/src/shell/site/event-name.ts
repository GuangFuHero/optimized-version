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
 * the event is set, and while it loads, the platform's name stays (`前台視覺對齊.md` §3).
 */
export function siteBrandName(disaster: CurrentDisaster | null | undefined): {
  label: string;
  fullName: string | null;
} {
  if (!disaster) {
    return { label: PLATFORM_NAME, fullName: null };
  }

  return {
    label: disaster.shortName?.trim() || disaster.name,
    fullName: disaster.name,
  };
}
