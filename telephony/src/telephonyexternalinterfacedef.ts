import { WebCall } from './webcall/webcall';
import { CallState } from './webcall/callState';
import * as InternalInterface from './telephonyinternalinterfacedef';
import { WebLine } from './webline/webline';
import { AcdQueueMembership } from './weblinedev/loginState/acdLoginState';
import { IWebRTCGateway } from './config/webRTCGatewayList';

export interface OptionsType {
  dynamicACDSubscribedList: string[];
  providedQlistTest: AcdQueueMembership[];
  vccGwAddr: string[];
  appSrvGwAddr: string[];
  webRtcConfigData: Array<IWebRTCGateway>;
  configHandler: any;
}

export enum ViperNodeState {
  NodeUp = 'NodeUp',
  NodeDown = 'NodeDown',
  Unknown = 'Unknown',
}

export interface ViperNodeStatus {
  nodeId: number;
  nodeState: ViperNodeState;
}

export enum LoggedStatus {
  LoggedIn = 'LoggedIn',
  LoggedOut = 'LoggedOut',
  LoginUnknown = 'LoginUnknown ',
}

export enum ErrorCode {
  Unknown = 'Unknown',
  Incapble = 'Incapble',
  NetworkDown = 'NetworkDown',
  Unreachable = 'Unreachable',
}

export enum StartStat {
  Stopped = 'Stopped',
  WebPhoneStarted = 'WebPhoneStarted',
  VccClientStarted = 'VccClientStarted',
  Started = 'Started',
}

export enum Status {
  Busy = 'Busy',
  Idle = 'Idle',
  InUse = 'InUse',
  Defective = 'Defective',
}

export enum CallType {
  Voice = 'Voice',
  Text = 'Text',
}

export { CallState } from './webcall/callState';

export enum LineType {
  LTIntercom = 'LTIntercom',
  LTADM = 'LTADM',
  LT911 = 'LT911',
  LTACD = 'LTACD',
  LTSIP = 'LTSIP',
  LTUnknown = 'LTUnknown',
}

export enum LineSharedType {
  LSTUnknown = 'LSTUnknown',
  LSTPrivate = 'LSTPrivate',
  LSTAutoPrivacy = 'LSTAutoPrivacy',
  LSTShared = 'LSTShared',
  LSTPublic = 'LSTPublic',
}

export enum LineTrunkType {
  LTTUnknown = 'LTTUnknown',
  LTTCIM = 'LTTCIM',
  LTTAIM = 'LTTAIM',
  LTTISDN = 'LTTISDN',
  LTTCAS = 'LTTCAS',
  LTTNG911 = 'LTTNG911',
}

export enum ForceNpaOnLocalCalls {
  Default = 'Default',
  True = 'True',
  False = 'False',
}

export enum Direction {
  Incoming = 'Incoming',
  Outgoing = 'Outgoing',
  None = 'None',
}

export enum RttMediaOutgoingCallsMode {
  RttMediaOutgoingCallsDisable = 'RttMediaOutgoingCallsDisable',
  RttMediaOutgoingCallsEnable = 'RttMediaOutgoingCallsEnable',
  None = 'None',
}

export enum RttMediaStatus {
  RttMediaNotConnected = 'RttMediaNotConnected',
  RttMediaConnected = 'RttMediaConnected',
}

export enum CallPriority {
  CPLowest = 1,
  CPLow,
  CPBelowNormal,
  CPNormal,
  CPAboveNormal,
  CPHigh,
  CPHighest,
}

export enum CtiHardwareStatus {
  Down = 'Down',
  Up = 'Up',
  NotAvailable = 'NotAvailable',
}

export enum CtiHardwareType {
  'None' = 'None',
  'Sonic' = 'Sonic',
  'PowerStationG3' = 'PowerStation G3',
  'SonicG3' = 'Sonic G3',
}

