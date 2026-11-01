'use client';

import { useMemo } from 'react';

import { FileText, MapPin, Tag, User } from 'lucide-react';

import { Alert, Box, Stack, Typography } from '@mui/material';
import { useQuery } from 'urql';

import {
  GetTicketDocument,
  TicketFieldsFragmentDoc,
  useFragment,
} from '@rescue-frontend/data-access';

import { BuildingTicketNavigation } from '../../building/building-navigation';
import { responsibleTeamsText } from '../../map/areas';
import { LocationPrivacyNotice } from '../../map/components/location-privacy-notice';
import { describeLocationCellSpan } from '../../map/location-cells';
import type { RescueMapMarkerItem } from '../../map/types';
import { SiteDetailLabel, SiteDetailRow } from '../../shell/site/detail-info';
import { formatTicketStreet, formatTicketUnit } from '../address';
import { requesterAuditNotice } from '../audit-issue';
import { AddNeedPanel, useCanAddNeed } from '../help-request/add-need-panel';
import {
  NeedRow,
  readTicketNeeds,
  summarizeNeedsProgress,
  useNeedClaim,
  VolunteerProgress,
} from '../needs';
import { PhotoThumb } from '../photos';
import { formatTicketTypeLabel } from '../status';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

const { color, spacing } = designTokens;

// 詳情面板自行顯示載入狀態，停用 suspense 避免整頁因抓取任務資料而閃爍重渲染。
const DETAIL_QUERY_CONTEXT = { suspense: false } as const;

interface TicketPhotoItem {
  uuid: string;
  url: string;
}

/** A row's second, smaller line under its value: a hint, a room, the coordinates. */
const secondaryLine = {
  fontSize: displayTextSize[12],
  lineHeight: 1.6,
  color: color.fg.neutral.subtle,
} as const;

