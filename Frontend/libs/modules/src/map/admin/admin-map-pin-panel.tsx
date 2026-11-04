'use client';

import { forwardRef, type ComponentProps, type ReactNode } from 'react';

import { Box, ButtonBase, Stack, Typography } from '@mui/material';
import { useStation, useTicket } from '@rescue-frontend/data-access/admin';
import { Button, Tag, designTokens } from '@rescue-frontend/ui';
import { ArrowLeft, ExternalLink, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

import { DetailRow } from '../../admin/shared/detail-rows';
import { Muted } from '../../admin/shared/muted';
import {
  toStationDetailView,
  type DetailStation,
  type StationDetailView,
} from '../../station/admin/station-management/model/station-detail-view';
import { PrivateLabel } from '../../station/admin/station-management/station-detail-sheet';
import {
  StatusBadge,
  TypeChip,
} from '../../station/admin/station-management/station-cells';
import {
  adminTicketHref,
  ticketDetailState,
  toTicketDetailView,
} from '../../ticket/admin/ticket-board/model/ticket-detail-view';
import type { RescueMapMarkerItem } from '../types';

const { color, radius, typography } = designTokens;

const NO_DISASTER_LABELS = {};

const TICKET_NOT_SHOWN = {
  loading: '載入中…',
  failed: '這張單的資料載入失敗。',
  missing: '找不到這張單，可能已刪除或不在你的權限範圍。',
  ready: '',
};

// A new tab: whoever is working on an area keeps it, and this pin, to come back to.
const NewTabLink = forwardRef<HTMLAnchorElement, ComponentProps<typeof Link>>(
  function NewTabLink(props, ref) {
    return (
      <Link ref={ref} {...props} target="_blank" rel="noopener noreferrer" />
    );
  },
);

function PanelFrame({
  heading,
  backLabel,
  onBack,
  href,
  linkLabel,
  children,
}: {
  heading: string;
  backLabel: string;
  onBack: () => void;
  href: string;
  linkLabel: string;
  children: ReactNode;
}) {
  return (
    <Stack sx={{ flex: 1, minHeight: 0 }}>
      <Stack
        direction="row"
        spacing={1}
        sx={{
          alignItems: 'center',
          px: 2,
          py: 1.5,
          borderBottom: `1px solid ${color.border.default}`,
        }}
      >
        <ButtonBase
          onClick={onBack}
          aria-label={backLabel}
          sx={{
            width: 32,
            height: 32,
            borderRadius: `${radius.sm}px`,
            color: color.fg.neutral.subtle,
          }}
        >
          <Box component={ArrowLeft} sx={{ width: 18, height: 18 }} />
        </ButtonBase>
        <Typography
          sx={{ ...typography.label[500], color: color.fg.neutral.default }}
        >
          {heading}
        </Typography>
      </Stack>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 2 }}>
        {children}
      </Box>
      <Stack
        direction="row"
        sx={{
          justifyContent: 'flex-end',
          px: 2.25,
          py: 1.5,
          borderTop: `1px solid ${color.border.default}`,
        }}
      >
        <Button
          variant="secondary"
          size="md"
          href={href}
          LinkComponent={NewTabLink}
          endIcon={<ExternalLink size={15} />}
        >
          {linkLabel}
        </Button>
      </Stack>
    </Stack>
  );
}

function Title({ children }: { children: ReactNode }) {
  return (
    <Typography
      sx={{
        ...typography.label[500],
        fontWeight: 700,
        color: color.fg.neutral.default,
        overflowWrap: 'anywhere',
        mb: 1.5,
      }}
    >
      {children}
    </Typography>
  );
}