export enum CSSEventType {
  StateUpdate = 'StateUpdate',
  InformationUpdate = 'InformationUpdate',
  ConnectedStatus = 'ConnectedStatus',
  LineChangeEvent = 'LineChangeEvent',
  CtiHardwareUpdate = 'CtiHardwareUpdate',
  ItrrStatusUpdate = 'ItrrStatusUpdate',
}

export enum CallRingingStatus {
  RingingOK = 'CallRingingOK',
  RingingProgress = 'CallRingingInProgress',
  RingingFail = 'CallRingingFail',
  RingingAbort = 'CallRingingCancel',
}

export class LoginChange extends Event {
  newStatus: LoggedStatus;
  loginId: string;
  alreaydloggedAt: string;
  constructor(type: string, info: InternalInterface.LoginStatus) {
    super(type);
    this.newStatus = info.loginStatus;
    this.loginId = info.loginId;
    this.alreaydloggedAt = info.loggedAtOtherDevice;
  }
}

export class AgentLoginChange extends LoginChange {
  newStatus: LoggedStatus;
  loginId: string;
  alreaydloggedAt: string;
  constructor(type: string, info: InternalInterface.LoginStatus) {
    super(type, info);
    this.newStatus = info.loginStatus;
    this.loginId = info.loginId;
    this.alreaydloggedAt = info.loggedAtOtherDevice;
  }
}

// ACD Queue interface and type definitions
export type {
  AcdLoginState,
  AcdLoginStateChange,
  AcdOpResult,
  AcdQueueMembership,
} from './weblinedev/loginState/acdLoginState';
export {
  AcdLoginStateChangeEvent,
  AcdLoginStatus,
  AcdMemberType,
  AcdOpStatus,
} from './weblinedev/loginState/acdLoginState';

// Ring Group interface and type definitions
export type { RgLoginState, RgLoginStateChange, RgOpResult } from './weblinedev/loginState/rgLoginState';
export { RgLoginStateChangeEvent, RgLoginStatus, RgOpStatus } from './weblinedev/loginState/rgLoginState';

export class TelephonyStartState extends Event {
  startState: StartStat;
  constructor(eventName: string, newStatus: StartStat) {
    super(eventName);
    this.startState = newStatus;
  }
}

export class StateUpdate extends Event {
  webCall: WebCall;
  oldState: CallState;
  newState: CallState;
  parkDN: string;
  constructor(eventName: string, newCall: WebCall, newStatus: CallState) {
    super(eventName);
    this.newState = newStatus;
    this.webCall = newCall;
    this.oldState = CallState.Unknown;
    this.parkDN = newCall.parkDN;
  }
}

export class LineStateUpdate extends Event {
  newStatus = Status.Idle;
  webLine: WebLine;
  constructor(eventName: string, webline: WebLine, newStatus: Status) {
    super(eventName);
    this.webLine = webline;
    this.newStatus = newStatus;
  }
}

export class AgentLogonException extends Error {
  agentId: string;
  otherAgent: string;
  otherPosition: string;
  constructor(agentId: string, otherAgent: string, otherDevice: string) {
    super();
    this.agentId = agentId;
    this.otherAgent = otherAgent; // In case another agent is already logged on this position.
    this.otherPosition = otherDevice;
  }
}

export class AgentAlreadyLogonLocally extends Error {
  agentId: string;
  constructor(agentId: string) {
    super();
    this.agentId = agentId;
  }
}

export class GlobalLogInFailure extends Event {
  agentId: string;
  errorCode: ErrorCode;
  constructor(eventName: string, agentId: string, errorCode: ErrorCode) {
    super(eventName);
    this.agentId = agentId;
    this.errorCode = errorCode;
  }
}

export class Service {
  counseling: string = '';
  counselingChildren: string = '';
  counselingMentalHealth: string = '';
  counselingSuicide: string = '';
  sos: string = '';
  sosAmbulance: string = '';
  sosAnimalControl: string = '';
  sosFire: string = '';
  sosGas: string = '';
  sosMarine: string = '';
  sosMountain: string = '';
  sosPhysician: string = '';
  sosPoison: string = '';
  sosPolice: string = '';
}

