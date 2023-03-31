import http from 'http';
import https from 'https';
import * as ExtInterface from '../telephonyexternalinterfacedef';
import { IWebRTCGateway } from './webRTCGatewayList';

// Telephony auto start flag
// true : Automatically start the telephony after each load
// false: Telephony must be started manually
export const autoStartTelephony: boolean = false;

export interface LineRingerPriority {
  address: string;
  priority: number;
}

export interface RouteRingerPriority {
  address: string;
  priority: number;
}

class DefaultOptions extends EventTarget {
  private static _instance = new DefaultOptions();
  private _options: ExtInterface.OptionsType;
  private _agentLogonName: string;
  private _positionName: string;
  private _lineRingerPriorities: Array<LineRingerPriority> = [];
  private _routeRingerPriorities: Array<RouteRingerPriority> = [];
  private _ringerMuteOnConnect = true;

  constructor() {
    super();
    // default values for Telephony
    this._options = {
      vccGwAddr: [],
      appSrvGwAddr: [],
      webRtcConfigData: [],
      configHandler: undefined,
      providedQlistTest: [],
      dynamicACDSubscribedList: [],
    };

    // default values for WebTeleTest
    this._positionName = 'WebClient1';
    this._agentLogonName = 'agent1';

    // Note:
    //   Usually we should not call async function in constructor; but it should be Ok here
    //   since it is a singleton object that created way before we use it. By the time we
    //   use it, the async will always has completed.
    this.loadDefaultFromConfigFile();
  }

  public get vccGwAddr(): string[] {
    return this._options.vccGwAddr;
  }

  public get appSrvGwAddr(): string[] {
    return this._options.appSrvGwAddr;
  }

  public get webRtcConfigData(): IWebRTCGateway[] {
    return this._options.webRtcConfigData;
  }

  public get agentLogonName(): string {
    return this._agentLogonName;
  }

  public get positionName(): string {
    return this._positionName;
  }

  public get lineRingerPriorites(): Array<LineRingerPriority> {
    return this._lineRingerPriorities;
  }

  public get routeRingerPriorites(): Array<RouteRingerPriority> {
    return this._routeRingerPriorities;
  }

  public get ringerMuteOnConnect(): boolean {
    return this._ringerMuteOnConnect;
  }

  public get providedQlistTest(): ExtInterface.AcdQueueMembership[] {
    return this._options.providedQlistTest;
  }

  public get dynamicACDSubscribedList(): string[] {
    return this._options.dynamicACDSubscribedList;
  }

  public async loadDefaultFromConfigFile(): Promise<void> {
    await this.fetchConfigFile('options.json')
      .then((data: string) => {
        try {
          let json = JSON.parse(data);
          console.log('loadDefaultFromConfigFile():' + data);

          this._options.vccGwAddr = json.VccGwAddress;
          this._options.appSrvGwAddr = json.AppSrvGwAddress;

          const webrtc1: IWebRTCGateway = json.WebRTC1;
          if (webrtc1) {
            this._options.webRtcConfigData.push(webrtc1);
          }
          const webrtc2: IWebRTCGateway = json.WebRTC2;
          if (webrtc2) {
            this._options.webRtcConfigData.push(webrtc2);
          }

          this._options.providedQlistTest = json.ProvidedQlistTest;
          this._options.dynamicACDSubscribedList = json.dynamicACDSubscribedList;

          this._agentLogonName = json.DefaultAgentName;
          this._positionName = json.DefaultPositionName;

          this._lineRingerPriorities = json.LineRingerPriority;
          this._routeRingerPriorities = json.RouteRingerPriority;

          if (json.RingerMuteOnConnect !== undefined) {
            this._ringerMuteOnConnect = json.RingerMuteOnConnect;
          }

          this.dispatchEvent(new Event('DefaultOptionsChanged'));

          console.log('loadDefaultFromConfigFile() succeed!');
        } catch (e) {
          console.warn('loadDefaultFromConfigFile() failed: ' + e);
        }
      })
      .catch((e: Error) => {
        console.warn('loadDefaultFromConfigFile() failed: ' + e.message);
      });
  }

  private async fetchConfigFile(filename: string): Promise<string> {
    const url = window.location.href;
    const urlTokens = url.split('/');
    const hostAndPort = urlTokens[2].split(':');
    const host = hostAndPort[0];
    const port = hostAndPort.length > 1 ? parseInt(hostAndPort[1]) : undefined;
    const secure: boolean = urlTokens[0].toLocaleLowerCase() === 'https:';

    const options: https.RequestOptions | http.RequestOptions = {
      host: host,
      port: port,
      path: '/teletest/' + filename,
      timeout: 2000,
      method: 'GET',
      rejectUnauthorized: false,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    };

    return new Promise((resolve, reject) => {
      let req = (secure ? https : http).get(options, (res: http.IncomingMessage) => {
        let data: string = '';
        res.on('data', (chunk: string) => {
          data += chunk;
        });
        res.on('end', () => {
          //logger.trace(ModuleName + 'fetch()): ' + data);
          resolve(data);
        });
      });
      req.on('error', (err: Error) => {
        reject(new Error(err.message));
      });
      req.on('timeout', () => {
        reject(new Error('Http request timed out'));
      });
      req.on('close', () => {
        reject(new Error('Http request closed'));
      });
      req.end();
    });
  }

  public static getInstance(): DefaultOptions {
    return this._instance || (this._instance = new this());
  }
}

// export singleton object
export const defaultOptions = DefaultOptions.getInstance();
