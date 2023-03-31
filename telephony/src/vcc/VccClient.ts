import { VccWebSocket } from './VccWebSocket';
import { VccMsg } from './VccMsg';

function onmessage(this: VccClient, msg: VccMsg) {
  try {
    if (msg) {
      if (msg.res) {
        if (msg.res.id) {
          const pendingReq = this.pendingReqs.get(msg.res.id);
          if (pendingReq) {
            pendingReq(msg);
            this.pendingReqs.delete(msg.res.id);
          }
          if (typeof this.onresponse === 'function') {
            this.onresponse(msg);
          }
        }
      } else if (msg.evt) {
        if (msg.evt.path) {
          this.dispatchEvent(new CustomEvent(msg.evt.path, { detail: msg }));
        }

        if (typeof this.onevent === 'function') {
          this.onevent(msg);
        }
      } else if (msg.ctl) {
        if (typeof this.oncontrol === 'function') {
          this.oncontrol(msg);
        }
      } else {
        // unsupported message type
      }
    }
  } catch (e) {
    // exception from one of the message handlers
  }
}

function onclose(this: VccClient, event: CloseEvent) {
  if (typeof this.onclose === 'function') {
    this.onclose(event);
  }
}

export class VccClient extends EventTarget {
  webSocket: VccWebSocket;
  pendingReqs: Map<string, (responseMsg: VccMsg) => any>;
  reqIdBase: string;
  reqIdSeq: number;
  reqTimeout: number;
  onevent?: (msg: VccMsg) => any;
  onresponse?: (msg: VccMsg) => any;
  oncontrol?: (msg: VccMsg) => any;
  onclose?: (event: CloseEvent) => any;

  constructor(vccWebSocket: VccWebSocket) {
    super();
    this.webSocket = vccWebSocket;
    this.webSocket.onmessage = onmessage.bind(this);
    this.webSocket.onclose = onclose.bind(this);
    this.pendingReqs = new Map();
    this.reqIdBase = (0x100000 + Math.floor(Math.random() * Math.floor(0xf00000))).toString(16);
    this.reqIdSeq = 0;
    this.reqTimeout = 2000;
  }

  static async connect(url: string, protocol?: string | string[]) {
    const webSocket = await VccWebSocket.connect(url, protocol);

    return new VccClient(webSocket);
  }

  nextReqId() {
    this.reqIdSeq += 1;
    return `${this.reqIdBase}-${this.reqIdSeq.toString(16)}`;
  }

  request(resource: VccMsg, timeout: number): Promise<VccMsg> {
    // validate and normalize request message
    if (!resource.req || !resource.req.path) {
      throw new Error('Invalid request object. No path to resource provided');
    }

    const msg = new VccMsg(resource);
    const reqId = resource.req.id || this.nextReqId();

    msg.req = {
      id: reqId,
      method: resource.req.method || resource.req.body ? 'POST' : 'GET',
      path: resource.req.path,
      query: resource.req.query,
      body: resource.req.body,
    };

    // make async request
    const promise = new Promise<VccMsg>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingReqs.delete(reqId);
        reject(new Error(`timeout waiting for response to request ${reqId}`));
      }, timeout || this.reqTimeout);

      this.pendingReqs.set(reqId, (responseMsg: VccMsg) => {
        clearTimeout(timeoutId);
        resolve(responseMsg);
      });

      try {
        this.webSocket.send(msg);
      } catch (e) {
        clearTimeout(timeoutId);
        if (reqId) {
          this.pendingReqs.delete(reqId);
        }
        reject(e);
      }
    });

    return promise;
  }

  sendControlMsg(controlMsg: VccMsg): void {
    // validate and normalize control message
    if (!controlMsg.ctl || !controlMsg.ctl.path) {
      throw new Error('Invalid control message object. No path to control message type provided');
    }

    const msg = new VccMsg(controlMsg);

    msg.ctl = {
      path: controlMsg.ctl.path,
      query: controlMsg.ctl.query,
      body: controlMsg.ctl.body,
    };

    this.webSocket.send(msg);
  }
}

export { VccClient as default };