export class ServiceUpdate extends Event {
  call: WebCall;
  counseling: boolean = false;
  counselingChildren: boolean = false;
  counselingMentalHealth: boolean = false;
  counselingSuicide: boolean = false;
  sos: boolean = false;
  sosAmbulance: boolean = false;
  sosAnimalControl: boolean = false;
  sosFire: boolean = false;
  sosGas: boolean = false;
  sosMarine: boolean = false;
  sosMountain: boolean = false;
  sosPhysician: boolean = false;
  sosPoison: boolean = false;
  sosPolice: boolean = false;
  constructor(call: WebCall) {
    super('ServiceUpdate');
    this.call = call;
  }
}

export class Information {
  callingPartyId: string = '';
  confirmedCallback: boolean = false;
  callingPartyExt: string = '';
  callingPartyName: string = '';
  callingPartyData: string = '';
  calledPartyId: string = '';
  calledPartyName: string = '';
  calledPartyData: string = '';
  connectedPartyId: string = '';
  connectedPartyName: string = '';
  connectedPartyData: string = '';
  aniFlash: boolean = false;
  trunkAddress: string = '';
  dnis: string = '';
  aliRequestKey: string = '';
  calledPartyIdReportTs: string = '';
  momCalledPartyId: string = '';
  wireless: boolean = false;
  rtxDebounceDelay: number = 0;
  callPriority: CallPriority;
  callReferenceValue: string = '';
  uniqueCallId: string = '';
  originalUCI: string = '';
  m911CallOrigin: string = '';
  reofferDetails: string = '';
  eisInformation: string = '';
  initRoute: string = '';
  route: string = '';
  psapName: string = '';
  presence: string = '';
  conferenceId: string = '';
  bargedIn: string = '';
  trunkToTrunkTransfer: string = '';
  pidflo: string = '';
  additionalData: string = '';
  locationBy: string = '';
  subject: string = '';
  aliTimeCount: BigInt = 0n;
  dtmfInfo: string = '';
  lisErrorCode: string = '';
  lisErrorMessage: string = '';
  lisErrorData: string = '';
  referredBy: string = '';
  constructor() {
    this.callPriority = CallPriority.CPNormal;
  }
}

export class InformationUpdate extends Event {
  call: WebCall;
  callingPartyId: boolean = false;
  confirmedCallback: boolean = false;
  callingPartyExt: boolean = false;
  callingPartyName: boolean = false;
  callingPartyData: boolean = false;
  calledPartyId: boolean = false;
  calledPartyName: boolean = false;
  calledPartyData: boolean = false;
  connectedPartyId: boolean = false;
  connectedPartyName: boolean = false;
  connectedPartyData: boolean = false;
  aniFlash: boolean = false;
  userInfo: boolean = false;
  trunkAddress: boolean = false;
  dnis: boolean = false;
  aliRequestKey: boolean = false;
  wireless: boolean = false;
  callPriority: boolean = false;
  callReferenceValue: boolean = false;
  uniqueCallId: boolean = false;
  originalUCI: boolean = false;
  call911Origin: boolean = false;
  reofferReason: boolean = false;
  reofferDetails: boolean = false;
  eisInformation: boolean = false;
  initRoute: boolean = false;
  route: boolean = false;
  psapName: boolean = false;
  presence: boolean = false;
  conferenceId: boolean = false;
  bargedIn: boolean = false;
  trunkToTrunkTransfer: boolean = false;
  pidflo: boolean = false;
  additionalData: boolean = false;
  locationBy: boolean = false;
  subject: boolean = false;
  aliTimeCount: boolean = false;
  cadSkipAliPhase1: boolean = false;
  dtmfInfo: boolean = false;
  lisError: boolean = false;

  constructor(call: WebCall) {
    super('InformationUpdate');
    this.call = call;
  }
}

