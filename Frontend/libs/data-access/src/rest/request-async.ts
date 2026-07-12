import parseJsonResponseAsync from './parse-json-response-async';

interface RequestOptions {
  accessToken?: string;
  body?: BodyInit | null;
  headers?: HeadersInit;
  method?: string;
}

async function requestAsync<T>(
  input: string,
  { accessToken, body, headers, method = 'GET' }: RequestOptions = {},
) {
  const resolvedHeaders = new Headers(headers);

  if (accessToken) {
    resolvedHeaders.set('Authorization', `Bearer ${accessToken}`);
  }

  const response = await fetch(input, {
    method,
    headers: resolvedHeaders,
    body,
  });

  return parseJsonResponseAsync<T>(response);
}

export async function requestJsonAsync<T>(
  input: string,
  options: Omit<RequestOptions, 'body' | 'headers'> & {
    body?: unknown;
    headers?: HeadersInit;
  } = {},
) {
  const headers = new Headers(options.headers);

  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  return requestAsync<T>(input, {
    ...options,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

export async function requestFormAsync<T>(
  input: string,
  body: URLSearchParams,
  options: Omit<RequestOptions, 'body' | 'headers'> & {
    headers?: HeadersInit;
  } = {},
) {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/x-www-form-urlencoded');

  return requestAsync<T>(input, {
    ...options,
    headers,
    body,
  });
}

export default requestAsync;
