'use client';

import { useEffect, useState, type ReactNode } from 'react';

import LocalPhoneRoundedIcon from '@mui/icons-material/LocalPhoneRounded';
import RadioRoundedIcon from '@mui/icons-material/RadioRounded';
import WaterDropRoundedIcon from '@mui/icons-material/WaterDropRounded';
import { Box } from '@mui/material';

import { Icons } from '@rescue-frontend/ui';

import { StationDetailDrawer } from '../../../station';
import type {
  StationDetailActionProps,
  StationDetailTabId,
  StationDetailTabPanels,
} from '../../../station/station-detail';
import { TicketDetailDrawer } from '../../../ticket';
import type { TicketDetailDrawerProps } from '../../../ticket/ticket-detail';
import type { RescueMapMarkerItem } from '../../types';

export type RescueMapTicketDetailOverrides = Partial<
  Pick<
    TicketDetailDrawerProps,
    | 'summaryLine'
    | 'detailsPane'
    | 'content'
    | 'footerActions'
    | 'tabs'
    | 'tabsVariant'
  >
> & {
  detailsContent?: ReactNode;
};

interface RescueMapDetailDrawerProps {
  marker: RescueMapMarkerItem | null;
  onClose: () => void;
  ticketDetailOverrides?: RescueMapTicketDetailOverrides;
  stationAction?: StationDetailActionProps;
  stationSecondaryAction?: StationDetailActionProps;
  stationPendingCorrectionCount?: number;
  stationTabPanels?: StationDetailTabPanels;
}

const DetailsIcon = Icons.details;
const IncidentLogIcon = Icons.incidentLog;
const CloseIcon = Icons.close;
const MapIcon = Icons.map;
const PersonIcon = Icons.person;
const PinIcon = Icons.pin;
const ResourcesIcon = Icons.resources;

function formatStationStatus(marker: RescueMapMarkerItem) {
  const station = marker.stationMeta;

  if (
    station?.visibility === 'public' &&
    station?.verificationStatus === 'human_verified'
  ) {
    return {
      label: station.isTemporary ? 'TEMP VERIFIED' : 'ACTIVE VERIFIED',
      tone: 'active' as const,
    };
  }

  if (station?.verificationStatus === 'ai_verified') {
    return {
      label: 'AI VERIFIED',
      tone: 'warning' as const,
    };
  }

  return {
    label: station?.visibility?.toUpperCase() ?? 'ACTIVE',
    tone: 'inactive' as const,
  };
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
      value: station?.opHour?.trim() || '未提供',
      icon: <MapIcon />,
    },
    {
      id: 'level',
      label: '站點等級',
      value:
        typeof station?.level === 'number'
          ? `Level ${station.level}`
          : '未提供',
      icon: <IncidentLogIcon />,
    },
    {
      id: 'confidence',
      label: '可信度',
      value:
        typeof station?.confidenceScore === 'number'
          ? `${Math.round(station.confidenceScore * 100)}%`
          : '未提供',
      icon: <WaterDropRoundedIcon />,
    },
  ];
}

function createTicketSummary(marker: RescueMapMarkerItem) {
  const [latitude, longitude] = marker.position;
  const contactSummary = [
    marker.ticketMeta?.contactName?.trim(),
    marker.ticketMeta?.contactPhone?.trim(),
  ].filter(Boolean);

  return {
    title: marker.title,
    detailsPane: {
      statusBadge: {
        eyebrow: '任務狀態',
        label: marker.label,
      },
      locationLabel: '位置資訊',
      locationLines: [
        marker.subtitle,
        `緯度 ${latitude.toFixed(6)} / 經度 ${longitude.toFixed(6)}`,
      ],
      taskLabel: '任務類型',
      taskValue: marker.ticketMeta?.taskType?.trim() || '未提供',
      requesterLabel: '現場聯絡人',
      requesterValue: contactSummary.join(' / ') || '未提供',
      notesLabel: '任務說明',
      notesValue: marker.ticketMeta?.reviewNote?.trim() || marker.subtitle,
    },
  };
}

function createStationSummary({
  marker,
  stationSecondaryAction,
}: {
  marker: RescueMapMarkerItem;
  stationSecondaryAction?: StationDetailActionProps;
}) {
  return {
    stationSummary: {
      stationCode: marker.stationMeta?.name?.trim() || marker.title,
      stationIcon: <ResourcesIcon />,
      address:
        marker.stationMeta?.description?.trim() ||
        marker.stationMeta?.comment?.trim() ||
        marker.subtitle,
      addressIcon: <PinIcon />,
      status: formatStationStatus(marker),
    },
    tabs: [
      {
        id: 'info' as const,
        label: '詳情',
        icon: <DetailsIcon />,
      },
    ],
    // 歷史記錄、待處理、建議修改尚無對應後端資料，暫時隱藏。
    // editAction: {
    //   label: '編輯站點',
    //   icon: <EditRoundedIcon />,
    // },
    secondaryAction: stationSecondaryAction,
    contactCard: marker.stationMeta?.source
      ? {
          name: marker.stationMeta.isOfficial ? '官方站點' : '一般站點',
          role: marker.stationMeta.source.toUpperCase(),
          avatarIcon: <PersonIcon />,
          methods: [
            {
              id: 'verification',
              value: marker.stationMeta.verificationStatus ?? '未驗證',
              icon: <RadioRoundedIcon />,
            },
            {
              id: 'visibility',
              value: marker.stationMeta.visibility ?? '未提供',
              icon: <LocalPhoneRoundedIcon />,
            },
          ],
        }
      : undefined,
    resources: createStationResources(marker),
  };
}

export function RescueMapDetailDrawer({
  marker,
  onClose,
  ticketDetailOverrides,
  stationSecondaryAction,
}: RescueMapDetailDrawerProps) {
  const [activeStationTab, setActiveStationTab] =
    useState<StationDetailTabId>('info');
  const [activeTicketTab, setActiveTicketTab] = useState('details');

  useEffect(() => {
    setActiveStationTab('info');
    setActiveTicketTab(ticketDetailOverrides?.tabs?.[0]?.id ?? 'details');
  }, [marker?.id]);

  const closeAction = {
    ariaLabel: '關閉詳情',
    icon: <CloseIcon />,
    onClick: onClose,
  };

  if (!marker) {
    return null;
  }

  const resolvedTicketOverrides = ticketDetailOverrides
    ? {
        ...ticketDetailOverrides,
        tabsVariant: ticketDetailOverrides.tabsVariant ?? 'station',
        tabs: ticketDetailOverrides.tabs?.map((item) => ({
          ...item,
          selected: item.id === activeTicketTab,
          onClick: () => setActiveTicketTab(item.id),
        })),
      }
    : undefined;

  const ticketContent =
    activeTicketTab === 'details'
      ? resolvedTicketOverrides?.detailsContent
      : activeTicketTab === 'operation-log'
        ? resolvedTicketOverrides?.content
        : undefined;

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
        <TicketDetailDrawer
          {...createTicketSummary(marker)}
          {...resolvedTicketOverrides}
          content={ticketContent}
          closeAction={closeAction}
          width="100%"
          height="100%"
          minHeight="100%"
          tabsVariant={resolvedTicketOverrides?.tabsVariant ?? 'station'}
        />
      ) : null}

      {marker.detailType === 'station' ? (
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
