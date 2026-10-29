'use client';

import { ArrowLeft, ChevronRight, Eye, EyeOff, MapPinned } from 'lucide-react';

import { Box, ButtonBase, Stack, Typography } from '@mui/material';
import { useEffect, useRef } from 'react';

import {
  AREA_KIND_LABELS,
  PUBLIC_ZONE_COLORS,
  type AreaContents,
  type RescueMapAreaKind,
  type RescueMapClosureArea,
  type RescueMapMarkerItem,
  type RescueMapPublicZone,
} from '@rescue-frontend/modules';

/** One area as the list shows it: any of the three kinds, with what lies inside it. */
export interface AdminAreaListItem {
  id: string;
  kind: RescueMapAreaKind;
  name: string | null;
  note: string | null;
  teams: readonly string[];
  /** Whether the public map shows it; always true except for a 標示區. */
  isPublic: boolean;
  contents: AreaContents;
}

// 危險區 first: the first thing to see on opening the page is where not to go (prototype `map-panel.jsx`).
const KIND_ORDER: readonly RescueMapAreaKind[] = [
  'hazardous_zone',
  'team_zone',
  'mark_zone',
];

export function toAdminAreaListItems({
  closureAreas,
  publicZones,
  countContents,
}: {
  closureAreas: readonly RescueMapClosureArea[];
  publicZones: readonly RescueMapPublicZone[];
  countContents: (area: { polygons: [number, number][][][] }) => AreaContents;
}): AdminAreaListItem[] {
  return [
    ...closureAreas.map(
      (area): AdminAreaListItem => ({
        id: area.id,
        kind: 'hazardous_zone',
        name: area.name,
        note: area.comment ?? null,
        teams: [],
        isPublic: true,
        contents: countContents(area),
      }),
    ),
    ...publicZones.map(
      (zone): AdminAreaListItem => ({
        id: zone.id,
        kind: zone.kind,
        name: zone.name,
        note: zone.comment ?? null,
        teams: zone.teams,
        isPublic: zone.isPublic !== false,
        contents: countContents(zone),
      }),
    ),
  ];
}

function Swatch({ kind }: { kind: RescueMapAreaKind }) {
  return (
    <Box
      sx={{
        width: 14,
        height: 14,
        mt: '3px',
        borderRadius: '3px',
        flexShrink: 0,
        ...(kind === 'hazardous_zone'
          ? {
              background:
                'repeating-linear-gradient(135deg, #F57C00 0 3px, #fff 3px 6px)',
              border: '1px solid #F57C00',
            }
          : { bgcolor: PUBLIC_ZONE_COLORS[kind] }),
      }}
    />
  );
}

function summaryOf(item: AdminAreaListItem) {
  const inside = `區內 ${item.contents.tickets} 張任務單、${item.contents.stations} 個站點`;

  return item.teams.length > 0
    ? `${item.teams.join('、')} · ${inside}`
    : inside;
}

function AreaRow({
  item,
  selected,
  onSelect,
}: {
  item: AdminAreaListItem;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (selected) {
      ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selected]);

  return (
    <ButtonBase
      ref={ref}
      onClick={() => onSelect(item.id)}
      aria-pressed={selected}
      sx={{
        width: '100%',
        textAlign: 'left',
        alignItems: 'flex-start',
        gap: 1.25,
        px: 1.5,
        py: 1.375,
        borderRadius: 3,
        border: `1px solid ${selected ? '#E3791E' : '#DCC1B1'}`,
        bgcolor: selected ? '#FFF1E5' : '#fff',
      }}
    >
      <Swatch kind={item.kind} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
          <Typography
            noWrap
            sx={{ fontSize: 14, fontWeight: 700, color: '#151C22' }}
          >
            {item.name ?? '（未命名）'}
          </Typography>
          <Box
            component={item.isPublic ? Eye : EyeOff}
            aria-label={item.isPublic ? '前台可見' : '只有後台看得到'}
            sx={{ width: 14, height: 14, flexShrink: 0, color: '#564337' }}
          />
        </Stack>
        <Typography sx={{ mt: 0.25, fontSize: 12, color: '#564337' }}>
          {summaryOf(item)}
        </Typography>
      </Box>
      <Box
        component={ChevronRight}
        sx={{ width: 16, height: 16, mt: '2px', color: '#8A7466' }}
      />
    </ButtonBase>
  );
}

const KIND_HINTS: Record<RescueMapAreaKind, { hint: string; example: string }> =
  {
    hazardous_zone: {
      hint: '提醒大家不要進入',
      example: '例：堤防潰口、土石流警戒',
    },
    team_zone: {
      hint: '交給一個單位負責，區內任務單歸他',
      example: '例：大平村交給慈濟基金會',
    },
    mark_zone: {
      hint: '只標出位置，不派單位',
      example: '例：志工休息區、集合點、物資集散點',
    },
  };

