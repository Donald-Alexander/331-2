import { Diag } from '../common/diagClient';
const diagWs = new Diag('webviperdriver.ws');

export class WebViperDriverWS extends EventTarget {
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
  private configCallback: Function | undefined;
  private heartbeatCallback: Function | undefined;
  private systemInfoCallBack: Function | undefined;
  private readyStateCallback: Function | undefined;

  private connectTimer: number | undefined;
  private heartbeatTimer: number | undefined;
  private systemInfoTimer: number | undefined;

  private skipInterval: boolean;

  constructor(url: string, skipInterval: boolean) {
    super();
    this.url = url;
    this.skipInterval = skipInterval;
    this.connectTimer = undefined;
    this.heartbeatTimer = undefined;
    this.systemInfoTimer = undefined;
    this.heartbeat = this.heartbeat.bind(this);
    this.systemInfo = this.systemInfo.bind(this);
  }

  public startHeatbeat() {
    // Send a first heatbeat
    if (this.heartbeat) {
      this.heartbeat();
      if (this.heartbeatTimer === undefined && !this.skipInterval) {
        // Schedule heartbeat automation
        this.heartbeatTimer = window.setInterval(() => {
          this.heartbeat();
        }, this.settings.heartbeatInterval);
      }
    }
  }

  public startSystemInfo() {
    // Send a first SystemInfo
    if (this.systemInfo) {
      this.systemInfo();
      if (this.systemInfoTimer === undefined && !this.skipInterval) {
        // Schedule System Information automation
        this.systemInfoTimer = window.setInterval(() => {
          this.systemInfo();
        }, this.settings.systemInfoInterval);
      }
    }
  }

  public async open(reconnectAttempt: boolean): Promise<boolean> {
    let result = false;
    diagWs.trace?.('open', `Attempt to connect to: ${this.url}`);

    await new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
      } catch (e) {
        reject(e);
      }

      this.connectTimer = window.setTimeout(() => {
        this.ws.close(1000, 'Timeout reached trying to connect to WebViperDriver');
        reject(new Error('Connect timed out, url: ' + this.url));
      }, this.settings.timeoutInterval);

      this.ws.onopen = () => {
        diagWs.out('open', `Connected to: ${this.url}`);
        this.setReadyState(this.OPEN);
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          let parsedData = JSON.parse(event.data);
          if (parsedData.__MESSAGE__ === 'Socket is connected') {
            reconnectAttempt = false;
            diagWs.trace?.('open', `Received Socket is connected message`);
            resolve(true);
          } else {
            diagWs.warn('open', `Received connection message is not correct: ${parsedData.__MESSAGE__}`);
            reject(new Error('Websocket connection message is not correct'));
          }
        } catch (e) {
          diagWs.warn('open', `Received connection message invalid: ${e.message}`);
          reject(new Error('Websocket connection message invalid'));
        }
      };

      this.ws.onclose = (event: CloseEvent) => {
        diagWs.trace?.('open', `Websocket is closed, reason: ${event.reason}`);
        reject(new Error('Websocket is closed, reason: ' + event.reason));
      };

      this.ws.onerror = (event: Event) => {
        diagWs.trace?.('open', `Websocket error`);
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

        if (this.configCallback) {
          // Trigger configuration message
          this.configCallback();
        }

        result = true;
      })
      .catch((error: Error) => {
        if (this.connectTimer) {
          window.clearTimeout(this.connectTimer);
          this.connectTimer = undefined;
        }
        diagWs.warn('open', `Open error ${error.message}`);
      });

    diagWs.trace?.('open', `Open returning result = ${result}`);
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
    diagWs.warn('onclose', `Websocket was closed`);

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }

    if (this.systemInfoTimer) {
      clearInterval(this.systemInfoTimer);
      this.systemInfoTimer = undefined;
    }

    if (!this.forcedClose) {
      this.reconnect();
    }
  }

  private onmessage(event: MessageEvent) {
    diagWs.trace?.('onmessage', `Message received on websocket: ${event.data}`);
    try {
      let parsedData = JSON.parse(event.data);
      if (this.messageCallBack) {
        this.messageCallBack(parsedData);
      }
    } catch (e) {
      diagWs.warn('onmessage', `Invalid message received on websocket: ${e.message}`);
    }
  }

  private onerror(event: Event) {
    diagWs.warn('onerror', `error received on websocket`);
  }

  /**
   * Closes the WebSocket connection or connection attempt, if any.
   * If the connection is already CLOSED, this method does nothing.
   */
  public close(): void {
    diagWs.out('close', `Closing websocket: ${this.url}`);
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
      diagWs.trace?.('send', `[${this.url}] Sending: ${data}`);
      this.ws.send(data);
    } else {
      diagWs.warn('send', `Attempting to send via closed WebSocket connection`);
      throw new Error('Attempting to send via closed WebSocket connection');
    }
  }

  public async sendAndWaitForResponse(data: any): Promise<string | null> {
    let res = null;
    let command: string = data.__CMD__;
    let timer: number = 0;

    await new Promise((resolve, reject) => {
      if (this.readyState === this.OPEN) {
        let handler = (event: MessageEvent) => {
          window.clearTimeout(timer);
          let parsedData = JSON.parse(event.data);
          let parsedCMD = parsedData.hasOwnProperty('FromCmd') ? parsedData.FromCmd : '';
          if (command === parsedCMD) {
            this.ws.removeEventListener('message', handler);
            resolve(event.data);
          }
        };

        timer = window.setTimeout(() => {
          this.ws.removeEventListener('message', handler);
          diagWs.warn('sendAndWaitForResponse', `Send request timed out for ${JSON.stringify(data)}`);
          reject(new Error('Send request timed out'));
        }, this.settings.responseTimeout);

        this.send(JSON.stringify(data));
        this.ws.addEventListener('message', handler);
      } else {
        diagWs.warn('sendAndWaitForResponse', `Attempting to send via closed WebSocket connection`);
        reject(new Error('Attempting to send via closed WebSocket connection'));
      }
    })
      .then((response) => {
        diagWs.trace?.('sendAndWaitForResponse', `[${this.url}] Receive response: ${response}`);
        res = response;
      })
      .catch((err: Error) => {
        diagWs.warn('sendAndWaitForResponse', `Error ${err.message}`);
      });

    return res;
  }

  public registerForMesssage(cb: Function) {
    this.messageCallBack = cb;
  }

  public registerForConfiguration(cb: Function) {
    this.configCallback = cb;
  }

  public registerForHeartbeat(cb: Function) {
    this.heartbeatCallback = cb;
  }

  public registerForReadyState(cb: Function) {
    this.readyStateCallback = cb;
  }

  public registerForSystemInfo(cb: Function) {
    this.systemInfoCallBack = cb;
  }

  private heartbeat() {
    if (this.heartbeatCallback) {
      this.heartbeatCallback();
    }
  }

  private systemInfo() {
    if (this.systemInfoCallBack) {
      this.systemInfoCallBack();
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
