'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import {
  Box,
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
import { PhotoLinkEditor } from '../../photos';
import { formatTicketTypeLabel } from '../../status';
import { DuplicateNotice } from './duplicate-notice';
import {
  isForbidden,
  NEED_TYPES,
  readCreateResult,
  type DuplicateSuspect,
  type NeedDraft,
} from './model/task-actions';
import {
  ticketPriorityLabel,
  type DetailTicket,
} from './model/ticket-detail-view';
import {
  acknowledgeSuspects,
  changedUpdateInput,
  emptyNeed,
  emptyTicketForm,
  isCoarseTicket,
  photoChanges,
  TICKET_NEEDS_MAX,
  TICKET_PRIORITIES,
  ticketFormFromTicket,
  toCreateTicketInput,
  updateTicketForm,
  validateTicketForm,
  type TicketFormErrors,
  type TicketFormValues,
} from './model/ticket-form-model';

const { color, typography } = designTokens;

export type TicketFormProps = (
  | {
      mode: 'create';
      /** A point picked on a map before the form opened: the pin starts there. */
      initialPoint?: { lat: number; lng: number } | null;
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
      ? '你的帳號沒有新增求助單的權限。'
      : '你的帳號沒有編輯求助單的權限。';
  if (refusal?.networkError) return '連線失敗，請確認網路後再試一次。';
  return mode === 'create'
    ? '建立失敗，請稍後再試一次。'
    : '儲存失敗，請稍後再試一次。';
}

/**
 * The admin form for one ticket, filling whichever `SheetFrame` holds it: `TicketCreateSheet` (the
 * board's 新增求助單 and the 互助地圖's pin), or the ticket's own drawer when 編輯 swaps it in. A coordinator enters a request taken by
 * phone, so a new ticket's needs are official.
 */
export function TicketForm(props: TicketFormProps) {
  const { mode, onDone, onCancel, onBusyChange } = props;
  const ticket = props.mode === 'edit' ? props.ticket : null;
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
  const disasterTypes = useDisasterTypes();
  // Active types only, but a type the ticket already has stays choosable after it is retired.
  const disasterOptions = (disasterTypes.data?.disasterTypes ?? []).filter(
    (d) => d.isActive || values.disasterTypes.includes(d.key),
  );
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
      input: toCreateTicketInput(values, acknowledged),
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

  const submit = () => {
    const next = validateTicketForm(values, mode);
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
        <Section title="基本資料">
          <TextInput
            label="標題"
            required
            value={values.title}
            error={errors.title}
            onChange={(event) => set('title', event.target.value)}
          />
          <TextField
            select
            fullWidth
            size="small"
            label="優先度"
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
          <TextField
            select
            fullWidth
            size="small"
            label="災害類型"
            value={values.disasterTypes}
            onChange={(event) => {
              const picked = event.target.value as unknown as string[] | string;
              set(
                'disasterTypes',
                typeof picked === 'string' ? picked.split(',') : picked,
              );
            }}
            slotProps={{
              select: {
                multiple: true,
                renderValue: (picked) =>
                  (picked as string[]).map(disasterLabel).join('、'),
              },
            }}
          >
            {disasterOptions.map((d) => (
              <MenuItem key={d.key} value={d.key}>
                {d.label}
              </MenuItem>
            ))}
          </TextField>
          {coarse ? (
            <Muted>你沒有檢視詳細資料的權限，無法編輯說明與照片</Muted>
          ) : (
            <TextInput
              label="說明"
              multiline
              minRows={2}
              value={values.description}
              onChange={(event) => set('description', event.target.value)}
            />
          )}
        </Section>

        {mode === 'create' ? (
          <Section title="聯絡人">
            <TextInput
              label="姓名"
              required
              value={values.contactName}
              error={errors.contactName}
              onChange={(event) => set('contactName', event.target.value)}
            />
            <TextInput
              label="電話"
              inputMode="tel"
              value={values.contactPhone}
              onChange={(event) => set('contactPhone', event.target.value)}
            />
            <TextInput
              label="Email"
              inputMode="email"
              value={values.contactEmail}
              onChange={(event) => set('contactEmail', event.target.value)}
            />
          </Section>
        ) : null}

        <Section title="位置">
          {mode === 'create' ? (
            <>
              <LocationPicker
                value={values.point}
                onChange={(point) => set('point', point)}
                invalid={Boolean(errors.point)}
              />
              {errors.point ? <ErrorText>{errors.point}</ErrorText> : null}
            </>
          ) : (
            <>
              {values.point ? (
                // Shown, not editable: the point can't change after the ticket is created.
                <Box inert sx={{ pointerEvents: 'none' }}>
                  <LocationPicker
                    value={values.point}
                    onChange={() => undefined}
                  />
                </Box>
              ) : null}
              <Muted>建立後無法修改地圖位置</Muted>
            </>
          )}
          {coarse ? (
            // A coarse ticket hides its address from this viewer: blank fields saved over it
            // would replace the real one.
            <Muted>約略位置（無檢視詳細位置權限），無法修改地址</Muted>
          ) : (
            <>
              <TextInput
                label="地址"
                placeholder="例：花蓮縣光復鄉中正路一段31號"
                hint={lookup.isFetching ? '正在根據座標解析地址…' : undefined}
                value={values.fullAddress}
                onChange={(event) => set('fullAddress', event.target.value)}
              />
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: '12px',
                }}
              >
                <TextInput
                  label="樓層"
                  value={values.floor}
                  onChange={(event) => set('floor', event.target.value)}
                />
                <TextInput
                  label="房號"
                  value={values.room}
                  onChange={(event) => set('room', event.target.value)}
                />
              </Box>
            </>
          )}
        </Section>

        {coarse ? null : (
          <Section title="現場照片">
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

        {mode === 'create' ? (
          <Section title="需求">
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
            <Box>
              <Button
                size="sm"
                variant="outline"
                startIcon={<Plus size={16} />}
                disabled={values.needs.length >= TICKET_NEEDS_MAX}
                onClick={() => setNeeds([...values.needs, emptyNeed()])}
              >
                {values.needs.length >= TICKET_NEEDS_MAX
                  ? `最多 ${TICKET_NEEDS_MAX} 項需求`
                  : '再加一項需求'}
              </Button>
            </Box>
          </Section>
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
      eyebrow={mode === 'edit' ? '求助單' : undefined}
      title={mode === 'create' ? '新增求助單' : '編輯求助單'}
      closeLabel={mode === 'create' ? '關閉新增求助單' : '關閉編輯求助單'}
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
                ? '建立求助單'
                : '確認送出'}
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
  return (
    <Box
      role="group"
      aria-label={`需求 ${index + 1}`}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        p: '12px',
        borderRadius: '8px',
        border: `1px solid ${color.border.default}`,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <TextField
          select
          fullWidth
          size="small"
          label="類型"
          value={need.taskType}
          onChange={(event) => onChange('taskType', event.target.value)}
        >
          {NEED_TYPES.map((type) => (
            <MenuItem key={type} value={type}>
              {formatTicketTypeLabel(type)}
            </MenuItem>
          ))}
        </TextField>
        <IconButton
          aria-label={`移除需求 ${index + 1}`}
          disabled={!removable}
          onClick={onRemove}
        >
          <Trash2 size={17} />
        </IconButton>
      </Box>
      <TextInput
        label="需求名稱"
        required
        value={need.taskName}
        error={errors[`needs.${index}.taskName`]}
        onChange={(event) => onChange('taskName', event.target.value)}
      />
      <TextInput
        label="數量"
        required={need.taskType !== 'rescue'}
        hint={need.taskType === 'rescue' ? '救援可不填' : undefined}
        type="number"
        inputProps={{ min: 1, step: 1 }}
        value={need.quantity}
        error={errors[`needs.${index}.quantity`]}
        onChange={(event) => onChange('quantity', event.target.value)}
      />
      <TextInput
        label="說明"
        value={need.description}
        onChange={(event) => onChange('description', event.target.value)}
      />
    </Box>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box
      component="section"
      sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
    >
      <Typography
        component="h3"
        sx={{ ...typography.label[400], color: color.fg.neutral.default }}
      >
        {title}
      </Typography>
      {children}
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
