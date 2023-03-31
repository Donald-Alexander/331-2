import { ConfigHandler } from 'client-web-api/src/config/ConfigHandler';
import * as ExtInterface from '../telephonyexternalinterfacedef';
import { defaultOptions } from './options';
import { AgentConfig } from './agentConfig';
import { PositionCfg } from './positionConfig';
import { NodeConfig, compareViperNode } from './nodeConfig';
import { LineConfig } from './lineConfig';
import { RouteConfig } from './routeConfig';
import { NpdToNpaList } from './npd2NpaList';
import { SystemConfig } from './systemConfig';
import { PsapConfig } from './psapConfig';
import { RoleConfig } from './roleConfig';
import { DialPlanConfig } from './dialPlanConfig';
import { LongDistanceConfig } from './longDistanceConfig';
import { WirelessServiceConfig } from './wirelessServiceConfig';
import { IWebRTCGateway, WebRTCGatewayList } from './webRTCGatewayList';
import * as deviceManager from '../weblinedev/deviceManager';

// TODO: any chance to get rid of this?
export interface WebPhoneCfg {
  userId: string;
  username: string;
  password: string;
  webRTCGWConfigData: IWebRTCGateway[];
}

class WebCfg {
  private static instance: WebCfg;
  public readonly p911WebServerAddr: string;
  public readonly secure: boolean;

  // Individual config, access using get accessor
  private _appSrvGwAddr: string[] = [];
  private _vccGwAddr: string[] = [];
  private _webRtcConfigData: Array<IWebRTCGateway> = [];

  private _agentConfig: AgentConfig | undefined;
  private _positionCfg: PositionCfg | undefined;
  private _psapConfig: PsapConfig | undefined;
  private _roleConfig: RoleConfig | undefined;

  private _nodeCfgMap: Array<NodeConfig> = [];
  private _routes: Array<RouteConfig> = [];
  private _npd2npaList: NpdToNpaList | undefined;
  private _systemConfig: SystemConfig | undefined;
  private _longDistanceConfig: LongDistanceConfig | undefined;
  private _configHandler: ConfigHandler | undefined;

  constructor() {
    const url = window.location.href;
    const urlTokens = url.split('/');
    this.p911WebServerAddr = urlTokens[2].split(':')[0];
    this.secure = urlTokens[0].toLocaleLowerCase() === 'https:';

    // enumerate audio devices
    deviceManager.enumerateDevices();
  }

