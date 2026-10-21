'use client';

import { useEffect, useId, useState } from 'react';

import { Box, Typography } from '@mui/material';
import {
  useCreateStation,
  useStation,
  useUpdateStation,
  type AdminStationFieldsFragment,
} from '@rescue-frontend/data-access/admin';
import { Button, Callout, designTokens, Sheet } from '@rescue-frontend/ui';
import { toast } from 'sonner';

import { useAuthSession } from '../../../session/auth-session';
import { StationFormFields } from './station-form-fields';
import {
  applyReverseGeocode,
  buildCreateInput,
  buildUpdateInput,
  emptyStationForm,
  formPosition,
  stationToForm,
  validateStationForm,
  type StationFormErrors,
  type StationFormState,
} from './station-form-model';
import { useReverseGeocode } from './use-reverse-geocode';

const { color, typography } = designTokens;

type Position = readonly [number, number];

export type StationFormTarget =
  | { mode: 'create'; position?: Position | null }
  | { mode: 'edit'; uuid: string };

export interface StationFormDrawerProps {
  /** What to create or edit; null closes the drawer. */
  target: StationFormTarget | null;
  /** Whether the viewer holds `station.view_pii`. Without it, editing can't touch contact fields. */
  canViewPii?: boolean;
  onClose: () => void;
  onSaved?: (station: AdminStationFieldsFragment) => void;
  /** The typed coordinates changed: a map can move its pin to follow them. */
  onLocationChange?: (position: [number, number]) => void;
}

const SHEET_WIDTH = 540;

/** The one form for creating and editing a station, shared by `/stations` and the maps. */
export function StationFormDrawer({
  target,
  canViewPii = true,
  onClose,
  onSaved,
  onLocationChange,
}: StationFormDrawerProps) {
  if (!target) return null;

  if (target.mode === 'create') {
    return (
      <StationFormSheet
        mode="create"
        initial={emptyStationForm(target.position)}
        position={target.position}
        onClose={onClose}
        onSaved={onSaved}
        onLocationChange={onLocationChange}
      />
    );
  }

  return (
    <EditStationSheet
      key={target.uuid}
      uuid={target.uuid}
      canViewPii={canViewPii}
      onClose={onClose}
      onSaved={onSaved}
      onLocationChange={onLocationChange}
    />
  );
}

function EditStationSheet({
  uuid,
  canViewPii,
  onClose,
  onSaved,
  onLocationChange,
}: {
  uuid: string;
  canViewPii: boolean;
  onClose: () => void;
  onSaved?: StationFormDrawerProps['onSaved'];
  onLocationChange?: StationFormDrawerProps['onLocationChange'];
}) {
  const query = useStation({ uuid });
  const station = query.data?.station;

  if (!station) {
    return (
      <Sheet open onClose={onClose} width={SHEET_WIDTH} title="編輯站點">
        {query.isPending ? (
          <Typography sx={typography.body[300]}>載入中…</Typography>
        ) : (
          <Callout tone="warning">
            找不到這個站點，可能已刪除或不在你的權限範圍。
          </Callout>
        )}
      </Sheet>
    );
  }

  // Initialised once from the loaded station: a background refetch must not wipe edits in progress.
  return (
    <StationFormSheet
      mode="edit"
      uuid={uuid}
      initial={stationToForm(station)}
      contactLocked={!canViewPii}
      onClose={onClose}
      onSaved={onSaved}
      onLocationChange={onLocationChange}
    />
  );
}

type StationFormSheetProps = {
  initial: StationFormState;
  onClose: () => void;
  onSaved?: StationFormDrawerProps['onSaved'];
  onLocationChange?: StationFormDrawerProps['onLocationChange'];
} & (
  | { mode: 'create'; position?: Position | null }
  | { mode: 'edit'; uuid: string; contactLocked: boolean }
);

