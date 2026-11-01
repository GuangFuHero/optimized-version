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

/** A ticket's place as one line: the address down to the room, or the pole. */
export function addressText(
  location: TicketForReview['location'],
): string | null {
  if (!location) return null;
  const text = [
    location.full_address,
    location.building_section,
    location.floor,
    location.room,
    location.pole_id,
  ]
    .filter(Boolean)
    .join(' ');
  return text || null;
}

/**
 * The one 聯絡人 row back into the API's three columns: an email and a phone are recognised by their
 * shape, and what is left is the name.
 */
export function parseContact(text: string) {
  const email = text.match(/[^\s、,，]+@[^\s、,，]+/)?.[0] ?? null;
  const withoutEmail = email ? text.replace(email, ' ') : text;
  const phone = withoutEmail.match(/\+?\d[\d\s()-]{5,}\d/)?.[0]?.trim() ?? null;
  const name = (phone ? withoutEmail.replace(phone, ' ') : withoutEmail)
    .replace(/[\s、,，]+/g, ' ')
    .trim();
  return { contact_name: name, contact_phone: phone, contact_email: email };
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

export interface PairFields {
  ticket: MergeField[];
  task: MergeField[];
  /** Labels of rows both sides left empty: listed under the table, not as rows (DUP-BE-410). */
  empty: string[];
}

/** The rows of a ticket or need card. Rows both sides left empty are dropped. */
export function ticketFields(
  pair: DuplicatePairDetail,
  labels: FieldLabels,
): PairFields {
  const tickets = pair.tickets;
  const empty: string[] = [];
  if (!tickets?.low || !tickets.high) return { ticket: [], task: [], empty };
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
    // One row, as the design has it (`dd-data.js:103`); the API keeps three columns.
    col('ticket:contact', '聯絡人', (x) =>
      [x.contact_name, x.contact_phone, x.contact_email]
        .filter(Boolean)
        .join(' '),
    ),
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
    col('ticket:disaster_types', '災害類型', (x) => x.disaster_types, {
      locked: true,
      show: (v) =>
        isEmptyValue(v)
          ? '（未填）'
          : (v as string[]).map(labels.disasterType).join('、'),
    }),
    // DUP-BE-431: the address is not edited (ADR-367); the side picked here is the one kept.
    col('ticket:location', '地址', (x) => addressText(x.location), {
      locked: true,
      primary: true,
    }),
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
      const has =
        !isEmptyValue(field.read('low')) || !isEmptyValue(field.read('high'));
      if (!has) empty.push(field.label);
      return has;
    });
  return { ticket: keep([...ticket, ...disaster]), task: keep(task), empty };
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

/** Each row starts on the kept ticket's value, or the other's when the kept one left it empty. */
export function defaultPlan(
  pair: DuplicatePairDetail,
  fields: PairFields,
): MergePlan {
  const primary = defaultPrimary(pair);
  const picks: Record<string, Side> = {};
  for (const field of [...fields.ticket, ...fields.task]) {
    if (field.primary) continue;
    picks[field.id] =
      isEmptyValue(field.read(primary)) &&
      !isEmptyValue(field.read(other(primary)))
        ? other(primary)
        : primary;
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
    const rescue = tasks.low.task_type === 'rescue';
    if (value == null || value === '') {
      if (!rescue)
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
  const contact = fields.ticket.find((f) => f.id === 'ticket:contact');
  if (
    contact &&
    !parseContact(String(resultValue(contact, plan) ?? '')).contact_name
  ) {
    problems.push({ field: 'ticket:contact', message: '聯絡人不能空白' });
  }
  return problems;
}

// ── The request (Spec 028 §3.1) ─────────────────────────────────────────────────────────────

const TICKET_KEYS = [
  'title',
  'description',
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
  const contact = value('ticket:contact');
  if (contact !== undefined) {
    const parsed = parseContact(String(contact ?? ''));
    for (const key of [
      'contact_name',
      'contact_phone',
      'contact_email',
    ] as const) {
      if (!same(parsed[key], kept[key])) ticket[key] = parsed[key];
    }
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
    [...mine, ...theirs].forEach(({ item }, index) => {
      const next = values[index];
      decided.set(
        item.uuid,
        next == null
          ? { property: item.uuid, action: 'cancel' }
          : next === item.property_value
            ? { property: item.uuid, action: 'keep' }
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
