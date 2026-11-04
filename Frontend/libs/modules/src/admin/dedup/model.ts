/**
 * 重複審核 (DEDUP-008): the pure part of the page. Which side is A, which fields a pair lists, what
 * the merged ticket ends up as, and the `resolve` request that says so (Spec 028 §3).
 *
 * Rule numbers (DUP-BE-4xx) are the design's, in `dd-data.js` on the design branch.
 */
import type {
  DuplicatePair,
  DuplicatePairDetail,
  DuplicatePairSide,
  ResolveDuplicatePairBody,
  TaskForReview,
  TicketForReview,
} from '@rescue-frontend/data-access/admin';

export type Side = 'low' | 'high';
export type PairTab = 'ticket' | 'station';
export type PairView = 'pending' | 'done';

export const PENDING_STATUSES = ['suggested', 'dup_ignored'] as const;
export const DONE_STATUSES = ['confirmed_duplicate', 'not_duplicate'] as const;
export const TAB_KINDS: Record<PairTab, DuplicatePair['entity_kind'][]> = {
  ticket: ['ticket', 'ticket_task'],
  station: ['station'],
};
export const NOTE_MAX_LENGTH = 1000;

export const other = (side: Side): Side => (side === 'low' ? 'high' : 'low');

export const isPending = (pair: Pick<DuplicatePair, 'status'>) =>
  (PENDING_STATUSES as readonly string[]).includes(pair.status);

const time = (value?: string | null) =>
  value ? new Date(value).getTime() : Number.NaN;

/**
 * DUP-BE-412: A is the side created first. `low` / `high` are ordered by uuid, not by time, so the
 * order is worked out here; equal or missing times keep `low` first.
 */
export function orderedSides(
  pair: Pick<DuplicatePair, 'low' | 'high'>,
): [Side, Side] {
  const low = time(pair.low.created_at);
  const high = time(pair.high.created_at);
  return high < low ? ['high', 'low'] : ['low', 'high'];
}

/** 最新建立的在前 (DUP-BE-412): by the later-created side; a side with no time counts for nothing. */
export function byLatestCreated<T extends Pick<DuplicatePair, 'low' | 'high'>>(
  pairs: readonly T[],
): T[] {
  const latest = (pair: T) =>
    Math.max(time(pair.low.created_at) || 0, time(pair.high.created_at) || 0);
  return [...pairs].sort((a, b) => latest(b) - latest(a));
}

/** How far apart two times are, in the words the design uses: 同時, 25 分, 1 小時 25 分, 2 天 3 小時. */
export function gapText(from?: string | null, to?: string | null): string {
  const mins = Math.round(Math.abs(time(to) - time(from)) / 60_000);
  if (!Number.isFinite(mins)) return '';
  if (mins === 0) return '同時';
  if (mins < 60) return `${mins} 分`;
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days) return `${days} 天${hours % 24 ? ` ${hours % 24} 小時` : ''}`;
  return `${hours} 小時${mins % 60 ? ` ${mins % 60} 分` : ''}`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** MM/DD HH:mm in Taiwan time. */
export function shortTime(value?: string | null): string {
  if (!value) return '—';
  const parts = new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const part = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return `${pad(part('month'))}/${pad(part('day'))} ${pad(part('hour'))}:${pad(part('minute'))}`;
}