export class AutoRequestUpdate extends Event {
  call: WebCall;
  autoRequestActive: boolean = false;

  constructor(call: WebCall) {
    super('AutoRequestUpdate');
    this.call = call;
  }
}

export class ConnectedStatus extends Event {
  connected: boolean;
  constructor(connected: boolean) {
    super(CSSEventType.ConnectedStatus);
    this.connected = connected;
  }
}

export class LineChangeEvent extends Event {
  call: WebCall;
  callState: CallState;
  oldLine: WebLine | null;
  newLine: WebLine | null;
  constructor(call: WebCall, oldLine: WebLine | null, newLine: WebLine | null) {
    super(CSSEventType.LineChangeEvent);
    this.call = call;
    this.callState = CallState.Unknown;
    this.oldLine = oldLine;
    this.newLine = newLine;
  }
}

export class CtiHardwareUpdate extends Event {
  status: CtiHardwareStatus;
  hardwareType: CtiHardwareType;
  constructor(status: CtiHardwareStatus, hardwareType: CtiHardwareType) {
    super(CSSEventType.CtiHardwareUpdate);
    this.status = status;
    this.hardwareType = hardwareType;
  }
}

//placeHolder for Power
export class UserData {
  protected cleanup() {} //placeholder for Power override
}

export interface DbrResponse {
  ani: string;
  request_id: string;
  ali: string;
  aliTimeCount: BigInt;
  pidflo: string;
}

export class DialingPrefix {
  localPrefix: string;
  longDPrefix: string;
  npa: string;
  nxx: string;
  forceNPAOnLocalCalls: ForceNpaOnLocalCalls;

  constructor(
    localPrefix: string,
    longDPrefix: string,
    npa: string,
    nxx: string,
    forceNPAOnLocalCalls: ForceNpaOnLocalCalls
  ) {
    this.localPrefix = localPrefix;
    this.longDPrefix = longDPrefix;
    this.npa = npa;
    this.nxx = nxx;
    this.forceNPAOnLocalCalls = forceNPAOnLocalCalls;
  }
}

export class ParkReofferDevice extends Event {
  call: WebCall;
  device: string;

  constructor(call: WebCall, device: string) {
    super('ParkReofferDevice');
    this.call = call;
    this.device = device;
  }
}

export class ParkReofferRoute extends Event {
  call: WebCall;
  route: string;

  constructor(call: WebCall, route: string) {
    super('ParkReofferRoute');
    this.call = call;
    this.route = route;
  }
}

export class ParkTimeoutWarning extends Event {
  call: WebCall;
  remainingSec: number;

  constructor(call: WebCall, remainingSec: number) {
    super('ParkTimeoutWarning');
    this.call = call;
    this.remainingSec = remainingSec;
  }
}

export class ParkTimeoutReached extends Event {
  call: WebCall;
  remainingSec: number;

  constructor(call: WebCall, remainingSec: number) {
    super('ParkTimeoutReached');
    this.call = call;
    this.remainingSec = remainingSec;
  }
}

export enum TddInitiationType {
  Answering,
  Originating,
}

export enum TddMessageDirectionType {
  Incoming,
  Outgoing,
}

export class TddLinkUpEvent extends Event {
  constructor() {
    super('TddLinkUpEvent');
  }
}

export class TddLinkDownEvent extends Event {
  constructor() {
    super('TddLinkDownEvent');
  }
}

export class TddConnectEvent extends Event {
  call: WebCall | null;
  initiation: TddInitiationType;
  constructor(call: WebCall | null, initiation: TddInitiationType) {
    super('TddConnectEvent');
    this.call = call;
    this.initiation = initiation;
  }
}

export class TddConnectTimeoutEvent extends Event {
  call: WebCall | null;
  constructor(call: WebCall | null) {
    super('TddConnectTimeoutEvent');
    this.call = call;
  }
}

