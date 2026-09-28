import type { Geometry } from 'geojson';

import { SITE_FALLBACK_BASE_LAYER } from '../../../../route/constants';
import { createSiteHref } from '../../../../route/serialize';

/** 候選單的連結：有座標就開地圖並定位到那張單，沒有就開列表。 */
export function buildCandidateHref(
  uuid: string,
  geometry?: Geometry | null,
): string {
  if (geometry?.type === 'Point') {
    const [lng, lat] = geometry.coordinates;

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return createSiteHref('map', {
        baseLayer: SITE_FALLBACK_BASE_LAYER,
        dataType: 'ticket',
        position: { center: [lat, lng], zoom: 18 },
        selectedMarkerId: uuid,
      });
    }
  }

  return createSiteHref('list', { dataType: 'ticket', selectedMarkerId: uuid });
}
