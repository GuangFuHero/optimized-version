'use client';

import { useEffect, useState, type ReactNode } from 'react';

import { Box, Tab, Typography } from '@mui/material';
import { useCurrentUser, useStation } from '@rescue-frontend/data-access/admin';
import {
  Badge,
  Button,
  designTokens,
  SheetFrame,
  SheetLayout,
  Tabs,
} from '@rescue-frontend/ui';
import { EyeOff, PencilLine, ShieldCheck, Trash2 } from 'lucide-react';

import {
  STATION_SHEET_WIDTH,
  StationForm,
  StationFormLayout,
} from '../../form';
import { getOperationalStatusMeta } from '../../operational-status';
import type { StationCapabilities } from './hooks/use-station-capabilities';
import {
  readOnlyCaption,
  toStationDetailView,
  type DetailStation,
  type StationDetailView,
} from './model/station-detail-view';
import { FreshnessCell } from '../../../admin/shared/freshness-cell';
import { StatusBadge } from './station-cells';
import {
  StationHistoryPanel,
  useLoadedStationVersion,
} from './station-history-panel';

const { color, radius, typography } = designTokens;

type DetailTab = 'info' | 'history';

interface StationDetailSheetProps {
  /** The station to show; null closes the sheet. */
  uuid: string | null;
  /** Show the station's edit form in place of its details, in the same drawer. */
  editing: boolean;
  caps: StationCapabilities;
  now: Date;
  onClose: () => void;
  onEdit: (uuid: string) => void;
  /** The edit was cancelled or saved: back to the station's details. */
  onEditEnd: () => void;
  onDelete: (uuid: string, name: string) => void;
}

/**
 * `/stations`' one drawer for a station (prototype `StationDrawer`): its details and version
 * history, or its edit form, swapped in place.
 */
export function StationDetailSheet({
  uuid,
  editing,
  caps,
  now,
  onClose,
  onEdit,
  onEditEnd,
  onDelete,
}: StationDetailSheetProps) {
  const query = useStation({ uuid: uuid ?? '' }, { enabled: Boolean(uuid) });
  const station = query.data?.station;
  const [activeTab, setActiveTab] = useState<DetailTab>('info');

  useEffect(() => setActiveTab('info'), [uuid]);

  let content: ReactNode;
  if (uuid && editing) {
    // 取消, a save, or a submit with nothing changed: back to the details.
    content = (
      <StationForm
        target={{ mode: 'edit', uuid }}
        onClose={onEditEnd}
        onSaved={onEditEnd}
      >
        {(view) => (
          <StationFormLayout
            view={view}
            onClose={() => {
              if (!view.submitting) onClose();
            }}
          />
        )}
      </StationForm>
    );
  } else if (station) {
    content = (
      <StationDetailContent
        station={station}
        caps={caps}
        now={now}
        activeTab={station.viewerCanViewHistory ? activeTab : 'info'}
        onTabChange={setActiveTab}
        onEdit={() => onEdit(station.uuid)}
        onDelete={() => onDelete(station.uuid, station.name ?? '')}
      />
    );
  } else {
    content = (
      <SheetLayout
        title={query.isPending ? '載入中…' : '找不到站點'}
        closeLabel="關閉站點詳情"
      >
        {query.isPending ? null : (
          <Muted>找不到這個站點，可能已刪除或不在你的權限範圍。</Muted>
        )}
      </SheetLayout>
    );
  }

  // One frame for every view, so switching to the edit form swaps the content in place.
  return (
    <SheetFrame
      open={Boolean(uuid)}
      onClose={onClose}
      width={STATION_SHEET_WIDTH}
      variant="admin"
      ariaLabel="站點詳情"
    >
      {content}
    </SheetFrame>
  );
}

function StationDetailContent({
  station,
  caps,
  now,
  activeTab,
  onTabChange,
  onEdit,
  onDelete,
}: {
  station: DetailStation;
  caps: StationCapabilities;
  now: Date;
  activeTab: DetailTab;
  onTabChange: (tab: DetailTab) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const view = toStationDetailView(station, {
    canViewPii: station.viewerCanViewPii,
  });
  const status = getOperationalStatusMeta(station.operationalStatus);
  const version = useLoadedStationVersion(station.uuid);
  const teamName = useCurrentUser().data?.active_identity?.team ?? null;

  return (
    <SheetLayout
      eyebrow={view.typeLabel}
      title={view.title}
      closeLabel="關閉站點詳情"
      headerContent={
        <>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '8px',
            }}
          >
            <Badge tone={status.tone} variant="solid">
              {status.label}
            </Badge>
            {view.isOfficial ? (
              <Badge tone="info" icon={<ShieldCheck size={13} />}>
                官方
              </Badge>
            ) : null}
            {view.verification.verified ? (
              <Badge tone="success">已驗證</Badge>
            ) : (
              <Badge>未驗證</Badge>
            )}
            {view.pendingFieldCount > 0 ? (
              <Badge tone="warning">{view.pendingFieldCount} 欄待審</Badge>
            ) : null}
          </Box>
          {station.viewerCanViewHistory ? (
            <Tabs
              aria-label="站點詳情分頁"
              value={activeTab}
              onChange={(_, tab: DetailTab) => onTabChange(tab)}
              sx={{ mt: '14px' }}
            >
              <Tab value="info" label="基本資料" />
              <Tab
                value="history"
                label={version ? `版本歷史 (v${version})` : '版本歷史'}
              />
            </Tabs>
          ) : null}
        </>
      }
      footer={
        <>
          {/* Per station, not the page capability: a `team`-scoped role holds the capability
              but would get a 404 on another team's station (WG-168). */}
          {station.viewerCanDelete ? (
            <Button
              variant="ghost"
              size="md"
              startIcon={<Trash2 size={16} />}
              onClick={onDelete}
              sx={{ color: color.fg.danger }}
            >
              刪除站點
            </Button>
          ) : null}
          <Box sx={{ flex: 1 }} />
          {station.viewerCanEdit ? (
            <Button
              size="md"
              startIcon={<PencilLine size={17} />}
              onClick={onEdit}
            >
              編輯站點
            </Button>
          ) : (
            <Muted>
              {readOnlyCaption({ canEditStations: caps.canEdit, teamName })}
            </Muted>
          )}
        </>
      }
    >
      {activeTab === 'history' ? (
        <StationHistoryPanel uuid={station.uuid} />
      ) : (
        <StationInfo station={station} view={view} now={now} />
      )}
    </SheetLayout>
  );
}

