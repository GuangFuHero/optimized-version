'use client';

import { ArrowLeft, ChevronRight, Eye, EyeOff, MapPinned } from 'lucide-react';

import {
  Box,
  Button,
  ButtonBase,
  Stack,
  Switch,
  Typography,
} from '@mui/material';
import { useEffect, useRef, useState } from 'react';

import {
  ADMIN_MAP_PRIORITIES,
  AREA_KIND_LABELS,
  type AreaContents,
  type RescueMapAreaKind,
  type RescueMapClosureArea,
  type RescueMapMarkerItem,
  type RescueMapPublicZone,
} from '@rescue-frontend/modules';

import {
  AreaDetailFooter,
  AreaEditForm,
  AreaTeamsSection,
  type AreaActions,
} from './admin-area-detail-actions';
import { AreaSwatch } from './area-swatch';
import { designTokens } from '@rescue-frontend/ui';

const { color, radius, typography } = designTokens;

/** One area as the list shows it: any of the three kinds, with what lies inside it. */
export interface AdminAreaListItem {
  id: string;
  kind: RescueMapAreaKind;
  name: string | null;
  note: string | null;
  teams: readonly string[];
  teamUuids: readonly string[];
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
        teamUuids: [],
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
        teamUuids: zone.teamUuids ?? [],
        isPublic: zone.isPublic !== false,
        contents: countContents(zone),
      }),
    ),
  ];
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
        borderRadius: `${radius.md}px`,
        border: `1px solid ${selected ? color.brand.primary.default : color.border.default}`,
        bgcolor: selected ? color.bg.primary.subtle : color.bg.neutral.default,
      }}
    >
      <AreaSwatch kind={item.kind} sx={{ mt: '3px' }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
          <Typography
            noWrap
            sx={{ ...typography.label[400], color: color.fg.neutral.default }}
          >
            {item.name ?? '（未命名）'}
          </Typography>
          <Box
            component={item.isPublic ? Eye : EyeOff}
            aria-label={item.isPublic ? '前台可見' : '只有後台看得到'}
            sx={{
              width: 14,
              height: 14,
              flexShrink: 0,
              color: color.fg.neutral.subtle,
            }}
          />
        </Stack>
        <Typography
          sx={{
            mt: 0.25,
            ...typography.label[300],
            color: color.fg.neutral.subtle,
          }}
        >
          {summaryOf(item)}
        </Typography>
      </Box>
      <Box
        component={ChevronRight}
        sx={{ width: 16, height: 16, mt: '2px', color: color.fg.neutral.muted }}
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
          bgcolor: color.bg.neutral.sunken,
          color: color.fg.neutral.subtle,
        }}
      >
        <Box component={MapPinned} sx={{ width: 24, height: 24 }} />
      </Box>
      <Typography
        sx={{ ...typography.label[500], color: color.fg.neutral.default }}
      >
        還沒有圈選任何區域
      </Typography>
      <Typography
        sx={{
          maxWidth: 280,
          textAlign: 'center',
          ...typography.label[300],
          lineHeight: 1.7,
          color: color.fg.neutral.subtle,
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
              borderRadius: `${radius.md}px`,
              border: `1px solid ${color.border.default}`,
              bgcolor: color.bg.neutral.default,
            }}
          >
            <AreaSwatch kind={kind} sx={{ mt: '3px' }} />
            <Box>
              <Typography sx={{ ...typography.label[400] }}>
                {AREA_KIND_LABELS[kind]}
                <Box
                  component="span"
                  sx={{
                    ml: 0.75,
                    ...typography.label[300],
                    fontWeight: 400,
                    color: color.fg.neutral.subtle,
                  }}
                >
                  {KIND_HINTS[kind].hint}
                </Box>
              </Typography>
              <Typography
                sx={{
                  mt: 0.25,
                  ...typography.label[300],
                  color: color.fg.neutral.muted,
                }}
              >
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
  onStartDraw,
}: {
  items: readonly AdminAreaListItem[];
  selectedId: string | null;
  isLoading: boolean;
  hasError: boolean;
  /** Whether this viewer may draw areas: the button below is theirs, and the empty state says so. */
  canDraw?: boolean;
  onSelect: (id: string) => void;
  onStartDraw?: () => void;
}) {
  return (
    <Stack aria-label="區域清單" sx={{ flex: 1, minHeight: 0 }}>
      <Box
        sx={{
          px: 2.25,
          py: 1.75,
          borderBottom: `1px solid ${color.border.default}`,
        }}
      >
        <Typography
          sx={{ ...typography.label[500], color: color.fg.neutral.default }}
        >
          區域 {items.length}
        </Typography>
        <Typography
          sx={{
            mt: 0.5,
            ...typography.label[300],
            color: color.fg.neutral.subtle,
          }}
        >
          數量只算目前地圖畫面內已載入的任務單與站點。
        </Typography>
      </Box>
      <Stack
        spacing={2.25}
        sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 2 }}
      >
        {hasError ? (
          <Typography sx={{ ...typography.body[300], color: color.fg.danger }}>
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
                sx={{
                  ...typography.label[300],
                  fontWeight: 700,
                  color: color.fg.neutral.subtle,
                }}
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
      {canDraw && onStartDraw ? (
        <Stack
          direction="row"
          sx={{
            justifyContent: 'flex-end',
            px: 2.25,
            py: 1.5,
            borderTop: `1px solid ${color.border.default}`,
          }}
        >
          <Button variant="contained" onClick={onStartDraw}>
            圈選新區域
          </Button>
        </Stack>
      ) : null}
    </Stack>
  );
}

