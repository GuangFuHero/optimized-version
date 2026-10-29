'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import {
  Box,
  ButtonBase,
  IconButton,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import {
  type AdminTicketFieldsFragment,
  useAttachTicketPhoto,
  useCreateTicket,
  useDetachTicketPhoto,
  useDisasterTypes,
  useReverseGeocode,
  useUpdateTicket,
} from '@rescue-frontend/data-access/admin';
import {
  Badge,
  Button,
  Callout,
  designTokens,
  SheetLayout,
  TextInput,
} from '@rescue-frontend/ui';
import { Check, Plus, Trash2 } from 'lucide-react';

import { applyReverseGeocode } from '../../../admin/shared/model/address-fill';
import { Muted } from '../../../admin/shared/muted';
import { LocationPicker } from '../../../map/components/location-picker';
import type { ClaimError } from '../../needs/claim-error';
import { filledInputSx } from '../../../station/form/station-form-fields';
import { PhotoLinkEditor } from '../../photos';
import {
  householdFloorChoice,
  type SpaceHouseholdTarget,
} from '../space/household-input';
import { useHouseholdSpace } from '../space/use-space-data';
import { DuplicateNotice } from './duplicate-notice';
import {
  isForbidden,
  readCreateResult,
  type DuplicateSuspect,
  type NeedDraft,
} from './model/task-actions';
import {
  ticketPriorityLabel,
  type DetailTicket,
} from './model/ticket-detail-view';
import {
  NEED_TYPES,
  needTypeLabel,
  TICKET_PRIORITIES,
} from './model/ticket-row';
import {
  acknowledgeSuspects,
  changedUpdateInput,
  emptyNeed,
  emptyTicketForm,
  isCoarseTicket,
  photoChanges,
  TICKET_NEEDS_MAX,
  ticketFormErrorSummary,
  ticketFormFromTicket,
  toCreateTicketInput,
  updateTicketForm,
  validateTicketForm,
  type TicketFormErrors,
  type TicketFormValues,
} from './model/ticket-form-model';

const { color, radius, typography } = designTokens;

export type TicketFormProps = (
  | {
      mode: 'create';
      /** A point picked on a map before the form opened: the pin starts there. */
      initialPoint?: { lat: number; lng: number } | null;
      /**
       * 新增一戶 (BE-036): a household filed in this space, which gives it its point and address;
       * the form asks only its floor (one of the space's, or unknown) and 戶別.
       */
      space?: SpaceHouseholdTarget;
      /** The ticket just created, before `onDone`. */
      onCreated?(ticket: AdminTicketFieldsFragment): void;
    }
  | { mode: 'edit'; ticket: DetailTicket }
) & {
  /** Created (the new ticket's uuid) or saved. */
  onDone(uuid: string): void;
  onCancel(): void;
  /** A save is on its way: the frame holding the form must refuse Escape and its backdrop. */
  onBusyChange?(busy: boolean): void;
};

const PHOTOS_PARTLY_SAVED = '資料已儲存，部分照片未更新';

function saveError(error: unknown, mode: 'create' | 'edit'): string {
  const refusal = error as ClaimError;
  if (isForbidden(refusal))
    return mode === 'create'
      ? '你的帳號沒有新增任務單的權限。'
      : '你的帳號沒有編輯任務單的權限。';
  if (refusal?.networkError) return '連線失敗，請確認網路後再試一次。';
  return mode === 'create'
    ? '建立失敗，請稍後再試一次。'
    : '儲存失敗，請稍後再試一次。';
}

/**
 * The admin form for one ticket, filling whichever `SheetFrame` holds it: `TicketCreateSheet` (the
 * board's 新增任務 and the 互助地圖's pin), or the ticket's own drawer when 編輯 swaps it in. A coordinator enters a request taken by
 * phone; the backend marks its needs official, as it does every need filed from the back office.
 */
