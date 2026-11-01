import { describe, expect, it } from 'vitest';

import type {
  DuplicatePairDetail,
  TaskForReview,
  TicketForReview,
} from '@rescue-frontend/data-access/admin';

import {
  addressText,
  byLatestCreated,
  defaultPlan,
  defaultPrimary,
  headcount,
  gapText,
  mergeProblems,
  orderedSides,
  outcomeOf,
  pairSignals,
  parseContact,
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

  it('lists only rows one side filled, and names the empty ones', () => {
    const fields = ticketFields(fixture(), labels);
    const ids = fields.ticket.map((f) => f.id);
    expect(ids).toContain('ticket:description');
    expect(ids).toContain('ticket:contact');
    expect(fields.empty).toContain('有人受困');
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

describe('the address row', () => {
  const place = (full_address: string, room: string | null = null) => ({
    location_type: 'address',
    full_address,
    building_section: null,
    floor: null,
    room,
    pole_id: null,
  });

  it('reads the address down to the room, or the pole', () => {
    expect(addressText(place('光復鄉大進街12號', '2室'))).toBe(
      '光復鄉大進街12號 2室',
    );
    expect(addressText({ ...place(''), pole_id: 'P-12' })).toBe('P-12');
    expect(addressText(null)).toBeNull();
  });

  it('keeps the ticket whose address was picked, and moves no other row', () => {
    const pair = fixture();
    both(pair).low.location = place('光復鄉大進街12號');
    both(pair).high.location = place('光復鄉大進街14號');
    const fields = ticketFields(pair, labels);
    const plan = defaultPlan(pair, fields);
    const picks = { ...plan.picks };
    expect(plan.primary).toBe('high');
    expect(fieldOf2(fields, 'ticket:location').label).toBe('地址');
    expect(resultValue(fieldOf2(fields, 'ticket:location'), plan)).toBe(
      '光復鄉大進街14號',
    );
    const next = { ...plan, primary: 'low' as const };
    expect(next.picks).toEqual(picks);
    expect(resultValue(fieldOf2(fields, 'ticket:location'), next)).toBe(
      '光復鄉大進街12號',
    );
    expect(resolveRequest(pair, fields, next, '').primary).toBe('low');
  });

  it('drops the row when neither ticket has an address', () => {
    const fields = ticketFields(fixture(), labels);
    expect(fields.ticket.map((f) => f.id)).not.toContain('ticket:location');
    expect(fields.empty).toContain('地址');
  });
});

describe('the one 聯絡人 row', () => {
  it('splits back into name, phone and email', () => {
    expect(parseContact('陳太太 0921-000-771 a@b.c')).toEqual({
      contact_name: '陳太太',
      contact_phone: '0921-000-771',
      contact_email: 'a@b.c',
    });
    expect(parseContact('村長室')).toEqual({
      contact_name: '村長室',
      contact_phone: null,
      contact_email: null,
    });
  });

  it('sends the picked side as three columns, and what was typed over', () => {
    const pair = fixture();
    const fields = ticketFields(pair, labels);
    const plan = defaultPlan(pair, fields);
    expect(fieldOf2(fields, 'ticket:contact').read('low')).toBe(
      '陳太太 0921000771',
    );
    plan.picks['ticket:contact'] = 'low';
    expect(resolveRequest(pair, fields, plan, '').ticket).toEqual({
      contact_name: '陳太太',
      contact_phone: '0921000771',
    });
    plan.edits['ticket:contact'] = '林小姐';
    expect(resolveRequest(pair, fields, plan, '').ticket).toEqual({
      contact_name: '林小姐',
      contact_phone: null,
    });
    plan.edits['ticket:contact'] = '0921000771';
    expect(mergeProblems(pair, fields, plan)).toContainEqual({
      field: 'ticket:contact',
      message: '聯絡人不能空白',
    });
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

  it('asks for a quantity except on a rescue need', () => {
    const pair = fixture();
    const fields = ticketFields(pair, labels);
    const plan = defaultPlan(pair, fields);
    plan.edits['task:quantity'] = '';
    expect(mergeProblems(pair, fields, plan)).toEqual([
      { field: 'task:quantity', message: '請填數量' },
    ]);
    for (const t of Object.values(both(pair))) t.tasks[0].task_type = 'rescue';
    expect(mergeProblems(pair, ticketFields(pair, labels), plan)).toEqual([]);
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
