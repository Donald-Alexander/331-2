import { Route } from 'client-web-api/src/config/model/Route';

export interface IRouteConfig {
  name: string;
  address: string;
  ringerPriority: number;
  //psapId:
}

export class RouteConfig {
  private _routeConfig: IRouteConfig;

  constructor(route: Route) {
    const json = route.json;

    this._routeConfig = {
      name: json.Name || '',
      address: json.Address || '',
      ringerPriority: json.RingerPriority || 0,
    };

    this.setPsapId(json.PsapOjectedId);
  }

  private setPsapId(objectId: number) {}

  // public accessor
  get name(): string {
    return this._routeConfig.name;
  }

  get address(): string {
    return this._routeConfig.address;
  }

  get ringerPriority(): number {
    return this._routeConfig.ringerPriority;
  }

  get json(): IRouteConfig {
    return this._routeConfig;
  }
}
