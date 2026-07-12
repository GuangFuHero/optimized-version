const DEFAULT_API_BASE_URL = 'http://localhost:8000/api';

function normalizeApiBaseUrl(url: string) {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

export function getBackendApiBaseUrl() {
  return normalizeApiBaseUrl(
    process.env.NEXT_PUBLIC_API_BASE_URL ??
      process.env.API_BASE_URL ??
      DEFAULT_API_BASE_URL,
  );
}
