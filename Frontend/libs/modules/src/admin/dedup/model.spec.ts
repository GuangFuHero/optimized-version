import { describe, expect, it } from 'vitest';

import type {
  DuplicatePairDetail,
  TaskForReview,
  TicketForReview,
} from '@rescue-frontend/data-access/admin';

import {
  byLatestCreated,
  defaultPlan,
  decidedSides,
  defaultPrimary,
  headcount,
  gapText,
  mergeAfterLines,
  mergeProblems,
  mergedSummary,
  orderedSides,
  outcomeOf,
  pairSignals,
  previewTag,
  resolveRequest,
  resultValue,
  ticketFields,
  type FieldLabels,
  type MergeField,
  type MergePlan,
  type PairFields,
} from './model';

const labels: FieldLabels = {
  disaster: (name) => ({
    label: `災害:${name}`,
    order: name === 'water_depth' ? 1 : 2,
    inactive: false,
  }),
  disasterType: (key) => key,
  taskType: (key) =>
    ({ hr: '人力', supply: '物資', rescue: '救援' })[key] ?? key,
};

function task(over: Partial<TaskForReview> & { uuid: string }): TaskForReview {
  return {
    task_type: 'hr',
    task_name: '清淤人力',
    task_description: null,
    quantity: 4,
    status: 'pending',
    claim_count: 0,
    claimant_keys: [],
    recruiting_stopped: false,
    properties: [],
    ...over,
  };
}

function ticket(
  over: Partial<TicketForReview> & { uuid: string },
): TicketForReview {
  return {
    version: `v-${over.uuid}`,
    title: '大進街12號 清淤',
    description: null,
    priority: 'medium',
    task_type: null,
    disaster_types: ['flood'],
    person_trapped_reported: null,
    immediate_danger_reported: null,
    contact_name: '陳先生',
    contact_phone: '0912000208',
    contact_email: null,
    longitude: 121.4219,
    latitude: 23.6696,
    status: 'pending',
    audit_status: 'unverified',
    created_by: null,
    created_at: '2026-10-10T07:17:00+08:00',
    tasks: [],
    photos: [],
    disaster_details: {},
    location: null,
    ...over,
  };
}

function needPair(
  low: TicketForReview,
  high: TicketForReview,
  lowTask: string,
  highTask: string,
): DuplicatePairDetail {
  const side = (t: TicketForReview, taskUuid: string) => ({
    uuid: taskUuid,
    deleted: false,
    title: t.tasks.find((x) => x.uuid === taskUuid)?.task_name ?? null,
    type: t.tasks.find((x) => x.uuid === taskUuid)?.task_type ?? null,
    status: 'pending',
    ticket_uuid: t.uuid,
    ticket_title: t.title,
    longitude: t.longitude,
    latitude: t.latitude,
    created_by: null,
    created_at: t.created_at,
  });
  return {
    uuid: 'pair-1',
    entity_kind: 'ticket_task',
    status: 'suggested',
    similarity: 0.91,
    evidence: null,
    method: 'fast',
    engine_version: null,
    source_layer: 'fast',
    duplicate_group_uuid: null,
    hint_outcome: null,
    created_at: '2026-10-10T08:42:00+08:00',
    reviewed_by: null,
    reviewed_by_name: null,
    reviewed_at: null,
    low: side(low, lowTask),
    high: side(high, highTask),
    events: [],
    tickets: { low, high },
  };
}

/** Both tickets of a fixture, which always has them. */
function both(pair: DuplicatePairDetail) {
  const low = pair.tickets?.low;
  const high = pair.tickets?.high;
  if (!low || !high) throw new Error('fixture without both tickets');
  return { low, high };
}

function fieldOf2(fields: PairFields, id: string): MergeField {
  const field = fields.ticket.find((f) => f.id === id);
  if (!field) throw new Error(`no field ${id}`);
  return field;
}

