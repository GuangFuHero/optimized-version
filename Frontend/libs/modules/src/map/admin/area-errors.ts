// SPDX-License-Identifier: GPL-3.0-only
// What the backend says when it refuses an area (Backend/app/services/area.py, authz.py), in the words
// an admin reads. A message not listed here is shown as the backend gave it.
const AREA_ERROR_MESSAGES: readonly [needle: string, message: string][] = [
  ['A team zone needs a team', '責任區至少要有一個團隊'],
  ['needs a status', '危險區需要狀態'],
  ['Only gov teams may draw', '只有政府團隊可以劃設區域'],
  ['must be Polygon or MultiPolygon', '區域範圍必須是一個封閉的多邊形'],
  ['is always public', '危險區和責任區不能改成只給後台看'],
  ['Team is not active', '這個團隊已停用，不能指派'],
  ['Team not found', '找不到這個團隊'],
  ['Team zone not found', '找不到這個責任區，可能已經被刪除'],
  ['Area not found', '找不到這個區域，可能已經被刪除'],
  ['Permission Denied', '你沒有權限變更這個區域'],
  ['Not Found', '找不到這個區域，或你沒有權限變更'],
  ['is not assigned to this team zone', '這個團隊沒有被指派到這個責任區'],
  [
    'A team zone needs at least one team',
    '責任區至少要有一個團隊，要移除最後一個請直接刪除這個責任區',
  ],
];

export function knownAreaErrorMessage(cause: unknown): string | undefined {
  const raw = cause instanceof Error ? cause.message : String(cause);
  return AREA_ERROR_MESSAGES.find(([needle]) => raw.includes(needle))?.[1];
}

export function areaErrorMessage(cause: unknown, fallback?: string): string {
  const raw = cause instanceof Error ? cause.message : String(cause);
  return (
    knownAreaErrorMessage(cause) ??
    fallback ??
    raw.replace(/^\[GraphQL\]\s*/, '')
  );
}