  // this function should be called in WebLineDev's constructor to load all config
  public init(providedOptions: ExtInterface.OptionsType) {
    // reinit all arrays
    this._appSrvGwAddr = [];
    this._vccGwAddr = [];
    this._webRtcConfigData = [];
    this._nodeCfgMap = [];
    this._routes = [];

    this._configHandler = providedOptions.configHandler as ConfigHandler;

    // SystemConfig
    this._systemConfig = new SystemConfig();

    // PsapConfig
    this._psapConfig = new PsapConfig(this.configHandler.currentPsap);

    // AppSrvGw & VccGw: provided by P911 > default from options.json > PSAP setting > System setting
    if (providedOptions.appSrvGwAddr && providedOptions.appSrvGwAddr.length) {
      this._appSrvGwAddr = providedOptions.appSrvGwAddr;
    } else if (defaultOptions.appSrvGwAddr && defaultOptions.appSrvGwAddr.length) {
      this._appSrvGwAddr = defaultOptions.appSrvGwAddr;
    } else if (this.psapConfig.webclientGateways.length) {
      this.psapConfig.webclientGateways.forEach((gateway) => {
        this._appSrvGwAddr.push(gateway.ipAddress + ':' + gateway.appSrvGwPort);
      });
    } else if (this.systemConfig.webclientGateways.length) {
      this.systemConfig.webclientGateways.forEach((gateway) => {
        this._appSrvGwAddr.push(gateway.ipAddress + ':' + gateway.appSrvGwPort);
      });
    } else {
      throw new Error('No AppSrvGw is configured for current PSAP or Telephony');
    }

    if (providedOptions.vccGwAddr && providedOptions.vccGwAddr.length) {
      this._vccGwAddr = providedOptions.vccGwAddr;
    } else if (defaultOptions.vccGwAddr && defaultOptions.vccGwAddr.length) {
      this._vccGwAddr = defaultOptions.vccGwAddr;
    } else if (this.psapConfig.webclientGateways.length) {
      this.psapConfig.webclientGateways.forEach((gateway) => {
        this._vccGwAddr.push(gateway.ipAddress + ':' + gateway.vccGwPort);
      });
    } else if (this.systemConfig.webclientGateways.length) {
      this.systemConfig.webclientGateways.forEach((gateway) => {
        this._vccGwAddr.push(gateway.ipAddress + ':' + gateway.vccGwPort);
      });
    } else {
      throw new Error('No VccGw is configured for current PSAP or Telephony');
    }

    // WebRTCGateway
    if (providedOptions.webRtcConfigData && providedOptions.webRtcConfigData.length) {
      this._webRtcConfigData = providedOptions.webRtcConfigData;
    } else if (defaultOptions.webRtcConfigData && defaultOptions.webRtcConfigData.length) {
      this._webRtcConfigData = defaultOptions.webRtcConfigData;
    } else {
      const webRtcConfigData = new WebRTCGatewayList().getAll();
      if (webRtcConfigData.length) {
        this._webRtcConfigData = webRtcConfigData;
      } else {
        throw new Error('No WebRTCGAteway found');
      }
    }

    // AgentConfig
    this._agentConfig = new AgentConfig(this.configHandler.currentAgent);

    // PositionConfig
    this._positionCfg = new PositionCfg(this.configHandler.localPosition);

    // NodeConfig
    for (const node of this.configHandler.collectionNode.getAll()) {
      const nodeCfg = new NodeConfig(node);
      if (nodeCfg.isValidViperNode()) {
        this._nodeCfgMap.push(nodeCfg);
      }
    }
    // sort nodes to an ordered array: primary, secondary, node3, node4, node5, node6
    this._nodeCfgMap.sort(compareViperNode);

    if (this._nodeCfgMap.length === 0) {
      throw new Error('No Node in configuration');
    }

    // RouteConfig
    this.configHandler.collectionRoute.getAll().forEach((route) => {
      const routeCfg = new RouteConfig(route);
      this._routes.push(routeCfg);
    });

    // NpdToNpa
    this._npd2npaList = new NpdToNpaList();

    // RoleConfig
    if (this.configHandler.currentRole) {
      this._roleConfig = new RoleConfig(this.configHandler.currentRole);
    }

    // LongDistanceConfig
    this._longDistanceConfig = new LongDistanceConfig();

    // WirelessServiceConfig (invoke constructor to configure up aliDecoder and autoRebidRule manager)
    new WirelessServiceConfig();

    // Retrieve dialPlanRef from profile
    let dialPlanRef: number = this.configHandler.collectionProfile.attributes.dialPlan;
    if (dialPlanRef === 0) {
      dialPlanRef = 1; // No dialPlan configured used default one
    }
    const dialPlan = this.configHandler.collectionDialPlan.get(dialPlanRef);
    if (dialPlan) {
      // Invoke constructor to fill outboundDialPlan
      new DialPlanConfig(dialPlan);
    }
  }

  // accessors
  get configHandler(): ConfigHandler {
    if (this._configHandler) {
      return this._configHandler;
    }
    throw new Error('configHandler not available');
  }

  get vccGwAddresses(): string[] {
    if (this._vccGwAddr?.length) {
      // ['ip1:port1', 'ip2:port2', ]
      return this._vccGwAddr;
    }
    throw new Error('vccGw address not available');
  }

  get appSrvGwUrls(): string[] {
    if (this._appSrvGwAddr) {
      // return (this.secure ? 'wss://' : 'ws://') + this._appSrvGwAddr;
      return this._appSrvGwAddr;
    }
    throw new Error('appSrvGw address not available');
  }

  get webRtcConfigData(): IWebRTCGateway[] {
    return this._webRtcConfigData;
  }

  get agentConfig(): AgentConfig {
    if (this._agentConfig) {
      return this._agentConfig;
    }
    throw new Error('No configuration found');
  }

  get positionCfg(): PositionCfg {
    if (this._positionCfg) {
      return this._positionCfg;
    }
    throw new Error('No configuration found');
  }

  get psapConfig(): PsapConfig {
    if (this._psapConfig) {
      return this._psapConfig;
    }
    throw new Error('No configuration found');
  }

  get roleConfig(): RoleConfig | undefined {
    return this._roleConfig;
  }

  get lineDataMap(): Array<LineConfig> {
    return this._positionCfg ? this._positionCfg.lineDataMap : [];
  }

  get nodeCfgMap(): Array<NodeConfig> {
    return this._nodeCfgMap;
  }

  get routes(): Array<RouteConfig> {
    return this._routes;
  }

  get npd2npaList(): NpdToNpaList {
    if (this._npd2npaList) {
      return this._npd2npaList;
    }
    throw new Error('No configuration found');
  }

  get systemConfig(): SystemConfig {
    if (this._systemConfig) {
      return this._systemConfig;
    }
    throw new Error('No configuration found');
  }

  get longDistanceConfig(): LongDistanceConfig {
    if (this._longDistanceConfig) {
      return this._longDistanceConfig;
    }
    throw new Error('No configuration found');
  }

  public static getInstance(): WebCfg {
    return this.instance || (this.instance = new this());
  }
}

// export singleton object
export const webCfg = WebCfg.getInstance();
