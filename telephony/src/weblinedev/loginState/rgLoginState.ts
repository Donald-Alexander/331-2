export enum RgLoginStatus {
  LoggedIn = 'LoggedIn',
  LoggedOut = 'LoggedOut',
  LoginUnknown = 'LoginUnknown',
}

export interface RgLoginState {
  loginStatus: RgLoginStatus;
  rgList: string[];
}

export enum RgOpStatus {
  Error = 'Error',
  Ok = 'Ok',
  AgentBusy = 'AgentBusy',
  DeviceBusy = 'DeviceBusy',
  NotExist = 'NotExist',
  OtherDevice = 'OtherDevice',
  Unknown = 'Unknown',
}

export interface RgOpResult {
  status: RgOpStatus;
  rgLoginState: RgLoginState;
}

export interface RgLoginStateChange {
  oldState: RgLoginState;
  newState: RgLoginState;
}

export class RgLoginStateChangeEvent extends Event implements RgLoginStateChange {
  oldState: RgLoginState;
  newState: RgLoginState;
  constructor(oldState: RgLoginState, newState: RgLoginState) {
    super('RgLoginStateChange');
    this.oldState = oldState;
    this.newState = newState;
  }
}

export function consolidateRgLoginState(states: RgLoginState[]): RgLoginState {
  const loginState: RgLoginState = {
    loginStatus: RgLoginStatus.LoginUnknown,
    rgList: [],
  };
  const ringgroups = new Set<string>();

  states.forEach((state) => {
    if (state) {
      if (state.loginStatus === RgLoginStatus.LoggedIn) {
        loginState.loginStatus = RgLoginStatus.LoggedIn;
        state.rgList.forEach((rg) => ringgroups.add(rg));
      } else if (
        state.loginStatus === RgLoginStatus.LoggedOut &&
        loginState.loginStatus === RgLoginStatus.LoginUnknown
      ) {
        loginState.loginStatus = RgLoginStatus.LoggedOut;
      }
    }
  });

  if (ringgroups.size > 0) {
    loginState.rgList = Array.from(ringgroups.values());
  }

  return loginState;
}

export function consolidateRgLoginOpStatus(opStatusArr: RgOpStatus[]): RgOpStatus {
  // status is 'Ok' if any 'Ok',
  // otherwise use any non-'Ok' status, with 'Error' being least preferred
  return opStatusArr.reduce((acc, cur) => {
    return cur === RgOpStatus.Ok || acc === RgOpStatus.Error ? cur : acc;
  }, RgOpStatus.Error);
}