export class TddConnectAbortEvent extends Event {
  call: WebCall | null;
  constructor(call: WebCall | null) {
    super('TddConnectAbortEvent');
    this.call = call;
  }
}

export class TddDisconnectEvent extends Event {
  call: WebCall | null;
  constructor(call: WebCall | null) {
    super('TddDisconnectEvent');
    this.call = call;
  }
}

export class TddDetectEvent extends Event {
  call: WebCall | null;
  constructor(call: WebCall | null) {
    super('TddDetectEvent');
    this.call = call;
  }
}

export class TddMessageEvent extends Event {
  direction: TddMessageDirectionType;
  message: string;
  constructor(direction: TddMessageDirectionType, message: string) {
    super('TddMessageEvent');
    this.direction = direction;
    this.message = message;
  }
}

export enum HCOMode {
  HCOOn,
  HCOOff,
}

export enum VCOMode {
  VCOOn,
  VCOOff,
}

export class HcoModeChange extends Event {
  mode: HCOMode;
  constructor(mode: HCOMode) {
    super('HcoModeChange');
    this.mode = mode;
  }
}

export class VcoModeChange extends Event {
  mode: VCOMode;
  constructor(mode: VCOMode) {
    super('VcoModeChange');
    this.mode = mode;
  }
}

export class MsrpMessageEvent extends Event {
  call: WebCall;
  senderInfo: string;
  sequenceNumber: number;
  receivedText: string;
  constructor(call: WebCall, senderInfo: string, sequenceNumber: number, receivedText: string) {
    super('MsrpMessageEvent');
    this.call = call;
    this.senderInfo = senderInfo;
    this.sequenceNumber = sequenceNumber;
    this.receivedText = receivedText;
  }
}

export class TextOwnerChange extends Event {
  newOwner: string;
  call: WebCall;
  constructor(call: WebCall, newOwner: string) {
    super('TextOwnerChange');
    this.call = call;
    this.newOwner = newOwner;
  }
}

export class RttMessageEvent extends Event {
  call: WebCall;
  senderInfo: string;
  sequenceNumber: number;
  receivedText: string;
  constructor(call: WebCall, senderInfo: string, sequenceNumber: number, receivedText: string) {
    super('RttMessageEvent');
    this.call = call;
    this.senderInfo = senderInfo;
    this.sequenceNumber = sequenceNumber;
    this.receivedText = receivedText;
  }
}

export class OutRttMessageEvent extends Event {
  call: WebCall;
  senderInfo: string;
  sequenceNumber: number;
  sentText: string;
  constructor(call: WebCall, senderInfo: string, sequenceNumber: number, sentText: string) {
    super('OutRttMessageEvent');
    this.call = call;
    this.senderInfo = senderInfo;
    this.sequenceNumber = sequenceNumber;
    this.sentText = sentText;
  }
}

export class RttMediaStatusEvent extends Event {
  webCall: WebCall;
  status: RttMediaStatus;
  constructor(newCall: WebCall, newStatus: RttMediaStatus) {
    super('RttMediaStatusEvent');
    this.status = newStatus;
    this.webCall = newCall;
  }
}

export class CallReferNotifySipfragEvent extends Event {
  uci: string;
  chanName: string;
  referResp: string;
  sipfrag: string;
  call: WebCall;
  constructor(call: WebCall, uci: string, chanName: string, referResp: string, sipfrag: string) {
    super('CallReferNotifySipfragEvent');
    this.call = call;
    this.uci = uci;
    this.chanName = chanName;
    this.referResp = referResp;
    this.sipfrag = sipfrag;
  }
}

export class ConfigUpdateEvent extends Event {
  viperVersion: string;
  mmHoldKeepAlive: string;
  t2tBlockBargeIn: string;
  qList: string;
  rgList: string;
  blockUnsupervisedTxfrList: string;
  constructor(
    viperVersion: string,
    mmHoldKeepAlive: string,
    t2tBlockBargeIn: string,
    qList: string,
    rgList: string,
    blockUnsupervisedTxfrList: string
  ) {
    super('ConfigUpdateEvent');
    this.viperVersion = viperVersion;
    this.mmHoldKeepAlive = mmHoldKeepAlive;
    this.t2tBlockBargeIn = t2tBlockBargeIn;
    this.qList = qList;
    this.rgList = rgList;
    this.blockUnsupervisedTxfrList = blockUnsupervisedTxfrList;
  }
}

