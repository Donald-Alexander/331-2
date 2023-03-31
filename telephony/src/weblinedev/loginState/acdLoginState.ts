export enum AcdLoginStatus {
  LoggedIn = 'LoggedIn',
  LoggedOut = 'LoggedOut',
  LoginUnknown = 'LoginUnknown',
}

export enum AcdMemberType {
  Static = 'Static',
  Dynamic = 'Dynamic',
  DynamicOn = 'DynamicOn',
}
export enum SkillsetForceConnectType {
  Off,
  On,
  UseAgentQueueSettings,
}

export interface AcdQueueMembership {
  queue: string;
  penalty: number;
  type: AcdMemberType;
  skillsetFC: SkillsetForceConnectType;
}

export interface PackedAcdQueueMembership {
  q: string;
  p: string;
  t: string;
  f: string;
}

export interface AcdLoginState {
  loginStatus: AcdLoginStatus;
  ready: boolean;
  reasonCode?: number;
  reasonDesc?: string;
  qlist: AcdQueueMembership[];
}

export enum AcdOpStatus {
  Error = 'Error',
  Ok = 'Ok',
  AgentBusy = 'AgentBusy',
  DeviceBusy = 'DeviceBusy',
  NoAgentId = 'NoAgentId',
  NoQueue = 'NoQueue',
  NotExist = 'NotExist',
  UnknownQueue = 'UnknownQueue',
  AgentNotInQueue = 'AgentNotInQueue',
  QueueNotDynamic = 'QueueNotDynamic',
  FcInitiatedOnDynamicQueue = 'FcInitiatedOnDynamicQueue',
  VccFailureOnDynamicQueue = 'VccFailureOnDynamicQueue',
  FcInitiatedOnNextAcdCall = 'FcInitiatedOnNextAcdCall',
  Unknown = 'Unknown',
}

export interface AcdOpResult {
  status: AcdOpStatus;
  acdLoginState: AcdLoginState;
}

export interface AcdLoginStateChange {
  oldState: AcdLoginState;
  newState: AcdLoginState;
}

export class AcdLoginStateChangeEvent extends Event implements AcdLoginStateChange {
  oldState: AcdLoginState;
  newState: AcdLoginState;
  constructor(oldState: AcdLoginState, newState: AcdLoginState) {
    super('AcdLoginStateChange');
    this.oldState = oldState;
    this.newState = newState;
  }
}

export function packAcdQlist(qlist: AcdQueueMembership[]): PackedAcdQueueMembership[] {
  return qlist.map((qmem: AcdQueueMembership) => {
    let penalty = 1;
    let type = '0'; // Static

    penalty = Math.round(qmem.penalty);
    if (penalty < 1) {
      penalty = 1;
    } else if (penalty > 9) {
      penalty = 9;
    }

    if (qmem.type === AcdMemberType.Dynamic) {
      type = '1';
    } else if (qmem.type === AcdMemberType.DynamicOn) {
      type = '2';
    } else {
      type = '0'; // Static
    }

    if (Object.values(SkillsetForceConnectType).indexOf(qmem.skillsetFC) === -1) {
      qmem.skillsetFC = SkillsetForceConnectType.UseAgentQueueSettings;
    }

    return { q: qmem.queue, p: penalty.toString(), t: type.toString(), f: qmem.skillsetFC.toString() };
  });
}

export function unpackAcdQlist(qlistPacked: PackedAcdQueueMembership[]): AcdQueueMembership[] {
  return qlistPacked.map((ele) => {
    let penalty = parseInt(ele.p, 10);
    const typeInt = parseInt(ele.t, 10);
    let type = AcdMemberType.Static;
    let skillsetFC = parseInt(ele.f, 10) as SkillsetForceConnectType;

    if (penalty < 1) {
      penalty = 1;
    }

    if (typeInt === 1) {
      type = AcdMemberType.Dynamic;
    } else if (typeInt === 2) {
      type = AcdMemberType.DynamicOn;
    } else {
      type = AcdMemberType.Static;
    }

    if (Object.values(SkillsetForceConnectType).indexOf(skillsetFC) === -1) {
      skillsetFC = SkillsetForceConnectType.UseAgentQueueSettings;
    }
    return { queue: ele.q, penalty, type, skillsetFC };
  });
}

export function consolidateAcdLoginState(states: AcdLoginState[]): AcdLoginState {
  const loginState: AcdLoginState = {
    loginStatus: AcdLoginStatus.LoginUnknown,
    ready: false,
    qlist: [],
  };
  const queues = new Map<string, AcdQueueMembership>();

  states.forEach((state) => {
    if (state) {
      if (state.loginStatus === AcdLoginStatus.LoggedIn) {
        loginState.loginStatus = AcdLoginStatus.LoggedIn;
        loginState.ready = loginState.ready || state.ready;
        state.qlist.forEach((qmem) => {
          if (!queues.has(qmem.queue)) {
            queues.set(qmem.queue, { ...qmem });
          }
        });
      } else if (
        state.loginStatus === AcdLoginStatus.LoggedOut &&
        loginState.loginStatus === AcdLoginStatus.LoginUnknown
      ) {
        loginState.loginStatus = AcdLoginStatus.LoggedOut;
      }
    }
  });

  if (queues.size > 0) {
    loginState.qlist = Array.from(queues.values());
  }

  return loginState;
}

export function consolidateAcdLoginOpStatus(opStatusArr: AcdOpStatus[]): AcdOpStatus {
  // status is 'Ok' if any 'Ok',
  // otherwise use any non-'Ok' status, with 'Error' being least preferred
  return opStatusArr.reduce((acc, cur) => {
    return cur === AcdOpStatus.Ok || acc === AcdOpStatus.Error ? cur : acc;
  }, AcdOpStatus.Error);
}

export function isDynamicQueue(qlist: AcdQueueMembership[], queue: string): boolean {
  let isDynamic: boolean = false;
  qlist.map((qmem) => {
    if (qmem.queue === queue && (qmem.type === AcdMemberType.Dynamic || qmem.type === AcdMemberType.DynamicOn)) {
      isDynamic = true;
    }
  });
  return isDynamic;
}

export function isDynamicOnQueue(qlist: AcdQueueMembership[], queue: string): boolean {
  let isDynamicOn: boolean = false;
  qlist.map((qmem) => {
    if (qmem.queue === queue && qmem.type === AcdMemberType.DynamicOn) {
      isDynamicOn = true;
    }
  });
  return isDynamicOn;
}
