'use client';

import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';

import { Box, TextField, Typography } from '@mui/material';
import {
  useCreateBuildingMap,
  useUpdateBuildingMap,
  type AdminBuildingMapFieldsFragment,
} from '@rescue-frontend/data-access/admin';
import {
  Button,
  Callout,
  designTokens,
  SheetFrame,
  SheetLayout,
} from '@rescue-frontend/ui';
import { Check, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';

import {
  LocationPicker,
  type PickedPoint,
} from '../../../map/components/location-picker';
import {
  Columns,
  filledInputSx,
  Labeled,
} from '../../../station/form/station-form-fields';
import {
  addressNote,
  addressToCheck,
  applyPinLookup,
  applyTypedLookup,
  restorePinAddress,
  restoreTypedLine,
  shortDoor,
  type AddressCheck,
  type AddressNote,
} from '../../address-lookup';
import { floorLabelsFor, floorSummary } from './floors';
import type { SpaceTicket } from './space-analysis';
import {
  emptySpaceForm,
  floorCounts,
  nearbySpace,
  spaceFormErrors,
  strandedTickets,
  toCreateBuildingMapInput,
  toUpdateBuildingMapInput,
  type SpaceFormField,
  type SpaceFormValues,
} from './space-form';
import {
  useSpacePinLookup,
  useSpaces,
  useSpaceTypedLookup,
} from './use-space-data';

const { color, typography } = designTokens;

/** The prototype's 新增地點 modal is 600 wide (`tk-building.jsx`); the edit modal 520. */
const SPACE_FORM_WIDTH = 600;

export type SpaceFormDrawerProps =
  | {
      mode: 'create';
      open: boolean;
      onClose: () => void;
      onCreated?: (uuid: string) => void;
    }
  | {
      mode: 'edit';
      open: boolean;
      onClose: () => void;
      building: AdminBuildingMapFieldsFragment;
      tickets: readonly SpaceTicket[];
    };

/**
 * 開啟空間 and 編輯空間 (BE-036): the designer's `BuildingSetupModal` and `SpaceEditModal`
 * (`Design/後台/js/admin/ticket/tk-building.jsx`, `tk-space.jsx`) in an admin sheet. Mounted only
 * while open, so each opening starts from a clean form.
 */
export function SpaceFormDrawer(props: SpaceFormDrawerProps) {
  // The form is saving: Escape and the backdrop wait for it, so its error isn't lost.
  const [busy, setBusy] = useState(false);
  if (!props.open) return null;
  const title = props.mode === 'create' ? '開啟空間' : '編輯空間';

  return (
    <SheetFrame
      open
      onClose={() => {
        if (!busy) props.onClose();
      }}
      width={SPACE_FORM_WIDTH}
      variant="admin"
      ariaLabel={title}
    >
      {props.mode === 'create' ? (
        <CreateSpaceForm
          onClose={props.onClose}
          onCreated={props.onCreated}
          onBusyChange={setBusy}
        />
      ) : (
        <SpaceEditLayout
          building={props.building}
          tickets={props.tickets}
          onClose={props.onClose}
          onBusyChange={setBusy}
        />
      )}
    </SheetFrame>
  );
}

function CreateSpaceForm({
  onClose,
  onCreated,
  onBusyChange,
}: {
  onClose: () => void;
  onCreated?: (uuid: string) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const formId = useId();
  const [values, setValues] = useState<SpaceFormValues>(emptySpaceForm);
  const [touched, setTouched] = useState(false);
  const [check, setCheck] = useState<AddressCheck | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const create = useCreateBuildingMap();
  useBusyReport(create.isPending, onBusyChange);
  const { spaces } = useSpaces();

  const pinLookup = useSpacePinLookup(values.pin);
  const typedLookup = useSpaceTypedLookup(check);

  // BM-11/12: a 門牌 found for the pin fills the line until someone writes in it.
  useEffect(() => {
    setValues((current) => applyPinLookup(current, pinLookup));
  }, [pinLookup]);
  useEffect(() => {
    if (check) {
      setValues((current) =>
        applyTypedLookup(current, check.address, typedLookup),
      );
    }
  }, [check, typedLookup]);

  const set = <K extends keyof SpaceFormValues>(
    key: K,
    value: SpaceFormValues[K],
  ) => setValues((current) => ({ ...current, [key]: value }));

  const errors = spaceFormErrors(values, 'create');
  const shown = (field: SpaceFormField) =>
    touched ? errors[field] : undefined;
  const note = addressNote({
    fields: values,
    pin: values.pin,
    pinLookup,
    check:
      check && typedLookup
        ? { address: check.address, lookup: typedLookup }
        : null,
  });
  const near = nearbySpace(
    values.pin,
    spaces.map(({ row }) => row),
  );

  const submit = async () => {
    setTouched(true);
    if (Object.keys(errors).length) return;
    setSubmitError(null);
    try {
      const result = await create.mutateAsync({
        input: toCreateBuildingMapInput(values),
      });
      const name = values.name.trim();
      toast.success(`已開啟空間：${name}（列表與地圖上看得到）`);
      onCreated?.(result.createBuildingMap.uuid);
      onClose();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '開啟空間失敗。');
    }
  };

  return (
    <SheetLayout
      title="開啟空間"
      footer={
        <FormFooter
          formId={formId}
          submitLabel="建立"
          submitting={create.isPending}
          onCancel={onClose}
        />
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
        <Labeled
          label="位置"
          required
          hint={
            shown('pin') ? undefined : '先在地圖上點那棟建築，地址會自動帶出來'
          }
        >
          {() => (
            <>
              <LocationPicker
                value={values.pin ? { ...values.pin, source: 'manual' } : null}
                onChange={(next: PickedPoint) =>
                  set('pin', { lat: next.lat, lng: next.lng })
                }
                invalid={Boolean(shown('pin'))}
                height={260}
                autoLocate={false}
              />
              {shown('pin') ? <ErrorText>{shown('pin')}</ErrorText> : null}
            </>
          )}
        </Labeled>

        {near ? (
          <Callout tone="warning">
            <strong>{`附近 ${near.metres} 公尺已經有「${near.name}」`}</strong>
            <br />
            是同一棟的話不用再開，到列表裡打開它改樓層就好。不是的話照常建立。
          </Callout>
        ) : null}

        <Labeled label="地址" required>
          {(id) => (
            <>
              <TextField
                id={id}
                fullWidth
                hiddenLabel
                value={values.address}
                onChange={(event) => set('address', event.target.value)}
                onBlur={() => setCheck(addressToCheck(values, values.pin))}
                // 查不到門牌 already asks for it by hand; no second 「必填」 beside it.
                error={Boolean(shown('address'))}
                helperText={
                  note?.kind === 'no_door' ? undefined : shown('address')
                }
                placeholder={
                  values.pin
                    ? '例：花蓮縣光復鄉中正路二段120號'
                    : '放好大頭針後會自動帶入'
                }
                sx={filledInputSx}
              />
              {note ? (
                <AddressNoteLine
                  note={note}
                  danger={touched && !values.address.trim()}
                  onUsePin={(door) =>
                    setValues((current) => restorePinAddress(current, door))
                  }
                  onUseTyped={(line) =>
                    setValues((current) => restoreTypedLine(current, line))
                  }
                />
              ) : null}
            </>
          )}
        </Labeled>

        <NameField
          values={values}
          error={shown('name')}
          onChange={(name) => set('name', name)}
        />
        <FloorFields
          values={values}
          errors={errors}
          touched={touched}
          set={set}
        />
        <FloorPreview values={values} />

        {submitError ? <Callout tone="danger">{submitError}</Callout> : null}
      </Box>
    </SheetLayout>
  );
}

/** Its holder must refuse Escape and the backdrop while `onBusyChange` says it is saving. */
export function SpaceEditLayout({
  building,
  tickets,
  onClose,
  onBusyChange,
}: {
  building: AdminBuildingMapFieldsFragment;
  tickets: readonly SpaceTicket[];
  onClose: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const formId = useId();
  const [values, setValues] = useState<SpaceFormValues>(() => ({
    ...emptySpaceForm(),
    address: building.secondaryLocation?.fullAddress ?? '',
    name: building.name,
    above: String(building.floorsAboveGround),
    below: String(building.floorsBelowGround),
  }));
  const [submitError, setSubmitError] = useState<string | null>(null);
  const update = useUpdateBuildingMap();
  useBusyReport(update.isPending, onBusyChange);

  const set = <K extends keyof SpaceFormValues>(
    key: K,
    value: SpaceFormValues[K],
  ) => setValues((current) => ({ ...current, [key]: value }));

  const errors = spaceFormErrors(values, 'edit');
  const { above, below } = floorCounts(values);
  const stranded = useMemo(
    () =>
      above !== null && below !== null
        ? strandedTickets(
            building.floors.map((floor) => floor.label),
            above,
            below,
            tickets,
          )
        : [],
    [above, below, building.floors, tickets],
  );

  const submit = async () => {
    if (Object.keys(errors).length) return;
    const input = toUpdateBuildingMapInput(building, values);
    if (!Object.keys(input).length) {
      onClose();
      return;
    }
    setSubmitError(null);
    try {
      await update.mutateAsync({ uuid: building.uuid, input });
      toast.success(`已更新「${values.name.trim()}」`);
      onClose();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '更新空間失敗。');
    }
  };

  return (
    <SheetLayout
      title="編輯空間"
      footer={
        <FormFooter
          formId={formId}
          submitLabel="儲存"
          submitting={update.isPending}
          disabled={Object.keys(errors).length > 0}
          onCancel={onClose}
        />
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
        <NameField
          values={values}
          error={errors.name}
          onChange={(name) => set('name', name)}
        />

        {/* The backend's UpdateBuildingMapInput has no address (BE-036 gap); shown, not editable. */}
        <Labeled label="地址" hint="地址目前不能改（後端還沒有）">
          {(id) => (
            <TextField
              id={id}
              fullWidth
              hiddenLabel
              disabled
              value={values.address}
              sx={filledInputSx}
            />
          )}
        </Labeled>

        <FloorFields values={values} errors={errors} touched set={set} />

        {stranded.length ? (
          <Callout tone="warning">
            <strong>{`有 ${stranded.length} 張任務單在要拿掉的樓層`}</strong>
            <br />
            {stranded
              .map(({ ticket, floor }) => `#${ticket.propertyName}（${floor}）`)
              .join('、')}
            。儲存後它們不會不見，會列在「樓層不在這棟的樓層裡」，樓層照原本寫的留著。
          </Callout>
        ) : null}

        {submitError ? <Callout tone="danger">{submitError}</Callout> : null}
      </Box>
    </SheetLayout>
  );
}

function NameField({
  values,
  error,
  onChange,
}: {
  values: SpaceFormValues;
  error?: string;
  onChange: (name: string) => void;
}) {
  return (
    <Labeled
      label="名稱"
      required
      hint={
        error
          ? undefined
          : '側欄與前台會顯示這個名字，例如：宏福苑 A 座、光復國小圖書館'
      }
    >
      {(id) => (
        <TextField
          id={id}
          fullWidth
          hiddenLabel
          value={values.name}
          onChange={(event) => onChange(event.target.value)}
          error={Boolean(error)}
          helperText={error}
          placeholder="中正路社區大樓"
          sx={filledInputSx}
        />
      )}
    </Labeled>
  );
}

function FloorFields({
  values,
  errors,
  touched,
  set,
}: {
  values: SpaceFormValues;
  errors: Partial<Record<SpaceFormField, string>>;
  touched: boolean;
  set: (key: 'above' | 'below', value: string) => void;
}) {
  const aboveError = touched ? errors.above : undefined;
  return (
    <Columns>
      <Labeled
        label="地上樓層數"
        required
        hint={aboveError ? undefined : '不含頂樓，頂樓會自動加上'}
      >
        {(id) => (
          <TextField
            id={id}
            fullWidth
            hiddenLabel
            value={values.above}
            onChange={(event) => set('above', event.target.value)}
            error={Boolean(aboveError)}
            helperText={aboveError}
            placeholder="12"
            slotProps={{ htmlInput: { inputMode: 'numeric' } }}
            sx={filledInputSx}
          />
        )}
      </Labeled>
      <Labeled label="地下樓層數">
        {(id) => (
          <TextField
            id={id}
            fullWidth
            hiddenLabel
            value={values.below}
            onChange={(event) => set('below', event.target.value)}
            // Out of range is said at once, as the prototype does: 0 is already filled in.
            error={Boolean(errors.below)}
            helperText={errors.below}
            placeholder="0"
            slotProps={{ htmlInput: { inputMode: 'numeric' } }}
            sx={filledInputSx}
          />
        )}
      </Labeled>
    </Columns>
  );
}

function FloorPreview({ values }: { values: SpaceFormValues }) {
  const { above, below } = floorCounts(values);
  if (above === null || below === null) return null;
  const labels = floorLabelsFor(above, below);

  return (
    <Callout tone="info">
      <strong>{`會產生 ${labels.length} 個樓層（含頂樓）`}</strong>
      <br />
      {floorSummary(labels)}
      <br />
      頂樓 RF 每棟都有：淹水時人會往頂樓跑。
      <br />
      戶別由通報的人自己填在任務單上（「302」「早餐店」「3樓之1」都可以），後台不用先定義。
    </Callout>
  );
}

/**
 * The line under the address. The resident-facing notes leave out 「未確認門牌」; the back office
 * says it, as the designer's admin form does (`tk-building.jsx` `statusLine`).
 */
function AddressNoteLine({
  note,
  danger,
  onUsePin,
  onUseTyped,
}: {
  note: AddressNote;
  danger: boolean;
  onUsePin: (door: NonNullable<AddressNote['pinDoor']>) => void;
  onUseTyped: (line: string) => void;
}) {
  const text =
    note.kind === 'edited'
      ? `${note.text}，會存成「未確認門牌」`
      : note.kind === 'no_door'
        ? `${note.text}（仍可建立，會存成「未確認門牌」）`
        : note.text;
  const looking = note.kind === 'looking' || note.kind === 'checking';
  const { pinDoor, typedLine } = note;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        gap: '6px',
        ...typography.data[300],
        color:
          danger && note.kind === 'no_door'
            ? color.fg.danger
            : color.fg.neutral.muted,
      }}
    >
      {looking ? (
        <LoaderCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
      ) : null}
      <Box component="span" sx={{ flex: 1, minWidth: 0 }}>
        {text}
      </Box>
      {pinDoor ? (
        <Button variant="ghost" size="sm" onClick={() => onUsePin(pinDoor)}>
          {`用大頭針的地址：${shortDoor(pinDoor.fullAddress)}`}
        </Button>
      ) : null}
      {typedLine ? (
        <Button variant="ghost" size="sm" onClick={() => onUseTyped(typedLine)}>
          改回你打的
        </Button>
      ) : null}
    </Box>
  );
}

function FormFooter({
  formId,
  submitLabel,
  submitting,
  disabled = false,
  onCancel,
}: {
  formId: string;
  submitLabel: string;
  submitting: boolean;
  disabled?: boolean;
  onCancel: () => void;
}) {
  return (
    <>
      <Box sx={{ flex: 1 }} />
      <Button
        variant="ghost"
        size="md"
        onClick={onCancel}
        disabled={submitting}
      >
        取消
      </Button>
      <Button
        type="submit"
        form={formId}
        size="md"
        startIcon={<Check size={18} />}
        disabled={submitting || disabled}
      >
        {submitLabel}
      </Button>
    </>
  );
}

function ErrorText({ children }: { children: ReactNode }) {
  return (
    <Typography sx={{ ...typography.body[300], color: color.fg.danger }}>
      {children}
    </Typography>
  );
}

/** Tells the sheet holding a form when its save starts and ends, and that it ended on unmount. */
function useBusyReport(
  busy: boolean,
  onBusyChange: ((busy: boolean) => void) | undefined,
) {
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);
}
