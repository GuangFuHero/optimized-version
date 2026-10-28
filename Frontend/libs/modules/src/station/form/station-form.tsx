'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';

import { Box, Typography } from '@mui/material';
import {
  useCreateStation,
  useReverseGeocode,
  useStation,
  useUpdateStation,
  type AdminStationFieldsFragment,
} from '@rescue-frontend/data-access/admin';
import { Button, Callout, designTokens } from '@rescue-frontend/ui';
import { toast } from 'sonner';

import { useAuthSession } from '../../session/auth-session';
import { getStationTypeLabel } from '../type-options';
import { StationFormFields } from './station-form-fields';
import {
  applyReverseGeocode,
  buildCreateInput,
  buildUpdateInput,
  emptyStationForm,
  formPosition,
  stationToForm,
  updateStationForm,
  validateStationForm,
  type StationFormErrors,
  type StationFormState,
} from './station-form-model';

const { typography } = designTokens;

type Position = readonly [number, number];

export type StationFormTarget =
  | { mode: 'create'; position?: Position | null }
  | { mode: 'edit'; uuid: string };

/** What a frame needs to draw the form: its title, body and footer are the frame's to lay out. */
export interface StationFormView {
  mode: 'create' | 'edit';
  /** The edited station's type, once it has loaded. */
  typeLabel: string | null;
  /** The form, or a loading or not-found message in its place. */
  body: ReactNode;
  /** False while `body` is only a message: there is nothing to submit, so no footer. */
  ready: boolean;
  /** For the frame's submit button, which sits outside the `<form>`. */
  formId: string;
  submitting: boolean;
  /** 取消: dismisses the form unless it is saving. */
  close: () => void;
  /** The map pin a new station starts from. */
  pin: Position | null;
  /** A new station is saved as official: the frame says so. */
  official: boolean;
}

export interface StationFormProps {
  target: StationFormTarget;
  /** Whether the viewer holds `station.view_pii`. Without it, editing can't touch contact fields. */
  canViewPii?: boolean;
  /** Save a new station as official: `/stations` and the admin map, not the public map. */
  official?: boolean;
  /** Dismisses the form: 取消, or a submit with nothing changed. */
  onClose: () => void;
  onSaved?: (station: AdminStationFieldsFragment) => void;
  /** The typed coordinates changed: a map can move its pin to follow them. */
  onLocationChange?: (position: [number, number]) => void;
  children: (view: StationFormView) => ReactNode;
}

/**
 * The one form for creating and editing a station, shared by `/stations` and the maps. It renders
 * no frame of its own: `children` lays out what it hands over in a sheet, a drawer or a panel.
 */
export function StationForm({
  target,
  canViewPii = true,
  ...props
}: StationFormProps) {
  if (target.mode === 'create') {
    return (
      <LoadedStationForm
        {...props}
        mode="create"
        initial={emptyStationForm(target.position)}
        position={target.position}
      />
    );
  }
  return (
    <EditStationForm
      key={target.uuid}
      {...props}
      uuid={target.uuid}
      canViewPii={canViewPii}
    />
  );
}

type FormProps = Omit<StationFormProps, 'target' | 'canViewPii'>;

function EditStationForm({
  uuid,
  canViewPii,
  ...props
}: FormProps & { uuid: string; canViewPii: boolean }) {
  const formId = useId();
  const query = useStation({ uuid });
  const station = query.data?.station;

  if (!station) {
    return props.children({
      mode: 'edit',
      typeLabel: null,
      body: query.isPending ? (
        <Typography sx={typography.body[300]}>載入中…</Typography>
      ) : (
        <Callout tone="warning">
          找不到這個站點，可能已刪除或不在你的權限範圍。
        </Callout>
      ),
      ready: false,
      formId,
      submitting: false,
      close: props.onClose,
      pin: null,
      official: false,
    });
  }

  // Initialised once from the loaded station: a background refetch must not wipe edits in progress.
  return (
    <LoadedStationForm
      {...props}
      mode="edit"
      uuid={uuid}
      typeLabel={getStationTypeLabel(station.type)}
      initial={stationToForm(station)}
      contactLocked={!canViewPii}
    />
  );
}

type LoadedStationFormProps = FormProps & {
  initial: StationFormState;
} & (
    | { mode: 'create'; position?: Position | null }
    | { mode: 'edit'; uuid: string; typeLabel: string; contactLocked: boolean }
  );

function LoadedStationForm(props: LoadedStationFormProps) {
  const {
    mode,
    initial,
    official = false,
    onClose,
    onSaved,
    onLocationChange,
    children,
  } = props;
  const formId = useId();
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<StationFormErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [duplicateOf, setDuplicateOf] = useState<string | null>(null);
  const { status: authStatus } = useAuthSession();
  const createStation = useCreateStation();
  const updateStation = useUpdateStation();
  const submitting = createStation.isPending || updateStation.isPending;
  const position = mode === 'create' ? (props.position ?? null) : null;
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

  // Once per pin: the query caches each position, so a lookup is never repeated.
  const lookup = useReverseGeocode(position);
  const lookupResult = lookup.data?.reverseGeocode;
  useEffect(() => {
    if (lookupResult) {
      setForm((current) => applyReverseGeocode(current, lookupResult));
    }
  }, [lookupResult]);
  const isResolvingAddress = lookup.isFetching;

  const change = <K extends keyof StationFormState>(
    key: K,
    value: StationFormState[K],
  ) => {
    setForm((current) => updateStationForm(current, key, value));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const close = () => {
    if (!submitting) onClose();
  };

  async function create(acknowledgedDuplicateOf?: string) {
    const { createStation: result } = await createStation.mutateAsync({
      input: buildCreateInput(form, { official }),
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

  const body = (
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
  );

  return children({
    mode,
    typeLabel: props.mode === 'edit' ? props.typeLabel : null,
    body,
    ready: true,
    formId,
    submitting,
    close,
    pin: position,
    official: mode === 'create' && official,
  });
}