/** A field of a fixture by id, which the test knows is there. */
function fieldOf(fields: PairFields, id: string): MergeField {
  const field = fields.task.find((f) => f.id === id);
  if (!field) throw new Error(`no field ${id}`);
  return field;
}

/** Low was created later than high, so high is A. */
function fixture() {
  const low = ticket({
    uuid: 'T-low',
    title: '需要人幫忙清泥',
    priority: 'high',
    created_at: '2026-10-10T08:42:00+08:00',
    contact_name: '陳太太',
    contact_phone: '0921000771',
    tasks: [
      task({
        uuid: 'L-dup',
        task_name: '清泥人力',
        quantity: 4,
        claim_count: 1,
        claimant_keys: ['k-both'],
        properties: [
          {
            uuid: 'L-p1',
            property_name: 'tools',
            display_label: '工具',
            property_value: '鏟子',
            quantity: null,
            status: null,
            comment: null,
          },
        ],
      }),
      task({
        uuid: 'L-water',
        task_type: 'supply',
        task_name: '飲用水',
        quantity: 2,
      }),
    ],
    photos: [{ uuid: 'L-ph', url: 'https://x/l.jpg', created_at: null }],
    disaster_details: { road_access: ['正常'] },
  });
  const high = ticket({
    uuid: 'T-high',
    title: '一樓淤泥清理',
    description: '一樓淤泥約 50 公分',
    created_at: '2026-10-10T07:17:00+08:00',
    tasks: [
      task({
        uuid: 'H-dup',
        task_name: '清淤人力',
        quantity: 6,
        claim_count: 3,
        claimant_keys: ['k-both', 'k-h1', 'k-h2'],
        properties: [
          {
            uuid: 'H-p1',
            property_name: 'tools',
            display_label: '工具',
            property_value: '推車',
            quantity: null,
            status: null,
            comment: null,
          },
        ],
      }),
      task({
        uuid: 'H-cart',
        task_type: 'supply',
        task_name: '推車',
        quantity: 2,
      }),
    ],
    photos: [{ uuid: 'H-ph', url: 'https://x/h.jpg', created_at: null }],
    disaster_details: { water_depth: ['50'] },
  });
  return needPair(low, high, 'L-dup', 'H-dup');
}

describe('orderedSides and gapText', () => {
  it('puts the side created first as A, whatever its uuid order', () => {
    expect(orderedSides(fixture())).toEqual(['high', 'low']);
  });

  it('writes gaps the way the design does', () => {
    expect(gapText('2026-10-10T07:17:00Z', '2026-10-10T07:17:00Z')).toBe(
      '同時',
    );
    expect(gapText('2026-10-10T07:17:00Z', '2026-10-10T07:42:00Z')).toBe(
      '25 分',
    );
    expect(gapText('2026-10-10T07:17:00Z', '2026-10-10T08:42:00Z')).toBe(
      '1 小時 25 分',
    );
    expect(gapText('2026-10-10T07:00:00Z', '2026-10-12T10:00:00Z')).toBe(
      '2 天 3 小時',
    );
  });
});

describe('byLatestCreated', () => {
  it('orders by the later-created side, with a deleted side counting for nothing', () => {
    const pair = (id: string, low: string | null, high: string | null) => ({
      id,
      low: { created_at: low },
      high: { created_at: high },
    });
    const sorted = byLatestCreated([
      pair('old', '2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z'),
      pair('deleted-side', null, '2026-10-03T00:00:00Z'),
      pair('new', '2026-10-01T00:00:00Z', '2026-10-04T00:00:00Z'),
    ] as unknown as Parameters<typeof byLatestCreated>[0]) as unknown as {
      id: string;
    }[];
    expect(sorted.map((p) => p.id)).toEqual(['new', 'deleted-side', 'old']);
  });
});

