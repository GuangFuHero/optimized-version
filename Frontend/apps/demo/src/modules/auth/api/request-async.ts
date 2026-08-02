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

    throw new Error(detail);
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