function StationFormSheet(props: StationFormSheetProps) {
  const { mode, initial, onClose, onSaved, onLocationChange } = props;
  const formId = useId();
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<StationFormErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [duplicateOf, setDuplicateOf] = useState<string | null>(null);
  const { status: authStatus } = useAuthSession();
  const createStation = useCreateStation();
  const updateStation = useUpdateStation();
  const submitting = createStation.isPending || updateStation.isPending;
  const position = mode === 'create' ? props.position : null;
  const [pinLat, pinLng] = position ?? [];

  // A pin moved on the map while the form is open: follow it.
  useEffect(() => {
    if (pinLat == null || pinLng == null) return;
    setForm((current) => ({
      ...current,
      latitude: String(pinLat),
      longitude: String(pinLng),
    }));
  }, [pinLat, pinLng]);

  const isResolvingAddress = useReverseGeocode(position, (geocode) =>
    setForm((current) => applyReverseGeocode(current, geocode)),
  );

  const change = <K extends keyof StationFormState>(
    key: K,
    value: StationFormState[K],
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const close = () => {
    if (!submitting) onClose();
  };

  async function create(acknowledgedDuplicateOf?: string) {
    const { createStation: result } = await createStation.mutateAsync({
      input: buildCreateInput(form),
      acknowledgedDuplicateOf,
    });
    if (result.__typename === 'DuplicatesSuspected') {
      setDuplicateOf(result.suspects[0]?.relatedUuid ?? null);
      return;
    }
    if (result.__typename === 'StationCreated') {
      toast.success(`已建立站點 ${result.station.name ?? ''}`);
      onSaved?.(result.station);
    }
  }

  async function update(uuid: string) {
    const input = buildUpdateInput(form, initial);
    if (Object.keys(input).length === 0) {
      onClose();
      return;
    }
    const { updateStation: station } = await updateStation.mutateAsync({
      uuid,
      input,
    });
    toast.success('已儲存站點變更');
    onSaved?.(station);
  }

  async function submit() {
    setNotice(null);
    if (authStatus !== 'authenticated') {
      setNotice('目前尚未登入，無法儲存站點。請先登入後再試。');
      return;
    }
    const nextErrors = validateStationForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    try {
      if (props.mode === 'create') await create();
      else await update(props.uuid);
    } catch {
      // The query client already reports the error as a toast.
    }
  }

  return (
    <Sheet
      open
      onClose={close}
      width={SHEET_WIDTH}
      title={mode === 'create' ? '新增站點' : '編輯站點'}
      footer={
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            width: '100%',
          }}
        >
          <Typography
            sx={{
              ...typography.body[300],
              color: color.fg.neutral.muted,
              flex: 1,
            }}
          >
            {mode === 'create'
              ? '後台新增的站點會標示為官方'
              : '儲存後自動記錄操作者與時間'}
          </Typography>
          <Button
            variant="ghost"
            size="sm"
            onClick={close}
            disabled={submitting}
          >
            取消
          </Button>
          <Button type="submit" form={formId} size="sm" disabled={submitting}>
            {mode === 'create' ? '建立站點' : '儲存變更'}
          </Button>
        </Box>
      }
    >
      <Box
        component="form"
        id={formId}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        sx={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
      >
        {notice ? <Callout tone="danger">{notice}</Callout> : null}
        {duplicateOf ? (
          <Callout tone="warning">
            附近可能已有相同的站點。確認不是重複後再建立。
            <Box sx={{ mt: '8px' }}>
              <Button
                size="sm"
                variant="outline"
                disabled={submitting}
                onClick={() => {
                  setDuplicateOf(null);
                  void create(duplicateOf).catch(() => undefined);
                }}
              >
                仍要建立
              </Button>
            </Box>
          </Callout>
        ) : null}
        <StationFormFields
          mode={mode}
          form={form}
          errors={errors}
          onChange={change}
          onCoordinatesBlur={() => {
            const typed = formPosition(form);
            if (typed) onLocationChange?.(typed);
          }}
          isResolvingAddress={isResolvingAddress}
          contactLocked={props.mode === 'edit' && props.contactLocked}
        />
      </Box>
    </Sheet>
  );
}
