'use client';

import { useEffect, useState, type ReactNode } from 'react';

import { Box, Drawer, Stack, Typography } from '@mui/material';
import { useStation } from '@rescue-frontend/data-access/admin';
import { Badge, designTokens, Icons, MetadataTable } from '@rescue-frontend/ui';
import {
  EyeOff,
  History,
  Mail,
  PencilLine,
  Phone,
  ShieldCheck,
  Trash2,
} from 'lucide-react';

import { getStationTypeLabel } from '../../type-options';
import {
  StationDetailDrawer,
  StationDetailInfoPanel,
  StationDetailSectionHeading,
  type StationDetailDrawerProps,
  type StationDetailTabId,
  type StationDetailTabItem,
} from '../station-detail';
import type { StationCapabilities } from './hooks/use-station-capabilities';
import {
  toStationDetailView,
  type DetailStation,
} from './model/station-detail-view';
import { formatAbsoluteTime, FreshnessCell } from './station-cells';
import { StationHistoryPanel } from './station-history-panel';

const { color, radius, typography } = designTokens;

const DRAWER_WIDTH = 480;

const CONTACT_ICONS = {
  phone: <Phone />,
  email: <Mail />,
} as const;

interface StationDetailSheetProps {
  /** The station to show; null closes the sheet. */
  uuid: string | null;
  caps: StationCapabilities;
  now: Date;
  onClose: () => void;
  onEdit: (uuid: string) => void;
  onDelete: (uuid: string, name: string) => void;
}

/** `/stations`' view of one station: the shared station detail drawer, fed from the admin API. */
export function StationDetailSheet({
  uuid,
  caps,
  now,
  onClose,
  onEdit,
  onDelete,
}: StationDetailSheetProps) {
  const query = useStation({ uuid: uuid ?? '' }, { enabled: Boolean(uuid) });
  const station = query.data?.station;
  const [activeTab, setActiveTab] = useState<StationDetailTabId>('info');

  useEffect(() => setActiveTab('info'), [uuid]);

  const closeAction = {
    ariaLabel: '關閉站點詳情',
    icon: <Icons.close />,
    onClick: onClose,
  };

  return (
    <Drawer
      anchor="right"
      open={Boolean(uuid)}
      onClose={onClose}
      slotProps={{
        paper: { sx: { width: `min(${DRAWER_WIDTH}px, 100vw)` } },
      }}
    >
      {station ? (
        <StationDetailDrawer
          {...stationDrawerProps(station, caps, now, {
            onEdit: () => onEdit(station.uuid),
            onDelete: () => onDelete(station.uuid, station.name ?? ''),
          })}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          closeAction={closeAction}
          width="100%"
          height="100%"
          minHeight="100%"
        />
      ) : (
        <StationDetailDrawer
          {...messageDrawerProps(
            query.isPending ? '載入中…' : '找不到站點',
            query.isPending
              ? null
              : '找不到這個站點，可能已刪除或不在你的權限範圍。',
          )}
          activeTab="info"
          closeAction={closeAction}
          width="100%"
          height="100%"
          minHeight="100%"
        />
      )}
    </Drawer>
  );
}

type DrawerContent = Pick<
  StationDetailDrawerProps,
  'stationSummary' | 'tabs' | 'tabPanels' | 'editAction' | 'footerAction'
>;

