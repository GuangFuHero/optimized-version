/**
 * Urql Client 工廠
 *
 * 建立並回傳 Urql Client 實例。
 * 支援跨 environment 的 GraphQL endpoint 解析與選擇性認證 header 注入。
 */
import type { ClientOptions, Exchange } from 'urql';
import { Client, fetchExchange } from 'urql';
import { graphCache } from './cache';

const DEFAULT_API_BASE_URL = 'http://localhost:8000/api';
const DEFAULT_GRAPHQL_URL = 'http://localhost:8000/graphql';

export type UrqlRuntime = 'client' | 'server';

function resolveRuntime(runtime?: UrqlRuntime): UrqlRuntime {
  if (runtime) {
    return runtime;
  }

  return typeof window === 'undefined' ? 'server' : 'client';
}

function deriveGraphqlUrl(apiBaseUrl: string): string {
  try {
    const url = new URL(apiBaseUrl);
    url.pathname = url.pathname.replace(/\/api\/?$/, '/graphql');

    if (url.pathname === '' || url.pathname === '/') {
      url.pathname = '/graphql';
    }

    return url.toString();
  } catch {
    return apiBaseUrl.replace(/\/api\/?$/, '/graphql') || DEFAULT_GRAPHQL_URL;
  }
}

function normalizeHeaders(headers?: HeadersInit): Record<string, string> {
  if (!headers) {
    return {};
  }

  if (headers instanceof Headers) {
    const normalizedHeaders: Record<string, string> = {};

    headers.forEach((value, key) => {
      normalizedHeaders[key] = value;
    });

    return normalizedHeaders;
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  return Object.entries(headers).reduce<Record<string, string>>(
    (acc, [key, value]) => {
      if (value !== undefined) {
        acc[key] = String(value);
      }

      return acc;
    },
    {},
  );
}

export function resolveGraphqlUrl(runtime?: UrqlRuntime): string {
  const resolvedRuntime = resolveRuntime(runtime);
  const configuredGraphqlUrl =
    resolvedRuntime === 'server'
      ? (process.env.GRAPHQL_URL ?? process.env.NEXT_PUBLIC_GRAPHQL_URL)
      : process.env.NEXT_PUBLIC_GRAPHQL_URL;

  if (configuredGraphqlUrl) {
    return configuredGraphqlUrl;
  }

  const apiBaseUrl =
    process.env.API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    DEFAULT_API_BASE_URL;

  return deriveGraphqlUrl(apiBaseUrl);
}

export function createUrqlExchanges(...exchanges: Exchange[]): Exchange[] {
  return [graphCache, ...exchanges, fetchExchange];
}

export interface UrqlClientOptions {
  /** GraphQL Endpoint URL */
  url?: string;
  /** 指定 client 目前運行於 browser 或 server。 */
  runtime?: UrqlRuntime;
  /** 直接帶入 token；優先級高於 getToken。 */
  authToken?: string;
  /**
   * 取得 JWT token 的函式（動態，每次 request 都會呼叫）。
   * 回傳 undefined 時不帶 Authorization header（公開查詢）。
   */
  getToken?: () => string | undefined;
  /** 額外要帶入 fetch 的 request headers。 */
  headers?: HeadersInit;
  /** 自訂 exchanges，預設會使用 graphCache + fetchExchange。 */
  exchanges?: Exchange[];
  /** 額外 fetchOptions。server-side 預設會補上 no-store。 */
  fetchOptions?: RequestInit;
  /** 指定 urql client 的 requestPolicy。 */
  requestPolicy?: ClientOptions['requestPolicy'];
  /** 指定是否啟用 suspense。 */
  suspense?: boolean;
}

export function createUrqlClient({
  url,
  runtime,
  authToken,
  getToken,
  headers,
  exchanges,
  fetchOptions,
  requestPolicy,
  suspense,
}: UrqlClientOptions): Client {
  const resolvedRuntime = resolveRuntime(runtime);

  return new Client({
    url: url ?? resolveGraphqlUrl(resolvedRuntime),
    exchanges: exchanges ?? createUrqlExchanges(),
    requestPolicy,
    suspense,
    fetchOptions: () => {
      const token = authToken ?? getToken?.();
      const mergedHeaders = normalizeHeaders(headers);

      if (token) {
        mergedHeaders['Authorization'] = token.startsWith('Bearer ')
          ? token
          : `Bearer ${token}`;
      }

      return {
        ...fetchOptions,
        cache:
          fetchOptions?.cache ??
          (resolvedRuntime === 'server' ? 'no-store' : undefined),
        headers: mergedHeaders,
      };
    },
  });
}
