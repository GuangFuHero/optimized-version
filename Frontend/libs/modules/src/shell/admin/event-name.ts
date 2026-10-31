import type { ProjectSettings } from '@rescue-frontend/data-access/admin';

/**
 * The event's name at the top of the sidebar, by the site's top-bar rule (`siteBrandName`): its short
 * name, or its full name when it has none, with the full name to hover. Null until the settings name it.
 */
export function sidebarEventName(
  settings: Pick<ProjectSettings, 'name' | 'short_name'> | undefined,
): { label: string; fullName: string } | null {
  const fullName = settings?.name;
  if (!fullName) return null;
  return { label: settings?.short_name?.trim() || fullName, fullName };
}