/** A ticket on 互助地圖: where it is and whose it is, not what to do about it (MAP-TICKET-101). */
function TicketPanel({
  marker,
  backLabel,
  onBack,
}: {
  marker: RescueMapMarkerItem;
  backLabel: string;
  onBack: () => void;
}) {
  const query = useTicket({ uuid: marker.id });
  const ticket = query.data?.ticket;
  const state = ticketDetailState(query);
  const view = ticket ? toTicketDetailView(ticket, NO_DISASTER_LABELS) : null;
  const address =
    view?.location.kind === 'exact'
      ? [view.location.address, view.location.floorRoom]
          .filter(Boolean)
          .join(' ')
      : null;

  return (
    <PanelFrame
      heading="任務單"
      backLabel={backLabel}
      onBack={onBack}
      href={adminTicketHref(marker.id)}
      linkLabel="到任務管理看完整內容"
    >
      <Title>{view?.title ?? marker.title}</Title>
      {view ? (
        <>
          <DetailRow label="地址">
            {address ?? <Muted inline>只看得到概略位置</Muted>}
          </DetailRow>
          <DetailRow label="負責團隊">
            {view.teamNames === null ? (
              <Muted inline>看不到</Muted>
            ) : view.teamNames.length > 0 ? (
              view.teamNames.join('、')
            ) : (
              <Box component="span" sx={{ color: color.fg.warning }}>
                未指派
              </Box>
            )}
          </DetailRow>
        </>
      ) : (
        <Muted inline>{TICKET_NOT_SHOWN[state]}</Muted>
      )}
    </PanelFrame>
  );
}

/**
 * A station on 互助地圖: the part of `/stations`' 基本資料 that planning an area needs
 * (MAP-STATION-101). Everything else, and editing, is one link away.
 */
function StationRows({
  station,
  view,
}: {
  station: DetailStation;
  view: StationDetailView;
}) {
  return (
    <>
      <DetailRow label="負責團隊">
        {station.assignedTeam?.name ?? <Muted inline>未指派</Muted>}
      </DetailRow>
      <DetailRow label="地址">{view.address}</DetailRow>
      <DetailRow label="營運狀態">
        <StatusBadge status={station.operationalStatus} />
      </DetailRow>
      <DetailRow label={<PrivateLabel>聯絡人 / 電話</PrivateLabel>}>
        {view.contact.line ?? <Muted inline>—</Muted>}
        {view.contact.maskedNote ? `\n${view.contact.maskedNote}` : null}
      </DetailRow>
      <DetailRow label="開放時間">{station.opHour || '—'}</DetailRow>
      <DetailRow label="目前缺少">{station.supplyStatus || '—'}</DetailRow>
    </>
  );
}

function StationPanel({
  marker,
  backLabel,
  onBack,
}: {
  marker: RescueMapMarkerItem;
  backLabel: string;
  onBack: () => void;
}) {
  const query = useStation({ uuid: marker.id });
  const station = query.data?.station;
  const view = station
    ? toStationDetailView(station, {
        canViewPii: station.viewerCanViewPii,
      })
    : null;

  return (
    <PanelFrame
      heading="資源站點"
      backLabel={backLabel}
      onBack={onBack}
      href={`/stations?station=${encodeURIComponent(marker.id)}`}
      linkLabel="到資源站點管理看完整內容"
    >
      <Title>{view?.title ?? marker.title}</Title>
      {station && view ? (
        <>
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: 'center', mb: 1 }}
          >
            <TypeChip type={station.type} />
            {view.isOfficial ? (
              <Tag tone="info" icon={<ShieldCheck size={13} />}>
                官方
              </Tag>
            ) : null}
          </Stack>
          <StationRows station={station} view={view} />
        </>
      ) : (
        <Muted inline>
          {query.isPending
            ? '載入中…'
            : query.error
              ? '這個站點的資料載入失敗。'
              : '找不到這個站點，可能已刪除或不在你的權限範圍。'}
        </Muted>
      )}
    </PanelFrame>
  );
}

/**
 * 互助地圖 settles who a piece of land belongs to; 任務管理 and 資源站點管理 are where a ticket or a
 * station is worked on (MAP-SCOPE-101). So a pin opens here, beside the map, and stops at a link.
 */
export function AdminMapPinPanel({
  marker,
  backLabel,
  onBack,
}: {
  marker: RescueMapMarkerItem;
  backLabel: string;
  onBack: () => void;
}) {
  return marker.detailType === 'station' ? (
    <StationPanel
      key={marker.id}
      marker={marker}
      backLabel={backLabel}
      onBack={onBack}
    />
  ) : (
    <TicketPanel
      key={marker.id}
      marker={marker}
      backLabel={backLabel}
      onBack={onBack}
    />
  );
}
