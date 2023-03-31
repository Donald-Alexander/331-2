import { sleep } from '../common/utils';
import { Diag } from '../common/diagClient';

const diag = new Diag('appserverclient.ws');

export class ReconnectingWS extends EventTarget {
  private settings = {
    connectTimeout: 2000,
    retryCount: 1, //3,
    reconnectInterval: 2000,
    reconnectPreferredCount: 3,
  };
  private ws!: WebSocket;
  private readonly urls: string[] = [];
  private url: string = '';
  private readyState: number = WebSocket.CONNECTING;
  private forcedClose = false;

  private updateCallBack: Function | undefined;
  private readyStateCallback: Function | undefined;

  constructor(urls: string[]) {
    super();
    this.urls = [...urls];
  }

  public async open() {
    let connected = false;

    for (let i = 0; !connected && i < this.urls.length; ) {
      for (let j = 0; !connected && j < this.settings.retryCount; j++) {
        await this.connect(this.urls[i])
          .then(() => {
            diag.trace?.('open', 'Connected');
            connected = true;
          })
          .catch((e: Error) => {
            diag.warn('open', 'Open ' + this.urls[i] + ' failed: ' + e.message);
          });
      }

      // startover when reach the end
      i = i === this.urls.length - 1 ? 0 : i + 1;
    }
  }

  // connect to specified url
  private async connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        diag.trace?.('connect', 'connecting ... ' + url);

        this.ws = new WebSocket(url);

        // setTimeout
        setTimeout(() => {
          reject(new Error('Connect timed out'));
        }, this.settings.connectTimeout);

        this.ws.onopen = () => {
          diag.trace?.('connect', 'connected: ' + url);
          this.setReadyState(WebSocket.OPEN);

          this.url = url;
          this.ws.onerror = this.onerror.bind(this);
          this.ws.onmessage = this.onmessage.bind(this);
          this.ws.onclose = this.onclose.bind(this);

          resolve();
        };

        this.ws.onerror = (ev: Event) => {
          reject(new Error('Connection error'));
        };

        this.ws.onclose = (ev: CloseEvent) => {
          reject(new Error('Connection closed'));
        };
      } catch (e) {
        reject(new Error('Exception: ' + e));
      }
    });
  }

  private async reconnect() {
    this.setReadyState(WebSocket.CONNECTING);
    let connected = false;

    // if connected on preferred, reconnect to preferred before reiterate whole list ...
    if (this.url === this.urls[0]) {
      for (let i = 0; !connected && i < this.settings.reconnectPreferredCount; i++) {
        await this.connect(this.url)
          .then(() => {
            diag.trace?.('reconnect', 'Connected');
            connected = true;
          })
          .catch(async () => {
            // sleep, and retry ...
            await sleep(this.settings.reconnectInterval);
          });
      }
    }

    // reiterate all urls from beginning ...
    if (!connected) {
      await this.open();
    }

    // notify higher layer
    diag.trace?.('reconnect', 'sending event ReconnectedEvent ...');
    this.dispatchEvent(new CustomEvent('ReconnectedEvent'));
  }

  private onclose(event: CloseEvent) {
    this.setReadyState(WebSocket.CLOSED);
    diag.trace?.('onclose', 'url=' + this.url);

    if (!this.forcedClose) {
      this.reconnect();
    }
  }

  private onmessage(event: MessageEvent) {
    diag.trace?.('onmessage', 'url=' + this.url + ', data=' + event.data);

    try {
      let parsedData = JSON.parse(event.data);
      if (parsedData.hasOwnProperty('type')) {
        if (parsedData.type === 'update' && this.updateCallBack) {
          this.updateCallBack(parsedData);
        }
      }
    } catch (e) {
      diag.warn('onmessage', 'Exception: ' + e.message);
    }
  }

  private onerror(event: Event) {
    diag.err('onerror', 'url=' + this.url + ', event=' + event);
  }

  /**
   * Closes the WebSocket connection or connection attempt, if any.
   * If the connection is already CLOSED, this method does nothing.
   */
  public close(): void {
    diag.trace?.('close', 'Closing ... ' + this.url);

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
  private send(data: string): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      diag.trace?.('send', 'url=' + this.url + ', data' + data);
      this.ws.send(data);
    } else {
      throw new Error('Attempting to send via closed WebSocket connection!');
    }
  }

  public async sendRequest(id: string, data: string): Promise<string | null> {
    let res = null;
    let timeout = 2000;

    await new Promise((resolve, reject) => {
      if (this.ws.readyState === WebSocket.OPEN) {
        let handler = (event: MessageEvent) => {
          let parsedData = JSON.parse(event.data);
          // TODO: JSON validation
          let parsedType = parsedData.hasOwnProperty('type') ? parsedData.type : '';
          let parsedId = parsedData.hasOwnProperty('id') ? parsedData.id : '';
          if (parsedType === 'response' && parsedId === id) {
            this.ws.removeEventListener('message', handler);
            resolve(event.data);
          }
        };

        setTimeout(() => {
          this.ws.removeEventListener('message', handler);
          reject(new Error('Send request timed out, id=' + id));
        }, timeout);

        this.send(data);
        this.ws.addEventListener('message', handler);
      } else {
        reject(new Error('Attempting to send via closed WebSocket connection!'));
      }
    })
      .then((response) => {
        diag.trace?.('sendRequest', 'result:' + response);

        res = response;
      })
      .catch((err: Error) => {
        diag.warn('sendRequest', 'Exception:' + err.message);
        // TODO: genereate error event and send up
        //res = err.message;
      });

    return res;
  }

  public registerForUpdateEvents(cb: Function) {
    this.updateCallBack = cb;
  }

  public registerForReadyState(cb: Function) {
    this.readyStateCallback = cb;
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
