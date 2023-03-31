import { webCfg } from './webcfg';
import { AutoRebidRule, autoRebidRuleManager, MinRebidDelay } from '../autorebid/autorebid';
import { IWebClientGateway, WebClientGatewayList } from './webClientGatewayList';

export interface ISystemConfig {
  systemId: string;
  appendLocalSystemId: boolean;

  // park
  parkedHoldWarningDelay: number;
  parkTimeout: number;
  //parkMaxTime: number;

  // other general settings
  lineLockDuration: number;
  MaxDNLength: number;
  outgoingRingbackTimeout: number;
  addLocalPrefixOnUnformatted: boolean;

  // audible alert
  audibleAlertTimeoutT1CAS: number;
  audibleAlertTimeoutNG911: number;

  // webclient gateway
  webclientGateways: Array<IWebClientGateway>;
}

export class SystemConfig {
  private readonly _systemConfig: ISystemConfig;

  constructor() {
    let systemAttributes = webCfg.configHandler.collectionSystem.attributes;
    const jsonObj: any = systemAttributes.json;

    this._systemConfig = {
      systemId: jsonObj.SystemId || '',
      appendLocalSystemId: jsonObj.AppendLocalSystemId || false,

      // park
      parkedHoldWarningDelay: jsonObj.ParkedHoldWarningDelay || 0,
      parkTimeout: jsonObj.ParkTimeout || 0,

      // other general settings
      lineLockDuration: jsonObj.LineLockDuration || 3,
      MaxDNLength: jsonObj.MaxDNLength || 6,
      outgoingRingbackTimeout: jsonObj.CallRingingTimeout || -1,
      addLocalPrefixOnUnformatted: jsonObj.AddLocalPrefixOnUnformatted || true,

      // audible alert
      audibleAlertTimeoutT1CAS: jsonObj.T1CASAudibleAlertTimeout === undefined ? 0 : jsonObj.T1CASAudibleAlertTimeout,
      audibleAlertTimeoutNG911: jsonObj.NG911AudibleAlertTimeout === undefined ? 30 : jsonObj.NG911AudibleAlertTimeout,

      webclientGateways: [],
    };

    // Configure autoRebidRuleManager with rule for I3 LIS call
    let i3AutoRebidNumberOfRebid: number = jsonObj.I3AutoRebidNumberOfRebid;
    if (!isNaN(i3AutoRebidNumberOfRebid)) {
      let rule: AutoRebidRule = new AutoRebidRule();
      rule.repetitions = i3AutoRebidNumberOfRebid;

      // FirstRebidDelay
      let firstRebidDelay: number = jsonObj.I3AutoRebidFirstDelay;
      if (!isNaN(firstRebidDelay) && firstRebidDelay >= MinRebidDelay) {
        rule.initialDelay = firstRebidDelay;
      } else {
        rule.initialDelay = MinRebidDelay;
      }

      // SubsequentRebidDelay
      let subsequentRebidDelay: number = jsonObj.I3AutoRebidSubsequentDelay;
      if (!isNaN(subsequentRebidDelay) && subsequentRebidDelay >= MinRebidDelay) {
        rule.subsequentDelay = subsequentRebidDelay;
      } else {
        rule.subsequentDelay = MinRebidDelay;
      }

      rule.i3Pidflo = true;

      autoRebidRuleManager.addRule(rule);

      if (jsonObj.AutoRebidOnPhase1Enabled === true) {
        autoRebidRuleManager.setRebidOnPhase1Wireless(true);
      }

      const webclientGatewayList = new WebClientGatewayList();
      if (jsonObj.WebClientGateways && jsonObj.WebClientGateways.length > 0) {
        interface WebClientGatewayEntry {
          WebClientGateway: string;
          priority: number; // priority = 1 | 2 | 3 | 4;
        }

        for (let pr = 1; pr <= 4; pr++) {
          const obj: WebClientGatewayEntry = jsonObj.WebClientGateways.find(
            (obj: WebClientGatewayEntry) => obj.priority === pr
          );
          if (obj) {
            const gateway = webclientGatewayList.getWebClientGatewayById(obj.WebClientGateway);
            if (gateway) {
              this._systemConfig.webclientGateways.push(gateway);
            }
          }
        } // end of for()
      }
    }
  }

  // accessors

  get systemId(): string {
    return this._systemConfig.systemId;
  }

  get parkedHoldWarningDelay(): number {
    return this._systemConfig.parkedHoldWarningDelay;
  }

  get parkTimeout(): number {
    return this._systemConfig.parkTimeout;
  }

  get lineLockDuration(): number {
    return this._systemConfig.lineLockDuration;
  }

  get MaxDNLength(): number {
    return this._systemConfig.MaxDNLength;
  }

  get outgoingRingbackTimeout(): number {
    return this._systemConfig.outgoingRingbackTimeout;
  }

  get addLocalPrefixOnUnformatted(): boolean {
    return this._systemConfig.addLocalPrefixOnUnformatted;
  }

  get audibleAlertTimeoutT1CAS(): number {
    return this._systemConfig.audibleAlertTimeoutT1CAS;
  }

  get audibleAlertTimeoutNG911(): number {
    return this._systemConfig.audibleAlertTimeoutNG911;
  }

  get webclientGateways(): Array<IWebClientGateway> {
    return this._systemConfig.webclientGateways;
  }

  get json(): ISystemConfig {
    return this._systemConfig;
  }
}
