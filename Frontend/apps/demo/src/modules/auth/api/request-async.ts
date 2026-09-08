/**
 * Error carrying the BFF response status and the backend's stable error code.
 *
 * Branch on `code`. The `message` is backend English prose — matching on it would couple this UI to
 * backend copy. `code` is undefined when the failure never reached the backend (network, gateway).
 */
export class AuthRequestError extends Error {
  readonly status: number;

  readonly code: string | undefined;

  constructor(status: number, detail: string, code?: string) {
    super(detail);
    this.name = 'AuthRequestError';
    this.status = status;
    this.code = code;
  }
}

async function parseFrontendResponseAsync<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail = '請求失敗';
    let code: string | undefined;

    try {
      const data = await response.json();

      if (typeof data?.detail === 'string') {
        detail = data.detail;
      }

      if (typeof data?.code === 'string') {
        code = data.code;
      }
    } catch {
      // Ignore malformed JSON error payloads.
    }

    throw new AuthRequestError(response.status, detail, code);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function requestFrontendJsonAsync<T>(
  input: string,
  init?: RequestInit,
) {
  const response = await fetch(input, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  return parseFrontendResponseAsync<T>(response);
}
