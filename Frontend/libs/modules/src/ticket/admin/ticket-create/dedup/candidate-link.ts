import type { Geometry } from 'geojson';

import type { RescueMapBaseLayer } from '../../../../map/types';
import { SITE_FALLBACK_BASE_LAYER } from '../../../../route/constants';
import { createSiteHref } from '../../../../route/serialize';

/**
 * 候選單連結。網址格式沿用 `route/serialize.ts`：
 * - map: `/map/{baseLayer}/{dataType}[/@{lat},{lng},{zoom}z]?id=`
 * - list: `/list/{dataType}?id=`
 */
export function buildCandidateMapHref(args: {
  uuid: string;
  geometry?: Geometry | null;
  baseLayer?: string;
}): string {
  const geometry = args.geometry;

  if (geometry?.type === 'Point') {
    const [lng, lat] = geometry.coordinates;

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return createSiteHref('map', {
        baseLayer: (args.baseLayer ??
          SITE_FALLBACK_BASE_LAYER) as RescueMapBaseLayer,
        dataType: 'ticket',
        position: { center: [lat, lng], zoom: 18 },
        selectedMarkerId: args.uuid,
      });
    }
  }

  return createSiteHref('list', {
    dataType: 'ticket',
    selectedMarkerId: args.uuid,
  });
}