/** 還沒有任何區域: says what can be drawn, so a first-time user knows (prototype `ZoneList`, 2026-10-16). */
function EmptyState({ canDraw }: { canDraw: boolean }) {
  return (
    <Stack spacing={1.5} sx={{ alignItems: 'center', pt: 3.5, pb: 1 }}>
      <Box
        sx={{
          display: 'grid',
          placeItems: 'center',
          width: 48,
          height: 48,
          borderRadius: '50%',
          bgcolor: '#E8EEF5',
          color: '#564337',
        }}
      >
        <Box component={MapPinned} sx={{ width: 24, height: 24 }} />
      </Box>
      <Typography sx={{ fontSize: 15, fontWeight: 700, color: '#151C22' }}>
        還沒有圈選任何區域
      </Typography>
      <Typography
        sx={{
          maxWidth: 280,
          textAlign: 'center',
          fontSize: 12,
          lineHeight: 1.7,
          color: '#564337',
        }}
      >
        {canDraw
          ? '在地圖上圈出範圍，告訴大家哪裡危險、哪一區交給誰。'
          : '超級管理員或政府圈選區域後，會出現在這裡。'}
      </Typography>
      <Stack spacing={1} sx={{ width: '100%', pt: 1 }}>
        {KIND_ORDER.map((kind) => (
          <Stack
            key={kind}
            direction="row"
            spacing={1.25}
            sx={{
              px: 1.5,
              py: 1.25,
              borderRadius: 3,
              border: '1px solid #DCC1B1',
              bgcolor: '#fff',
            }}
          >
            <Swatch kind={kind} />
            <Box>
              <Typography sx={{ fontSize: 14, fontWeight: 700 }}>
                {AREA_KIND_LABELS[kind]}
                <Box
                  component="span"
                  sx={{
                    ml: 0.75,
                    fontSize: 12,
                    fontWeight: 400,
                    color: '#564337',
                  }}
                >
                  {KIND_HINTS[kind].hint}
                </Box>
              </Typography>
              <Typography sx={{ mt: 0.25, fontSize: 12, color: '#8A7466' }}>
                {KIND_HINTS[kind].example}
              </Typography>
            </Box>
          </Stack>
        ))}
      </Stack>
    </Stack>
  );
}

/**
 * 互助地圖's right panel, read-only for now: the areas by kind (prototype `ZoneList`), 危險區 first.
 * A row zooms the map to its area and marks it.
 */
export function AdminAreaListPanel({
  items,
  selectedId,
  isLoading,
  hasError,
  canDraw = false,
  onSelect,
}: {
  items: readonly AdminAreaListItem[];
  selectedId: string | null;
  isLoading: boolean;
  hasError: boolean;
  /** Whether this viewer may draw areas; the empty state's hint says so. Nothing draws yet. */
  canDraw?: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <Stack aria-label="區域清單" sx={{ flex: 1, minHeight: 0 }}>
      <Box sx={{ px: 2.25, py: 1.75, borderBottom: '1px solid #DCC1B1' }}>
        <Typography sx={{ fontSize: 16, fontWeight: 800, color: '#151C22' }}>
          區域 {items.length}
        </Typography>
        <Typography sx={{ mt: 0.5, fontSize: 12, color: '#564337' }}>
          數量只算目前地圖畫面內已載入的任務單與站點。
        </Typography>
      </Box>
      <Stack
        spacing={2.25}
        sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 2 }}
      >
        {hasError ? (
          <Typography sx={{ fontSize: 13, color: '#B3261E' }}>
            區域載入失敗，請重新整理。
          </Typography>
        ) : null}
        {KIND_ORDER.map((kind) => {
          const group = items.filter((item) => item.kind === kind);

          if (group.length === 0) {
            return null;
          }

          return (
            <Stack key={kind} spacing={1}>
              <Typography
                sx={{ fontSize: 12, fontWeight: 700, color: '#564337' }}
              >
                {AREA_KIND_LABELS[kind]}（{group.length}）
              </Typography>
              {group.map((item) => (
                <AreaRow
                  key={item.id}
                  item={item}
                  selected={item.id === selectedId}
                  onSelect={onSelect}
                />
              ))}
            </Stack>
          );
        })}
        {items.length === 0 && !isLoading && !hasError ? (
          <EmptyState canDraw={canDraw} />
        ) : null}
      </Stack>
    </Stack>
  );
}

// The priority colours of the markers on the map (prototype `map-filter.jsx`).
const PRIORITY_COLORS: Record<string, string> = {
  critical: '#D32F2F',
  high: '#F57C00',
  medium: '#2592B9',
  low: '#64748B',
};

const VISIBILITY_NOTES: Record<RescueMapAreaKind, string> = {
  hazardous_zone:
    '危險區一律公開。民眾與志工在前台地圖看得到這一區的名稱、範圍與備註。',
  team_zone:
    '責任區一律公開。民眾與志工在前台地圖看得到這一區的名稱、範圍、備註與負責單位。',
  mark_zone: '',
};

