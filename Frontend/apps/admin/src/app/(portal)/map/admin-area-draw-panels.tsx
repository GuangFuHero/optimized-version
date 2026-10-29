'use client';

import { ArrowLeft, Check, X } from 'lucide-react';

import {
  Box,
  Button,
  ButtonBase,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { useState } from 'react';

import {
  AREA_KIND_LABELS,
  AREA_LABEL_NAME_MAX,
  PUBLIC_ZONE_COLORS,
  type AreaContents,
  type RescueMapAreaKind,
} from '@rescue-frontend/modules';

// More than this many tickets in one area asks for a second look before it is saved (MAP-ZD-125).
export const HIGH_VOLUME_TICKETS = 100;

export interface AreaFormValues {
  kind: RescueMapAreaKind | null;
  name: string;
  note: string;
  teamUuid: string;
  /** 標示區 only: shown on the public map. Off to start with. */
  isPublic: boolean;
}

export const EMPTY_AREA_FORM: AreaFormValues = {
  kind: null,
  name: '',
  note: '',
  teamUuid: '',
  isPublic: false,
};

export interface AreaTeamOption {
  uuid: string;
  name: string;
  type: string;
}

/** The characters of a name as a person counts them: 𥕢 is one, not the two of `string.length`. */
export function countNameCharacters(name: string): number {
  return [...name.trim()].length;
}

const KIND_ORDER: readonly RescueMapAreaKind[] = [
  'hazardous_zone',
  'team_zone',
  'mark_zone',
];

const KIND_CARDS: Record<
  RescueMapAreaKind,
  { description: string; example: string }
> = {
  hazardous_zone: {
    description: '提醒大家不要進入。一律公開到前台',
    example: '例：堤防潰口、土石流警戒',
  },
  team_zone: {
    description: '交給一個單位負責，區內任務單歸他。一律公開到前台',
    example: '例：大平村交給慈濟基金會',
  },
  mark_zone: {
    description: '只標出位置，不派單位。可選只給後台看，或公開到前台',
    example: '例：志工休息區、集合點、物資集散點',
  },
};

const NAME_PLACEHOLDERS: Record<RescueMapAreaKind, string> = {
  hazardous_zone: '例：馬太鞍溪堤防潰口',
  team_zone: '例：光復鄉 大平村',
  mark_zone: '例：糖廠志工休息區',
};

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

function Steps({ at }: { at: 1 | 2 }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 1.25 }}>
      {['畫範圍', '填資料'].map((label, index) => {
        const step = index + 1;
        const done = step < at;
        const on = step === at;

        return (
          <Stack
            key={label}
            direction="row"
            spacing={0.75}
            sx={{ alignItems: 'center' }}
          >
            {index > 0 ? (
              <Box sx={{ width: 18, height: '1px', bgcolor: '#DCC1B1' }} />
            ) : null}
            <Box
              sx={{
                display: 'grid',
                placeItems: 'center',
                width: 20,
                height: 20,
                borderRadius: '50%',
                fontSize: 11,
                fontWeight: 700,
                bgcolor: on || done ? '#E3791E' : '#E8EEF5',
                color: on || done ? '#fff' : '#564337',
              }}
            >
              {done ? (
                <Box component={Check} sx={{ width: 12, height: 12 }} />
              ) : (
                step
              )}
            </Box>
            <Typography
              sx={{
                fontSize: 12,
                fontWeight: on ? 700 : 400,
                color: on ? '#151C22' : '#564337',
              }}
            >
              {label}
            </Typography>
          </Stack>
        );
      })}
    </Stack>
  );
}

function Frame({
  at,
  onBack,
  onClose,
  footer,
  children,
}: {
  at: 1 | 2;
  onBack?: () => void;
  onClose: () => void;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Stack sx={{ flex: 1, minHeight: 0 }}>
      <Box sx={{ px: 2.25, py: 1.75, borderBottom: '1px solid #DCC1B1' }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          {onBack ? (
            <ButtonBase
              onClick={onBack}
              aria-label="回到畫範圍"
              sx={{ width: 32, height: 32, ml: -1, borderRadius: 2 }}
            >
              <Box component={ArrowLeft} sx={{ width: 18, height: 18 }} />
            </ButtonBase>
          ) : null}
          <Typography sx={{ flex: 1, fontSize: 16, fontWeight: 800 }}>
            圈選新區域
          </Typography>
          <ButtonBase
            onClick={onClose}
            aria-label="關閉（Esc）"
            sx={{ width: 32, height: 32, mr: -1, borderRadius: 2 }}
          >
            <Box component={X} sx={{ width: 18, height: 18 }} />
          </ButtonBase>
        </Stack>
        <Steps at={at} />
      </Box>
      <Stack
        spacing={2}
        sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 2.25 }}
      >
        {children}
      </Stack>
      <Stack
        direction="row"
        spacing={1}
        sx={{
          alignItems: 'center',
          px: 2.25,
          py: 1.5,
          borderTop: '1px solid #DCC1B1',
        }}
      >
        {footer}
      </Stack>
    </Stack>
  );
}