// A ticket's priority colour, as its pin on the map and the filter have it.
const PRIORITY_COLORS: Record<string, string> = Object.fromEntries(
  ADMIN_MAP_PRIORITIES.map((priority) => [priority.value, priority.color]),
);

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
      <Typography
        sx={{
          ...typography.label[300],
          fontWeight: 700,
          color: color.fg.neutral.subtle,
        }}
      >
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
  actions,
  onBack,
  onSelectTicket,
}: {
  item: AdminAreaListItem;
  tickets: readonly RescueMapMarkerItem[];
  selectedTicketId: string | undefined;
  /** What this viewer may do to the area; none for one who may only look. */
  actions?: AreaActions;
  onBack: () => void;
  onSelectTicket: (ticket: RescueMapMarkerItem) => void;
}) {
  const [editing, setEditing] = useState(false);

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
          aria-label="返回區域清單"
          sx={{
            width: 32,
            height: 32,
            borderRadius: `${radius.sm}px`,
            color: color.fg.neutral.subtle,
          }}
        >
          <Box component={ArrowLeft} sx={{ width: 18, height: 18 }} />
        </ButtonBase>
        <AreaSwatch kind={item.kind} sx={{ mt: '3px' }} />
        <Typography
          noWrap
          sx={{
            flex: 1,
            ...typography.label[500],
            color: color.fg.neutral.default,
          }}
        >
          {item.name ?? '（未命名）'}
        </Typography>
        <Typography
          sx={{
            px: 1,
            py: 0.25,
            borderRadius: `${radius.full}px`,
            bgcolor: color.bg.primary.subtle,
            ...typography.label[300],
            fontWeight: 700,
            color: color.fg.warning,
          }}
        >
          {AREA_KIND_LABELS[item.kind]}
        </Typography>
      </Stack>
      <Stack
        spacing={2.25}
        sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 2 }}
      >
        {editing && actions ? (
          <AreaEditForm
            item={item}
            onCancel={() => setEditing(false)}
            onSave={(changes) => {
              setEditing(false);
              actions.onSave(changes);
            }}
          />
        ) : item.note ? (
          <Typography sx={{ ...typography.body[300], lineHeight: 1.7 }}>
            {item.note}
          </Typography>
        ) : null}
        {item.kind === 'team_zone' ? (
          <AreaTeamsSection item={item} actions={actions} />
        ) : null}
        <Stack
          direction="row"
          spacing={4}
          sx={{
            p: 1.5,
            borderRadius: `${radius.md}px`,
            border: `1px solid ${color.border.default}`,
          }}
        >
          {[
            ['區內任務單', item.contents.tickets],
            ['區內站點', item.contents.stations],
          ].map(([label, count]) => (
            <Box key={label}>
              <Typography
                sx={{
                  ...typography.label[300],
                  fontWeight: 700,
                  color: color.fg.neutral.subtle,
                }}
              >
                {label}
              </Typography>
              <Typography sx={{ ...typography.heading[600] }}>
                {count}
              </Typography>
            </Box>
          ))}
        </Stack>
        <DetailSection title="顯示範圍">
          {item.kind === 'mark_zone' && actions?.canEdit ? (
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Switch
                checked={item.isPublic}
                onChange={(event) =>
                  actions.onTogglePublic(event.target.checked)
                }
                slotProps={{ input: { 'aria-label': '前台可見' } }}
              />
              <Typography sx={{ ...typography.label[400] }}>
                前台可見
              </Typography>
            </Stack>
          ) : (
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
              <Box
                component={item.isPublic ? Eye : EyeOff}
                sx={{ width: 16, height: 16 }}
              />
              <Typography sx={{ ...typography.label[400] }}>
                {item.isPublic ? '公開到前台' : '只有後台'}
              </Typography>
            </Stack>
          )}
          <Typography
            sx={{
              ...typography.label[300],
              lineHeight: 1.65,
              color: color.fg.neutral.subtle,
            }}
          >
            {visibilityNote(item)}
          </Typography>
        </DetailSection>
        <DetailSection title={`區內任務單（${tickets.length}）`}>
          {tickets.length === 0 ? (
            <Typography
              sx={{ ...typography.body[300], color: color.fg.neutral.subtle }}
            >
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
                      borderBottom: `1px solid ${color.border.subtle}`,
                      bgcolor:
                        ticket.id === selectedTicketId
                          ? color.bg.primary.subtle
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
                          color.fg.neutral.muted,
                      }}
                    />
                    <Typography
                      noWrap
                      sx={{ flex: 1, ...typography.body[300] }}
                    >
                      {ticket.title}
                    </Typography>
                    <Typography
                      sx={{
                        ...typography.label[300],
                        color: color.fg.neutral.subtle,
                        flexShrink: 0,
                      }}
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
      {actions ? (
        <AreaDetailFooter
          item={item}
          actions={actions}
          editing={editing}
          onEdit={() => setEditing(true)}
        />
      ) : null}
    </Stack>
  );
}
