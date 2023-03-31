import { Diag } from '../common/diagClient';
const diag = new Diag('itrrclient.ws');

export class ItrrClientWS extends EventTarget {
  public readonly CONNECTING = WebSocket.CONNECTING;
  public readonly OPEN = WebSocket.OPEN;
  public readonly CLOSING = WebSocket.CLOSING;
  public readonly CLOSED = WebSocket.CLOSED;

  // Default settings
  private settings = {
    /** The maximum time in milliseconds to wait for a connection to succeed before closing and retrying. */
    timeoutInterval: 2000,

    /** The interval of the heartbeat */
    heartbeatInterval: 5000,

    /** The interval of the system information */
    systemInfoInterval: 5000,

    /** The maximum time to wait for a response to a sent command */
    responseTimeout: 2000,
  };

  private ws!: WebSocket;

  private readonly url: string;
  private readyState: number = WebSocket.CONNECTING;

  private forcedClose = false;

  private messageCallBack: Function | undefined;
  private heartbeatCallback: Function | undefined;
  private readyStateCallback: Function | undefined;
  private initCallback: Function | undefined;

  private connectTimer: number | undefined;
  private heartbeatTimer: number | undefined;

  constructor(url: string) {
    super();
    this.url = url;
    this.connectTimer = undefined;
    this.heartbeatTimer = undefined;
    this.heartbeat = this.heartbeat.bind(this);
  }

  public startHeatbeat() {
    // Send a first heatbeat
    if (this.heartbeat) {
      this.heartbeat();
      if (this.heartbeatTimer === undefined) {
        // Schedule heartbeat automation
        this.heartbeatTimer = window.setInterval(() => {
          this.heartbeat();
        }, this.settings.heartbeatInterval);
      }
    }
  }

  public async open(reconnectAttempt: boolean): Promise<boolean> {
    let result = false;
    diag.trace?.('open', `Attempt to connect to: ${this.url}`);

    await new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
      } catch (e) {
        reject(e);
      }

      this.connectTimer = window.setTimeout(() => {
        this.ws.close(1000, 'Timeout reached trying to connect to ItrrServ');
        reject(new Error('Connect timed out, url: ' + this.url));
      }, this.settings.timeoutInterval);

