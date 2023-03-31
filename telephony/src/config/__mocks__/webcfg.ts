import { ICadRouterServer } from '../psapConfig';
import { RingerDestination } from '../positionConfig';

class MockPsapConfig {
  private servers: ICadRouterServer[] = [];
  constructor() {
    // this.servers.push({ address: '10.103.40.137', port: 80 });
    // this.servers.push({ address: '10.103.40.137', port: 443 });
    this.servers.push({ address: 'localhost', port: 10080 });
  }

  get cadrouters(): ICadRouterServer[] {
    return this.servers;
  }
}

class MockPositionCfg {
  constructor() {}

  get isCadEnabled(): boolean {
    return true;
  }

  get id(): number {
    return 2;
  }

  get cadPosId(): number {
    return 3;
  }

  get isCadRefreshOnNewALI(): boolean {
    return true;
  }

  get ringerDestination(): RingerDestination {
    return RingerDestination.Handset;
  }

  get defaultRingerVolume(): number {
    return 18.25;
  }

  get defaultConversationVolume(): number {
    return 25.3;
  }
}

class MockSystemConfig {
  constructor() {}

  get MaxDNLength() {
    return 4;
  }
}

class MockAgentConfig {
  get id() {
    return '10001';
  }
}

class WebCfg {
  private static instance: WebCfg;
  private _positionCfg: MockPositionCfg = new MockPositionCfg();
  private _psapCfg: MockPsapConfig = new MockPsapConfig();
  private _systemCfg: MockSystemConfig = new MockSystemConfig();
  private _agentCfg: MockAgentConfig = new MockAgentConfig();

  constructor() {}

  init() {}

  get positionCfg(): MockPositionCfg {
    return this._positionCfg;
  }

  get psapConfig(): MockPsapConfig {
    return this._psapCfg;
  }

  get systemConfig(): MockSystemConfig {
    return this._systemCfg;
  }

  get agentConfig(): MockAgentConfig {
    return this._agentCfg;
  }

  public static getInstance(): WebCfg {
    return this.instance || (this.instance = new this());
  }
}

// export singleton object
export const webCfg = WebCfg.getInstance();
