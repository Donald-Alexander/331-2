import { VccMsg } from './VccMsg';

function onmessage(this: VccWebSocket, wsMessage: MessageEvent) {
  let msg = null;
  try {
    msg = VccMsg.parse(wsMessage.data);

    // 'onrecv' is a dev hook to get notified of incoming messages
    if (typeof this.onrecv === 'function') {
      this.onrecv(msg);
    }
  } catch (e) {
    return;
  }

  if (typeof this.onmessage === 'function') {
    try {
      this.onmessage(msg);
    } catch (e) {
      // error in message handler
    }
  }
}

function onclose(this: VccWebSocket, event: CloseEvent) {
  if (typeof this.onclose === 'function') {
    try {
      this.onclose(event);
    } catch (e) {
      // error in message handler
    }
  }
}

function onerror(this: VccWebSocket, error: Event) {
  if (typeof this.onerror === 'function') {
    try {
      this.onerror(error);
    } catch (e) {
      // error in message handler
    }
  }
}

/** IWebSocket is an interface for the lower level WebSocket implementation.
 * By using an interface, it allows us to inject our own implementation.
 * For example, to do automated unit testing.
 */

export interface IWebSocket {
  onmessage?: ((event: MessageEvent) => any) | null;
  onclose?: ((event: CloseEvent) => any) | null;
  onerror?: ((event: Event) => any) | null;
  send(data: any): any;
  close(): any;
}

export class VccWebSocket {
  ws: IWebSocket;
  onmessage?: (msg: VccMsg) => any;
  onclose?: (event: CloseEvent) => any;
  onerror?: (event: Event) => any;

  /** 'onsend' is a dev hook to get notified of outgoing messages  */
  onsend?: (msg: VccMsg) => any;
  /** 'onrecv' is a dev hook to get notified of incoming messages  */
  onrecv?: (msg: VccMsg) => any;

  /** convenience function to connect using WebSocket */
  static connect(url: string, protocols?: string | string[]): Promise<VccWebSocket> {
    const promise = new Promise<VccWebSocket>((resolve, reject) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(url, protocols);
      } catch (e) {
        reject(e);
        return;
      }

      ws.onopen = () => {
        ws.onclose = null;
        ws.onerror = null;

        resolve(new VccWebSocket(ws));
      };

      ws.onclose = (event) => {
        reject(event.reason);
      };

      ws.onerror = (event: Event) => {
        reject((event as ErrorEvent).message);
      };
    });

    return promise;
  }

  constructor(ws: IWebSocket) {
    this.ws = ws;
    this.ws.onmessage = onmessage.bind(this);
    this.ws.onclose = onclose.bind(this);
    this.ws.onerror = onerror.bind(this);
  }

  send(msg: VccMsg) {
    // 'onsend' is a dev hook to get notified of outgoing messages
    if (typeof this.onsend === 'function') {
      try {
        this.onsend(msg);
      } catch (e) {
        // prevent exception from bubbling up
      }
    }

    this.ws.send(msg.toString());
  }
}

export { VccWebSocket as default };
