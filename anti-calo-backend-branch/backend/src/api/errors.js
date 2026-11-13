export class HttpError extends Error {
  constructor(status, message, code = 'error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export const bad = (m, code = 'bad_request') => new HttpError(400, m, code);
export const unauthorized = (m) => new HttpError(401, m, 'unauthorized');
export const forbidden = (m) => new HttpError(403, m, 'forbidden');
export const notFound = (m) => new HttpError(404, m, 'not_found');
export const conflict = (m) => new HttpError(409, m, 'conflict');
