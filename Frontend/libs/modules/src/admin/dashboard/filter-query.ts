import type { components } from '@rescue-frontend/data-access/openapi';

import type { AnalyticsCatalog, DashboardMetric } from './kpis';

type AreaCounty = components['schemas']['AreaCounty'];
export type DashboardDomain = DashboardMetric['domain'];

/** The 地區 row, which the whole page is asked within. A town needs its county, a 村里 its town. */
export interface DashboardArea {
  county?: string;
  town?: string;
  village?: string;
}

/** A section's own 類型 and 狀態, set beside its heading; they apply to that section only. */
export interface SectionFilter {
  type?: string;
  status?: string;
}

const DOMAINS: readonly DashboardDomain[] = ['tickets', 'stations'];

const unique = (values: string[]) => [...new Set(values)];

/**
 * The 縣市, 鄉鎮市區 and 村里 the 地區 row offers. Tickets and stations each list their own (the
 * catalog draws them from the rows the viewer may chart), and one row filters both sections, so it
 * offers every value either has, the tickets' order first.
 */
export function areaChoices(
  filters: AnalyticsCatalog['filters'] | undefined,
  area: DashboardArea,
): { counties: string[]; towns: string[]; villages: string[] } {
  const lists = DOMAINS.map((domain) => filters?.[domain]?.areas ?? []);
  const townsOf = (areas: AreaCounty[]) =>
    areas.find((county) => county.county === area.county)?.towns ?? [];
  const counties = unique(
    lists.flatMap((areas) => areas.map((county) => county.county)),
  );
  const towns = area.county
    ? unique(lists.flatMap((areas) => townsOf(areas).map((town) => town.town)))
    : [];
  const villages = area.town
    ? unique(
        lists.flatMap(
          (areas) =>
            townsOf(areas).find((town) => town.town === area.town)?.villages ??
            [],
        ),
      )
    : [];
  return { counties, towns, villages };
}

/**
 * Whether a domain has rows in `area`. Asking it for an area its catalog does not list is a 422, so
 * a section whose catalog lacks the area says so instead of asking.
 */
export function domainHasArea(
  areas: readonly AreaCounty[] | undefined,
  area: DashboardArea,
): boolean {
  if (!area.county) return true;
  const county = areas?.find((entry) => entry.county === area.county);
  if (!county) return false;
  if (!area.town) return true;
  const town = county.towns.find((entry) => entry.town === area.town);
  if (!town) return false;
  return !area.village || town.villages.includes(area.village);
}

/**
 * The filter params of one query in a section: the area, the section's type, and its status — but
 * no status for the volunteer metrics, which the design keeps off that filter. A 村里 goes with its
 * town and county, as the same name can repeat across towns.
 */
export function filterQuery(
  domain: DashboardDomain,
  area: DashboardArea,
  section: SectionFilter,
  metric: string,
): Record<string, string> {
  const query: Record<string, string> = {};
  if (area.county) query.county = area.county;
  if (area.town) query.town = area.town;
  if (area.village) query.village = area.village;
  if (section.type) {
    query[domain === 'tickets' ? 'task_type' : 'station_type'] = section.type;
  }
  if (section.status && !metric.startsWith('volunteer')) {
    query.status = section.status;
  }
  return query;
}