/** Step 1: click the corners. Counts follow every corner (MAP-ZD-124); a crossing outline cannot go on. */
export function AdminAreaDrawPanel({
  cornerCount,
  contents,
  areaKm2,
  crosses,
  onUndoCorner,
  onCancel,
  onNext,
}: {
  cornerCount: number;
  contents: AreaContents;
  areaKm2: number;
  crosses: boolean;
  onUndoCorner: () => void;
  onCancel: () => void;
  onNext: () => void;
}) {
  const canFinish = cornerCount >= 3 && !crosses;
  const hint =
    cornerCount === 0
      ? '在地圖上點出範圍的轉角，至少三個。'
      : cornerCount < 3
        ? `再點 ${3 - cornerCount} 個轉角。`
        : '範圍已成形，可以繼續加轉角，或按「下一步」。';
  const stats: [string, string][] = [
    ['區內任務單', String(contents.tickets)],
    ['區內站點', String(contents.stations)],
    ['轉角', String(cornerCount)],
    ['面積 km²', areaKm2.toFixed(2)],
  ];

  return (
    <Frame
      at={1}
      onClose={onCancel}
      footer={
        <>
          <Button
            onClick={onUndoCorner}
            disabled={cornerCount === 0}
            sx={{ color: '#151C22', fontWeight: 700 }}
          >
            退回一點
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button variant="outlined" onClick={onCancel}>
            取消
          </Button>
          <Button variant="contained" disabled={!canFinish} onClick={onNext}>
            下一步
          </Button>
        </>
      }
    >
      <Typography sx={{ fontSize: 13, lineHeight: 1.7 }}>{hint}</Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 1.5,
          p: 1.75,
          borderRadius: 3,
          border: '1px solid #DCC1B1',
          bgcolor: '#fff',
        }}
      >
        {stats.map(([label, value]) => (
          <Box key={label}>
            <Typography
              sx={{ fontSize: 12, fontWeight: 700, color: '#564337' }}
            >
              {label}
            </Typography>
            <Typography sx={{ fontSize: 22, fontWeight: 700 }}>
              {value}
            </Typography>
          </Box>
        ))}
      </Box>
      {crosses ? (
        <Typography role="alert" sx={{ fontSize: 13, color: '#B3261E' }}>
          邊線交叉了，這樣的範圍不能儲存。請按「退回一點」，或換個方式圈。
        </Typography>
      ) : null}
      {contents.tickets > HIGH_VOLUME_TICKETS ? (
        <Typography sx={{ fontSize: 13, color: '#9A5B00' }}>
          這個範圍內有 {contents.tickets} 張任務單，比一般的區域多很多。
          確認範圍沒有圈太大再繼續。
        </Typography>
      ) : null}
      <Typography sx={{ fontSize: 12, lineHeight: 1.8, color: '#564337' }}>
        點地圖加轉角 · Backspace 退回一點 · Enter 完成範圍 · Esc 取消
      </Typography>
    </Frame>
  );
}