export function TicketForm(props: TicketFormProps) {
  const { mode, onDone, onCancel, onBusyChange } = props;
  const ticket = props.mode === 'edit' ? props.ticket : null;
  const space = props.mode === 'create' ? props.space : undefined;
  // Editing a household keeps it in its building: its floor one of the building's, its address
  // the building's. Creating one is handed the space.
  const editSpace = useHouseholdSpace(ticket?.buildingMapUuid);
  const household = space ?? editSpace.target ?? undefined;
  const coarse = ticket ? isCoarseTicket(ticket) : false;
  const formId = useId();
  const [values, setValues] = useState<TicketFormValues>(() =>
    props.mode === 'edit'
      ? ticketFormFromTicket(props.ticket)
      : emptyTicketForm(props.initialPoint),
  );
  const [errors, setErrors] = useState<TicketFormErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [suspects, setSuspects] = useState<DuplicateSuspect[] | null>(null);
  const [acked, setAcked] = useState<Map<number, string>>(() => new Map());
  const [submitting, setSubmitting] = useState(false);
  // What the ticket holds now, as far as this form has saved it: a retry after a photo failed
  // resends neither the saved fields nor the photos that did go through.
  const saved = useRef({
    values,
    photos: ticket?.photos.map(({ uuid, url }) => ({ uuid, url })) ?? [],
  });

  const createTicket = useCreateTicket();
  const updateTicket = useUpdateTicket();
  const attachPhoto = useAttachTicketPhoto();
  const detachPhoto = useDetachTicketPhoto();
  // Active types only: listing retired ones needs project.edit, which a team admin lacks. A type
  // the ticket already has stays choosable after it is retired, under its key.
  const disasterTypes = useDisasterTypes({ includeInactive: false });
  const activeDisasters = disasterTypes.data?.disasterTypes ?? [];
  const disasterOptions = [
    ...activeDisasters,
    ...values.disasterTypes
      .filter((key) => !activeDisasters.some((d) => d.key === key))
      .map((key) => ({ key, label: key })),
  ];
  const disasterLabel = (key: string) =>
    disasterOptions.find((d) => d.key === key)?.label ?? key;

  // Once per pin, on create only: the query caches each position, so a lookup is never repeated.
  const { lat: pinLat, lng: pinLng } = values.point ?? {};
  const lookup = useReverseGeocode(
    mode === 'create' && pinLat != null && pinLng != null
      ? [pinLat, pinLng]
      : null,
  );
  const lookupResult = lookup.data?.reverseGeocode;
  useEffect(() => {
    if (lookupResult) {
      setValues((current) => applyReverseGeocode(current, lookupResult));
    }
  }, [lookupResult]);

  useEffect(() => {
    onBusyChange?.(submitting);
  }, [submitting, onBusyChange]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);

  const change = (patch: Partial<TicketFormValues>, cleared: string[]) => {
    setValues((current) => updateTicketForm(current, patch));
    setErrors((current) => {
      const next = { ...current };
      for (const key of cleared) delete next[key as keyof TicketFormErrors];
      return next;
    });
    // The notice was about the ticket as sent; an edit makes it a new one to check.
    setSuspects(null);
    setAcked(new Map());
  };
  const set = <K extends keyof TicketFormValues>(
    key: K,
    value: TicketFormValues[K],
  ) => change({ [key]: value } as Partial<TicketFormValues>, [key]);
  const setNeed = (index: number, key: keyof NeedDraft, value: string) =>
    change(
      {
        needs: values.needs.map((need, at) =>
          at === index ? { ...need, [key]: value } : need,
        ),
      },
      ['needs', `needs.${index}.${key}`],
    );
  const setNeeds = (needs: NeedDraft[]) =>
    // Rows shift on a removal: their errors no longer point at the right one.
    change(
      { needs },
      Object.keys(errors).filter((key) => key.startsWith('needs')),
    );

  const cancel = () => {
    if (!submitting) onCancel();
  };

  async function run(task: () => Promise<void>) {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await task();
    } catch (caught) {
      setError(saveError(caught, mode));
    } finally {
      setSubmitting(false);
    }
  }

  async function create(acknowledged: Map<number, string>) {
    const { createTicket: result } = await createTicket.mutateAsync({
      input: toCreateTicketInput(values, acknowledged, space),
    });
    const read = readCreateResult(result);
    if (read.kind === 'duplicates') {
      // Shown again even after a confirmed resend: the user decides, never a loop.
      setAcked(acknowledged);
      setSuspects(read.suspects);
      return;
    }
    if (result.__typename === 'TicketCreated') {
      if (props.mode === 'create') props.onCreated?.(result.ticket);
      onDone(result.ticket.uuid);
    }
  }

  async function save(current: DetailTicket) {
    const input = changedUpdateInput(values, saved.current.values, current);
    if (Object.keys(input).length > 0) {
      await updateTicket.mutateAsync({ uuid: current.uuid, input });
    }
    saved.current.values = values;
    // A coarse ticket's photos came back empty: a diff against them would be no diff at all.
    if (isCoarseTicket(current)) {
      onDone(current.uuid);
      return;
    }

    const { attach, detach } = photoChanges(
      saved.current.photos,
      values.photoUrls,
    );
    let photosFailed = false;
    for (const url of attach) {
      try {
        const { attachTicketPhoto: photo } = await attachPhoto.mutateAsync({
          ticketUuid: current.uuid,
          url,
        });
        saved.current.photos.push({ uuid: photo.uuid, url: photo.url });
      } catch {
        photosFailed = true;
      }
    }
    for (const uuid of detach) {
      try {
        await detachPhoto.mutateAsync({ uuid });
        saved.current.photos = saved.current.photos.filter(
          (photo) => photo.uuid !== uuid,
        );
      } catch {
        photosFailed = true;
      }
    }
    if (photosFailed) {
      setError(PHOTOS_PARTLY_SAVED);
      return;
    }
    onDone(current.uuid);
  }

  const missing = ticketFormErrorSummary(errors);

  const submit = () => {
    const next = validateTicketForm(values, mode, space);
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    if (ticket) void run(() => save(ticket));
    else void run(() => create(acked));
  };

  const body = (
    <Box
      component="form"
      id={formId}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {/* Disables every native control underneath while a save is on its way. */}
      <Box
        component="fieldset"
        disabled={submitting}
        sx={{
          border: 0,
          p: 0,
          m: 0,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
        }}
      >
        <Section title="地點資訊">
          <TextInput
            label="任務標題"
            required
            placeholder="例：中山路100號 透天半倒受困"
            value={values.title}
            error={errors.title}
            onChange={(event) => set('title', event.target.value)}
          />
          {coarse ? (
            // A coarse ticket hides its address from this viewer: blank fields saved over it
            // would replace the real one.
            <Muted>約略位置（無檢視詳細位置權限），無法修改地址</Muted>
          ) : household ? (
            <HouseholdLocation
              space={household}
              floor={values.floor}
              room={values.room}
              onFloorChange={(floor) => set('floor', floor)}
              onRoomChange={(room) => set('room', room)}
            />
          ) : editSpace.loading ? (
            <Muted>正在載入這一棟的樓層…</Muted>
          ) : (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) 120px 120px',
                gap: '12px',
                alignItems: 'start',
              }}
            >
              <TextInput
                label="地址"
                placeholder="例：花蓮縣光復鄉中正路一段31號"
                hint={lookup.isFetching ? '正在根據座標解析地址…' : undefined}
                value={values.fullAddress}
                onChange={(event) => set('fullAddress', event.target.value)}
              />
              <TextInput
                label="樓層（選填）"
                placeholder="如 6F／RF"
                value={values.floor}
                onChange={(event) => set('floor', event.target.value)}
              />
              <TextInput
                label="房號（選填）"
                value={values.room}
                onChange={(event) => set('room', event.target.value)}
              />
            </Box>
          )}
          {household || editSpace.loading ? null : (
            <FieldBlock
              label="地標"
              required={mode === 'create'}
              hint={
                mode === 'create'
                  ? errors.point
                    ? undefined
                    : '點地圖任一處或拖曳大頭針調整；救援端以此座標導航'
                  : '建立後無法修改地標'
              }
            >
              {mode === 'create' ? (
                <>
                  <LocationPicker
                    value={values.point}
                    onChange={(point) => set('point', point)}
                    invalid={Boolean(errors.point)}
                  />
                  {errors.point ? <ErrorText>{errors.point}</ErrorText> : null}
                </>
              ) : values.point ? (
                // Shown, not editable: the point can't change after the ticket is created.
                <Box inert sx={{ pointerEvents: 'none' }}>
                  <LocationPicker
                    value={values.point}
                    onChange={() => undefined}
                  />
                </Box>
              ) : null}
            </FieldBlock>
          )}
          {mode === 'create' ? (
            <>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: '12px',
                  alignItems: 'start',
                }}
              >
                <TextInput
                  label="現場聯絡人"
                  required
                  placeholder="姓名／稱謂"
                  value={values.contactName}
                  error={errors.contactName}
                  onChange={(event) => set('contactName', event.target.value)}
                />
                <TextInput
                  label="聯絡電話（選填）"
                  inputMode="tel"
                  placeholder="0912-345-678"
                  value={values.contactPhone}
                  onChange={(event) => set('contactPhone', event.target.value)}
                />
              </Box>
              <TextInput
                label="Email（選填）"
                inputMode="email"
                value={values.contactEmail}
                onChange={(event) => set('contactEmail', event.target.value)}
              />
            </>
          ) : null}
          {coarse ? (
            <Muted>你沒有檢視詳細資料的權限，無法編輯狀況描述與照片</Muted>
          ) : (
            <TextInput
              label="狀況描述（選填）"
              multiline
              minRows={3}
              placeholder="簡述現場狀況…"
              value={values.description}
              onChange={(event) => set('description', event.target.value)}
            />
          )}
        </Section>

        {mode === 'create' ? (
          <Section
            title="需求清單"
            aside={
              <>
                <Badge tone="neutral">{values.needs.length}</Badge>
                <Muted>一個地點可有多筆需求；志工以「需求」為單位承接</Muted>
              </>
            }
          >
            {values.needs.map((need, index) => (
              <NeedRow
                key={index}
                index={index}
                need={need}
                errors={errors}
                removable={values.needs.length > 1}
                onChange={(key, value) => setNeed(index, key, value)}
                onRemove={() =>
                  setNeeds(values.needs.filter((_, at) => at !== index))
                }
              />
            ))}
            {errors.needs ? <ErrorText>{errors.needs}</ErrorText> : null}
            <ButtonBase
              disabled={values.needs.length >= TICKET_NEEDS_MAX}
              onClick={() => setNeeds([...values.needs, emptyNeed()])}
              sx={{
                ...typography.label[400],
                gap: '6px',
                height: 42,
                borderRadius: `${radius.md}px`,
                border: `1px dashed ${color.border.default}`,
                color: color.brand.secondary.default,
                '&:hover': { bgcolor: color.bg.neutral.subtle },
                '&.Mui-disabled': { color: color.fg.disable },
              }}
            >
              <Plus size={16} />
              {values.needs.length >= TICKET_NEEDS_MAX
                ? `最多 ${TICKET_NEEDS_MAX} 項需求`
                : '新增需求'}
            </ButtonBase>
          </Section>
        ) : null}

        {coarse ? null : (
          // The editor names itself, with its count: the heading stays for screen readers only.
          <Section title="現場照片" titleHidden>
            <PhotoLinkEditor
              label="現場照片"
              hint="選填，貼上圖片網址"
              value={values.photoUrls}
              onChange={(next) => set('photoUrls', next)}
            />
            {errors.photoUrls ? (
              <ErrorText>{errors.photoUrls}</ErrorText>
            ) : null}
          </Section>
        )}

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: '220px minmax(0, 1fr)',
            gap: '12px',
            alignItems: 'start',
          }}
        >
          <FieldBlock label="優先級">
            {(id) => (
              <TextField
                id={id}
                select
                fullWidth
                hiddenLabel
                sx={filledInputSx}
                value={values.priority}
                onChange={(event) =>
                  set(
                    'priority',
                    event.target.value as TicketFormValues['priority'],
                  )
                }
              >
                {TICKET_PRIORITIES.map((priority) => (
                  <MenuItem key={priority} value={priority}>
                    {ticketPriorityLabel(priority)}
                  </MenuItem>
                ))}
              </TextField>
            )}
          </FieldBlock>
          <FieldBlock label="災害類型（選填）">
            {(id) => (
              <TextField
                id={id}
                select
                fullWidth
                hiddenLabel
                sx={filledInputSx}
                value={values.disasterTypes}
                onChange={(event) => {
                  const picked = event.target.value as unknown as
                    | string[]
                    | string;
                  set(
                    'disasterTypes',
                    typeof picked === 'string' ? picked.split(',') : picked,
                  );
                }}
                slotProps={{
                  select: {
                    multiple: true,
                    displayEmpty: true,
                    renderValue: (picked) =>
                      (picked as string[]).length ? (
                        (picked as string[]).map(disasterLabel).join('、')
                      ) : (
                        <Box
                          component="span"
                          sx={{ color: color.fg.neutral.muted }}
                        >
                          未選
                        </Box>
                      ),
                  },
                }}
              >
                {disasterOptions.map((d) => (
                  <MenuItem key={d.key} value={d.key}>
                    {d.label}
                  </MenuItem>
                ))}
              </TextField>
            )}
          </FieldBlock>
        </Box>

        {missing.length > 0 ? (
          <Callout tone="danger">
            {`尚有 ${missing.length} 項未完成，請補齊：${missing.join('、')}。`}
          </Callout>
        ) : null}
        {error ? <Callout tone="danger">{error}</Callout> : null}
        {suspects ? (
          <DuplicateNotice
            suspects={suspects}
            submitting={submitting}
            onBack={() => setSuspects(null)}
            onConfirm={() =>
              void run(() => create(acknowledgeSuspects(acked, suspects)))
            }
          />
        ) : null}
      </Box>
    </Box>
  );

  return (
    <SheetLayout
      title={
        space
          ? `新增一戶：${space.name}`
          : mode === 'create'
            ? '新增任務'
            : '編輯任務單'
      }
      closeLabel={mode === 'create' ? '關閉新增任務' : '關閉編輯任務單'}
      onClose={cancel}
      footer={
        <>
          <Box sx={{ flex: 1 }} />
          <Button
            variant="ghost"
            size="md"
            onClick={cancel}
            disabled={submitting}
          >
            取消
          </Button>
          <Button
            type="submit"
            form={formId}
            size="md"
            startIcon={<Check size={18} />}
            // With the notice up, the choice is its 返回修改 or 仍要新增.
            disabled={submitting || suspects !== null}
          >
            {submitting
              ? '儲存中…'
              : mode === 'create'
                ? '建立任務'
                : '儲存變更'}
          </Button>
        </>
      }
    >
      {body}
    </SheetLayout>
  );
}

