/**
 * Urql graphcache 設定
 *
 * 因後端使用 Connection 型分頁（StationConnection, TicketConnection 等），
 * 無法直接使用 urql 的 simplePagination helper（只支援直接回傳陣列的欄位）。
 * 改用自訂 connectionPagination resolver，效果等同 simplePagination。
 */
import { cacheExchange } from '@urql/exchange-graphcache';
import type { Resolver } from '@urql/exchange-graphcache';

/**
 * 通用 Connection 累積分頁 resolver
 *
 * 適用於後端回傳 `{ items: [...], pageInfo: {...} }` 結構的所有 paginated query。
 * 每次查詢新的 skip 值時，會將之前頁面的 items 自動合併累積。
 *
 * @param offsetArg - 分頁偏移量的 argument 名稱，預設 'skip'
 */
const connectionPagination =
  (offsetArg = 'skip'): Resolver =>
  (_parent, args, cache, info) => {
    const { parentKey: entityKey, fieldName } = info;

    const allFields = cache.inspectFields(entityKey);
    const fieldInfos = allFields.filter((f) => f.fieldName === fieldName);
    if (fieldInfos.length === 0) return undefined;

    const currentSkip = (args[offsetArg] as number) ?? 0;

    // 依 skip 排序，只合併到當前頁（累積模式）
    const sortedFields = [...fieldInfos].sort(
      (a, b) =>
        ((a.arguments?.[offsetArg] as number) ?? 0) -
        ((b.arguments?.[offsetArg] as number) ?? 0)
    );

    let mergedItems: unknown[] = [];
    let pageInfo: unknown = null;

    for (const field of sortedFields) {
      const fieldSkip = (field.arguments?.[offsetArg] as number) ?? 0;
      if (fieldSkip > currentSkip) break; // 只合併 ≤ 當前頁的資料

      const conn = cache.resolve(entityKey, field.fieldKey) as string;
      if (!conn) continue;

      const items = cache.resolve(conn, 'items') as unknown[];
      if (items?.length) mergedItems = [...mergedItems, ...items];
      pageInfo = cache.resolve(conn, 'pageInfo');
    }

    if (!mergedItems.length) return undefined;

    return {
      __typename: fieldName.charAt(0).toUpperCase() + fieldName.slice(1) + 'Connection',
      items: mergedItems,
      pageInfo,
    };
  };

/**
 * graphcache 設定
 *
 * 列舉所有使用 Connection 分頁的 Query 欄位。
 * 新增欄位時，在 resolvers.Query 加上對應的 connectionPagination() 即可。
 */
export const graphCache = cacheExchange({
  resolvers: {
    Query: {
      // Geo domain
      stations: connectionPagination('skip'),
      closureAreas: connectionPagination('skip'),

      // Tickets domain
      tickets: connectionPagination('skip'),
      ticketTasks: connectionPagination('skip'),
    },
  },
});
