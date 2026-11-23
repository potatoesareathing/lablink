/** Error carrying an HTTP status and a stable machine-readable code. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const notFound = (what: string) => new HttpError(404, 'not_found', `${what} not found`);
export const forbidden = () =>
  new HttpError(403, 'forbidden', 'You do not have access to this action');
export const unauthorized = () => new HttpError(401, 'unauthorized', 'Sign in to continue');
