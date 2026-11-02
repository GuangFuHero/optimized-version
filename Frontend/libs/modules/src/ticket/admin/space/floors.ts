/**
 * A space's floors (BE-036, 開啟空間). The backend derives them from the floor counts — RF, nF…1F,
 * B1…Bn, roof first — and a ticket's floor is free text, so the screen orders the labels itself and
 * reads a ticket's floor against them (designer, `Design/後台/js/admin/ticket/tk-space.jsx` `floorOf`).
 */

const BASEMENT = /^B(\d+)$/;
const ABOVE = /^(\d+)F$/;

/**
 * Where a label sits, smallest number on top (designer, 2026-09-12): the deepest basement first,
 * then 1F up, RF last. Anything else keeps its place after them.
 */
function floorRank(label: string): number {
  const basement = BASEMENT.exec(label);
  if (basement) return -Number(basement[1]);
  const above = ABOVE.exec(label);
  if (above) return Number(above[1]);
  return label === 'RF' ? 10_000 : 20_000;
}

export function orderFloors(labels: readonly string[]): string[] {
  return labels
    .map((label, index) => ({ label, index, rank: floorRank(label) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ label }) => label);
}

/** The labels the backend will derive from the counts, in screen order. Every building has RF. */
export function floorLabelsFor(above: number, below: number): string[] {
  const labels: string[] = [];
  for (let floor = below; floor >= 1; floor--) labels.push(`B${floor}`);
  for (let floor = 1; floor <= above; floor++) labels.push(`${floor}F`);
  labels.push('RF');
  return labels;
}

/**
 * A ticket's floor as one of the building's labels: 「3」「3F」「3樓」 are 3F, 「B1」「地下1」 are
 * B1, 「頂樓」「屋頂」「R」 are RF. Full-width digits read as their ASCII ones. A floor the building
 * doesn't have, or text that isn't a floor, gives no label but keeps what was written.
 */
export function matchFloor(
  raw: string | null | undefined,
  labels: readonly string[],
): { floor: string | null; raw: string } {
  const written = (raw ?? '').trim();
  if (!written) return { floor: null, raw: '' };

  const text = written.normalize('NFKC').replace(/\s|樓/g, '').toUpperCase();
  let label: string | null = null;
  const basement = /^(?:B|地下)(\d+)F?$/.exec(text);
  const above = /^(\d+)F?$/.exec(text);
  if (/^(?:頂|屋頂|R|RF)$/.test(text)) label = 'RF';
  else if (basement) label = `B${Number(basement[1])}`;
  else if (above) label = `${Number(above[1])}F`;

  return {
    floor: label && labels.includes(label) ? label : null,
    raw: written,
  };
}

function run(labels: readonly string[]): string | null {
  if (!labels.length) return null;
  return labels.length > 1
    ? `${labels[0]}～${labels[labels.length - 1]}`
    : labels[0];
}

/** The floors in a few words: 「B1、1F～12F、RF（共 14 層）」. */
export function floorSummary(labels: readonly string[]): string {
  const ordered = orderFloors(labels);
  const parts = [
    run(ordered.filter((label) => BASEMENT.test(label))),
    run(ordered.filter((label) => ABOVE.test(label))),
    ordered.includes('RF') ? 'RF' : null,
  ].filter((part): part is string => part !== null);
  return `${parts.join('、')}（共 ${labels.length} 層）`;
}