describe('pairSignals', () => {
  it('reads distance, time, kind and phone off the two sides, not the engine evidence', () => {
    const pair = fixture();
    both(pair).high.contact_phone = '0921-000-771';
    expect(pairSignals(pair, labels.taskType)).toEqual([
      '相距 0 公尺',
      '建立時間差 1 小時 25 分',
      '需求種類相同（人力）',
      '聯絡電話相同',
    ]);
  });
});

describe('fields', () => {
  it("reads a need item's name, order, type and unit from the detail, not the settings", () => {
    const pair = fixture();
    for (const t of Object.values(both(pair))) {
      t.tasks[0].properties.push({
        uuid: `${t.uuid}-n`,
        property_name: 'people',
        property_value: '3',
        quantity: null,
        status: null,
        comment: null,
        display_label: '人數',
        sort_order: 0,
        data_type: 'number',
        enum_options: null,
        unit: '人',
        is_active: false,
      });
    }
    const fields = ticketFields(pair, labels);
    const items = fields.task.filter((f) => f.id.startsWith('item:'));
    // sort_order 0 comes before tools, which has no setting (9999).
    expect(items.map((f) => [f.id, f.label])).toEqual([
      ['item:people', '人數'],
      ['item:tools', '工具'],
    ]);
    expect(items[0].input).toBe('number');
    expect(items[0].inactive).toBe(true);
    expect(items[0].show('3')).toBe('3 人');
  });

  it('lists only rows one side filled, and names no empty one', () => {
    const fields = ticketFields(fixture(), labels);
    const ids = fields.ticket.map((f) => f.id);
    expect(ids).toContain('ticket:description');
    expect(ids).toContain('ticket:contact_name');
    // Neither ticket says whether someone is trapped, nor has an email: no row, and nothing else.
    expect(ids).not.toContain('ticket:person_trapped_reported');
    expect(ids).not.toContain('ticket:contact_email');
    expect(Object.keys(fields)).toEqual(['ticket', 'task']);
    // Disaster answers follow the settings order: water_depth (1) before road_access (2).
    expect(ids.filter((id) => id.startsWith('disaster:'))).toEqual([
      'disaster:water_depth',
      'disaster:road_access',
    ]);
    expect(fields.task.map((f) => f.id)).toEqual(
      [
        'task:task_type',
        'task:task_name',
        'task:quantity',
        'task:task_description',
        'item:tools',
      ].filter((id) => id !== 'task:task_description'),
    );
  });

  it('has no duplicate-need rows on a whole-ticket card', () => {
    const pair = { ...fixture(), entity_kind: 'ticket' as const };
    expect(ticketFields(pair, labels).task).toEqual([]);
  });
});

describe('defaultPlan', () => {
  it('keeps the side whose duplicate need has more people, then the older one', () => {
    expect(defaultPrimary(fixture())).toBe('high');
    const pair = fixture();
    both(pair).low.tasks[0].claim_count = 5;
    pair.low = { ...pair.low };
    expect(defaultPrimary(pair)).toBe('low');
  });

  it('starts each row on the kept ticket, or the other one where the kept one is empty', () => {
    const pair = fixture();
    both(pair).high.description = null;
    both(pair).low.description = '只有這邊有';
    const fields = ticketFields(pair, labels);
    const plan = defaultPlan(pair, fields);
    expect(plan.primary).toBe('high');
    expect(plan.picks['ticket:title']).toBe('high');
    expect(plan.picks['ticket:description']).toBe('low');
  });
});

