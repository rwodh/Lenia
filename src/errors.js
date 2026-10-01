/**
 * Error with a message that is safe to show to end users.
 * `code` is a stable identifier; `detail` holds technical info (e.g. a shader log).
 */
export class LeniaError extends Error {
  constructor(code, userMessage, { detail = '', cause } = {}) {
    super(userMessage, cause ? { cause } : undefined);
    this.name = 'LeniaError';
    this.code = code;
    this.userMessage = userMessage;
    this.detail = detail;
  }
}
