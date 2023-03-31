import { WebLineDev } from './weblinedev';
import { vccEventHandler } from './vccEventHandler';
import { VccClient } from '../vcc/VccClient';
import { VccWebSocket } from '../vcc/VccWebSocket';
import { VccMsg } from '../vcc/VccMsg';
import { GlobalVccGWConnectionFalure, StartStat, TelephonyStartState } from '../telephonyexternalinterfacedef';
import { Diag } from '../common/diagClient';

const moduleName = 'vccconnectionhandler';
const diag = new Diag(moduleName);

const connectionHandles: Array<VccConnectionHandle> = [];
interface VccConnectionHandle {
  id: number;
  isAlive: boolean;
  connectState: boolean;
  addr: string;
  url: string;
  vccWS: VccWebSocket;
  pingIntervalId: number | undefined;
  connect: () => Promise<boolean>;
}
export interface UrlsInfo {
  token: string;
  vccVersion: string;
  gwAddrList: string[];
}

/*
function listenPong(lineDev: WebLineDev, handle: VccConnectionHandle) {
  lineDev.vccClient.oncontrol = (msg) => {
    diag.trace?.('listenPong', `got ${JSON.stringify(msg)} on vcc connection handle <${handle.id}>`);
    handle.isAlive = true;
  };
}

async function ping(lineDev: WebLineDev, handle: VccConnectionHandle) {
  try {
    const msg = new VccMsg({ ctl: { path: '/ping' } });
    diag.trace?.('ping', `send ${JSON.stringify(msg)} onto vcc connection handle <${handle.id}>`);
    lineDev.vccClient.sendControlMsg(msg);
    return Promise.resolve();
  } catch (e) {
    diag.warn('ping', `got error: ${JSON.stringify(e)}`);
    return Promise.reject(e);
  }
}

async function keepAlive(lineDev: WebLineDev, handleInUse: VccConnectionHandle) {
  const pingInterval = 5000;
  handleInUse.pingIntervalId = window.setInterval(async () => {
    if (!handleInUse.isAlive) {
      // if isAlive is set in current connectionHandle, it means we did not get vcc pong feed back and implies the websocket connection
      // may be stuck. So actively close websocket. This will trigger CloseEvent
      diag.warn('keepAlive', `detect network failure by Vcc ping`);
      handleInUse.vccWS.ws.close();
    } else {
      // reset to send new ping
      handleInUse.isAlive = false;
      try {
        await ping(lineDev, handleInUse);
      } catch (e) {
        diag.warn('keepAlive', `got error: ${JSON.stringify(e)}`);
      }
    }
  }, pingInterval);
}

function createGWsHandles(lineDev: WebLineDev, urlsInfo: UrlsInfo) {
  connectionHandles.length = 0;
  for (const [index, addr] of urlsInfo.gwAddrList.entries()) {
    const handle: VccConnectionHandle = {
      id: index,
      isAlive: false,
      connectState: false,
      addr: addr,
      url: `wss://${addr}/?agentId=${lineDev.agentId}&device=${lineDev.device}&token=${urlsInfo.token}`,
      vccWS: new VccWebSocket({
        send: () => {
          throw new Error('VCC web socket not initialize(test)');
        },
        close: () => {},
      }),
      pingIntervalId: undefined,
      connect: function (): Promise<boolean> {
        return new Promise(async (r, j) => {
          try {
            const vccWS = await VccWebSocket.connect(this.url, urlsInfo.vccVersion);
            this.connectState = true;
            this.vccWS = vccWS;
            diag.out('vccConnectionHandler', `Connected ${this.addr} on handle <${this.id}>`);
            r(this.connectState);
          } catch (e) {
            diag.out('vccConnectionHandler', `Failed to connect ${this.addr} on handle <${this.id}>`);
            this.connectState = false;
            j(this.connectState);
          }
        });
      },
    };

    diag.out(moduleName, 'createGWsHandles', `VccConnection handle<${index}> -> ${addr}`);
    connectionHandles.push(handle);
  }

  diag.trace?.('createGWsHandles', `VccConnection handles: ${connectionHandles}`);
}

function useConnectionHandle(lineDev: WebLineDev, handle: VccConnectionHandle) {
  // update new VccClient and VccWebSocket to WebclientDev
  handle.isAlive = true; // initialize when connects to vccGW
  lineDev.vccws = handle.vccWS;

  lineDev.vccClient = new VccClient(handle.vccWS);
  diag.out('useConnectionHandle', `Telephony VccClient updated. Handle ${handle.id} GW: ${handle.addr}`);

  // monitor websocket
  lineDev.vccClient.onclose = (event: CloseEvent) => {
    if (handle.pingIntervalId) {
      window.clearInterval(handle.pingIntervalId);
      handle.pingIntervalId = undefined;
    }

    diag.warn('onClose', `${event.reason}`);
    findNewConnection(lineDev);
  };

  // monitor network
  listenPong(lineDev, handle);

  // receiving vcc event
  lineDev.vccClient.onevent = (msg) => {
    vccEventHandler(lineDev, msg);
  };
}

async function vccHandlerConnectTo(lineDev: WebLineDev, handles: VccConnectionHandle[]) {
  let connected = false;
  for (let handle of handles) {
    try {
      connected = await handle.connect();
      if (connected) {
        useConnectionHandle(lineDev, handle);
        if (handle.pingIntervalId) {
          window.clearInterval(handle.pingIntervalId);
          handle.pingIntervalId = undefined;
        }
        keepAlive(lineDev, handle);
        break;
      }
    } catch (e) {
      diag.warn(
        'vccHandlerConnectTo',
        `Failed to connect to vccGW ${handles[0].addr} on handle <${handle.id}, try next one. cause:${e} `
      );
    }
  }
  if (!connected) {
    throw new GlobalVccGWConnectionFalure('');
  }
}

async function initialConnectRetry(lineDev: WebLineDev) {
  diag.out('initialConnectRetry', `Every 10 seconds`);
  let retry = window.setTimeout(async () => {
    try {
      await vccHandlerConnectTo(lineDev, connectionHandles);
      window.clearTimeout(retry);
      if (lineDev.startState === StartStat.WebPhoneStarted) {
        // Now VccClient started as well from previous global failure
        // If only webphone was started, from now on telephony started
        lineDev.startState = StartStat.Started;
        lineDev.report(new TelephonyStartState('TelephonyStartState', lineDev.startState));
      } else if (lineDev.startState !== StartStat.Started) {
        lineDev.startState = StartStat.VccClientStarted;
        lineDev.report(new TelephonyStartState('TelephonyStartState', lineDev.startState));
      } else {
        // failure over from prevous connected and global failure.
        // Got new connection during re-try. Nothing to do here.
      }
    } catch (e) {
      diag.err('initialConnectRetry', `${e}`);
      window.clearTimeout(retry);
      initialConnectRetry(lineDev);
    }
  }, 10000);
}

async function findNewConnection(lineDev: WebLineDev) {
  // skip usedHandle
  let otherHandles = connectionHandles.filter((handle) => handle.connectState === false);
  const handleInUse = connectionHandles.find((handle) => handle.connectState === true);
  if (handleInUse) {
    diag.out('findNewConnection', `connection to GW <${handleInUse.addr} closed on handle <${handleInUse.id}>`);
    handleInUse.connectState = false;
  }
  if (otherHandles.length === 0) otherHandles = connectionHandles;
  try {
    await vccHandlerConnectTo(lineDev, otherHandles);
  } catch (e) {
    // If failed to have a connection on all rest handles in the list,
    // re-try every GW that is configured
    diag.warn('findNewConnection', `${e}, re-try to connect GW base on configuration`);
    initialConnectRetry(lineDev);
  }
}

export async function vccConnectionHandler(lineDev: WebLineDev, urlsInfo: UrlsInfo): Promise<boolean> {
  diag.out('vccConnectionHandler', `Received configuration: ${JSON.stringify(urlsInfo)}`);
  try {
    createGWsHandles(lineDev, urlsInfo);
    await vccHandlerConnectTo(lineDev, connectionHandles);
    return true;
  } catch (e) {
    diag.err('vccConnectionHandler', `re-trying. error${e}`);
    initialConnectRetry(lineDev);
    return Promise.reject(false);
  }
}

export { vccConnectionHandler as default };
*/