describe('resolveRequest', () => {
  function planFor(pair: DuplicatePairDetail, over: Partial<MergePlan> = {}) {
    const fields = ticketFields(pair, labels);
    return { fields, plan: { ...defaultPlan(pair, fields), ...over } };
  }

  it('turns ticks and picks into keep, cancel, move and absorb', () => {
    const pair = fixture();
    const { fields, plan } = planFor(pair);
    plan.picks['ticket:priority'] = 'low';
    plan.edits['task:quantity'] = '7';
    plan.needOff['L-water'] = true;
    plan.photoOff['L-ph'] = true;
    const body = resolveRequest(pair, fields, plan, '  已電話確認  ');

    expect(body.primary).toBe('high');
    expect(body.expected_versions).toEqual({
      low: 'v-T-low',
      high: 'v-T-high',
    });
    expect(body.ticket).toEqual({ priority: 'high' });
    expect(body.primary_tasks).toEqual([
      {
        task: 'H-dup',
        action: 'keep',
        absorb: ['L-dup'],
        values: { quantity: 7 },
        properties: [
          { property: 'H-p1', action: 'keep' },
          { property: 'L-p1', action: 'cancel' },
        ],
      },
      { task: 'H-cart', action: 'keep', absorb: [], properties: [] },
    ]);
    expect(body.secondary_tasks).toEqual([
      { task: 'L-water', action: 'cancel' },
    ]);
    expect(body.photos).toEqual([
      { photo: 'H-ph', action: 'keep' },
      { photo: 'L-ph', action: 'cancel' },
    ]);
    // The other ticket has disaster answers, so the whole set is sent (ADR-385).
    expect(body.disaster_details).toEqual({
      water_depth: ['50'],
      road_access: ['正常'],
    });
    expect(body.note).toBe('已電話確認');
  });

  it('moves the other ticket kept items and sends a typed-over item value', () => {
    const pair = fixture();
    const { fields, plan } = planFor(pair);
    plan.picks['item:tools'] = 'low';
    plan.edits['item:tools'] = '鏟子、手套';
    const body = resolveRequest(pair, fields, plan, '');
    expect(body.primary_tasks[0].properties).toEqual([
      { property: 'H-p1', action: 'cancel' },
      {
        property: 'L-p1',
        action: 'keep',
        values: { property_value: '鏟子、手套' },
      },
    ]);
    expect(body.secondary_tasks).toEqual([
      { task: 'L-water', action: 'move', properties: [] },
    ]);
    expect(body.note).toBeNull();
  });

  it('sends nothing for a field left as the kept ticket has it', () => {
    const pair = fixture();
    const { fields, plan } = planFor(pair);
    const body = resolveRequest(pair, fields, plan, '');
    expect(body.ticket).toBeNull();
    expect(body.primary_tasks[0].values).toBeNull();
  });

  it('switches the kept ticket when the other location is picked', () => {
    const pair = fixture();
    const { fields, plan } = planFor(pair, { primary: 'low' });
    const body = resolveRequest(pair, fields, plan, '');
    expect(body.primary).toBe('low');
    expect(body.primary_tasks[0]).toMatchObject({
      task: 'L-dup',
      absorb: ['H-dup'],
    });
    expect(body.secondary_tasks?.map((t) => t.task)).toEqual(['H-cart']);
    // Rows stay on the side picked for them, which is now the one going away.
    expect(body.ticket).toMatchObject({ title: '一樓淤泥清理' });
  });
});