export enum HandsetType {
  HandsetAgent, //a.k.a. Handset 1
  HandsetTrainer, //a.k.a. Handset 2
}

export enum MuteState {
  MuteOff,
  MuteOn,
}

export class MuteChange extends Event {
  handset: HandsetType;
  state: MuteState;
  constructor(handset: HandsetType, state: MuteState) {
    super('MuteChange');
    this.handset = handset;
    this.state = state;
  }
}

export enum HandsetDetectType {
  NoneConnected,
  AtLeastOneConnected,
}

export class HandsetDetectChange extends Event {
  state: HandsetDetectType;
  constructor(state: HandsetDetectType) {
    super('HandsetDetectChange');
    this.state = state;
  }
}

export enum RadioStatus {
  Disable,
  Enable,
}

export enum RadioMode {
  Split,
  Combine,
}

export class RadioTransmitMode extends Event {
  status: RadioStatus;
  constructor(status: RadioStatus) {
    super('RadioTransmitMode');
    this.status = status;
  }
}

export class RadioReceptionMode extends Event {
  status: RadioStatus;
  constructor(status: RadioStatus) {
    super('RadioReceptionMode');
    this.status = status;
  }
}

export class RadioModeChange extends Event {
  mode: RadioMode;
  constructor(mode: RadioMode) {
    super('RadioModeChange');
    this.mode = mode;
  }
}

export enum PttState {
  PttOff,
  PttOn,
}

export enum AGCState {
  Disable,
  Enable,
}

export class AGCStatus extends Event {
  status: AGCState;
  constructor(status: AGCState) {
    super('AGCStatus');
    this.status = status;
  }
}

export class CallTakerAGCStatus extends Event {
  status: AGCState;
  constructor(status: AGCState) {
    super('CallTakerAGCStatus');
    this.status = status;
  }
}

export enum NRState {
  Disable,
  Enable,
}

export class CallTakerNRStatus extends Event {
  status: NRState;
  constructor(status: NRState) {
    super('CallTakerNRStatus');
    this.status = status;
  }
}

// Ordered from lowest to highest priority
export enum ProgressTone {
  DialTone = 1,
  BusyTone,
  ReorderTone,
  RingbackTone,
}

// Conference exports
export * from './webconference/conferenceTypes';
export * from './webconference/conferenceCreate';

// AppSvrGw Link status
export enum AppSvrGwLink {
  Down = 'Down',
  Up = 'Up',
}

export class AppSvrGwLinkStatus extends Event {
  status: AppSvrGwLink;
  constructor(status: AppSvrGwLink) {
    super('AppSvrGwLinkStatus');
    this.status = status;
  }
}

export class GreetingStarted extends Event {
  id: string;
  src: string;
  constructor(id: string, src: string) {
    super('GreetingStarted');
    this.id = id;
    this.src = src;
  }
}

export class GreetingEnded extends Event {
  id: string;
  src: string;
  constructor(id: string, src: string) {
    super('GreetingEnded');
    this.id = id;
    this.src = src;
  }
}

export class RecGreetingStarted extends Event {
  id: string;
  startTime: Date;
  constructor(id: string) {
    super('RecGreetingStarted');
    this.id = id;
    this.startTime = new Date();
  }
}

export class RecGreetingEnded extends Event {
  id: string;
  blob: Blob;
  endTime: Date;
  constructor(id: string, blob: Blob) {
    super('RecGreetingEnded');
    this.id = id;
    this.blob = blob;
    this.endTime = new Date();
  }
}

