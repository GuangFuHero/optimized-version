import type {
  RescueMapBaseLayer,
  RescueMapDataType,
  RescueMapRouteState,
} from '../map/types';

/**
 * 前台目前支援的顯示模組。
 * - `map`：互動式救災地圖。
 * - `list`：條列式資料檢視。
 */
export type SiteModule = 'map' | 'list';

/**
 * 前台路由狀態。沿用地圖元件的 {@link RescueMapRouteState}，
 * 讓地圖與列表共用同一份篩選/詳情狀態，避免重複定義。
 */
export type SiteRouteState = RescueMapRouteState;

export interface SiteSubDataTypeOption {
  value: string;
  label: string;
}

export type { RescueMapBaseLayer, RescueMapDataType };
