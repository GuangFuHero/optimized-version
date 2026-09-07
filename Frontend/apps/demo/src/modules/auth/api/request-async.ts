/**
 * A failed BFF call, carrying the status the BFF answered with.
 *
 * Mirrors `RequestError` in the data-access layer, and exists for the same reason: the
 * step-up flows turn on a 422 specifically ("code sent, call again with it"), which a plain
 * `Error` cannot express.
 */
export class FrontendRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'FrontendRequestError';
    this.status = status;
  }
}

/** True when the backend is asking for a step-up proof rather than reporting a mistake. */
export function isStepUpRequired(error: unknown) {
  return error instanceof FrontendRequestError && error.status === 422;
}

async function parseFrontendResponseAsync<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail = '請求失敗';

    try {
      const data = await response.json();

      if (typeof data?.detail === 'string') {
        detail = data.detail;
      }
    } catch {
      // Ignore malformed JSON error payloads.
    }

    throw new FrontendRequestError(detail, response.status);
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
