import { webCfg } from './webcfg';
import { WebClientGateway } from 'client-web-api/src/config/model/WebClientGateway';

export interface IWebClientGateway {
  id: string;
  name: string;
  ipAddress: string;
  appSrvGwPort: string;
  vccGwPort: string;
}

export class WebClientGatewayList {
  private readonly _list: Array<IWebClientGateway> = [];

  constructor() {
    // retrieve all webclient gateways configured in VIPER
    webCfg.configHandler.collectionWebClientGateway.getAll().forEach((gateway: WebClientGateway) => {
      const jsonObj = gateway.json;
      const webclientgateway: IWebClientGateway = {
        id: jsonObj.ObjectId,
        name: jsonObj.Name,
        ipAddress: jsonObj.IPAddress,
        appSrvGwPort: String(jsonObj.AppSrvGwPort) || '6443',
        vccGwPort: String(jsonObj.VccGwPort) || '6445',
      };
      this._list.push(webclientgateway);
    });
  }

  public getAll(): Array<IWebClientGateway> {
    return this._list;
  }

  public getWebClientGatewayById(id: string): IWebClientGateway | undefined {
    return this._list.find((item) => id === item.id);
  }
}
