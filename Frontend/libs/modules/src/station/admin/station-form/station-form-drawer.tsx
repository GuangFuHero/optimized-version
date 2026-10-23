'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';

import { Box, Typography } from '@mui/material';
import {
  useCreateStation,
  useStation,
  useUpdateStation,
  type AdminStationFieldsFragment,
} from '@rescue-frontend/data-access/admin';
import { Button, Callout, designTokens, Sheet } from '@rescue-frontend/ui';
import { Check, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { useAuthSession } from '../../../session/auth-session';
import { getStationTypeLabel } from '../../type-options';
import {
  AdminStationDrawer,
  AdminStationDrawerCaption,
  AdminStationDrawerLayout,
} from './admin-station-drawer';
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

const { color, radius, typography } = designTokens;

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
  /**
   * `admin-drawer` is `/stations`' look: the prototype drawer's header, a create banner and its
   * footer copy. The maps keep `sheet`, the shared `Sheet`.
   */
  frame?: StationFormDrawerFrame;
}

/** The frames a standalone form drawer can take (`admin-embedded` lives in another drawer). */
export type StationFormDrawerFrame = Exclude<
  StationFormFrame,
  'admin-embedded'
>;

const SHEET_WIDTH = 540;

/** The one form for creating and editing a station, shared by `/stations` and the maps. */
export function StationFormDrawer({
  target,
  canViewPii = true,
  onClose,
  onSaved,
  onLocationChange,
  frame = 'sheet',
}: StationFormDrawerProps) {
  if (!target) return null;

  if (target.mode === 'create') {
    return (
      <StationFormSheet
        mode="create"
        frame={frame}
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
      frame={frame}
      canViewPii={canViewPii}
      onClose={onClose}
      onSaved={onSaved}
      onLocationChange={onLocationChange}
    />
  );
}

export interface StationEditPanelProps {
  uuid: string;
  canViewPii: boolean;
  /** 取消, or a submit with nothing changed: back to wherever the edit started. */
  onCancel: () => void;
  /** The header's close button: closes the drawer the panel sits in. */
  onCloseDrawer: () => void;
  onSaved?: StationFormDrawerProps['onSaved'];
}

/**
 * The admin edit form without a drawer of its own, for `/stations`' station drawer to swap in for
 * the detail view, so editing never stacks a second sheet over it.
 */
export function StationEditPanel({
  uuid,
  canViewPii,
  onCancel,
  onCloseDrawer,
  onSaved,
}: StationEditPanelProps) {
  return (
    <EditStationSheet
      key={uuid}
      uuid={uuid}
      frame="admin-embedded"
      canViewPii={canViewPii}
      onClose={onCancel}
      onCloseDrawer={onCloseDrawer}
      onSaved={onSaved}
    />
  );
}

/**
 * Where the form renders: the shared `Sheet` (the maps), `/stations`' drawer of its own (create),
 * or inside a drawer that already exists (`/stations`' edit, in the station drawer).
 */
type StationFormFrame = 'sheet' | 'admin-drawer' | 'admin-embedded';

function EditStationSheet({
  uuid,
  frame,
  canViewPii,
  onClose,
  onCloseDrawer,
  onSaved,
  onLocationChange,
}: {
  uuid: string;
  frame: StationFormFrame;
  canViewPii: boolean;
  onClose: () => void;
  onCloseDrawer?: () => void;
  onSaved?: StationFormDrawerProps['onSaved'];
  onLocationChange?: StationFormDrawerProps['onLocationChange'];
}) {
  const query = useStation({ uuid });
  const station = query.data?.station;

  if (!station) {
    const message = query.isPending ? (
      <Typography sx={typography.body[300]}>載入中…</Typography>
    ) : (
      <Callout tone="warning">
        找不到這個站點，可能已刪除或不在你的權限範圍。
      </Callout>
    );
    if (frame === 'sheet') {
      return (
        <Sheet open onClose={onClose} width={SHEET_WIDTH} title="編輯站點">
          {message}
        </Sheet>
      );
    }
    return (
      <AdminFrame
        frame={frame}
        title="編輯站點"
        onClose={onCloseDrawer ?? onClose}
      >
        {message}
      </AdminFrame>
    );
  }

  // Initialised once from the loaded station: a background refetch must not wipe edits in progress.
  return (
    <StationFormSheet
      mode="edit"
      frame={frame}
      uuid={uuid}
      typeLabel={getStationTypeLabel(station.type)}
      initial={stationToForm(station)}
      contactLocked={!canViewPii}
      onClose={onClose}
      onCloseDrawer={onCloseDrawer}
      onSaved={onSaved}
      onLocationChange={onLocationChange}
    />
  );
}

type StationFormSheetProps = {
  frame: StationFormFrame;
  initial: StationFormState;
  /** Dismisses the form: 取消, or a submit with nothing changed. */
  onClose: () => void;
  /** The header's close button, where it differs from `onClose` (the form is embedded). */
  onCloseDrawer?: () => void;
  onSaved?: StationFormDrawerProps['onSaved'];
  onLocationChange?: StationFormDrawerProps['onLocationChange'];
} & (
  | { mode: 'create'; position?: Position | null }
  | { mode: 'edit'; uuid: string; typeLabel: string; contactLocked: boolean }
);

function StationFormSheet(props: StationFormSheetProps) {
  const { mode, frame, initial, onClose, onSaved, onLocationChange } = props;
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

  const formBody = (
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
        appearance={frame === 'sheet' ? 'default' : 'admin'}
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

  if (frame === 'sheet') {
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
        {formBody}
      </Sheet>
    );
  }

  return (
    <AdminFrame
      frame={frame}
      eyebrow={props.mode === 'create' ? 'CRUD · 新增' : props.typeLabel}
      title={mode === 'create' ? '新增資源站' : '編輯站點'}
      onClose={
        props.onCloseDrawer
          ? () => {
              if (!submitting) props.onCloseDrawer?.();
            }
          : close
      }
      footer={
        <>
          <AdminStationDrawerCaption flex={1}>
            儲存後自動記錄操作者與時間戳
            {/* The banner says it unless it is showing the map's coordinates instead. */}
            {mode === 'create' && pinLat != null && pinLng != null ? (
              <>
                <br />
                後台新增的站點會標示為官方
              </>
            ) : null}
          </AdminStationDrawerCaption>
          <Button
            variant="ghost"
            size="md"
            onClick={close}
            disabled={submitting}
          >
            取消
          </Button>
          <Button
            type="submit"
            form={formId}
            size="md"
            startIcon={<Check size={18} />}
            disabled={submitting}
          >
            {mode === 'create' ? '建立站點' : '確認送出'}
          </Button>
        </>
      }
    >
      {mode === 'create' ? (
        <CreateBanner>
          {pinLat != null && pinLng != null
            ? `座標已由地圖帶入：${formatCoordinate(pinLat)}, ${formatCoordinate(pinLng)}`
            : '新站點將以官方來源建立。'}
        </CreateBanner>
      ) : null}
      {formBody}
    </AdminFrame>
  );
}

/** A map click carries full float precision; five decimals is about a metre. */
function formatCoordinate(value: number): string {
  return String(Number(value.toFixed(5)));
}

function AdminFrame({
  frame,
  eyebrow,
  title,
  onClose,
  footer,
  children,
}: {
  frame: Exclude<StationFormFrame, 'sheet'>;
  eyebrow?: ReactNode;
  title: string;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const layout = (
    <AdminStationDrawerLayout
      eyebrow={eyebrow}
      title={title}
      onClose={onClose}
      footer={footer}
    >
      {children}
    </AdminStationDrawerLayout>
  );
  if (frame === 'admin-embedded') return layout;
  return (
    <AdminStationDrawer open onClose={onClose} ariaLabel={title}>
      {layout}
    </AdminStationDrawer>
  );
}

/** The prototype's create banner: where the new station's coordinates came from. */
function CreateBanner({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        p: '11px 14px',
        mb: '16px',
        borderRadius: `${radius.md}px`,
        bgcolor: color.bg.primary.subtle,
        color: color.brand.primary.subtle,
      }}
    >
      <Sparkles size={17} style={{ flexShrink: 0 }} />
      <Typography sx={{ ...typography.body[300], color: 'inherit' }}>
        {children}
      </Typography>
    </Box>
  );
}
