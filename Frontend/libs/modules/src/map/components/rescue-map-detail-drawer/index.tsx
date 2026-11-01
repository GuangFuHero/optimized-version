'use client';

import { useEffect, useState, type ReactNode } from 'react';

import EditRoundedIcon from '@mui/icons-material/EditRounded';
import { Box } from '@mui/material';

import { Icons } from '@rescue-frontend/ui';

import { SiteBadge } from '../../../shell/site/site-badge';
import { StationDetailDrawer } from '../../../station';
import { SiteStationDetailDrawer } from '../../../station/site-detail/site-station-detail-drawer';
import {
  readOpHour,
  resolveStationAvailability,
  type StationAvailabilityTone,
} from '../../../station/availability';
import type {
  StationDetailActionProps,
  StationDetailTabId,
  StationStatusTone,
} from '../../../station/station-detail';
import { openStationSuggestion } from '../../../station/suggestion/open-station-suggestion';
import { describeSupplyStatus } from '../../../station/supply-status';
import {
  SiteTicketDetailDrawer,
  type SiteTicketDetailDrawerProps,
} from '../../../ticket/site-detail/site-ticket-detail-drawer';
import type { RescueMapDetailItem, RescueMapMarkerItem } from '../../types';
import { LocationCellDetail } from '../location-cell-detail';

/** What the page puts in a ticket's drawer: the drawer itself draws the title and the close button. */
export type RescueMapTicketDetailOverrides = Pick<
  SiteTicketDetailDrawerProps,
  'headerActions' | 'badges' | 'footerLead' | 'onShare'
> & {
  detailsContent?: ReactNode;
};

/**
 * Which station detail to draw. The site has its own, on the site's text scale; the back office's
 * map keeps the one it has, so that is the default.
 */
export type RescueMapStationLayout = 'admin' | 'site';

interface RescueMapDetailDrawerProps {
  marker: RescueMapDetailItem | null;
  onClose: () => void;
  /** 從概略區塊的清單點進某一筆時切換選取。 */
  onSelectMarker?: (markerId: string) => void;
  /** 只影響訪客提示文案（「登入後可看」），不決定遮不遮 —— 遮在後端。 */
  isAuthenticated?: boolean;
  ticketDetailOverrides?: RescueMapTicketDetailOverrides;
  stationSecondaryAction?: StationDetailActionProps;
  stationLayout?: RescueMapStationLayout;
}

const DetailsIcon = Icons.details;
const CloseIcon = Icons.close;
const MapIcon = Icons.map;
const PersonIcon = Icons.person;
const PinIcon = Icons.pin;
const ResourcesIcon = Icons.resources;

const AVAILABILITY_TONES: Record<StationAvailabilityTone, StationStatusTone> = {
  success: 'active',
  warning: 'warning',
  neutral: 'inactive',
};

// 官方 and 臨時站點 only when they hold: a chip on every ordinary station would drown the list
// (prototype site-detail.jsx:214-219). Not `source`, which the site stopped showing (2026-08-21).
function createStationBadges(marker: RescueMapMarkerItem): ReactNode {
  const station = marker.stationMeta;

  if (!station?.isOfficial && !station?.isTemporary) {
    return null;
  }

  return (
    <>
      {station.isOfficial ? <SiteBadge tone="secondary">官方</SiteBadge> : null}
      {station.isTemporary ? (
        <SiteBadge tone="neutral">臨時站點</SiteBadge>
      ) : null}
    </>
  );
}

function formatVerificationStatus(status: string | null | undefined) {
  if (status === 'human_verified') {
    return '人工驗證';
  }

  if (status === 'ai_verified') {
    return 'AI 驗證';
  }

  return '未驗證';
}

function createStationResources(marker: RescueMapMarkerItem) {
  const station = marker.stationMeta;

  return [
    {
      id: 'station-type',
      label: '站點類型',
      value: marker.label,
      icon: <ResourcesIcon />,
    },
    {
      id: 'op-hour',
      label: '服務時間',
      value: readOpHour(station?.opHour) ?? '未提供',
      icon: <MapIcon />,
    },
    // 「站點等級」與「可信度」依設計決議不在前台顯示：`level` 的語意還在問後端，
    // 對讀者顯示一個我們自己都不確定意思的數字沒有意義；信任制度 v0.1.0 不做，
    // 後端也已移除 `confidence_score`（a889fd4，從未被寫入）。
  ];
}

// For a guest too, who is told in the drawer to sign in (PUB-FEAT-001 Q7: the way in always shows).
function createStationEditAction(
  marker: RescueMapMarkerItem,
): StationDetailActionProps {
  return {
    label: '修改建議',
    icon: <EditRoundedIcon />,
    onClick: () => openStationSuggestion(marker.id),
  };
}