/** The designer's 基本資料 rows, in their order, with our extra fields where they fit. */
function StationInfo({
  station,
  view,
  now,
}: {
  station: DetailStation;
  view: StationDetailView;
  now: Date;
}) {
  return (
    <Box sx={{ '& > :first-of-type': { borderTop: 'none', pt: 0 } }}>
      <Row label="指派團隊">
        {station.assignedTeam?.name ?? <Muted>未指派</Muted>}
      </Row>
      <Row label="行政區">{view.district}</Row>
      <Row label="地址">{view.address}</Row>
      <Row label="座標">
        {view.coordinates ? <Data>{view.coordinates}</Data> : '—'}
      </Row>
      <Row label="營運狀態">
        <StatusBadge status={station.operationalStatus} />
      </Row>
      <Row label={<PrivateLabel>聯絡人 / 電話</PrivateLabel>}>
        <Box
          component="span"
          sx={{
            display: 'inline-flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: '4px',
          }}
        >
          {view.contact.line ?? <Muted>—</Muted>}
          {view.contact.email ? <span>{view.contact.email}</span> : null}
          {view.contact.maskedNote ? (
            <Data>{view.contact.maskedNote}</Data>
          ) : null}
        </Box>
      </Row>
      <Row label="開放時間">{station.opHour || '—'}</Row>
      <Row label="說明">{station.description || '—'}</Row>
      <Row label={<PrivateLabel>內部備註</PrivateLabel>}>
        {station.comment || '—'}
      </Row>
      <Block label="站點照片">
        <PhotoStrip photos={station.photos} />
      </Block>
      <Block label="物資盤點">
        {station.supplyStatus ? (
          <Box
            sx={{
              ...typography.body[400],
              color: color.fg.neutral.default,
              mb: '8px',
              whiteSpace: 'pre-line',
            }}
          >
            {`物資狀況：${station.supplyStatus}`}
          </Box>
        ) : null}
        {view.resources.length ? (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {view.resources.map((resource) => (
              <Badge key={resource.id}>
                {`${resource.label}・${resource.value}`}
              </Badge>
            ))}
          </Box>
        ) : (
          <Muted>（無盤點資料）</Muted>
        )}
      </Block>
      <Row label="成立時間">{view.createdDate}</Row>
      {/* 建立者: the station only carries a `createdBy` uuid, no name to show. */}
      <Row label="驗證">{view.verification.label}</Row>
      <Row label="最後更新">
        <FreshnessCell updatedAt={station.updatedAt} now={now} />
      </Row>
    </Box>
  );
}

const ROW_BORDER = `1px solid ${color.border.default}`;

/** A caption on the left, its value right-aligned, on the designer's ~48px rhythm. */
function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: '16px',
        minHeight: 48,
        boxSizing: 'border-box',
        py: '12px',
        borderTop: ROW_BORDER,
      }}
    >
      <Caption>{label}</Caption>
      <Box
        component="span"
        sx={{
          ...typography.body[400],
          color: color.fg.neutral.default,
          textAlign: 'right',
          minWidth: 0,
          overflowWrap: 'anywhere',
          whiteSpace: 'pre-line',
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

/** A row whose value is too wide to sit beside its caption: the caption over it. */
function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ py: '12px', borderTop: ROW_BORDER }}>
      <Box sx={{ mb: '8px' }}>
        <Caption>{label}</Caption>
      </Box>
      {children}
    </Box>
  );
}

function PhotoStrip({ photos }: { photos: DetailStation['photos'] }) {
  if (photos.length === 0) return <Muted>（尚無照片）</Muted>;
  return (
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
              borderRadius: `${radius.md}px`,
              border: `1px solid ${color.border.default}`,
            }}
          />
        </Box>
      ))}
    </Box>
  );
}

function PrivateLabel({ children }: { children: ReactNode }) {
  return (
    <Box
      component="span"
      sx={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
    >
      {children}
      <Badge tone="primary" size="sm" icon={<EyeOff size={11} />}>
        不公開
      </Badge>
    </Box>
  );
}

function Caption({ children }: { children: ReactNode }) {
  return (
    <Typography
      component="span"
      sx={{
        ...typography.body[300],
        fontSize: 15,
        color: color.fg.neutral.muted,
        flexShrink: 0,
      }}
    >
      {children}
    </Typography>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return (
    <Typography
      component="span"
      sx={{ ...typography.body[300], color: color.fg.neutral.muted }}
    >
      {children}
    </Typography>
  );
}

function Data({ children }: { children: ReactNode }) {
  return (
    <Box
      component="span"
      sx={{
        ...typography.data[300],
        color: color.fg.neutral.muted,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {children}
    </Box>
  );
}
