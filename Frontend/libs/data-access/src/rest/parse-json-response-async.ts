/**
 * A failed backend call, carrying the status the backend actually answered with.
 *
 * A plain `Error` loses that, and the step-up flows need it: a 422 from `/auth/set-password`
 * or `/auth/contacts` means "here is your code, call again with it", which is a different
 * outcome from every other failure and cannot be told apart by message text alone.
 */
export class RequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'RequestError';
    this.status = status;
  }
}

async function parseJsonResponseAsync<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail = '請求失敗';
    try {
      const data = await response.json();

      if (typeof data?.detail === 'string') {
        detail = data.detail;
      } else if (Array.isArray(data?.detail) && data.detail.length > 0) {
        detail = data.detail
          .map((item: { msg?: unknown }) => item?.msg)
          .filter(
            (message: unknown): message is string => typeof message === 'string',
          )
          .join('、');
      }
    } catch {
      // Ignore JSON parse failures and keep fallback message.
    }
    throw new RequestError(detail, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentLength = response.headers.get('content-length');

  if (contentLength === '0') {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export default parseJsonResponseAsync;
