'use client';

/**
 * StationTypeIcon —— 資源站點類型圖示（lucide）。設計稿：Design/後台/元件 Components.html 第 8 節。
 *
 * 🔒 2026-11-01 Sucre：站點圖示統一用 lucide（線條款），前台、後台同一套。
 *    目前 libs/modules/src/station/type-options.ts 的 STATION_TYPE_ICONS 是 MUI 實心款（*Rounded）——
 *    下個版本把那張表換成這一份（建議直接搬到 type-options.ts 旁，key 用 StationTypeValue）。
 * 對照表與原型 Design/前台/js/site/site-route.js 的 STATION_TYPE_ICONS 相同，那是唯一來源。
 *
 * ICON-101 線條粗細 strokeWidth 2；16px 放在文字旁、22px 單獨出現。
 * ICON-102 顏色跟著文字（currentColor），不另外上色 —— 類型不靠顏色分辨。
 * ICON-103 不在清單裡的類型用 MapPin（目前 staging 退回 Inventory2，看起來像「物資」，會誤導）。
 */

import {
  BatteryCharging,
  Bus,
  Droplets,
  Fuel,
  HeartPulse,
  type LucideIcon,
  type LucideProps,
  MapPin,
  Package,
  RadioTower,
  ShowerHead,
  Tent,
  Toilet,
  Zap,
} from 'lucide-react';

export const STATION_TYPE_LUCIDE_ICONS: Record<string, LucideIcon> = {
  water: Droplets, // 加水
  shelter: Tent, // 避難
  shower: ShowerHead, // 洗澡
  toilet: Toilet, // 廁所
  transport: Bus, // 交通
  medical: HeartPulse, // 醫療
  supply: Package, // 物資
  gas_station: Fuel, // 加油
  charge: BatteryCharging, // 充電
  power: Zap, // 發電
  cellular: RadioTower, // 通訊
};

export function getStationTypeLucideIcon(type?: string | null): LucideIcon {
  const key = type?.trim().toLowerCase();

  return (key && STATION_TYPE_LUCIDE_ICONS[key]) || MapPin;
}

export interface StationTypeIconProps extends Omit<LucideProps, 'type'> {
  /** 站點類型 value（water、shelter…）。LucideProps 自己的 type 是 SVG 屬性，用不到，所以蓋掉 */
  type?: string | null;
}

export function StationTypeIcon({ type, size = 16, strokeWidth = 2, ...rest }: StationTypeIconProps) {
  const Icon = getStationTypeLucideIcon(type);

  return <Icon size={size} strokeWidth={strokeWidth} aria-hidden {...rest} />;
}
