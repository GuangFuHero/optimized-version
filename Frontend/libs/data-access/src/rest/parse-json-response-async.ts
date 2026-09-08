import ApiError from './api-error';

async function parseJsonResponseAsync<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail = '請求失敗';
    let code: string | undefined;
    try {
      const data = await response.json();

      if (typeof data?.code === 'string') {
        code = data.code;
      }

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
    throw new ApiError(response.status, detail, code);
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
