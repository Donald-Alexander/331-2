let baseContextId: number = Math.floor(Date.now() / 100) % 0x7fffffff;

export function nextContextId(): number {
  if (baseContextId === 0x7fffffff) {
    baseContextId = 1;
  } else {
    baseContextId++;
  }
  return baseContextId;
}

export class CtxId {
  private newCtxId: boolean;
  private ctxId: number;
  constructor() {
    this.newCtxId = true;
    this.ctxId = nextContextId();
  }

  public readCtxId(): number {
    return this.ctxId;
  }

  public getCtxId(): { ctxId: number; newCtxId: boolean } {
    if (this.newCtxId) {
      this.newCtxId = false;
      return { ctxId: this.ctxId, newCtxId: true };
    } else {
      return { ctxId: this.ctxId, newCtxId: false };
    }
  }
}