export enum BeepType {
  Alarm,
  Abandon,
  NewText,
  Incident,
  Broadcast,
  TtyValidateBaudot,
}

export class GlobalVccGWConnectionFalure extends Error {
  constructor(message: string | undefined) {
    super(message);
    this.name = 'GlobalVccGWConnectionsFalure';
    this.message = message || this.name;
  }
}

export class Incapable extends Error {
  constructor(message: string | undefined) {
    super(message);
    this.name = 'Incapable';
    this.message = message || this.name;
  }
}

export class Timeout extends Error {
  constructor(message: string | undefined) {
    super(message);
    this.name = 'Timeout';
    this.message = message || this.name;
  }
}

export class LineLocked extends Error {
  constructor(message: string | undefined) {
    super(message);
    this.name = 'LineLocked';
    this.message = message || this.name;
  }
}

export class CallRingingProgress extends Event {
  call: WebCall;
  constructor(call: WebCall) {
    super('CallRingingProgress');
    this.call = call;
  }
}

export class ViperNodesStates extends Event {
  nodesState: Array<ViperNodeStatus>;
  constructor(nodesState: Array<ViperNodeStatus>) {
    super('ViperNodesStates');
    this.nodesState = nodesState;
  }
}

export class ViperNodeStateChange extends Event {
  newState: ViperNodeState;
  oldState: ViperNodeState;
  nodeId: number;
  constructor(newState: ViperNodeState, oldState: ViperNodeState, nodeId: number) {
    super('ViperNodeStateChange');
    this.newState = newState;
    this.oldState = oldState;
    this.nodeId = nodeId;
  }
}

export class ExclusiveHoldUnholdFailure extends Error {
  constructor(message: string | undefined) {
    super(message);
    this.name = 'ExclusiveHoldUholdFailure';
    this.message = message || this.name;
  }
}

export const ItrrMinusInfinity: Date = new Date(0);
export const ItrrPlusInfinity: Date = new Date(8640000000000000);

export enum ItrrChannelType {
  Super = 0,
  Telephony = 1,
  Radio = 2,
}

export enum ItrrSelectionMode {
  NoLoop = 0,
  Loop,
}

export enum ItrrDirection {
  Incoming = 1,
  Outgoing,
}

export enum ItrrMarkType {
  InvalidMark = 0,
  RecordingStart,
  RecordingStop,
  SilenceSuppressionStart,
  SilenceSuppressionStop,
  ConversationBegin,
  ConversationEnd,
  ConversationPause,
  ConversationResume,
}

export enum ItrrStatus {
  Down = 'Down',
  Up = 'Up',
  NotAvailable = 'NotAvailable',
}

export class ItrrStatusUpdate extends Event {
  status: ItrrStatus;
  constructor(status: ItrrStatus) {
    super(CSSEventType.ItrrStatusUpdate);
    this.status = status;
  }
}

export enum ItrrSinkFlagConstants {
  SectionUpdateEvents = 1,
  PlaybackUpdateEvents = 4,
}

export enum ItrrSectionType {
  Normal, // section contains recorded audio
  Silent, // section is silent
  Blank, // section indicates a period when the recording process wasn't active
  OutOfFile, // section is out of the range covered by the file
  Conversation,
}

export enum ItrrSectionUpdateType {
  SectionCreated,
  SectionUpdated,
  SectionDeleted,
}

export class ItrrSectionInfo {
  public ctxId: number;
  public callId: number;
  public direction: ItrrDirection;
  public phoneNumber: string;

  constructor(ctxId: number, callId: ItrrSectionType, direction: ItrrDirection, phoneNumber: string) {
    this.ctxId = ctxId;
    this.callId = callId;
    this.direction = direction;
    this.phoneNumber = phoneNumber;
  }
}

export class ItrrSection {
  public sectionId: number;
  public sectionType: ItrrSectionType;
  public startTime: Date;
  public endTime: Date;
  public updateStatus: ItrrSectionUpdateType;
  public sectionInfo: ItrrSectionInfo;

