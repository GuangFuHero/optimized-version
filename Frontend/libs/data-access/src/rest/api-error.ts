/**
 * Error carrying the upstream HTTP status and the backend's stable error code.
 *
 * Branch on `code`. The `message` is the backend's English prose — matching on it couples the UI to
 * backend copy, so a reworded detail would silently stop matching instead of failing loudly.
 * `code` is undefined for failures raised before the backend could classify them (network, gateway).
 */
class ApiError extends Error {
  readonly status: number;

  readonly code: string | undefined;

  constructor(status: number, detail: string, code?: string) {
    super(detail);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export default ApiError;