function stationDrawerProps(
  station: DetailStation,
  caps: StationCapabilities,
  now: Date,
  actions: { onEdit: () => void; onDelete: () => void },
): DrawerContent {
  const view = toStationDetailView(station, { canViewPii: caps.canViewPii });
  const stationSummary: StationDetailDrawerProps['stationSummary'] = {
    stationCode: view.title,
    stationIcon: <Icons.resources />,
    address: view.address,
    addressIcon: <Icons.pin />,
    status: view.status,
    statusDetail: station.statusChangedAt
      ? `狀態更新於 ${formatAbsoluteTime(station.statusChangedAt)}`
      : undefined,
    badges: (
      <>
        {view.isOfficial ? (
          <Badge tone="info" icon={<ShieldCheck size={12} />}>
            官方
          </Badge>
        ) : null}
        {view.pendingFieldCount > 0 ? (
          <Badge tone="warning">{view.pendingFieldCount} 欄待審</Badge>
        ) : null}
      </>
    ),
  };

  const tabs: StationDetailTabItem[] = [
    { id: 'info', label: '基本資料', icon: <Icons.details /> },
  ];
  if (caps.canViewHistory) {
    tabs.push({ id: 'history', label: '版本歷史', icon: <History /> });
  }

  return {
    stationSummary,
    tabs,
    tabPanels: {
      info: (
        <Stack spacing={3}>
          <StationDetailInfoPanel
            stationSummary={stationSummary}
            contactCard={{
              name: view.contact.name,
              role: view.contact.note,
              avatarIcon: caps.canViewPii ? <Icons.person /> : <EyeOff />,
              methods: view.contact.methods.map((method) => ({
                ...method,
                icon: CONTACT_ICONS[method.id],
              })),
            }}
            resources={view.resources}
          />
          <StationRecordSection station={station} now={now} />
          <StationPhotosSection photos={station.photos} />
        </Stack>
      ),
      history: caps.canViewHistory ? (
        <StationHistoryPanel uuid={station.uuid} />
      ) : undefined,
    },
    editAction: caps.canEdit
      ? { label: '編輯站點', icon: <PencilLine />, onClick: actions.onEdit }
      : undefined,
    footerAction: caps.canDelete
      ? {
          label: '刪除站點',
          icon: <Trash2 />,
          intent: 'danger',
          onClick: actions.onDelete,
        }
      : undefined,
  };
}

/** The drawer's frame around a single message, while loading or when the station is gone. */
function messageDrawerProps(
  title: string,
  message: string | null,
): DrawerContent {
  return {
    stationSummary: {
      stationCode: title,
      stationIcon: <Icons.resources />,
      address: '',
      status: { label: '' },
    },
    tabs: [{ id: 'info', label: '基本資料' }],
    tabPanels: {
      info: message ? <Muted>{message}</Muted> : <Box />,
    },
  };
}

function StationRecordSection({
  station,
  now,
}: {
  station: DetailStation;
  now: Date;
}) {
  const point = station.geometry as { coordinates?: number[] } | null;
  const [lng, lat] = point?.coordinates ?? [];

  return (
    <Section title="站點資料">
      <MetadataTable
        layout="split"
        labelWidth={104}
        rows={[
          { label: '類型', value: getStationTypeLabel(station.type) },
          { label: '指派團隊', value: station.assignedTeam?.name ?? '未指派' },
          {
            label: '座標',
            value:
              lat == null || lng == null ? (
                '—'
              ) : (
                <Mono>{`${lat}, ${lng}`}</Mono>
              ),
          },
          { label: '開放時間', value: station.opHour || '—' },
          { label: '物資狀況', value: station.supplyStatus || '—' },
          { label: '說明', value: station.description || '—' },
          {
            label: <PrivateLabel>內部備註</PrivateLabel>,
            value: station.comment || '—',
          },
          { label: '建立時間', value: formatAbsoluteTime(station.createdAt) },
          {
            label: '最後更新',
            value: <FreshnessCell updatedAt={station.updatedAt} now={now} />,
          },
        ]}
      />
    </Section>
  );
}

function StationPhotosSection({ photos }: { photos: DetailStation['photos'] }) {
  return (
    <Section title="站點照片">
      {photos.length === 0 ? (
        <Muted>（尚無照片）</Muted>
      ) : (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {photos.map((photo) => (
            <Box
              key={photo.uuid}
              component="a"
              href={photo.url}
              target="_blank"
              rel="noreferrer"
              sx={{ display: 'block', lineHeight: 0 }}
            >
              <Box
                component="img"
                src={photo.url}
                alt="站點照片"
                sx={{
                  width: 96,
                  height: 72,
                  objectFit: 'cover',
                  borderRadius: `${radius.sm}px`,
                  border: `1px solid ${color.border.default}`,
                }}
              />
            </Box>
          ))}
        </Box>
      )}
    </Section>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack spacing={1}>
      <StationDetailSectionHeading label={title} />
      {children}
    </Stack>
  );
}

function PrivateLabel({ children }: { children: ReactNode }) {
  return (
    <Box
      component="span"
      sx={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
    >
      {children}
      <Badge tone="warning" size="sm" icon={<EyeOff size={11} />}>
        不公開
      </Badge>
    </Box>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return (
    <Typography sx={{ ...typography.body[300], color: color.fg.neutral.muted }}>
      {children}
    </Typography>
  );
}

function Mono({ children }: { children: ReactNode }) {
  return (
    <Box component="span" sx={typography.data[300]}>
      {children}
    </Box>
  );
}