/** Step 2: what the area is. The kind comes first, since what else is asked depends on it. */
export function AdminAreaFormPanel({
  initial,
  teams,
  isSubmitting,
  onBack,
  onCancel,
  onSubmit,
}: {
  initial: AreaFormValues;
  teams: readonly AreaTeamOption[];
  isSubmitting: boolean;
  /** Goes back to the outline; what was typed comes along, to be there again on return. */
  onBack: (values: AreaFormValues) => void;
  onCancel: () => void;
  onSubmit: (values: AreaFormValues) => void;
}) {
  const [values, setValues] = useState(initial);
  const set = <K extends keyof AreaFormValues>(
    key: K,
    value: AreaFormValues[K],
  ) => setValues((current) => ({ ...current, [key]: value }));
  const { kind } = values;
  const nameLength = countNameCharacters(values.name);
  const nameOver = nameLength > AREA_LABEL_NAME_MAX;
  const canSave =
    kind !== null &&
    nameLength > 0 &&
    !nameOver &&
    (kind !== 'team_zone' || values.teamUuid !== '') &&
    !isSubmitting;
  const teamGroups = [
    { label: '政府', teams: teams.filter((team) => team.type === 'gov') },
    { label: '非政府組織', teams: teams.filter((team) => team.type !== 'gov') },
  ].filter((group) => group.teams.length > 0);

  return (
    <Frame
      at={2}
      onBack={() => onBack(values)}
      onClose={onCancel}
      footer={
        <>
          <Box sx={{ flex: 1 }} />
          <Button variant="outlined" onClick={onCancel}>
            取消
          </Button>
          <Button
            variant="contained"
            disabled={!canSave}
            onClick={() => onSubmit(values)}
          >
            {kind ? `建立${AREA_KIND_LABELS[kind]}` : '建立區域'}
          </Button>
        </>
      }
    >
      <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#564337' }}>
        這一區是做什麼的？
      </Typography>
      <Stack spacing={1} role="radiogroup" aria-label="區域類型">
        {KIND_ORDER.map((option) => (
          <ButtonBase
            key={option}
            role="radio"
            aria-checked={kind === option}
            onClick={() => set('kind', option)}
            sx={{
              alignItems: 'flex-start',
              gap: 1.25,
              px: 1.5,
              py: 1.25,
              textAlign: 'left',
              borderRadius: 3,
              border: `${kind === option ? 2 : 1}px solid ${
                kind === option ? '#E3791E' : '#DCC1B1'
              }`,
              bgcolor: kind === option ? '#FFF1E5' : '#fff',
            }}
          >
            <Swatch kind={option} />
            <Box>
              <Typography sx={{ fontSize: 14, fontWeight: 700 }}>
                {AREA_KIND_LABELS[option]}
              </Typography>
              <Typography sx={{ fontSize: 13, lineHeight: 1.6 }}>
                {KIND_CARDS[option].description}
              </Typography>
              <Typography sx={{ fontSize: 12, color: '#8A7466' }}>
                {KIND_CARDS[option].example}
              </Typography>
            </Box>
          </ButtonBase>
        ))}
      </Stack>
      {kind ? (
        <>
          <TextField
            label="名稱"
            required
            value={values.name}
            onChange={(event) => set('name', event.target.value)}
            placeholder={NAME_PLACEHOLDERS[kind]}
            error={nameOver}
            helperText={
              nameOver
                ? `超過 ${nameLength - AREA_LABEL_NAME_MAX} 個字。名稱會顯示在前台地圖上，太長會蓋住旁邊；地點說明請寫在備註`
                : `會顯示在前台地圖上。地點說明（例如在哪個廣場）請寫在備註 ${nameLength}／${AREA_LABEL_NAME_MAX}`
            }
            autoFocus
          />
          {kind === 'team_zone' ? (
            <TextField
              select
              label="責任單位"
              required
              value={values.teamUuid}
              onChange={(event) => set('teamUuid', event.target.value)}
              helperText="區內的任務單會出現在這個單位的清單裡。之後可以再加其他單位。"
            >
              {teamGroups.flatMap((group) => [
                <MenuItem key={group.label} disabled sx={{ fontWeight: 700 }}>
                  {group.label}
                </MenuItem>,
                ...group.teams.map((team) => (
                  <MenuItem key={team.uuid} value={team.uuid}>
                    {team.name}
                  </MenuItem>
                )),
              ])}
            </TextField>
          ) : null}
          <TextField
            label="備註（選填）"
            value={values.note}
            onChange={(event) => set('note', event.target.value)}
            multiline
            minRows={3}
            placeholder={
              kind === 'mark_zone' && !values.isPublic
                ? '這一區的狀況、要注意什麼。'
                : '這一區的狀況、要注意什麼。這一區公開到前台，民眾也看得到。'
            }
          />
          {kind === 'mark_zone' ? (
            <Stack>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Switch
                  checked={values.isPublic}
                  onChange={(event) => set('isPublic', event.target.checked)}
                  slotProps={{ input: { 'aria-label': '前台可見' } }}
                />
                <Typography sx={{ fontSize: 14, fontWeight: 700 }}>
                  前台可見
                </Typography>
              </Stack>
              <Typography sx={{ fontSize: 12, color: '#564337' }}>
                {values.isPublic
                  ? '民眾與志工在前台地圖看得到這一區的名稱、範圍與備註。'
                  : '只有後台看得到。'}
              </Typography>
            </Stack>
          ) : null}
        </>
      ) : null}
    </Frame>
  );
}
