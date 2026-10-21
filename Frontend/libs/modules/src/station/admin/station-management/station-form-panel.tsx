'use client';

import { Box, MenuItem, TextField, Typography } from '@mui/material';
import {
  useCreateStation,
  useStation,
  useUpdateStation,
} from '@rescue-frontend/data-access/admin';
import { Button, Callout, designTokens, TextInput } from '@rescue-frontend/ui';
import { EyeOff, MapPin } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { STATION_TYPE_OPTIONS } from '../../type-options';
import {
  buildCreateInput,
  buildUpdateInput,
  emptyStationForm,
  stationToForm,
  validateStationForm,
  type StationFormErrors,
  type StationFormState,
} from './model/station-form';
import { OPERATIONAL_STATUS_OPTIONS, type OperationalStatus } from './model/status';

const { color, typography } = designTokens;

interface StationFormPanelProps {
  mode: 'new' | 'edit';
  uuid?: string;
  position?: [number, number];
  canViewPii: boolean;
  onSaved: (uuid: string) => void;
  onCancel: () => void;
}

export function StationFormPanel({
  mode,
  uuid,
  position,
  canViewPii,
  onSaved,
  onCancel,
}: StationFormPanelProps) {
  const station = useStation({ uuid: uuid ?? '' }, { enabled: mode === 'edit' });
  // Snapshot the station once it loads; a later refetch must not wipe edits in progress.
  const loaded = mode === 'edit' ? (station.data?.station ?? null) : null;
  const [original, setOriginal] = useState<StationFormState>(() =>
    emptyStationForm(position),
  );
  const [form, setForm] = useState<StationFormState>(original);
  const snapshotFor = useRef<string | null>(null);
  const [errors, setErrors] = useState<StationFormErrors>({});
  const [suspects, setSuspects] = useState<string[] | null>(null);
  const createStation = useCreateStation();
  const updateStation = useUpdateStation();
  const submitting = createStation.isPending || updateStation.isPending;
  const contactLocked = mode === 'edit' && !canViewPii;

  useEffect(() => {
    if (!loaded || snapshotFor.current === loaded.uuid) return;
    snapshotFor.current = loaded.uuid;
    const next = stationToForm(loaded);
    setOriginal(next);
    setForm(next);
  }, [loaded]);

  const set = <K extends keyof StationFormState>(key: K, value: StationFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  async function create(acknowledgedDuplicateOf?: string) {
    const result = await createStation.mutateAsync({
      input: buildCreateInput(form),
      acknowledgedDuplicateOf,
    });
    const created = result.createStation;
    if (created.__typename === 'DuplicatesSuspected') {
      setSuspects(created.suspects.map((s) => s.relatedUuid));
      return;
    }
    if (created.__typename === 'StationCreated') {
      toast.success(`已建立站點 ${created.station.name ?? ''}`);
      onSaved(created.station.uuid);
    }
  }

  async function submit() {
    const nextErrors = validateStationForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    try {
      if (mode === 'new') {
        await create();
        return;
      }
      if (!uuid) return;
      const input = buildUpdateInput(form, original);
      if (Object.keys(input).length > 0) {
        await updateStation.mutateAsync({ uuid, input });
        toast.success('已儲存站點變更');
      }
      onSaved(uuid);
    } catch {
      // The admin query client already shows the error as a toast.
    }
  }

  if (mode === 'edit' && snapshotFor.current === null) {
    return <Typography sx={typography.body[300]}>載入中…</Typography>;
  }

  return (
    <Box
      component="form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      sx={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
    >
      {mode === 'new' && position ? (
        <Callout tone="info">
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <MapPin size={14} />
            座標已由地圖帶入：{position[0].toFixed(5)}, {position[1].toFixed(5)}
          </Box>
        </Callout>
      ) : null}

      {suspects ? (
        <Callout tone="warning">
          附近可能已有相同的站點（{suspects.length} 筆）。確認不是重複後再建立。
          <Box sx={{ mt: '8px' }}>
            <Button
              size="sm"
              variant="outline"
              disabled={submitting}
              onClick={() => {
                const first = suspects[0];
                setSuspects(null);
                void create(first).catch(() => undefined);
              }}
            >
              仍要建立
            </Button>
          </Box>
        </Callout>
      ) : null}

      <TextInput
        label="站點名稱 *"
        value={form.name}
        onChange={(e) => set('name', e.target.value)}
        placeholder="例：光復國中收容所"
        error={errors.name}
      />
      <TextField
        select
        size="small"
        label="類型 *"
        value={form.type}
        onChange={(e) => set('type', e.target.value)}
        error={Boolean(errors.type)}
        helperText={errors.type}
      >
        {STATION_TYPE_OPTIONS.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </TextField>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <TextInput
          label="緯度 *"
          value={form.latitude}
          onChange={(e) => set('latitude', e.target.value)}
          inputMode="decimal"
          error={errors.latitude}
        />
        <TextInput
          label="經度 *"
          value={form.longitude}
          onChange={(e) => set('longitude', e.target.value)}
          inputMode="decimal"
          error={errors.longitude}
        />
      </Box>
      <TextField
        select
        size="small"
        label="營運狀態"
        value={form.operationalStatus}
        onChange={(e) => set('operationalStatus', e.target.value as OperationalStatus)}
      >
        {OPERATIONAL_STATUS_OPTIONS.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </TextField>
      <TextInput
        label="開放時間"
        value={form.opHour}
        onChange={(e) => set('opHour', e.target.value)}
        placeholder="例：08:00-20:00"
      />
      <TextInput
        label="物資狀況"
        value={form.supplyStatus}
        onChange={(e) => set('supplyStatus', e.target.value)}
        placeholder="例：飲用水見底、尿布尚有存量"
      />
      <TextInput
        label="說明"
        value={form.description}
        onChange={(e) => set('description', e.target.value)}
        multiline
        minRows={2}
      />

      <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', color: color.fg.neutral.muted }}>
        <EyeOff size={14} />
        <Typography sx={typography.body[300]}>
          {contactLocked
            ? '無個資權限，無法修改聯絡資訊'
            : '聯絡資訊僅後台可見，公開 API 不會回傳'}
        </Typography>
      </Box>
      <TextInput
        label="聯絡人（不公開）"
        value={form.contactName}
        onChange={(e) => set('contactName', e.target.value)}
        disabled={contactLocked}
      />
      <TextInput
        label="聯絡電話（不公開）"
        value={form.contactPhone}
        onChange={(e) => set('contactPhone', e.target.value)}
        disabled={contactLocked}
        inputMode="tel"
      />
      <TextInput
        label="聯絡 Email（不公開）"
        value={form.contactEmail}
        onChange={(e) => set('contactEmail', e.target.value)}
        disabled={contactLocked}
        inputMode="email"
      />

      <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', pt: '8px' }}>
        <Typography sx={{ ...typography.body[300], color: color.fg.neutral.muted, flex: 1 }}>
          {mode === 'new' ? '後台新增的站點會標示為官方' : '儲存後自動記錄操作者與時間'}
        </Typography>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>
          取消
        </Button>
        <Button type="submit" size="sm" disabled={submitting}>
          {mode === 'new' ? '建立站點' : '儲存變更'}
        </Button>
      </Box>
    </Box>
  );
}
