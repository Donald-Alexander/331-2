import { Agent } from 'client-web-api/src/config/model/Agent';

export interface IAgentConfig {
  id: string;
  logonName: string;
  firstName: string;
  middleName: string;
  lastName: string;
  //skillSet: SkillSet | null;
}

export class AgentConfig {
  private _agentConfig: IAgentConfig;

  constructor(agent: Agent) {
    const jsonObj: any = agent.json;

    this._agentConfig = {
      id: jsonObj.ViperLoginId || '',
      logonName: jsonObj.LogOnName || '',
      firstName: jsonObj.Name || '',
      middleName: '',
      lastName: '',
      //skillSet: null,
    };

    this.fetchAgentSkillSet(jsonObj.DefaultSkillSetObjectId);

    if (this._agentConfig.id === '' || this._agentConfig.logonName === '') {
      throw new Error('Invalid Agent configuration');
    }
  }

  private fetchAgentSkillSet(objectId: number) {
    //let skillSet: SkillSet = configHandler.collectionSkillSet.get(objectId);
    // TODO:
  }

  get id(): string {
    return this._agentConfig.id;
  }

  get logonName(): string {
    return this._agentConfig.logonName;
  }

  get firstName(): string {
    return this._agentConfig.firstName;
  }

  get middleName(): string {
    return this._agentConfig.middleName;
  }

  get lastName(): string {
    return this._agentConfig.lastName;
  }

  get json(): IAgentConfig {
    return this._agentConfig;
  }
}