function NeedRow({
  index,
  need,
  errors,
  removable,
  onChange,
  onRemove,
}: {
  index: number;
  need: NeedDraft;
  errors: TicketFormErrors;
  removable: boolean;
  onChange: (key: keyof NeedDraft, value: string) => void;
  onRemove: () => void;
}) {
  const rescue = need.taskType === 'rescue';
  return (
    <Box
      role="group"
      aria-label={`需求 ${index + 1}`}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        p: '12px',
        borderRadius: `${radius.md}px`,
        border: `1px solid ${color.border.default}`,
        bgcolor: color.bg.neutral.default,
      }}
    >
      {/* tk-form's row: 種類, 需求名稱, 數量, then remove. */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '120px minmax(0, 1fr) 96px 36px',
          gap: '10px',
          alignItems: 'start',
        }}
      >
        <TextField
          select
          fullWidth
          hiddenLabel
          sx={filledInputSx}
          value={need.taskType}
          onChange={(event) => onChange('taskType', event.target.value)}
          slotProps={{
            select: {
              SelectDisplayProps: {
                'aria-label': `需求 ${index + 1} 種類`,
              } as object,
            },
          }}
        >
          {NEED_TYPES.map((type) => (
            <MenuItem key={type} value={type}>
              {needTypeLabel(type)}
            </MenuItem>
          ))}
        </TextField>
        <TextInput
          inputProps={{ 'aria-label': `需求 ${index + 1} 名稱` }}
          required
          placeholder="需求名稱，如：破拆人力／圓鍬／礦泉水"
          value={need.taskName}
          error={errors[`needs.${index}.taskName`]}
          onChange={(event) => onChange('taskName', event.target.value)}
        />
        <TextInput
          required={!rescue}
          placeholder={rescue ? '數量（可不填）' : '數量'}
          type="number"
          inputProps={{
            min: 1,
            step: 1,
            'aria-label': `需求 ${index + 1} 數量`,
          }}
          value={need.quantity}
          error={errors[`needs.${index}.quantity`]}
          onChange={(event) => onChange('quantity', event.target.value)}
        />
        <IconButton
          aria-label={`移除需求 ${index + 1}`}
          title={removable ? '移除此需求' : '至少保留一筆需求'}
          disabled={!removable}
          onClick={onRemove}
          sx={{ width: 36, height: 36, mt: '6px' }}
        >
          <Trash2 size={16} />
        </IconButton>
      </Box>
      <TextInput
        inputProps={{ 'aria-label': `需求 ${index + 1} 說明` }}
        placeholder="說明（選填）"
        value={need.description}
        onChange={(event) => onChange('description', event.target.value)}
      />
    </Box>
  );
}