describe('the place rows', () => {
  const place = (
    full_address: string | null,
    parts: Partial<NonNullable<TicketForReview['location']>> = {},
  ) => ({
    location_type: 'address',
    full_address,
    building_section: null,
    floor: null,
    room: null,
    pole_id: null,
    ...parts,
  });
  const placeIds = (fields: PairFields) =>
    fields.ticket
      .map((f) => f.id)
      .filter((id) => id.startsWith('ticket:location:'));

  it('lists each part of the place either ticket has, floor and room apart', () => {
    const pair = fixture();
    both(pair).low.location = place('光復鄉大進街12號', { floor: '2F' });
    both(pair).high.location = place('光復鄉大進街12號', {
      floor: '3F',
      room: '301',
    });
    const fields = ticketFields(pair, labels);
    expect(placeIds(fields)).toEqual([
      'ticket:location:full_address',
      'ticket:location:floor',
      'ticket:location:room',
    ]);
    expect(fieldOf2(fields, 'ticket:location:floor').label).toBe('樓層');
    expect(fieldOf2(fields, 'ticket:location:room').label).toBe('戶／室');
  });

  it('keeps the ticket picked on any of its rows, and moves no other row', () => {
    const pair = fixture();
    both(pair).low.location = place('光復鄉大進街12號', { floor: '2F' });
    both(pair).high.location = place('光復鄉大進街14號', { floor: '3F' });
    const fields = ticketFields(pair, labels);
    const plan = defaultPlan(pair, fields);
    const picks = { ...plan.picks };
    expect(plan.primary).toBe('high');
    expect(resultValue(fieldOf2(fields, 'ticket:location:floor'), plan)).toBe(
      '3F',
    );
    const next = { ...plan, primary: 'low' as const };
    expect(next.picks).toEqual(picks);
    expect(
      resultValue(fieldOf2(fields, 'ticket:location:full_address'), next),
    ).toBe('光復鄉大進街12號');
    expect(resultValue(fieldOf2(fields, 'ticket:location:floor'), next)).toBe(
      '2F',
    );
    expect(resolveRequest(pair, fields, next, '').primary).toBe('low');
  });

  it('lists the pole where there is no address', () => {
    const pair = fixture();
    both(pair).low.location = {
      ...place(null, { pole_id: 'P-12' }),
      location_type: 'pole',
    };
    const fields = ticketFields(pair, labels);
    expect(placeIds(fields)).toEqual(['ticket:location:pole_id']);
  });

  it('lists no place row when neither ticket has a place', () => {
    expect(placeIds(ticketFields(fixture(), labels))).toEqual([]);
  });
});

describe('the three contact rows', () => {
  it('lists name and phone apart, as the ticket form asks', () => {
    const fields = ticketFields(fixture(), labels);
    expect(fieldOf2(fields, 'ticket:contact_name').label).toBe('現場聯絡人');
    expect(fieldOf2(fields, 'ticket:contact_phone').label).toBe('聯絡電話');
    expect(fieldOf2(fields, 'ticket:contact_name').read('low')).toBe('陳太太');
  });

  it('sends each row on its own: a name from one ticket, a phone from the other', () => {
    const pair = fixture();
    const fields = ticketFields(pair, labels);
    const plan = defaultPlan(pair, fields);
    // High is kept; take only low's phone.
    plan.picks['ticket:contact_phone'] = 'low';
    expect(resolveRequest(pair, fields, plan, '').ticket).toEqual({
      contact_phone: '0921000771',
    });
    plan.edits['ticket:contact_name'] = '林小姐';
    expect(resolveRequest(pair, fields, plan, '').ticket).toEqual({
      contact_name: '林小姐',
      contact_phone: '0921000771',
    });
  });

  it('sends a LINE ID as the phone it is', () => {
    const pair = fixture();
    both(pair).low.contact_phone = 'line: chen0921';
    const fields = ticketFields(pair, labels);
    const plan = defaultPlan(pair, fields);
    plan.picks['ticket:contact_name'] = 'low';
    plan.picks['ticket:contact_phone'] = 'low';
    expect(resolveRequest(pair, fields, plan, '').ticket).toEqual({
      contact_name: '陳太太',
      contact_phone: 'line: chen0921',
    });
  });

  it('starts phone and Email on the ticket the name starts on, even where it left them empty', () => {
    const pair = fixture();
    // High is kept and has no Email; low's contact is someone else, with one.
    both(pair).low.contact_email = 'lin@mock.test';
    const fields = ticketFields(pair, labels);
    const plan = defaultPlan(pair, fields);
    expect(plan.picks['ticket:contact_name']).toBe('high');
    expect(plan.picks['ticket:contact_phone']).toBe('high');
    expect(plan.picks['ticket:contact_email']).toBe('high');
    expect(
      resultValue(fieldOf2(fields, 'ticket:contact_email'), plan),
    ).toBeNull();
    // Nothing of low's contact is sent unless picked.
    expect(resolveRequest(pair, fields, plan, '').ticket).toBeNull();
    // Picked on purpose, it is used.
    plan.picks['ticket:contact_email'] = 'low';
    expect(resolveRequest(pair, fields, plan, '').ticket).toEqual({
      contact_email: 'lin@mock.test',
    });
  });

  it('refuses a blank name', () => {
    const pair = fixture();
    const fields = ticketFields(pair, labels);
    const plan = defaultPlan(pair, fields);
    plan.edits['ticket:contact_name'] = ' ';
    expect(mergeProblems(pair, fields, plan)).toContainEqual({
      field: 'ticket:contact_name',
      message: '現場聯絡人不能空白',
    });
  });
});

