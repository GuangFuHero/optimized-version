const DEFAULT_API_BASE_URL = 'http://localhost:8000/api';

function normalizeApiBaseUrl(url: string) {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

export function getBackendApiBaseUrl() {
  return normalizeApiBaseUrl(
    process.env.API_BASE_URL ??
      process.env.NEXT_PUBLIC_API_BASE_URL ??
      DEFAULT_API_BASE_URL,
  );
}

/** Where the backend's `/api` and `/graphql` both live: the generated paths start with `/api`. */
export function getBackendOrigin() {
  return getBackendApiBaseUrl().replace(/\/api$/, '');
}

/** `GRAPHQL_URL`, or the backend's `/graphql` beside its `/api`. */
export function getBackendGraphqlUrl() {
  return (
    process.env.GRAPHQL_URL ??
    process.env.NEXT_PUBLIC_GRAPHQL_URL ??
    `${getBackendOrigin()}/graphql`
  );
}