export function TaskMatchTicketDetailsPanel({
  marker,
  isAuthenticated = false,
  onOpenBuilding,
  onSelectTicket,
}: {
  marker: RescueMapMarkerItem;
  isAuthenticated?: boolean;
  /** For a ticket filed inside a building: open the building's drawer (現場分區). */
  onOpenBuilding?: (buildingUuid: string) => void;
  /** Open another ticket of the same building, from 上一張／下一張. */
  onSelectTicket?: (marker: RescueMapMarkerItem) => void;
}) {
  // The backend withheld this ticket's detail (ADR-281): the point is a cell centre, and the
  // free text, notes and photos came back empty. Rows for them are left out rather than shown as
  // 「未提供」— that would claim the reporter wrote nothing, which is not what happened.
  const coarse = Boolean(marker.locationCell);
  const [{ data: ticketData, fetching: isTicketFetching, error: ticketError }] =
    useQuery({
      query: GetTicketDocument,
      variables: { uuid: marker.id },
      pause: !marker.id,
      // Shown from the cache, then re-read (WG-028): a ticket opened again in the same visit
      // otherwise showed claims and releases made since by other people as they were.
      requestPolicy: 'cache-and-network',
      context: DETAIL_QUERY_CONTEXT,
    });

  const ticket = useMemo(() => {
    if (!ticketData?.ticket) {
      return null;
    }

    return {
      ...ticketData.ticket,
      ...useFragment(TicketFieldsFragmentDoc, ticketData.ticket),
    };
  }, [ticketData?.ticket]);

  const photos = useMemo<TicketPhotoItem[]>(
    () =>
      (ticket?.photos ?? []).map((photo) => ({
        uuid: photo.uuid,
        url: photo.url,
      })),
    [ticket?.photos],
  );

  // The ticket's tasks, as needs a volunteer can claim. Who claimed them is not shown: without
  // ticket.view_history `assignments` comes back empty, and `assignedCount` is what everyone gets.
  const needs = useMemo(
    () => readTicketNeeds(ticketData?.ticket ?? null),
    [ticketData?.ticket],
  );
  const ticketStatus = ticket?.status ?? marker.ticketMeta?.status;
  const ticketCreatedBy = ticket?.createdBy ?? marker.ticketMeta?.createdBy;
  // Its requester can add one more need, even to a ticket left with none.
  const canAddNeed = useCanAddNeed({ ticketStatus, ticketCreatedBy });
  const { viewerId } = useNeedClaim();
  const auditNotice = requesterAuditNotice({
    auditStatus: ticket?.auditStatus ?? marker.ticketMeta?.auditStatus,
    createdBy: ticketCreatedBy,
    viewerId,
    title: ticket?.title || marker.title,
  });
  const contact =
    [
      ticket?.contactName?.trim() || marker.ticketMeta?.contactName?.trim(),
      ticket?.contactPhone?.trim() || marker.ticketMeta?.contactPhone?.trim(),
    ]
      .filter(Boolean)
      .join(' / ') || '未提供';
  const street = formatTicketStreet(ticketData?.ticket?.secondaryLocation);
  const unit = formatTicketUnit(ticketData?.ticket?.secondaryLocation);
  // Null to a guest, as the exact location is.
  const buildingUuid = ticketData?.ticket?.buildingMapUuid;
  // Empty when the ticket lies in no 責任區, and to a guest, who sees the coarse branch anyway (ADR-422).
  const responsible = responsibleTeamsText(
    ticketData?.ticket?.responsibleTeams.map((team) => team.name) ?? [],
  );
  const progress = summarizeNeedsProgress(needs, ticketStatus);

  return (
    // No cards, as in the prototype: blocks set apart by space, each under a small heading.
    <Stack sx={{ gap: `${spacing[4]}px` }}>
      {/* At the very top, as the design has it: orange, not red, as the ticket stands. */}
      {auditNotice ? <Alert severity="warning">{auditNotice}</Alert> : null}

      {ticketError ? (
        <Alert severity="error">
          {ticketError.message ?? '載入任務詳情失敗。'}
        </Alert>
      ) : null}

      {/* The whole ticket first, then each need: how far it is from having its people. */}
      {progress ? <VolunteerProgress progress={progress} /> : null}

      {/* First, as in the prototype: what a volunteer came to decide. */}
      {needs.length > 0 || isTicketFetching || canAddNeed ? (
        <Box>
          <SiteDetailLabel>
            {needs.length > 0 ? `需求（${needs.length} 筆）` : '需求'}
          </SiteDetailLabel>
          {/* Under the heading, not beside it: on a phone the two squeezed each other onto two lines. */}
          {needs.length > 1 ? (
            <Typography sx={{ ...secondaryLine, mt: -0.5, mb: 1 }}>
              一筆一筆接，可以接多筆
            </Typography>
          ) : null}
          {needs.length > 0 ? (
            <Stack sx={{ gap: `${spacing[2]}px` }}>
              {needs.map((need) => (
                <NeedRow
                  key={need.uuid}
                  need={need}
                  ticketUuid={marker.id}
                  ticketStatus={ticketStatus}
                  ticketCreatedBy={ticketCreatedBy}
                  isAuthenticated={isAuthenticated}
                />
              ))}
            </Stack>
          ) : (
            <Typography
              sx={{ ...secondaryLine, fontSize: displayTextSize[13] }}
            >
              {isTicketFetching ? '載入需求中...' : '這張單目前沒有需求。'}
            </Typography>
          )}
          {canAddNeed ? (
            <Box sx={{ mt: `${spacing[2]}px` }}>
              <AddNeedPanel ticketUuid={marker.id} needCount={needs.length} />
            </Box>
          ) : null}
        </Box>
      ) : null}

      {coarse ? (
        <LocationPrivacyNotice isAuthenticated={isAuthenticated}>
          為保護求助者，這裡只顯示<b>概略區塊</b>
          與結構化資訊。精確位置、狀況描述、照片與聯絡方式不會對外公開。
        </LocationPrivacyNotice>
      ) : null}

      {/* The rest of the prototype's 詳情, in its order: what this is, then where and whom to ask.
          Nothing of the back office's — 母單／子任務, review state, notes, times — which the
          prototype does not show. The status is a badge under the title. */}
      {coarse ? null : (
        <SiteDetailRow label="任務說明" icon={<FileText size={16} />}>
          {ticket?.description?.trim() || marker.subtitle}
        </SiteDetailRow>
      )}
      <SiteDetailRow label="任務類型" icon={<Tag size={16} />}>
        {formatTicketTypeLabel(ticket?.taskType ?? marker.ticketMeta?.taskType)}
      </SiteDetailRow>
      {/* Withheld with the location — a scene photo can show the house number (AC-03) — and
              left out when there are none, as in the prototype. All at once, as thumbnails that
              open the image itself (prototype site-detail.jsx:353), and each failing on its own
              into a card with its link. No 上傳者 or time: the one is an account's uuid, which
              tells a reader nothing and ties the photo to an account. */}
      {!coarse && photos.length > 0 ? (
        <Box>
          <SiteDetailLabel>現場照片（{photos.length}）</SiteDetailLabel>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
              gap: `${spacing[2]}px`,
            }}
          >
            {photos.map((photo, index) => (
              <PhotoThumb
                key={photo.uuid}
                url={photo.url}
                index={index}
                linksOut
              />
            ))}
          </Box>
        </Box>
      ) : null}
      {/* Not beside a coarse location, as in the prototype: a caller without ticket.view_pii
          gets it masked (王◯◯ / 09*****678 — backend `graphql/tickets/types.py`), which
          tells a guest nothing and reaches no one. */}
      {coarse ? null : (
        <SiteDetailRow label="現場聯絡人" icon={<User size={16} />}>
          {contact}
        </SiteDetailRow>
      )}
      <SiteDetailRow label="位置資訊" icon={<MapPin size={16} />}>
        {marker.locationCell ? (
          <>
            概略區塊（{describeLocationCellSpan(marker.locationCell)}範圍）
            <Box sx={secondaryLine}>
              同一區塊內的求助會顯示在一起，看不出是哪一戶
            </Box>
          </>
        ) : (
          // The prototype's order: the address, then which floor and room — what someone going
          // there needs first — and the coordinates last.
          <>
            {street || !isTicketFetching ? (
              <Box>{street ?? '未填地址'}</Box>
            ) : null}
            {unit ? (
              <Box sx={{ fontSize: displayTextSize[13], fontWeight: 600 }}>
                {unit}
              </Box>
            ) : null}
            {/* Who answers for this place, as the map's 責任區 label writes it (ADR-422). */}
            {responsible ? (
              <Box sx={{ fontSize: displayTextSize[13] }}>{responsible}</Box>
            ) : null}
            <Box sx={secondaryLine}>
              緯度 {marker.position[0].toFixed(6)} / 經度{' '}
              {marker.position[1].toFixed(6)}
            </Box>
            {buildingUuid && onOpenBuilding && onSelectTicket ? (
              <BuildingTicketNavigation
                buildingUuid={buildingUuid}
                ticketUuid={marker.id}
                onOpenBuilding={onOpenBuilding}
                onSelectTicket={onSelectTicket}
              />
            ) : null}
          </>
        )}
      </SiteDetailRow>
    </Stack>
  );
}