      this.ws.onopen = () => {
        diag.out('open', `Connected to: ${this.url}`);
        this.setReadyState(this.OPEN);
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          let parsedData = JSON.parse(event.data);
          if (parsedData.message === 'Socket is connected') {
            reconnectAttempt = false;
            diag.trace?.('open', `Received Socket is connected message`);
            resolve(true);
          } else {
            diag.warn('open', `Received connection message is not correct: ${parsedData.message}`);
            reject(new Error('Websocket connection message is not correct'));
          }
        } catch (e) {
          diag.warn('open', `Received connection message invalid: ${e.message}`);
          reject(new Error('Websocket connection message invalid'));
        }
      };

      this.ws.onclose = (event: CloseEvent) => {
        diag.trace?.('open', `Websocket is closed, reason: ${event.reason}`);
        reject(new Error('Websocket is closed, reason: ' + event.reason));
      };

      this.ws.onerror = (event: Event) => {
        diag.trace?.('open', `Websocket error`);
        reject(new Error('Websocket error!'));
      };
    })
      .then((value) => {
        if (this.connectTimer) {
          window.clearTimeout(this.connectTimer);
          this.connectTimer = undefined;
        }

        this.ws.onerror = this.onerror.bind(this);
        this.ws.onmessage = this.onmessage.bind(this);
        this.ws.onclose = this.onclose.bind(this);

        this.startHeatbeat();

        if (this.initCallback) {
          // Trigger configuration message
          this.initCallback();
        }

        result = true;
      })
      .catch((error: Error) => {
        if (this.connectTimer) {
          window.clearTimeout(this.connectTimer);
          this.connectTimer = undefined;
        }
        diag.warn('open', `Open error ${error.message}`);
      });

    diag.trace?.('open', `Open returning result = ${result}`);
    return result;
  }

  public async reconnect() {
    let connected = false;
    this.setReadyState(this.CONNECTING);

    do {
      // sleep, and retry ...
      await new Promise((r) => window.setTimeout(r, this.settings.timeoutInterval));
      connected = await this.open(true);
    } while (!connected && !this.forcedClose);
  }

  private onclose(event: CloseEvent) {
    this.setReadyState(this.CLOSED);
    diag.warn('onclose', `Websocket was closed`);

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }

    if (!this.forcedClose) {
      this.reconnect();
    }
  }

  private onmessage(event: MessageEvent) {
    diag.trace?.('onmessage', `Message received on websocket: ${event.data}`);
    try {
      let parsedData = JSON.parse(event.data);
      if (this.messageCallBack) {
        this.messageCallBack(parsedData);
      }
    } catch (e) {
      diag.warn('onmessage', `Invalid message received on websocket: ${e.message}`);
    }
  }

  private onerror(event: Event) {
    diag.warn('onerror', `error received on websocket`);
  }

  /**
   * Closes the WebSocket connection or connection attempt, if any.
   * If the connection is already CLOSED, this method does nothing.
   */
  public close(): void {
    diag.out('close', `Closing websocket: ${this.url}`);
    if (this.ws != null) {
      this.forcedClose = true;

      this.ws.close();
    }
  }

  /**
   * Transmits data to the server over the WebSocket connection.
   *
   * @param data a text string.
   */
  public send(data: string): void {
    if (this.readyState === this.OPEN) {
      diag.trace?.('send', `[${this.url}] Sending: ${data}`);
      this.ws.send(data);
    } else {
      diag.warn('send', `Attempting to send via closed WebSocket connection`);
      throw new Error('Attempting to send via closed WebSocket connection');
    }
  }

  public async sendAndWaitForResponse(data: any): Promise<string | null> {
    let res = null;
    let msgId: string = data.msgId;
    let timer: number = 0;

    await new Promise((resolve, reject) => {
      if (this.readyState === this.OPEN) {
        let handler = (event: MessageEvent) => {
          window.clearTimeout(timer);
          let parsedData = JSON.parse(event.data);
          let parsedMsgId = parsedData.hasOwnProperty('msgId') ? parsedData.msgId : '';
          if (msgId === parsedMsgId) {
            this.ws.removeEventListener('message', handler);
            resolve(event.data);
          }
        };

        timer = window.setTimeout(() => {
          this.ws.removeEventListener('message', handler);
          diag.warn('sendAndWaitForResponse', `Send request timed out for ${JSON.stringify(data)}`);
          reject(new Error('Send request timed out'));
        }, this.settings.responseTimeout);

        this.send(JSON.stringify(data));
        this.ws.addEventListener('message', handler);
      } else {
        diag.warn('sendAndWaitForResponse', `Attempting to send via closed WebSocket connection`);
        reject(new Error('Attempting to send via closed WebSocket connection'));
      }
    })
      .then((response) => {
        diag.trace?.('sendAndWaitForResponse', `[${this.url}] Receive response: ${response}`);
        res = response;
      })
      .catch((err: Error) => {
        diag.warn('sendAndWaitForResponse', `Error ${err.message}`);
      });

    return res;
  }

  public registerForMesssage(cb: Function) {
    this.messageCallBack = cb;
  }

  public registerForHeartbeat(cb: Function) {
    this.heartbeatCallback = cb;
  }

  public registerForReadyState(cb: Function) {
    this.readyStateCallback = cb;
  }

  public registerForInit(cb: Function) {
    this.initCallback = cb;
  }

  private heartbeat() {
    if (this.heartbeatCallback) {
      this.heartbeatCallback();
    }
  }

  private setReadyState(readyState: number) {
    if (readyState !== this.readyState) {
      this.readyState = readyState;
      if (this.readyStateCallback) {
        this.readyStateCallback(readyState);
      }
    }
  }
}