/**
 * Where a household in a space is (BE-036 point 3): the space gives the point and the address, so
 * only the floor, from the space's own floors or unknown, and a free-text 戶別 (302、早餐店). On
 * edit a stored floor the building lacks stays as it was (`householdFloorChoice`).
 */
function HouseholdLocation({
  space,
  floor,
  room,
  onFloorChange,
  onRoomChange,
}: {
  space: SpaceHouseholdTarget;
  floor: string;
  room: string;
  onFloorChange: (floor: string) => void;
  onRoomChange: (room: string) => void;
}) {
  const choice = householdFloorChoice(floor, space.floorLabels);
  return (
    <>
      <Muted>{`🏢 ${space.name}：位置與地址用這一棟的`}</Muted>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: '12px',
        }}
      >
        <TextField
          select
          fullWidth
          size="small"
          label="樓層"
          value={choice.value}
          onChange={(event) => onFloorChange(event.target.value)}
          slotProps={{
            select: { displayEmpty: true },
            inputLabel: { shrink: true },
          }}
        >
          <MenuItem value="">不知道在幾樓</MenuItem>
          {choice.options.map((label) => (
            <MenuItem key={label} value={label}>
              {label}
            </MenuItem>
          ))}
        </TextField>
        <TextInput
          label="戶別"
          placeholder="例：302、早餐店"
          value={room}
          onChange={(event) => onRoomChange(event.target.value)}
        />
      </Box>
    </>
  );
}

