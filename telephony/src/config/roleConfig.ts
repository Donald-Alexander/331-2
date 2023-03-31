import { Role } from 'client-web-api/src/config/model/Role';

export interface IRoleConfig {
  name: string;
  //skillset:
}

export class RoleConfig {
  private _roleConfig: IRoleConfig;

  constructor(role: Role) {
    const json = role.json;

    this._roleConfig = {
      name: json.Name || '',
    };
  }

  // public accessor

  get name(): string {
    return this._roleConfig.name;
  }

  get json(): IRoleConfig {
    return this._roleConfig;
  }
}