function createStationSummary({
  marker,
  stationSecondaryAction,
}: {
  marker: RescueMapMarkerItem;
  stationSecondaryAction?: StationDetailActionProps;
}) {
  // 「現在能不能去」, the one thing the page has to answer first (prototype site-detail.jsx:222-224).
  const availability = resolveStationAvailability({
    operationalStatus: marker.stationMeta?.operationalStatus,
    opHour: marker.stationMeta?.opHour,
  });

  return {
    stationSummary: {
      stationCode: marker.stationMeta?.name?.trim() || marker.title,
      stationIcon: <ResourcesIcon />,
      // The description only, as the prototype's 位置說明. Never the station's `comment`, the back
      // office's internal note (backend ADR-332), nor the subtitle, which falls back to the hours.
      address: marker.stationMeta?.description?.trim() || '未提供位置說明',
      addressIcon: <PinIcon />,
      status: {
        label: availability.headline,
        tone: AVAILABILITY_TONES[availability.tone],
      },
      statusDetail: availability.detail,
      badges: createStationBadges(marker),
    },
    // No 修改建議（N） tab, nor 歷史記錄: nothing public lists a station's suggestions or history yet.
    tabs: [
      {
        id: 'info' as const,
        label: '詳情',
        icon: <DetailsIcon />,
      },
    ],
    editAction: createStationEditAction(marker),
    secondaryAction: stationSecondaryAction,
    // 2026-08-21 決議：前台不顯示 `source`。站點一律由後台建立，來源不具區別力；
    // 有區別力的是「是不是官方造冊」。這張卡也不再列 visibility —— 讀者只會看到
    // 公開的站點，這個欄位對他永遠是同一個值。
    contactCard: {
      name: marker.stationMeta?.isOfficial ? '官方站點' : '一般站點',
      role: formatVerificationStatus(marker.stationMeta?.verificationStatus),
      avatarIcon: <PersonIcon />,
      methods: [],
    },
    resources: createStationResources(marker),
    supplyStatus: describeSupplyStatus(
      marker.stationMeta?.supplyStatus,
      marker.stationMeta?.supplyStatusUpdatedAt,
    ),
  };
}

export function RescueMapDetailDrawer({
  marker,
  onClose,
  onSelectMarker,
  isAuthenticated = false,
  ticketDetailOverrides,
  stationSecondaryAction,
  stationLayout = 'admin',
}: RescueMapDetailDrawerProps) {
  const [activeStationTab, setActiveStationTab] =
    useState<StationDetailTabId>('info');

  useEffect(() => {
    setActiveStationTab('info');
  }, [marker?.id]);

  const closeAction = {
    ariaLabel: '關閉詳情',
    icon: <CloseIcon />,
    onClick: onClose,
  };

  if (!marker) {
    return null;
  }

  if (marker.detailType === 'cell') {
    return (
      <LocationCellDetail
        cell={marker}
        isAuthenticated={isAuthenticated}
        onClose={onClose}
        onSelectMember={(markerId) => onSelectMarker?.(markerId)}
      />
    );
  }

  return (
    <Box
      sx={{
        width: '100%',
        minWidth: 0,
        height: '100%',
        minHeight: 0,
        display: 'flex',
        justifyContent: 'flex-end',
        pointerEvents: 'auto',
      }}
    >
      {marker.detailType === 'ticket' ? (
        <SiteTicketDetailDrawer
          title={marker.title}
          onClose={onClose}
          headerActions={ticketDetailOverrides?.headerActions}
          badges={ticketDetailOverrides?.badges}
          footerLead={ticketDetailOverrides?.footerLead}
          onShare={ticketDetailOverrides?.onShare}
        >
          {ticketDetailOverrides?.detailsContent}
        </SiteTicketDetailDrawer>
      ) : null}

      {marker.detailType === 'station' && stationLayout === 'site' ? (
        <SiteStationDetailDrawer
          marker={marker}
          onClose={onClose}
          editAction={createStationEditAction(marker)}
          secondaryAction={stationSecondaryAction}
        />
      ) : null}

      {marker.detailType === 'station' && stationLayout === 'admin' ? (
        <StationDetailDrawer
          {...createStationSummary({
            marker,
            stationSecondaryAction,
          })}
          activeTab={activeStationTab}
          onTabChange={setActiveStationTab}
          closeAction={closeAction}
          width="100%"
          height="100%"
          minHeight="100%"
        />
      ) : null}
    </Box>
  );
}