function visibilityNote(item: AdminAreaListItem) {
  if (item.kind !== 'mark_zone') {
    return VISIBILITY_NOTES[item.kind];
  }

  return item.isPublic
    ? '民眾與志工在前台地圖看得到這一區的名稱、範圍與備註。'
    : '只有後台看得到。';
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Stack spacing={1}>
      <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#564337' }}>
        {title}
      </Typography>
      {children}
    </Stack>
  );
}

/**
 * One area, read-only (prototype `ZoneDetail`): what it is, who has it, what lies inside. Each ticket
 * inside opens that ticket's detail, the one a pin opens.
 */
export function AdminAreaDetailPanel({
  item,
  tickets,
  selectedTicketId,
  onBack,
  onSelectTicket,
}: {
  item: AdminAreaListItem;
  tickets: readonly RescueMapMarkerItem[];
  selectedTicketId: string | undefined;
  onBack: () => void;
  onSelectTicket: (ticket: RescueMapMarkerItem) => void;
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
          borderBottom: '1px solid #DCC1B1',
        }}
      >
        <ButtonBase
          onClick={onBack}
          aria-label="返回區域清單"
          sx={{ width: 32, height: 32, borderRadius: 2, color: '#564337' }}
        >
          <Box component={ArrowLeft} sx={{ width: 18, height: 18 }} />
        </ButtonBase>
        <Swatch kind={item.kind} />
        <Typography
          noWrap
          sx={{ flex: 1, fontSize: 16, fontWeight: 800, color: '#151C22' }}
        >
          {item.name ?? '（未命名）'}
        </Typography>
        <Typography
          sx={{
            px: 1,
            py: 0.25,
            borderRadius: 999,
            bgcolor: '#FFF1E5',
            fontSize: 12,
            fontWeight: 700,
            color: '#7A3E00',
          }}
        >
          {AREA_KIND_LABELS[item.kind]}
        </Typography>
      </Stack>
      <Stack
        spacing={2.25}
        sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 2 }}
      >
        {item.note ? (
          <Typography sx={{ fontSize: 14, lineHeight: 1.7 }}>
            {item.note}
          </Typography>
        ) : null}
        {item.teams.length > 0 ? (
          <DetailSection title="負責單位">
            <Typography sx={{ fontSize: 14, fontWeight: 700 }}>
              {item.teams.join('、')}
            </Typography>
          </DetailSection>
        ) : null}
        <Stack
          direction="row"
          spacing={4}
          sx={{ p: 1.5, borderRadius: 3, border: '1px solid #DCC1B1' }}
        >
          {[
            ['區內任務單', item.contents.tickets],
            ['區內站點', item.contents.stations],
          ].map(([label, count]) => (
            <Box key={label}>
              <Typography
                sx={{ fontSize: 12, fontWeight: 700, color: '#564337' }}
              >
                {label}
              </Typography>
              <Typography sx={{ fontSize: 22, fontWeight: 700 }}>
                {count}
              </Typography>
            </Box>
          ))}
        </Stack>
        <DetailSection title="顯示範圍">
          <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
            <Box
              component={item.isPublic ? Eye : EyeOff}
              sx={{ width: 16, height: 16 }}
            />
            <Typography sx={{ fontSize: 14, fontWeight: 700 }}>
              {item.isPublic ? '公開到前台' : '只有後台'}
            </Typography>
          </Stack>
          <Typography sx={{ fontSize: 12, lineHeight: 1.65, color: '#564337' }}>
            {visibilityNote(item)}
          </Typography>
        </DetailSection>
        <DetailSection title={`區內任務單（${tickets.length}）`}>
          {tickets.length === 0 ? (
            <Typography sx={{ fontSize: 13, color: '#564337' }}>
              目前畫面內這一區沒有任務單。
            </Typography>
          ) : (
            <Stack component="ul" sx={{ m: 0, p: 0, listStyle: 'none' }}>
              {tickets.map((ticket) => (
                <li key={ticket.id}>
                  <ButtonBase
                    onClick={() => onSelectTicket(ticket)}
                    aria-pressed={ticket.id === selectedTicketId}
                    sx={{
                      width: '100%',
                      gap: 1.25,
                      px: 0.5,
                      py: 1.25,
                      textAlign: 'left',
                      justifyContent: 'flex-start',
                      borderBottom: '1px solid #EBDDD2',
                      bgcolor:
                        ticket.id === selectedTicketId
                          ? '#FFF1E5'
                          : 'transparent',
                    }}
                  >
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        flexShrink: 0,
                        bgcolor:
                          PRIORITY_COLORS[ticket.ticketMeta?.priority ?? ''] ??
                          '#64748B',
                      }}
                    />
                    <Typography noWrap sx={{ flex: 1, fontSize: 14 }}>
                      {ticket.title}
                    </Typography>
                    <Typography
                      sx={{ fontSize: 12, color: '#564337', flexShrink: 0 }}
                    >
                      {ticket.label}
                    </Typography>
                  </ButtonBase>
                </li>
              ))}
            </Stack>
          )}
        </DetailSection>
      </Stack>
    </Stack>
  );
}