  constructor(
    sectionId: number,
    sectionType: ItrrSectionType,
    startTime: Date,
    endTime: Date,
    updateStatus: ItrrSectionUpdateType,
    sectionInfo: ItrrSectionInfo
  ) {
    this.sectionId = sectionId;
    this.sectionType = sectionType;
    this.startTime = startTime;
    this.endTime = endTime;
    this.updateStatus = updateStatus;
    this.sectionInfo = sectionInfo;
  }
}

export class ItrrSectionUpdate extends Event {
  fileIndex: number;
  channelId: ItrrChannelType;
  sections: Array<ItrrSection>;
  constructor(fileIndex: number, channelId: ItrrChannelType, sections: Array<ItrrSection>) {
    super('ItrrSectionUpdate');
    this.fileIndex = fileIndex;
    this.channelId = channelId;
    this.sections = sections;
  }
}

export enum ItrrPlaybackState {
  Error,
  Playing,
  Paused,
  Stopped,
  PlaybackStarting,
}

export class ItrrPlaybackUpdate extends Event {
  fileIndex: number;
  time: Date;
  state: ItrrPlaybackState;
  constructor(fileIndex: number, time: Date, state: ItrrPlaybackState) {
    super('ItrrPlaybackUpdate');
    this.fileIndex = fileIndex;
    this.time = time;
    this.state = state;
  }
}

export enum RecordAvailabilityStatusType {
  eRecordUnknown,
  eRecordNotAvailable,
  eRecordAvailable,
  eRecordSaved,
}

export class RecordStatus {
  ctxId: number;
  status: RecordAvailabilityStatusType;
  constructor(ctxId: number, status: RecordAvailabilityStatusType) {
    this.ctxId = ctxId;
    this.status = status;
  }
}

export class RecordStatusChange extends Event {
  recordsStatus: Array<RecordStatus>;
  constructor(recordsStatus: Array<RecordStatus>) {
    super('RecordStatusChange');
    this.recordsStatus = recordsStatus;
  }
}

export class ExportItrrFile {
  fileName: string;
  saved: boolean;
  constructor(fileName: string, saved: boolean) {
    this.fileName = fileName;
    this.saved = saved;
  }
}

export class ExportItrrFileChange extends Event {
  files: Array<ExportItrrFile>;
  constructor(files: Array<ExportItrrFile>) {
    super('ExportItrrFileChange');
    this.files = files;
  }
}

export {
  Status as ParticipantStatus,
  ParticipantType,
  JoiningMethod,
  Participant,
  ParticipantAdded,
  ParticipantRemoved,
  ParticipantUpdated,
} from './webconference/confinfo';

export { ListenJoinChange, ListenJoinMonitoringMode, ljModeString } from './weblinedev/listenJoin';

// Nena Status exports
export * from './weblinedev/nenaState/nenaStateTypes';

export class ExportSilentCallDigitInfo extends Event {
  digit: string;
  call: WebCall;
  constructor(digit: string, call: WebCall) {
    super('ExportSilentCallDigitInfo');
    this.digit = digit;
    this.call = call;
  }
}

export class ExportVMNotifyEvent extends Event {
  agentId: number;
  nbNewMessage: number;
  nbOldMessage: number;
  available: boolean;
  constructor(agentId: number, nbNewMessage: number, nbOldMessage: number, available: boolean) {
    super('ExportVMNotifyEvent');
    this.agentId = agentId;
    this.nbNewMessage = nbNewMessage;
    this.nbOldMessage = nbOldMessage;
    this.available = available;
  }
}

export interface LvfResponse {
  request_id: string;
  response: string;
}

export { DynamicACDUpdate, AgentStat } from './weblinedev/dynamicACDBySupervisor/dynamicACDStatus';
export type { AgentQueueStatus, QueueStat, SVNAgentsInfo } from './weblinedev/dynamicACDBySupervisor/dynamicACDStatus';
