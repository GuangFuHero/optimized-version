// What the backend says when it refuses an area (Backend/app/services/area.py, authz.py), in the words
// an admin reads. A message not listed here is shown as the backend gave it.
const AREA_ERROR_MESSAGES: readonly [needle: string, message: string][] = [
  ['A team zone needs a team', '責任區至少要有一個團隊'],
  ['needs a status', '危險區需要狀態'],
  ['Only gov teams may draw', '只有政府團隊可以劃設區域'],
  ['must be Polygon or MultiPolygon', '區域範圍必須是一個封閉的多邊形'],
  ['is always public', '危險區和責任區一律公開，不能隱藏'],
  ['Team is not active', '這個團隊已停用，不能指派'],
  ['Team not found', '找不到這個團隊'],
  ['Area not found', '找不到這個區域，可能已經被刪除'],
  ['Only a mark zone can be promoted', '只有標示區可以升為危險區'],
  ['is not assigned to this team zone', '這個團隊沒有被指派到這個責任區'],
  [
    'A team zone needs at least one team',
    '責任區至少要有一個團隊，要移除最後一個請直接刪除這個責任區',
  ],
];

export function areaErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const known = AREA_ERROR_MESSAGES.find(([needle]) => raw.includes(needle));

  return known ? known[1] : raw.replace(/^\[GraphQL\]\s*/, '');
}