describe('災害類型', () => {
  it("takes both tickets' types, with nothing to pick", () => {
    const pair = fixture();
    both(pair).low.disaster_types = ['flood', 'landslide'];
    both(pair).high.disaster_types = ['collapse', 'flood'];
    const fields = ticketFields(pair, labels);
    const field = fieldOf2(fields, 'ticket:disaster_types');
    expect(field.combined).toBe(true);
    const plan = defaultPlan(pair, fields);
    expect(plan.picks['ticket:disaster_types']).toBeUndefined();
    // The kept ticket's first, then the other's not already there.
    expect(resultValue(field, plan)).toEqual([
      'collapse',
      'flood',
      'landslide',
    ]);
    expect(resolveRequest(pair, fields, plan, '').ticket).toMatchObject({
      disaster_types: ['collapse', 'flood', 'landslide'],
    });
    expect(previewTag(field, plan)).toBe('combined');
  });

  it('sends nothing when the other ticket adds no type', () => {
    const pair = fixture();
    const fields = ticketFields(pair, labels);
    const plan = defaultPlan(pair, fields);
    expect(
      resolveRequest(pair, fields, plan, '').ticket?.disaster_types,
    ).toBeUndefined();
  });
});

describe('configured fields', () => {
  it('types a field by its data type, with its unit, and splits a multi-select into rows', () => {
    const configured: FieldLabels = {
      ...labels,
      disaster: () => ({
        label: '積水深度',
        order: 0,
        inactive: false,
        dataType: 'number',
        unit: 'cm',
      }),
    };
    const pair = fixture();
    for (const t of Object.values(both(pair)))
      t.tasks[0].properties[0].data_type = 'multi_select';
    const fields = ticketFields(pair, configured);
    const depth = fields.ticket.find((f) => f.id === 'disaster:water_depth');
    expect(depth?.input).toBe('number');
    expect(depth?.show(50)).toBe('50 cm');
    const tools = fieldOf(fields, 'item:tools');
    expect(tools.input).toBe('list');
    const plan = defaultPlan(pair, fields);
    plan.edits['item:tools'] = '推車、鏟子';
    const body = resolveRequest(pair, fields, plan, '');
    expect(body.primary_tasks[0].properties).toEqual([
      { property: 'H-p1', action: 'keep' },
      { property: 'L-p1', action: 'keep' },
    ]);
    // Dropping 推車 keeps 鏟子 on its own row (and quantity); only the freed row is cancelled.
    plan.edits['item:tools'] = '鏟子';
    expect(
      resolveRequest(pair, fields, plan, '').primary_tasks[0].properties,
    ).toEqual([
      { property: 'H-p1', action: 'cancel' },
      { property: 'L-p1', action: 'keep' },
    ]);
    plan.edits['item:tools'] = '鏟子、手套';
    expect(
      resolveRequest(pair, fields, plan, '').primary_tasks[0].properties,
    ).toEqual([
      {
        property: 'H-p1',
        action: 'keep',
        values: { property_value: '手套' },
      },
      { property: 'L-p1', action: 'keep' },
    ]);
    plan.edits['item:tools'] = '推車、鏟子、手套';
    expect(mergeProblems(pair, fields, plan)).toContainEqual({
      field: 'item:tools',
      message: '最多 2 項',
    });
    plan.edits['item:tools'] = '';
    expect(
      resolveRequest(pair, fields, plan, '').primary_tasks[0].properties,
    ).toEqual([
      { property: 'H-p1', action: 'cancel' },
      { property: 'L-p1', action: 'cancel' },
    ]);
  });
});

