'use client';

import { useMemo, type ReactNode } from 'react';

import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import VolunteerActivismRoundedIcon from '@mui/icons-material/VolunteerActivismRounded';
import { Alert, Box, Stack, Typography } from '@mui/material';
import { useQuery } from 'urql';

import {
  GetTicketDocument,
  TicketFieldsFragmentDoc,
  useFragment,
} from '@rescue-frontend/data-access';

import { LocationPrivacyNotice } from '../../map/components/location-privacy-notice';
import { describeLocationCellSpan } from '../../map/location-cells';
import type { RescueMapMarkerItem } from '../../map/types';
import { AddNeedPanel, useCanAddNeed } from '../help-request/add-need-panel';
import { NeedRow, readTicketNeeds } from '../needs';
import { PhotoThumb } from '../photos';
import { formatTicketStatusLabel, formatTicketTypeLabel } from '../status';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

const { color } = designTokens;

const detailPalette = {
  surface: color.bg.neutral.default,
  border: color.border.default,
  heading: color.fg.neutral.default,
  text: color.fg.neutral.default,
  muted: color.fg.neutral.muted,
  accent: color.brand.secondary.subtle,
};

// 詳情面板自行顯示載入狀態，停用 suspense 避免整頁因抓取任務資料而閃爍重渲染。
const DETAIL_QUERY_CONTEXT = { suspense: false } as const;

interface TicketPhotoItem {
  uuid: string;
  url: string;
}

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Stack
      spacing={1.5}
      sx={{
        p: 2,
        borderRadius: 3,
        bgcolor: detailPalette.surface,
        border: `1px solid ${detailPalette.border}`,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ color: detailPalette.accent, display: 'grid', placeItems: 'center' }}>
            {icon}
          </Box>
          <Typography
            sx={{
              color: detailPalette.heading,
              fontSize: displayTextSize[15],
              lineHeight: '22px',
              fontWeight: 800,
            }}
          >
            {title}
          </Typography>
        </Box>
      </Box>
      {children}
    </Stack>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <Stack spacing={0.5}>
      <Typography
        sx={{
          color: detailPalette.muted,
          fontSize: displayTextSize[12],
          lineHeight: '18px',
          fontWeight: 700,
        }}
      >
        {label}
      </Typography>
      {typeof value === 'string' ? (
        <Typography
          sx={{
            color: detailPalette.text,
            fontSize: displayTextSize[14],
            lineHeight: '21px',
          }}
        >
          {value}
        </Typography>
      ) : (
        value
      )}
    </Stack>
  );
}

export function TaskMatchTicketDetailsPanel({
  marker,
  isAuthenticated = false,
}: {
  marker: RescueMapMarkerItem;
  isAuthenticated?: boolean;
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
  const contact =
    [
      ticket?.contactName?.trim() || marker.ticketMeta?.contactName?.trim(),
      ticket?.contactPhone?.trim() || marker.ticketMeta?.contactPhone?.trim(),
    ]
      .filter(Boolean)
      .join(' / ') || '未提供';

  return (
    <Stack spacing={2}>
      {ticketError ? (
        <Alert severity="error">
          {ticketError.message ?? '載入任務詳情失敗。'}
        </Alert>
      ) : null}

      {/* First, as in the prototype (site-detail.jsx:330-332): what a volunteer came to decide. */}
      {needs.length > 0 || isTicketFetching || canAddNeed ? (
        <SectionCard
          title={needs.length > 0 ? `需求（${needs.length} 筆）` : '需求'}
          icon={<VolunteerActivismRoundedIcon sx={{ fontSize: 18 }} />}
        >
          {/* Under the title, not beside it: on a phone the two squeezed each other onto two lines. */}
          {needs.length > 1 ? (
            <Typography sx={{ color: detailPalette.muted, fontSize: displayTextSize[12], lineHeight: 1.5 }}>
              一筆一筆接，可以接多筆
            </Typography>
          ) : null}
          {needs.length > 0 ? (
            <Stack spacing={1}>
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
            <Typography sx={{ color: detailPalette.muted, fontSize: displayTextSize[13] }}>
              {isTicketFetching ? '載入需求中...' : '這張單目前沒有需求。'}
            </Typography>
          )}
          {canAddNeed ? (
            <AddNeedPanel ticketUuid={marker.id} needCount={needs.length} />
          ) : null}
        </SectionCard>
      ) : null}

      {coarse ? (
        <LocationPrivacyNotice isAuthenticated={isAuthenticated}>
          為保護求助者，這裡只顯示<b>概略區塊</b>
          與結構化資訊。精確位置、狀況描述、照片與聯絡方式不會對外公開。
        </LocationPrivacyNotice>
      ) : null}

      {/* The rest of the prototype's 詳情, in its order: what this is, then where and whom to ask.
          Nothing of the back office's — 母單／子任務, review state, notes, times — which the
          prototype does not show. */}
      <SectionCard
        title="任務資訊"
        icon={<InfoOutlinedIcon sx={{ fontSize: 18 }} />}
      >
        <Stack spacing={1.25}>
          <DetailRow
            label="狀態"
            value={formatTicketStatusLabel(ticketStatus)}
          />
          {coarse ? null : (
            <DetailRow
              label="任務說明"
              value={ticket?.description?.trim() || marker.subtitle}
            />
          )}
          <DetailRow
            label="任務類型"
            value={formatTicketTypeLabel(ticket?.taskType ?? marker.ticketMeta?.taskType)}
          />
          {/* Withheld with the location — a scene photo can show the house number (AC-03) — and
              left out when there are none, as in the prototype. All at once, as thumbnails that
              open the image itself (prototype site-detail.jsx:353), and each failing on its own
              into a card with its link. No 上傳者 or time: the one is an account's uuid, which
              tells a reader nothing and ties the photo to an account. */}
          {!coarse && photos.length > 0 ? (
            <DetailRow
              label={`現場照片（${photos.length}）`}
              value={
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns:
                      'repeat(auto-fill, minmax(120px, 1fr))',
                    gap: 1,
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
              }
            />
          ) : null}
          {/* Not beside a coarse location, as in the prototype: a caller without ticket.view_pii
              gets it masked (王◯◯ / 09*****678 — backend `graphql/tickets/types.py`), which
              tells a guest nothing and reaches no one. */}
          {coarse ? null : <DetailRow label="現場聯絡人" value={contact} />}
          {marker.locationCell ? (
            <DetailRow
              label="位置資訊"
              value={
                <Stack spacing={0.25}>
                  <Typography sx={{ color: detailPalette.text, fontSize: displayTextSize[14], lineHeight: '21px' }}>
                    概略區塊（{describeLocationCellSpan(marker.locationCell)}範圍）
                  </Typography>
                  <Typography sx={{ color: detailPalette.muted, fontSize: displayTextSize[12], lineHeight: '19px' }}>
                    同一區塊內的求助會顯示在一起，看不出是哪一戶
                  </Typography>
                </Stack>
              }
            />
          ) : (
            <DetailRow
              label="位置資訊"
              value={`緯度 ${marker.position[0].toFixed(6)} / 經度 ${marker.position[1].toFixed(6)}`}
            />
          )}
        </Stack>
      </SectionCard>
    </Stack>
  );
}
