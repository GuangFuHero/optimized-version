import {
  UNITS,
  cellToBoundary,
  getHexagonEdgeLengthAvg,
  getResolution,
  isValidCell,
} from 'h3-js';

import type { RescueMapLocationCell, RescueMapMarkerItem } from './types';

/**
 * 訪客看到的是區域，不是地點（後端 ADR-281／283）。
 *
 * 後端對沒有 `ticket.view_detail` 的人，把任務單的座標換成所在 H3 格子的中心，並在
 * `locationCell` 附上格子編號。同一格的單座標完全相同，畫成圖釘會整疊壓在同一點 —— 所以
 * 地圖不畫個別圖釘，改畫格子本身，中央標數量，點開才列出內容（原型 `groupMarkersByGridCell`
 * ／`CellDetail`）。
 *
 * 格子的形狀與大小都從 H3 編號本身算（h3-js），不在前端重寫一份 zoom→resolution 公式：
 * resolution 就在編號裡，後端怎麼調整封頂，這裡都不必跟著改。
 */

export const LOCATION_CELL_ID_PREFIX = 'cell:';

/** 打開後端數好的格子時，一次讀幾筆：跟地圖一次抓的張數一樣（`tickets` 的上限）。 */
export const LOCATION_CELL_MEMBERS_PAGE_SIZE = 200;

export function locationCellId(cell: string): string {
  return `${LOCATION_CELL_ID_PREFIX}${cell}`;
}

export function isLocationCellId(id: string | null | undefined): boolean {
  return Boolean(id?.startsWith(LOCATION_CELL_ID_PREFIX));
}

/** 依 `locationCell` 把任務單分組；精確座標的單與站點不參與，照舊各自一根圖釘。 */
export function buildLocationCells(
  markers: readonly RescueMapMarkerItem[],
): RescueMapLocationCell[] {
  const byCell = new Map<string, RescueMapMarkerItem[]>();

  for (const marker of markers) {
    const cell = marker.locationCell;

    if (marker.detailType !== 'ticket' || !cell || !isValidCell(cell)) {
      continue;
    }

    const members = byCell.get(cell);

    if (members) {
      members.push(marker);
    } else {
      byCell.set(cell, [marker]);
    }
  }

  return [...byCell.entries()].map(([cell, members]) => ({
    id: locationCellId(cell),
    cell,
    detailType: 'cell',
    // 同一格的成員座標都是格子中心，取第一筆即可。
    position: members[0].position,
    variant: members.some((member) => member.variant === 'urgent-ticket')
      ? 'urgent-ticket'
      : 'in-progress',
    count: members.length,
    members,
  }));
}

/**
 * `id` 是否仍指得到詳情抽屜能顯示的東西：一個 marker，或某張概略單所在的格子，或後端數過的格子
 * （`cells`，格子裡的單不一定在這一頁 markers 裡）。資料刷新後用來判斷要不要清掉選取 —— 只比對
 * marker id 的話，選到格子會立刻被清掉。
 */
export function hasRescueMapDetailItem(
  markers: readonly RescueMapMarkerItem[],
  id: string,
  cells: readonly RescueMapLocationCell[] = [],
): boolean {
  return (
    cells.some((cell) => cell.id === id) ||
    markers.some(
      (marker) =>
        marker.id === id ||
        (isCoarseTicket(marker) &&
          locationCellId(marker.locationCell ?? '') === id),
    )
  );
}

/** 地圖上要畫的格子。已有精確座標的單不在此列，圖釘層照舊處理。 */
export function isCoarseTicket(marker: RescueMapMarkerItem): boolean {
  return marker.detailType === 'ticket' && Boolean(marker.locationCell);
}

/** 格子中央的字兩側至少要留的空間（px），跟原型 `measureCells` 的 PAD 一樣。 */
const LOCATION_CELL_LABEL_SPARE_PX = 10;

/**
 * 「12 求助」在格子裡放得下多少（原型 CELL-LABEL-101，2026-10-24）：整句；只放數字（「求助」會壓到
 * 隔壁格）；或連數字都放不下，數字改小字。數字永遠不藏。
 *
 * `across` 是格子此刻在畫面上平行兩邊之間的寬度（px），每次縮放都重量，不照縮放級距寫死 —— 格子
 * 大小跟著 H3 resolution 走。`label` 是字本身量到的寬度：整句，與只有數字。
 */
export function locationCellLabelFit(
  across: number,
  label: { whole: number; count: number },
): 'whole' | 'count' | 'small-count' {
  if (across >= label.whole + LOCATION_CELL_LABEL_SPARE_PX) {
    return 'whole';
  }

  return across >= label.count + LOCATION_CELL_LABEL_SPARE_PX
    ? 'count'
    : 'small-count';
}

/** 六角形頂點，Leaflet 的 `[lat, lng]` 順序（h3-js 預設即是）。 */
export function locationCellBoundary(cell: string): [number, number][] {
  return cellToBoundary(cell).map(([lat, lng]) => [lat, lng]);
}

/**
 * 「約 1 公里」這類說法：格子對角寬度 ≈ 平均邊長 × 2（正六角形的外接圓直徑）。
 * resolution 8 平均邊長 531 m，約 1 公里；地圖拉遠時格子會跟著變粗。
 */
export function describeLocationCellSpan(cell: string): string {
  const acrossKm = getHexagonEdgeLengthAvg(getResolution(cell), UNITS.km) * 2;

  if (acrossKm >= 1) {
    return `約 ${Math.round(acrossKm)} 公里`;
  }

  return `約 ${Math.round((acrossKm * 1000) / 100) * 100} 公尺`;
}