describe('headcount', () => {
  it('counts each claimant key once across the needs', () => {
    expect(headcount([])).toBe(0);
    expect(
      headcount([
        task({ uuid: 'a', claimant_keys: ['k1', 'k2'] }),
        task({ uuid: 'b', claimant_keys: ['k2', 'k3'] }),
      ]),
    ).toBe(3);
  });
});

describe('mergeProblems', () => {
  it('refuses a quantity under the people on both needs, counting someone on both once', () => {
    const pair = fixture();
    const fields = ticketFields(pair, labels);
    const plan = defaultPlan(pair, fields);
    plan.edits['task:quantity'] = '2';
    expect(mergeProblems(pair, fields, plan)).toEqual([
      { field: 'task:quantity', message: '不能少於承接人數 3' },
    ]);
    // 1 + 3 claims, but k-both is on both needs: 3 people, so 3 is enough.
    plan.edits['task:quantity'] = '3';
    expect(mergeProblems(pair, fields, plan)).toEqual([]);
    expect(resultValue(fieldOf(fields, 'task:quantity'), plan)).toBe(3);
  });

  it('asks for a quantity when two needs fold together, a rescue included (ADR-448)', () => {
    const pair = fixture();
    for (const t of Object.values(both(pair))) {
      t.tasks[0].task_type = 'rescue';
      t.tasks[0].quantity = null;
    }
    const fields = ticketFields(pair, labels);
    // Both sides blank: the row is still listed, so it can be filled.
    expect(fields.task.map((f) => f.id)).toContain('task:quantity');
    const plan = defaultPlan(pair, fields);
    expect(mergeProblems(pair, fields, plan)).toEqual([
      { field: 'task:quantity', message: '請填數量' },
    ]);
    plan.edits['task:quantity'] = '5';
    expect(mergeProblems(pair, fields, plan)).toEqual([]);
  });

  it('keeps at least one need on a whole-ticket card', () => {
    const pair = { ...fixture(), entity_kind: 'ticket' as const };
    const fields = ticketFields(pair, labels);
    const plan = defaultPlan(pair, fields);
    for (const id of ['L-dup', 'L-water', 'H-dup', 'H-cart'])
      plan.needOff[id] = true;
    expect(mergeProblems(pair, fields, plan)).toEqual([
      { message: '合併後的任務單至少要留一項需求' },
    ]);
  });
});

describe('mergedSummary', () => {
  const event = (before: unknown, after: unknown) => ({
    uuid: 'e',
    event_type: 'merged',
    actor_uuid: null,
    source_layer: 'manual' as const,
    decision_reason: null,
    engine_version: null,
    before_state: before as Record<string, unknown>,
    after_state: after as Record<string, unknown>,
    created_at: '2026-10-10T09:00:00Z',
  });

  it('names both tickets by their titles before the merge, A first, and the one kept', () => {
    const pair = fixture();
    const merged = event(
      {
        tickets: {
          low: { uuid: 'T-low', title: '需要人幫忙清泥' },
          high: { uuid: 'T-high', title: '一樓淤泥清理' },
        },
      },
      { ticket: { uuid: 'T-high', title: '改過的標題' } },
    );
    // T-high was created first, so it is A.
    expect(mergedSummary(pair, merged)).toBe(
      '「一樓淤泥清理」與「需要人幫忙清泥」合成一張（留下「一樓淤泥清理」）。',
    );
  });

  it('keeps A and B after the merge, when the cancelled side has lost its time', () => {
    const pair = fixture();
    // T-high (A) was cancelled: the card no longer gives it a time.
    pair.high.created_at = null;
    pair.high.deleted = true;
    const merged = event(
      {
        tickets: {
          low: {
            uuid: 'T-low',
            title: '需要人幫忙清泥',
            created_at: '2026-10-10T08:42:00+08:00',
          },
          high: {
            uuid: 'T-high',
            title: '一樓淤泥清理',
            created_at: '2026-10-10T07:17:00+08:00',
          },
        },
      },
      { ticket: { uuid: 'T-low' } },
    );
    pair.events = [merged];
    expect(decidedSides(pair)).toEqual(['high', 'low']);
    expect(mergedSummary(pair, merged)).toBe(
      '「一樓淤泥清理」與「需要人幫忙清泥」合成一張（留下「需要人幫忙清泥」）。',
    );
  });

  it('falls back to a plain line without titles', () => {
    const pair = fixture();
    for (const side of ['low', 'high'] as const) {
      pair[side].ticket_title = null;
      pair[side].title = null;
    }
    expect(mergedSummary(pair, event(null, null))).toBe('兩張任務單合成一張。');
  });
});