const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: 1,
  height: 1,
  p: 0,
  m: '-1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;

function Section({
  title,
  titleHidden = false,
  aside,
  children,
}: {
  title: string;
  /** Keep the heading for screen readers only, when the section's own content shows the name. */
  titleHidden?: boolean;
  /** A count or a note after the heading. */
  aside?: ReactNode;
  children: ReactNode;
}) {
  const heading = (
    <Typography
      component="h3"
      sx={
        titleHidden
          ? VISUALLY_HIDDEN
          : { ...typography.label[500], color: color.fg.neutral.default }
      }
    >
      {title}
    </Typography>
  );
  return (
    <Box
      component="section"
      sx={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
    >
      {aside ? (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          {heading}
          {aside}
        </Box>
      ) : (
        heading
      )}
      {children}
    </Box>
  );
}

/**
 * A label over a control that is not a `TextInput` (the map, a select), in `TextInput`'s look.
 * A render function gets the id to give the control, so the label points at it.
 */
function FieldBlock({
  label,
  required = false,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: ReactNode;
  children: ReactNode | ((id: string) => ReactNode);
}) {
  const id = useId();
  const linked = typeof children === 'function';
  return (
    <Box
      sx={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'baseline',
          flexWrap: 'wrap',
          gap: '6px',
        }}
      >
        <Typography
          component={linked ? 'label' : 'span'}
          htmlFor={linked ? id : undefined}
          sx={{ ...typography.label[400], color: color.fg.neutral.default }}
        >
          {label}
          {required ? (
            <Box component="span" aria-hidden sx={{ color: color.fg.danger }}>
              {' *'}
            </Box>
          ) : null}
        </Typography>
        {hint ? (
          <Typography
            component="span"
            sx={{ ...typography.body[300], color: color.fg.neutral.muted }}
          >
            {hint}
          </Typography>
        ) : null}
      </Box>
      {typeof children === 'function' ? children(id) : children}
    </Box>
  );
}

function ErrorText({ children }: { children: ReactNode }) {
  return (
    <Typography
      role="alert"
      sx={{ ...typography.body[300], color: color.fg.danger }}
    >
      {children}
    </Typography>
  );
}
