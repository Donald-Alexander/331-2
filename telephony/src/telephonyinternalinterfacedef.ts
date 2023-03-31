import * as ExtInterface from './telephonyexternalinterfacedef';
import { AcdQueueMembership } from './weblinedev/loginState/acdLoginState';

interface Info {
  status: ExtInterface.LoggedStatus;
  agentId: string;
  otherDevice: string;
  otherAgent: string;
}

export enum InitialCallState {
  Connected = 'Connected',
  Busy = 'Busy',
  Hold = 'Hold',
  IHold = 'IHold',
  Park = 'Park',
}

export interface InitialCallStateRep {
  state: InitialCallState;
  initCall?: string;
  trunkAddr?: string;
  mmdn?: string;
  confId?: string;
  connectedBy?: string;
  uci?: string;
  route?: string;
  initRoute?: string;
  trunkUci?: string;
  posList?: string;
  t2t?: string;
  call?: string;
  parkDN?: string;
  callType?: string;
}

export interface outgingCallAnsweredData {
  id: string;
  cssId: string;
  trunkUci: string;
  connectedPotsSrv: string;
}

export enum InitialCallType {
  ICTIncomingOffered = 'ICTIncomingOffered',
  ICTIncomingIdle = 'ICTIncomingIdle',
  ICTOutgoing = 'ICTOutgoing',
}

export interface AgentInfo {
  firstName: string;
  middleName: string;
  lastName: string;
  pSAPName: string;
  pSAPID: string;
  role: string;
}

export interface InitialAgentStatus {
  agentId: string;
  status: string;
  acdStatusSubscription: boolean;
}

export interface InitialRingGroupStatus {
  agentId: string;
  status: string;
}

export interface InitialAcdStatus {
  agentId: string;
  status: string;
  voipProxies: string;
  qList: Array<AcdQueueMembership>;
}

export class DirectionCfg {
  direction: ExtInterface.Direction;
  constructor(direction: ExtInterface.Direction) {
    this.direction = direction;
  }
}

export class LoginStatus {
  loginStatus: ExtInterface.LoggedStatus;
  loginId: string;
  loggedAtOtherDevice: string;
  constructor() {
    this.loginStatus = ExtInterface.LoggedStatus.LoginUnknown; //
    this.loginId = ''; //      agentId,  rgAgentId, ACDAgentID
    this.loggedAtOtherDevice = '';
  }
}

export class AgentLoginStatus extends LoginStatus {
  firstName: string;
  middleName: string;
  lastName: string;
  pSAPName: string;
  pSAPId: string;
  role: string;
  constructor(agentInfo: AgentInfo | null, info: Info | null) {
    super();
    if (agentInfo) {
      this.firstName = agentInfo.firstName;
      this.middleName = agentInfo.middleName;
      this.lastName = agentInfo.lastName;
      this.pSAPName = agentInfo.pSAPName;
      this.pSAPId = agentInfo.pSAPID;
      this.role = agentInfo.role;
    } else {
      this.firstName = '';
      this.middleName = '';
      this.lastName = '';
      this.pSAPName = '';
      this.pSAPId = '';
      this.role = '';
    }
    if (info) {
      this.loginStatus = info.status;
      this.loginId = info.agentId;
      this.loggedAtOtherDevice = info.otherDevice;
    } else {
      this.loginStatus = ExtInterface.LoggedStatus.LoginUnknown;
      this.loginId = '';
      this.loggedAtOtherDevice = '';
    }
  }
}

export class CallRinging extends Event {
  info: { node: number; cssid: string; uci: string; status: ExtInterface.CallRingingStatus };
  constructor(info: { node: number; cssid: string; uci: string; status: ExtInterface.CallRingingStatus }) {
    super('CallRinging');
    this.info = info;
  }
}

export class OutCallAttemptFailure extends Error {
  constructor(message: string | undefined) {
    super(message);
    this.name = 'OutCallAttemptFailure';
    this.message = message || this.name;
  }
}

export class HoldCurrConnectedFailure extends Error {
  constructor(message: string | undefined) {
    super(message);
    this.name = 'HoldCurrConnectedFailure';
    this.message = message || this.name;
  }
}

export class OutCallForbidden extends Error {
  constructor(message: string | undefined) {
    super(message);
    this.name = 'OutCallForbidden';
    this.message = message || this.name;
  }
}

export class MidCallDialingFailure extends Error {
  constructor(message: string | undefined) {
    super(message);
    this.name = 'MidCallDialingFailure';
    this.message = message || this.name;
  }
}

export class CancelOutgoing extends Error {
  constructor(message: string | undefined) {
    super(message);
    this.name = 'CancelOutgoing';
    this.message = message || this.name;
  }
}

export class FinishAudibleAlert extends Event {
  constructor() {
    super('FinishAudibleAlert');
  }
}

export class AudibleAlertASASipNotification extends Event {
  sipId: string;
  constructor(sipId: string) {
    super('AudibleAlertASASipNotification');
    this.sipId = sipId;
  }
}

export interface LinkInfo {
  node: number;
  cssid?: string;
  caller?: string;
  callee?: string;
  callerTrunkAddress?: string;
  calleeTrunkAddress?: string;
}

export class CallOpDoneNotif extends Event {
  ucid: string;
  constructor(ucid: string) {
    super('CallOpDoneNotif');
    this.ucid = ucid;
  }
}

export class DigitRecivedNotification extends Event {
  digit: string;
  sipId: string;
  constructor(digit: string, sipId: string) {
    super('DigitRecivedNotification');
    this.digit = digit;
    this.sipId = sipId;
  }
}
