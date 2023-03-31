export class VccError extends Error {
  err: string;

  constructor(err?: string, message?: string) {
    super(message);
    this.err = err || '';
  }
}

export default VccError;
