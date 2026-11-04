export class DomainError extends Error {
  constructor(code, message, status = 400) { super(message); this.name = 'DomainError'; this.code = code; this.status = status; }
}