describe('outcomeOf', () => {
  it('tells a merge from a plain 確認重複 by its merged event', () => {
    expect(outcomeOf({ status: 'suggested' })).toBe('pending');
    expect(outcomeOf({ status: 'not_duplicate' })).toBe('separate');
    expect(outcomeOf({ status: 'confirmed_duplicate', events: [] })).toBe(
      'confirmed',
    );
    expect(
      outcomeOf({
        status: 'confirmed_duplicate',
        events: [
          {
            uuid: 'e',
            event_type: 'merged',
            actor_uuid: null,
            source_layer: 'manual',
            decision_reason: null,
            engine_version: null,
            before_state: null,
            after_state: null,
            created_at: '2026-10-10T09:00:00Z',
          },
        ],
      }),
    ).toBe('merged');
  });
});

describe('the merge preview (DUP-BE-413)', () => {
  it('tags a row by the ticket it came from, only where the two differ, and 已修改 where typed over', () => {
    const pair = fixture();
    const fields = ticketFields(pair, labels);
    const plan = defaultPlan(pair, fields);
    // High is A and kept, so its title is the one used.
    expect(previewTag(fieldOf2(fields, 'ticket:title'), plan)).toBe('high');
    // Both say flood: nothing to tell apart.
    expect(previewTag(fieldOf2(fields, 'ticket:disaster_types'), plan)).toBe(
      null,
    );
    plan.picks['ticket:priority'] = 'low';
    expect(previewTag(fieldOf2(fields, 'ticket:priority'), plan)).toBe('low');
    plan.edits['ticket:title'] = '一樓淤泥清理，需要人力';
    expect(previewTag(fieldOf2(fields, 'ticket:title'), plan)).toBe('edited');
    // Typed back to what was picked: not an edit.
    plan.edits['ticket:title'] = '一樓淤泥清理';
    expect(previewTag(fieldOf2(fields, 'ticket:title'), plan)).toBe('high');
  });

  it('lists under the card only what the card cannot show', () => {
    const pair = fixture();
    const fields = ticketFields(pair, labels);
    const plan = defaultPlan(pair, fields);
    // k-both is on both duplicate needs: 3 people, not 4.
    expect(mergeAfterLines(pair, plan)).toEqual([
      '3 位已承接的志工繼續承接，會收到通知',
      '通知兩邊開單的人',
    ]);

    const water = both(pair).low.tasks[1];
    water.claim_count = 1;
    water.claimant_keys = ['k-w'];
    plan.needOff['L-water'] = true;
    plan.photoOff['L-ph'] = true;
    expect(mergeAfterLines(pair, plan)).toEqual([
      '沒勾的需求取消：「飲用水」',
      '3 位已承接的志工繼續承接，會收到通知',
      '1 位志工承接的需求取消了，會收到通知',
      '1 張照片不要',
      '通知兩邊開單的人',
    ]);
  });
});
