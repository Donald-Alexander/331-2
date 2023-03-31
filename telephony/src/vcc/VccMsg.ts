// internal type for serialized message format
interface SerMsg {
  node?: number;
  req?: [string, string, string, any, any];
  res?: [string, string, string, any];
  evt?: [string, any, any];
  ctl?: [string, any, any];
}

export class VccMsg {
  node?: number;
  req?: { id?: string; method?: string; path: string; query?: any; body?: any };
  res?: { id: string; status: string; reason: string; body?: any };
  evt?: { path: string; query?: any; body?: any };
  ctl?: { path: string; query?: any; body?: any };

  constructor(msg?: VccMsg) {
    if (msg) {
      Object.assign(this, msg);
    }
  }

  toString(this: VccMsg) {
    const ser: SerMsg = { node: this.node };

    if (this.req) {
      ser.req = [
        this.req.id || '',
        this.req.method || '',
        this.req.path || '',
        this.req.query || {},
        this.req.body || {},
      ];
    }

    if (this.res) {
      ser.res = [this.res.id || '', this.res.status || '', this.res.reason || '', this.res.body || {}];
    }

    if (this.evt) {
      ser.evt = [this.evt.path || '', this.evt.query || {}, this.evt.body || {}];
    }

    if (this.ctl) {
      ser.ctl = [this.ctl.path || '', this.ctl.query || {}, this.ctl.body || {}];
    }

    return JSON.stringify(ser);
  }

  static parse(message: string): VccMsg {
    const ser: SerMsg = JSON.parse(message);
    const vccMsg = new VccMsg({ node: ser.node });

    if (ser.req) {
      if (!Array.isArray(ser.req) || ser.req.length !== 5) {
        throw new SyntaxError("Bad VCC message. property 'req' is not an array of length 5");
      } else {
        vccMsg.req = {
          id: ser.req[0],
          method: ser.req[1],
          path: ser.req[2],
          query: ser.req[3],
          body: ser.req[4],
        };
      }
    }

    if (ser.res) {
      if (!Array.isArray(ser.res) || ser.res.length !== 4) {
        throw new SyntaxError("Bad VCC message. property 'res' is not an array of length 4");
      } else {
        vccMsg.res = {
          id: ser.res[0],
          status: ser.res[1],
          reason: ser.res[2],
          body: ser.res[3],
        };
      }
    }

    if (ser.evt) {
      if (!Array.isArray(ser.evt) || ser.evt.length !== 3) {
        throw new SyntaxError("Bad VCC message. property 'evt' is not an array of length 3");
      } else {
        vccMsg.evt = {
          path: ser.evt[0],
          query: ser.evt[1],
          body: ser.evt[2],
        };
      }
    }

    if (ser.ctl) {
      if (!Array.isArray(ser.ctl) || ser.ctl.length !== 3) {
        throw new SyntaxError("Bad VCC message. property 'ctl' is not an array of length 3");
      } else {
        vccMsg.ctl = {
          path: ser.ctl[0],
          query: ser.ctl[1],
          body: ser.ctl[2],
        };
      }
    }

    return vccMsg;
  }
}

export { VccMsg as default };