/** Great-circle distance in metres, or null when either side has no point. */
export function distanceMetres(
  a: Pick<DuplicatePairSide, 'latitude' | 'longitude'>,
  b: Pick<DuplicatePairSide, 'latitude' | 'longitude'>,
): number | null {
  if (
    a.latitude == null ||
    a.longitude == null ||
    b.latitude == null ||
    b.longitude == null
  )
    return null;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) *
      Math.cos(rad(b.latitude)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/**
 * 為什麼可能重複: facts read off the two sides, not the engine's `evidence`, which the API calls
 * opaque.
 */
export function pairSignals(
  pair: DuplicatePairDetail,
  typeLabel: (type: string) => string,
): string[] {
  const out: string[] = [];
  const metres = distanceMetres(pair.low, pair.high);
  if (metres != null) out.push(`相距 ${Math.round(metres)} 公尺`);
  const gap = gapText(pair.low.created_at, pair.high.created_at);
  if (gap) out.push(gap === '同時' ? '同時建立' : `建立時間差 ${gap}`);
  if (pair.low.type && pair.low.type === pair.high.type) {
    out.push(
      `${pair.entity_kind === 'station' ? '類型' : '需求種類'}相同（${typeLabel(pair.low.type)}）`,
    );
  }
  const phone = (t?: TicketForReview | null) =>
    t?.contact_phone?.replace(/\D/g, '');
  const lowPhone = phone(pair.tickets?.low);
  if (lowPhone && lowPhone === phone(pair.tickets?.high))
    out.push('聯絡電話相同');
  return out;
}

// ── Fields (DUP-BE-410: list what the pair has; never a fixed list of a ticket's answers) ──────

export type FieldValue = string | number | string[] | null;

/** One picked-and-editable row: a ticket column, a disaster answer, a need column or a need item. */
export interface MergeField {
  id: string;
  label: string;
  /** How the value is typed in: `list` splits on 、 or a comma. */
  input: 'text' | 'long' | 'number' | 'list' | 'select';
  options?: readonly (readonly [string, string])[];
  /** Shown, picked on the left, never typed (the address and the need's kind). */
  locked?: boolean;
  /** Picking this row picks the ticket that is kept (DUP-BE-431). */
  primary?: boolean;
  /** Not picked: the merged ticket takes both tickets' values together (災害類型). */
  combined?: boolean;
  inactive?: boolean;
  read: (side: Side) => FieldValue;
  show: (value: FieldValue) => string;
}

export const isEmptyValue = (value: FieldValue | undefined) =>
  value == null || value === '' || (Array.isArray(value) && value.length === 0);

const plainShow = (value: FieldValue) =>
  isEmptyValue(value)
    ? '（未填）'
    : Array.isArray(value)
      ? value.join('、')
      : String(value);

export const PRIORITY_OPTIONS = [
  ['critical', '生命危急'],
  ['high', '緊急'],
  ['medium', '一般'],
  ['low', '低'],
] as const;
export const TRIAGE_OPTIONS = [
  ['yes', '是'],
  ['no', '否'],
  ['unknown', '不確定'],
] as const;

const optionShow =
  (options: readonly (readonly [string, string])[]) => (value: FieldValue) =>
    isEmptyValue(value)
      ? '（未填）'
      : (options.find(([key]) => key === value)?.[1] ?? String(value));

/** What the settings say about a configured field; a field they do not know has only its key. */
export interface FieldConfig {
  label: string;
  order: number;
  inactive: boolean;
  dataType?: string;
  options?: readonly string[] | null;
  unit?: string | null;
}

export interface FieldLabels {
  /** A disaster answer's name → its settings, ordered as the settings order them. */
  disaster: (name: string) => FieldConfig;
  disasterType: (key: string) => string;
  taskType: (key: string) => string;
}

/** How a configured field is typed in, by its data type (`docs/重複審核.md`, DUP-BE-432). */
function configInput(
  config: FieldConfig,
  multiple: boolean,
): Pick<MergeField, 'input' | 'options' | 'show'> {
  const show = (value: FieldValue) => {
    const text = plainShow(value);
    return config.unit && !isEmptyValue(value) && !Array.isArray(value)
      ? `${text} ${config.unit}`
      : text;
  };
  if (multiple || config.dataType === 'multi_select') {
    return { input: 'list', show };
  }
  if (config.dataType === 'single_select' && config.options?.length) {
    return {
      input: 'select',
      options: config.options.map((option) => [option, option] as const),
      show,
    };
  }
  if (config.dataType === 'number') return { input: 'number', show };
  if (config.dataType === 'long_text') return { input: 'long', show };
  return { input: 'text', show };
}

/** The need each side's ticket has in the pair, for a need card; null for a whole-ticket card. */
export function duplicateTasks(
  pair: DuplicatePairDetail,
): Record<Side, TaskForReview> | null {
  if (pair.entity_kind !== 'ticket_task' || !pair.tickets) return null;
  const find = (side: Side) =>
    pair.tickets?.[side]?.tasks.find((task) => task.uuid === pair[side].uuid);
  const low = find('low');
  const high = find('high');
  return low && high ? { low, high } : null;
}

/**
 * How many people the needs hold together. A person on two of them has the same key on each
 * (ADR-445), so they count once, as the resolve counts them.
 */
export function headcount(tasks: readonly TaskForReview[]): number {
  return new Set(tasks.flatMap((task) => task.claimant_keys)).size;
}

/**
 * A need item's settings, as the pair detail carries them on each item (ADR-446, ADR-447): read
 * with ai_duplicate.view alone, so a data auditor gets the same rows as an admin.
 */
function itemConfig(items: TaskForReview['properties']): FieldConfig {
  const item = items.find((i) => i.data_type != null) ?? items[0];
  return {
    label: item?.display_label ?? '',
    order: item?.sort_order ?? 9999,
    inactive: item?.is_active === false,
    dataType: item?.data_type ?? undefined,
    options: item?.enum_options,
    unit: item?.unit,
  };
}

/** Items grouped by name: one row per name, as a reviewer reads them. */
function itemGroups(task: TaskForReview) {
  const groups = new Map<string, TaskForReview['properties']>();
  for (const item of task.properties) {
    groups.set(item.property_name, [
      ...(groups.get(item.property_name) ?? []),
      item,
    ]);
  }
  return groups;
}

/** A ticket's place, part by part, as the forms ask for it; the pole is where there is no address. */
const LOCATION_PARTS = [
  ['full_address', '地址'],
  ['building_section', '區'],
  ['floor', '樓層'],
  ['room', '戶／室'],
  ['pole_id', '電線桿編號'],
] as const;

export interface PairFields {
  ticket: MergeField[];
  task: MergeField[];
}

/**
 * The rows of a ticket or need card: only what either ticket has filled in and the backend holds.
 * A row both sides left empty is not listed, nor named anywhere: many fields have
 * no place to be filled in yet, and the fields grow as the forms ask more (動態欄位).
 */
export function ticketFields(
  pair: DuplicatePairDetail,
  labels: FieldLabels,
): PairFields {
  const tickets = pair.tickets;
  if (!tickets?.low || !tickets.high) return { ticket: [], task: [] };
  const t = (side: Side) => tickets[side] as TicketForReview;
  const col = (
    id: string,
    label: string,
    read: (ticket: TicketForReview) => FieldValue,
    extra: Partial<MergeField> = {},
  ): MergeField => ({
    id,
    label,
    input: 'text',
    read: (side) => read(t(side)),
    show: plainShow,
    ...extra,
  });

  const ticket: MergeField[] = [
    col('ticket:title', '標題', (x) => x.title),
    col('ticket:description', '描述', (x) => x.description ?? null, {
      input: 'long',
    }),
    // Three rows, as the ticket form asks and the API keeps them: each is picked or typed on its own,
    // so a LINE ID in 聯絡電話 never has to be told apart from a name.
    col('ticket:contact_name', '現場聯絡人', (x) => x.contact_name),
    col('ticket:contact_phone', '聯絡電話', (x) => x.contact_phone ?? null),
    col('ticket:contact_email', 'Email', (x) => x.contact_email ?? null),
    col('ticket:priority', '優先級', (x) => x.priority, {
      input: 'select',
      options: PRIORITY_OPTIONS,
      show: optionShow(PRIORITY_OPTIONS),
    }),
    col(
      'ticket:person_trapped_reported',
      '有人受困',
      (x) => x.person_trapped_reported ?? null,
      {
        input: 'select',
        options: TRIAGE_OPTIONS,
        show: optionShow(TRIAGE_OPTIONS),
      },
    ),
    col(
      'ticket:immediate_danger_reported',
      '有立即危險',
      (x) => x.immediate_danger_reported ?? null,
      {
        input: 'select',
        options: TRIAGE_OPTIONS,
        show: optionShow(TRIAGE_OPTIONS),
      },
    ),
    // Both tickets' types together: a 淹水 and a 倒塌 report of one place lose
    // neither, and there is nothing to pick.
    col('ticket:disaster_types', '災害類型', (x) => x.disaster_types, {
      locked: true,
      combined: true,
      show: (v) =>
        isEmptyValue(v)
          ? '（未填）'
          : (v as string[]).map(labels.disasterType).join('、'),
    }),
    // DUP-BE-431: the place is not edited (ADR-367), and the side picked on any of its rows is the
    // ticket kept. One row per part, so floor and room, which tell two households of one building
    // apart, are read side by side.
    ...LOCATION_PARTS.map(([key, label]) =>
      col(`ticket:location:${key}`, label, (x) => x.location?.[key] ?? null, {
        locked: true,
        primary: true,
      }),
    ),
  ];

  const names = [
    ...new Set([
      ...Object.keys(t('low').disaster_details),
      ...Object.keys(t('high').disaster_details),
    ]),
  ];
  const disaster = names
    .map((name) => ({ name, ...labels.disaster(name) }))
    .sort((a, b) => a.order - b.order)
    .map(({ name, ...config }) => {
      const answers = (x: TicketForReview) => x.disaster_details[name] ?? [];
      const multiple =
        config.dataType === 'multi_select' ||
        answers(t('low')).length > 1 ||
        answers(t('high')).length > 1;
      return col(
        `disaster:${name}`,
        config.label,
        (x) => (multiple ? answers(x) : (answers(x)[0] ?? null)),
        { inactive: config.inactive, ...configInput(config, multiple) },
      );
    });

  const tasks = duplicateTasks(pair);
  const task: MergeField[] = [];
  if (tasks) {
    const tk = (side: Side) => tasks[side];
    const taskCol = (
      id: string,
      label: string,
      read: (x: TaskForReview) => FieldValue,
      extra: Partial<MergeField> = {},
    ): MergeField => ({
      id,
      label,
      input: 'text',
      read: (side) => read(tk(side)),
      show: plainShow,
      ...extra,
    });
    task.push(
      // ADR-370: only needs of the same kind merge, so the kind is shown, not picked.
      taskCol(
        'task:task_type',
        '需求種類',
        (x) => labels.taskType(x.task_type),
        {
          locked: true,
        },
      ),
      taskCol('task:task_name', '需求名稱', (x) => x.task_name),
      taskCol('task:quantity', '數量', (x) => x.quantity ?? null, {
        input: 'number',
      }),
      taskCol(
        'task:task_description',
        '需求說明',
        (x) => x.task_description ?? null,
        {
          input: 'long',
        },
      ),
    );
    const groups = { low: itemGroups(tk('low')), high: itemGroups(tk('high')) };
    const itemNames = [
      ...new Set([...groups.low.keys(), ...groups.high.keys()]),
    ];
    task.push(
      ...itemNames
        .map((name) => ({
          name,
          ...itemConfig([
            ...(groups.low.get(name) ?? []),
            ...(groups.high.get(name) ?? []),
          ]),
        }))
        .sort((a, b) => a.order - b.order)
        .map(({ name, ...config }) => {
          const rows = (side: Side) => groups[side].get(name) ?? [];
          const multiple = rows('low').length > 1 || rows('high').length > 1;
          const both = [...rows('low'), ...rows('high')];
          const typed = configInput(config, multiple);
          return taskCol(`item:${name}`, config.label, () => null, {
            ...typed,
            inactive: config.inactive,
            // The value is the item's own text; its quantity is only shown, never typed over.
            read: (side) => {
              const values = rows(side).map((i) => i.property_value);
              return typed.input === 'list' ? values : (values[0] ?? null);
            },
            show: (value) => {
              if (isEmptyValue(value)) return '（未填）';
              const texts = Array.isArray(value) ? value : [String(value)];
              const shown = texts.map((text) => {
                const item = both.find((i) => i.property_value === text);
                return item?.quantity != null
                  ? `${text} ×${item.quantity}`
                  : text;
              });
              return config.unit && !Array.isArray(value)
                ? `${shown[0]} ${config.unit}`
                : shown.join('、');
            },
          });
        }),
    );
  }

  const keep = (fields: MergeField[]) =>
    fields.filter((field) => {
      // The merged need's quantity is always asked for (ADR-448), even when both sides left it blank.
      if (field.id === 'task:quantity') return true;
      return (
        !isEmptyValue(field.read('low')) || !isEmptyValue(field.read('high'))
      );
    });
  return { ticket: keep([...ticket, ...disaster]), task: keep(task) };
}

// ── The merge plan ──────────────────────────────────────────────────────────────────────────

export interface MergePlan {
  /** The ticket kept (DUP-BE-431). Never shown as such. */
  primary: Side;
  /** Field id → the side whose value is used. */
  picks: Record<string, Side>;
  /** Field id → what was typed on the right, as typed. */
  edits: Record<string, string>;
  /** Need uuid → unticked (cancelled). */
  needOff: Record<string, boolean>;
  /** Photo uuid → unticked (cancelled). */
  photoOff: Record<string, boolean>;
}

/** DUP-BE-431: with no address picked yet, the side whose duplicate need has people, then the older. */
export function defaultPrimary(pair: DuplicatePairDetail): Side {
  const [first, second] = orderedSides(pair);
  const tasks = duplicateTasks(pair);
  if (tasks && tasks[second].claim_count > tasks[first].claim_count)
    return second;
  return first;
}

/** The contact rows after 現場聯絡人: they start on whichever ticket the name starts on. */
const CONTACT_FOLLOWERS = ['ticket:contact_phone', 'ticket:contact_email'];

/**
 * Each row starts on the kept ticket's value, or the other's when the kept one left it empty. The
 * contact rows are one person, so 聯絡電話 and Email start on the ticket 現場聯絡人 starts on, even
 * where that ticket left them empty: filling the gap from the other ticket would put one person's
 * email beside another's name. The reviewer can still pick them one by one.
 */
export function defaultPlan(
  pair: DuplicatePairDetail,
  fields: PairFields,
): MergePlan {
  const primary = defaultPrimary(pair);
  const picks: Record<string, Side> = {};
  for (const field of [...fields.ticket, ...fields.task]) {
    if (field.primary || field.combined) continue;
    picks[field.id] =
      isEmptyValue(field.read(primary)) &&
      !isEmptyValue(field.read(other(primary)))
        ? other(primary)
        : primary;
  }
  const contactSide = picks['ticket:contact_name'];
  if (contactSide) {
    for (const id of CONTACT_FOLLOWERS) {
      if (id in picks) picks[id] = contactSide;
    }
  }
  return { primary, picks, edits: {}, needOff: {}, photoOff: {} };
}

const pickedSide = (field: MergeField, plan: MergePlan): Side =>
  field.primary ? plan.primary : (plan.picks[field.id] ?? plan.primary);

const toText = (value: FieldValue) =>
  value == null ? '' : Array.isArray(value) ? value.join('、') : String(value);

function fromText(field: MergeField, text: string): FieldValue {
  const trimmed = text.trim();
  if (field.input === 'list') {
    return trimmed
      .split(/[、,，]/)
      .map((part) => part.trim())
      .filter(Boolean);
  }
  if (trimmed === '') return null;
  if (field.input === 'number') return Number(trimmed);
  return field.input === 'long' ? text : trimmed;
}

export const isEdited = (field: MergeField, plan: MergePlan) =>
  !field.locked &&
  plan.edits[field.id] != null &&
  plan.edits[field.id] !== toText(field.read(pickedSide(field, plan)));

/** The value the merged ticket ends up with: typed over, or the side picked on the left. */
export function resultValue(field: MergeField, plan: MergePlan): FieldValue {
  if (field.combined) {
    const values = [plan.primary, other(plan.primary)].flatMap((side) => {
      const value = field.read(side);
      return isEmptyValue(value)
        ? []
        : Array.isArray(value)
          ? value
          : [String(value)];
    });
    return [...new Set(values)];
  }
  const picked = field.read(pickedSide(field, plan));
  if (field.locked || plan.edits[field.id] == null) return picked;
  return fromText(field, plan.edits[field.id]);
}

export const resultText = (field: MergeField, plan: MergePlan) =>
  plan.edits[field.id] ?? toText(field.read(pickedSide(field, plan)));

export { pickedSide };

// ── What the merge does (shown before sending, DUP-BE-413) ──────────────────────────────────

export interface NeedRow {
  task: TaskForReview;
  side: Side;
  included: boolean;
}

export function otherNeeds(
  pair: DuplicatePairDetail,
  plan: MergePlan,
): NeedRow[] {
  const tasks = duplicateTasks(pair);
  const dup = new Set(tasks ? [tasks.low.uuid, tasks.high.uuid] : []);
  return orderedSides(pair).flatMap((side) =>
    (pair.tickets?.[side]?.tasks ?? [])
      .filter((task) => !dup.has(task.uuid))
      .map((task) => ({ task, side, included: !plan.needOff[task.uuid] })),
  );
}

export function photoRows(pair: DuplicatePairDetail, plan: MergePlan) {
  return orderedSides(pair).flatMap((side) =>
    (pair.tickets?.[side]?.photos ?? []).map((photo) => ({
      photo,
      side,
      included: !plan.photoOff[photo.uuid],
    })),
  );
}

/**
 * The tag a row of the merge preview carries (DUP-BE-413): 已修改 when typed over, else the ticket
 * its value came from (用 B 的), and nothing where both tickets say the same.
 */
export function previewTag(
  field: MergeField,
  plan: MergePlan,
): 'edited' | 'combined' | Side | null {
  if (isEdited(field, plan)) return 'edited';
  if (toText(field.read('low')) === toText(field.read('high'))) return null;
  if (field.combined) return 'combined';
  return pickedSide(field, plan);
}

/**
 * What the preview card cannot show (DUP-BE-413): the needs cancelled, who is told, the photos
 * left out. Each person counted once, as the quantity check does.
 */
export function mergeAfterLines(
  pair: DuplicatePairDetail,
  plan: MergePlan,
): string[] {
  const lines: string[] = [];
  const tasks = duplicateTasks(pair);
  const needs = otherNeeds(pair, plan);
  const kept = needs.filter((n) => n.included).map((n) => n.task);
  const dropped = needs.filter((n) => !n.included).map((n) => n.task);
  if (dropped.length) {
    lines.push(
      `沒勾的需求取消：${dropped.map((t) => `「${t.task_name}」`).join('、')}`,
    );
  }
  const staying = headcount([
    ...(tasks ? [tasks.low, tasks.high] : []),
    ...kept,
  ]);
  const cancelled = headcount(dropped);
  if (staying) lines.push(`${staying} 位已承接的志工繼續承接，會收到通知`);
  if (cancelled) lines.push(`${cancelled} 位志工承接的需求取消了，會收到通知`);
  const photosOut = photoRows(pair, plan).filter((p) => !p.included).length;
  if (photosOut) lines.push(`${photosOut} 張照片不要`);
  lines.push('通知兩邊開單的人');
  return lines;
}

export interface MergeProblem {
  field?: string;
  message: string;
}

/**
 * What stops a merge before it is sent. The floor is the people on the two needs, each counted once,
 * as the resolve counts them (ADR-370, ADR-445).
 */
export function mergeProblems(
  pair: DuplicatePairDetail,
  fields: PairFields,
  plan: MergePlan,
): MergeProblem[] {
  const problems: MergeProblem[] = [];
  const tasks = duplicateTasks(pair);
  if (tasks) {
    const quantity = fields.task.find((f) => f.id === 'task:quantity');
    const value = quantity
      ? resultValue(quantity, plan)
      : tasks[plan.primary].quantity;
    const floor = headcount([tasks.low, tasks.high]);
    // Folding two needs needs a quantity, a rescue's included (ADR-448 point 4): without one the
    // merged need would take everyone from both and never fill.
    if (value == null || value === '') {
      problems.push({ field: 'task:quantity', message: '請填數量' });
    } else if (!Number.isInteger(Number(value)) || Number(value) < 1) {
      problems.push({
        field: 'task:quantity',
        message: '數量要是 1 以上的整數',
      });
    } else if (Number(value) < floor) {
      problems.push({
        field: 'task:quantity',
        message: `不能少於承接人數 ${floor}`,
      });
    }
    const name = fields.task.find((f) => f.id === 'task:task_name');
    if (name && isEmptyValue(resultValue(name, plan))) {
      problems.push({ field: 'task:task_name', message: '需求名稱不能空白' });
    }
  } else if (!otherNeeds(pair, plan).some((row) => row.included)) {
    problems.push({ message: '合併後的任務單至少要留一項需求' });
  }
  // An item's values live on the rows both needs already have: the API adds none.
  if (tasks) {
    for (const field of fields.task.filter((f) => f.id.startsWith('item:'))) {
      const value = resultValue(field, plan);
      const count = Array.isArray(value) ? value.length : 0;
      const name = field.id.slice('item:'.length);
      const room = [tasks.low, tasks.high]
        .flatMap((task) => task.properties)
        .filter((item) => item.property_name === name).length;
      if (count > room) {
        problems.push({ field: field.id, message: `最多 ${room} 項` });
      }
    }
  }
  const title = fields.ticket.find((f) => f.id === 'ticket:title');
  if (title && isEmptyValue(resultValue(title, plan))) {
    problems.push({ field: 'ticket:title', message: '標題不能空白' });
  }
  const contact = fields.ticket.find((f) => f.id === 'ticket:contact_name');
  if (contact && isEmptyValue(resultValue(contact, plan))) {
    problems.push({
      field: 'ticket:contact_name',
      message: '現場聯絡人不能空白',
    });
  }
  return problems;
}

// ── The request (Spec 028 §3.1) ─────────────────────────────────────────────────────────────

const TICKET_KEYS = [
  'title',
  'description',
  'contact_name',
  'contact_phone',
  'contact_email',
  'priority',
  'person_trapped_reported',
  'immediate_danger_reported',
] as const;

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Turns the plan into `POST …/resolve`. Only fields that differ from the kept ticket are sent
 * (a field left out stays as it is). Needs: the kept ticket's ticked = keep, unticked = cancel; the
 * other ticket's ticked = move, unticked = cancel; its duplicate need is absorbed. Photos: ticked =
 * keep (DUP-BE-431).
 */
export function resolveRequest(
  pair: DuplicatePairDetail,
  fields: PairFields,
  plan: MergePlan,
  note: string,
): ResolveDuplicatePairBody {
  const tickets = pair.tickets;
  if (!tickets?.low || !tickets.high)
    throw new Error('Both tickets are needed to resolve');
  const kept = tickets[plan.primary] as TicketForReview;
  const gone = tickets[other(plan.primary)] as TicketForReview;
  const byId = new Map(
    [...fields.ticket, ...fields.task].map((f) => [f.id, f]),
  );
  const value = (id: string) => {
    const field = byId.get(id);
    return field ? resultValue(field, plan) : undefined;
  };

  const ticket: Record<string, unknown> = {};
  for (const key of TICKET_KEYS) {
    const next = value(`ticket:${key}`);
    if (next !== undefined && !same(next, kept[key])) ticket[key] = next;
  }
  const disasterTypes = value('ticket:disaster_types');
  if (
    disasterTypes !== undefined &&
    !same(disasterTypes, kept.disaster_types)
  ) {
    ticket.disaster_types = disasterTypes;
  }

  const disasterDetails: Record<string, string[]> = {};
  for (const field of fields.ticket.filter((f) =>
    f.id.startsWith('disaster:'),
  )) {
    const answer = resultValue(field, plan);
    const answers = Array.isArray(answer)
      ? answer
      : isEmptyValue(answer)
        ? []
        : [String(answer)];
    if (answers.length) {
      disasterDetails[field.id.slice('disaster:'.length)] = answers;
    }
  }
  const sendDetails =
    Object.keys(gone.disaster_details).length > 0 ||
    !same(disasterDetails, kept.disaster_details);

  const tasks = duplicateTasks(pair);
  const keepAll = (task: TaskForReview) =>
    task.properties.map((item) => ({
      property: item.uuid,
      action: 'keep' as const,
    }));

  const primaryTasks: ResolveDuplicatePairBody['primary_tasks'] =
    kept.tasks.map((task) => {
      if (tasks && task.uuid === tasks[plan.primary].uuid) {
        const absorbed = tasks[other(plan.primary)];
        const values: Record<string, unknown> = {};
        const name = value('task:task_name');
        if (name !== undefined && !same(name, task.task_name))
          values.task_name = name;
        const description = value('task:task_description');
        if (
          description !== undefined &&
          !same(description, task.task_description)
        ) {
          values.task_description = description;
        }
        const quantity = value('task:quantity');
        if (quantity !== undefined && !same(quantity, task.quantity)) {
          values.quantity = quantity == null ? null : Number(quantity);
        }
        return {
          task: task.uuid,
          action: 'keep' as const,
          absorb: [absorbed.uuid],
          values: Object.keys(values).length ? values : null,
          properties: mergedItems(task, absorbed, fields, plan),
        };
      }
      return plan.needOff[task.uuid]
        ? { task: task.uuid, action: 'cancel' as const, absorb: [] }
        : {
            task: task.uuid,
            action: 'keep' as const,
            absorb: [],
            properties: keepAll(task),
          };
    });

  const absorbedUuid = tasks?.[other(plan.primary)].uuid;
  const secondaryTasks: ResolveDuplicatePairBody['secondary_tasks'] = gone.tasks
    .filter((task) => task.uuid !== absorbedUuid)
    .map((task) =>
      plan.needOff[task.uuid]
        ? { task: task.uuid, action: 'cancel' as const }
        : {
            task: task.uuid,
            action: 'move' as const,
            properties: keepAll(task),
          },
    );

  const photos = [...kept.photos, ...gone.photos].map((photo) => ({
    photo: photo.uuid,
    action: plan.photoOff[photo.uuid] ? ('cancel' as const) : ('keep' as const),
  }));

  return {
    primary: plan.primary,
    expected_versions: {
      low: (tickets.low as TicketForReview).version,
      high: (tickets.high as TicketForReview).version,
    },
    ticket: Object.keys(ticket).length ? ticket : null,
    primary_tasks: primaryTasks,
    secondary_tasks: secondaryTasks,
    photos: photos.length ? photos : null,
    disaster_details: sendDetails ? disasterDetails : null,
    note: note.trim() || null,
  };
}

/**
 * The merged need's items: for each item name, the side picked keeps its items and the other side's
 * are cancelled. Typed-over values go on those rows, then on the other side's, since the API adds
 * no rows: a value is kept on an existing uuid, and any row left over is cancelled.
 */
function mergedItems(
  keptTask: TaskForReview,
  absorbed: TaskForReview,
  fields: PairFields,
  plan: MergePlan,
) {
  type Item = NonNullable<
    ResolveDuplicatePairBody['primary_tasks'][number]['properties']
  >[number];
  const sideOf = (task: TaskForReview): Side =>
    task === keptTask ? plan.primary : other(plan.primary);
  const all = [keptTask, absorbed].flatMap((task) =>
    task.properties.map((item) => ({ item, side: sideOf(task) })),
  );
  const decided = new Map<string, Item>();
  for (const name of new Set(all.map(({ item }) => item.property_name))) {
    const field = fields.task.find((f) => f.id === `item:${name}`);
    const chosen = field ? pickedSide(field, plan) : plan.primary;
    const rows = all.filter(({ item }) => item.property_name === name);
    const mine = rows.filter(({ side }) => side === chosen);
    const theirs = rows.filter(({ side }) => side !== chosen);
    if (!field || !isEdited(field, plan)) {
      for (const { item } of mine) {
        decided.set(item.uuid, { property: item.uuid, action: 'keep' });
      }
      for (const { item } of theirs) {
        decided.set(item.uuid, { property: item.uuid, action: 'cancel' });
      }
      continue;
    }
    const value = resultValue(field, plan);
    const values = Array.isArray(value)
      ? value
      : isEmptyValue(value)
        ? []
        : [String(value)];
    // A row whose value is still there keeps it, with its own quantity; only then do the new values
    // go on the rows left, so removing one value does not shift the others' quantities.
    const ordered = [...mine, ...theirs];
    const left = [...values];
    const free: typeof ordered = [];
    for (const row of ordered) {
      const at = left.indexOf(row.item.property_value);
      if (at < 0) {
        free.push(row);
        continue;
      }
      left.splice(at, 1);
      decided.set(row.item.uuid, { property: row.item.uuid, action: 'keep' });
    }
    free.forEach(({ item }, index) => {
      const next = left[index];
      decided.set(
        item.uuid,
        next == null
          ? { property: item.uuid, action: 'cancel' }
          : {
              property: item.uuid,
              action: 'keep',
              values: { property_value: next },
            },
      );
    });
  }
  return all.map(({ item }) => decided.get(item.uuid) as Item);
}

// ── Outcomes ────────────────────────────────────────────────────────────────────────────────

type BeforeTicket = {
  uuid?: string;
  title?: string | null;
  created_at?: string;
};

const beforeTickets = (
  merged: DuplicatePairDetail['events'][number] | undefined,
) =>
  (merged?.before_state?.tickets ?? {}) as Partial<Record<Side, BeforeTicket>>;

/**
 * A and B on a decided pair. A merge cancels one ticket, and the card then gives that side no
 * `created_at`, which would swap the letters; the merged event still holds both as they were.
 */
export function decidedSides(pair: DuplicatePairDetail): [Side, Side] {
  const before = beforeTickets(
    pair.events.find((e) => e.event_type === 'merged'),
  );
  const at = (side: Side) =>
    pair[side].created_at ?? before[side]?.created_at ?? null;
  return orderedSides({
    low: { ...pair.low, created_at: at('low') },
    high: { ...pair.high, created_at: at('high') },
  });
}

/**
 * What a merge did, by the two tickets' titles as the reviewer saw them (the merged event's
 * `before_state`): 「A」與「B」合成一張（留下「…」）. No ids are shown (design 11/01).
 */
export function mergedSummary(
  pair: DuplicatePairDetail,
  merged: DuplicatePairDetail['events'][number] | undefined,
): string {
  const before = beforeTickets(merged);
  const title = (side: Side) =>
    before[side]?.title || pair[side].ticket_title || pair[side].title || '';
  const sides = decidedSides(pair);
  const names = sides.map(title);
  if (names.some((name) => !name)) return '兩張任務單合成一張。';
  // after_state holds the kept ticket as the resolve left it.
  const keptUuid = (
    merged?.after_state?.ticket as { uuid?: string } | undefined
  )?.uuid;
  const kept = sides.find(
    (side) => keptUuid != null && before[side]?.uuid === keptUuid,
  );
  return `「${names[0]}」與「${names[1]}」合成一張${kept ? `（留下「${title(kept)}」）` : ''}。`;
}

export type Outcome = 'pending' | 'merged' | 'confirmed' | 'separate';

export function outcomeOf(
  pair: Pick<DuplicatePairDetail, 'status'> & {
    events?: DuplicatePairDetail['events'];
  },
): Outcome {
  if (isPending(pair)) return 'pending';
  if (pair.status === 'not_duplicate') return 'separate';
  return pair.events?.some((event) => event.event_type === 'merged')
    ? 'merged'
    : 'confirmed';
}

export const OUTCOME_LABELS: Record<Exclude<Outcome, 'pending'>, string> = {
  merged: '已合併',
  confirmed: '確認重複',
  separate: '不是重複',
};
