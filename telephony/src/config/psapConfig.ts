import { ICadRouter } from 'common/src/config/model/ICadRouter';
import { Psap } from 'client-web-api/src/config/model/Psap';
import { IWebClientGateway, WebClientGatewayList } from './webClientGatewayList';

export interface ICadRouterServer {
  address: string;
  port: number;
}

export interface IPsapConfig {
  id: number;
  name: string;
  nenaPsapId: string;
  tenantId: number;
  //psapGroupId:
  //skillset:
  cadrouters: ICadRouterServer[];

  // webclient gateway
  webclientGateways: Array<IWebClientGateway>;
}

export class PsapConfig {
  private _psapConfig: IPsapConfig;

  constructor(psap: Psap) {
    const json = psap.json;

    this._psapConfig = {
      id: json.ObjectId || 0,
      name: json.Name || '',
      nenaPsapId: json.NenaPsapId || '',
      tenantId: json.TenantId || 0,
      cadrouters: [],
      webclientGateways: [],
    };
    psap.cadRouters.forEach((server: ICadRouter) => {
      this._psapConfig.cadrouters.push({ address: server.IPAddress, port: server.Port });
    });

    const webclientGatewayList = new WebClientGatewayList();
    if (json.WebClientGateways && json.WebClientGateways.length > 0) {
      interface WebClientGatewayEntry {
        WebClientGateway: string;
        priority: number; // priority = 1 | 2 | 3 | 4;
      }

      for (let pr = 1; pr <= 4; pr++) {
        const obj: WebClientGatewayEntry = json.WebClientGateways.find(
          (obj: WebClientGatewayEntry) => obj.priority === pr
        );
        if (obj) {
          const gateway = webclientGatewayList.getWebClientGatewayById(obj.WebClientGateway);
          if (gateway) {
            this._psapConfig.webclientGateways.push(gateway);
          }
        }
      } // end of for()
    }
  }

  // public accessor

  get id(): number {
    return this._psapConfig.id;
  }

  get name(): string {
    return this._psapConfig.name;
  }

  get cadrouters(): ICadRouterServer[] {
    return this._psapConfig.cadrouters;
  }

  get webclientGateways(): Array<IWebClientGateway> {
    return this._psapConfig.webclientGateways;
  }

  get json(): IPsapConfig {
    return this._psapConfig;
  }
}
