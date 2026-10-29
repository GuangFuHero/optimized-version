import type { components } from '@rescue-frontend/data-access/openapi';

import { formatTaiwanDateTime } from '../../../../time';
import { getOperationalStatusMeta } from '../../../operational-status';
import { getStationTypeLabel } from '../../../type-options';

type Suspect = components['schemas']['SuspectedRowResponse'];

/**
 * The suspected rows to file anyway, by line: the station each looked like when the importer chose.
 * A line left out is not created (ADR-398), which is what an undecided row means too.
 */
export type FiledRows = Readonly<Record<number, string>>;

/**
 * The choices that still hold after a new preview: a line keeps 仍要建立 only while it looks like the
 * same station. The backend files a row only when its decision names the suspect it finds now
 * (ADR-400), so a choice made about another station would be held anyway.
 */
export function keepFiled(
  filed: FiledRows,
  suspects: readonly Suspect[],
): FiledRows {
  const kept: Record<number, string> = {};
  for (const suspect of suspects) {
    if (filed[suspect.line] === suspect.related_uuid) {
      kept[suspect.line] = suspect.related_uuid;
    }
  }
  return kept;
}

/**
 * A suspected row as the importer is shown it, side by side: the name the file gives the row, and
 * the station it looks like — name, type and status, distance, and when it was made (uiux
 * 2026-10-27, Q4). No similarity: the backend gives none. A part the backend could not fill is null
 * and left out.
 */
export function describeSuspect(suspect: Suspect): {
  row: string | null;
  title: string;
  kind: string;
  distance: string | null;
  created: string | null;
} {
  const status = suspect.status
    ? getOperationalStatusMeta(suspect.status).label
    : null;
  const created = formatTaiwanDateTime(suspect.created_at);
  return {
    row: suspect.row_title || null,
    title: suspect.title || '（沒有名稱）',
    kind: [getStationTypeLabel(suspect.type), status]
      .filter(Boolean)
      .join('・'),
    distance: distanceLabel(suspect.distance_m),
    created: created ? `${created} 建立` : null,
  };
}

function distanceLabel(metres: number | null): string | null {
  if (metres === null) return null;
  return metres < 1000
    ? `相距 ${metres} 公尺`
    : `相距 ${(metres / 1000).toFixed(1)} 公里`;
}

/** 全部仍要建立: every suspected row filed against the station it looks like. */
export function fileAll(suspects: readonly Suspect[]): FiledRows {
  return Object.fromEntries(suspects.map((s) => [s.line, s.related_uuid]));
}

/**
 * The lines filed anyway that the commit held all the same. A decision counts only for the station
 * the commit finds for its line (ADR-400); one that came back held looked like another station by
 * then, which the commit's own `suspects` names.
 */
export function heldThoughFiled(
  filed: FiledRows,
  held: readonly Suspect[],
): ReadonlySet<number> {
  return new Set(held.filter((s) => s.line in filed).map((s) => s.line));
}

/**
 * The commit's `decisions` form field: `[{line, acknowledged_duplicate_of}]`, the same meaning as
 * `acknowledgedDuplicateOf` on a single create. Undefined when no row is filed anyway, so the form
 * leaves it out.
 */
export function decisionsField(filed: FiledRows): string | undefined {
  const decisions = Object.entries(filed)
    .map(([line, uuid]) => ({
      line: Number(line),
      acknowledged_duplicate_of: uuid,
    }))
    .sort((a, b) => a.line - b.line);
  return decisions.length > 0 ? JSON.stringify(decisions) : undefined;
}

/**
 * The commit's `declined` form field: the suspected rows not filed anyway, as a JSON array of
 * lines. Undecided rows are in it too, as undecided means not created (uiux 2026-10-27, Q6). The
 * backend then creates none of them even when its check gives no answer at commit (ADR-398).
 * Undefined when every suspected row is filed anyway, so the form leaves it out.
 */
export function declinedField(
  suspects: readonly Suspect[],
  filed: FiledRows,
): string | undefined {
  const lines = suspects
    .map((s) => s.line)
    .filter((line) => !(line in filed))
    .sort((a, b) => a - b);
  return lines.length > 0 ? JSON.stringify(lines) : undefined;
}

/** How long after one press a second counts as the same gesture: a double click, a held key. */
const CHOICE_SETTLE_MS = 400;

/**
 * Whether a press on 不建立／仍要建立 counts, given when it happened. A choice moves the card on to
 * the next row under the same buttons, so a double click or a held Enter would decide a row the
 * importer never saw. Every press restarts the wait, taken or not, so a held key decides one row
 * however long it is held.
 */
export function choiceGate(
  settleMs = CHOICE_SETTLE_MS,
): (now: number) => boolean {
  let last = Number.NEGATIVE_INFINITY;
  return (now) => {
    const accepted = now - last >= settleMs;
    last = now;
    return accepted;
  };
}
