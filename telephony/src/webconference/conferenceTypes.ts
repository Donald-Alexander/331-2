import { WebCall } from '../webcall/webcall';
import { DialingPrefix } from '../telephonyexternalinterfacedef';
import { ConfInfo, Participant } from './confinfo';

export enum ConferenceMemberType {
  InitialCall = 'InitialCall',
  ConsultCall = 'ConsultCall',
  PatchCall = 'PatchCall',
}

export interface ConferenceMember {
  call: WebCall;
  memberType: ConferenceMemberType;
}

export enum ConferenceConsultType {
  Normal = 'Normal',
  NoHold = 'NoHold',
  TandemNoHold = 'TandemNoHold',
}

export enum ConferenceState {
  Connected = 'Connected',
  Finished = 'Finished',
  Hold = 'Hold',
  HoldPendingConference = 'HoldPendingConference',
  Idle = 'Idle',
}

export interface WebConference {
  readonly confId: number;
  readonly state: ConferenceState;
  readonly members: ConferenceMember[];
  readonly ownerDevice: string;
  readonly consultCall: WebCall | null;
  readonly systemConfId: string;
  readonly participantsMap: Map<string, Participant>;
  readonly eventTarget: EventTarget;

  /** Remove and drop the most recent consultation call */
  cancel(): Promise<void>;
  /** Connect the current consultation call */
  connect(): Promise<void>;
  /** Drop initial call and end the conference */
  drop(): Promise<void>;
  /** Place conference calls on hold */
  hold(): Promise<void>;
  /** Unhold conference calls */
  unhold(): Promise<void>;
  /** Add new call to conference through Normal or NoHold conference invite. Returns new call */
  inviteCall(destAddr: string, prefix: DialingPrefix | null, consultType: ConferenceConsultType): Promise<WebCall>;
  /** Add existing call to conference through Call Patch */
  patchCall(otherCall: WebCall): Promise<void>;
  /** Conference event reporter */
  report(evt: Event): void;
  /** Transfer conference to consultation call, and drop self */
  transfer(): Promise<void>;
  /** Notifier when call state changes */
  callStateUpdate(call: WebCall): void;
  /** update participantsMap by confInfo */
  updateParticipantsMap(confInfo: ConfInfo): Promise<Boolean>;
  /** Remove participant from conference */
  removeFromConference(theParticipant: Participant): Promise<void>;
  /** Remove all participant from conference */
  removeAllFromConference(): Promise<void>;
  /** Deafen/Undeafen participant  */
  deafenParticipant(confParticipant: Participant, deafen: boolean): Promise<void>;
  /** Mute/Unmute participant  */
  muteParticipant(confParticipant: Participant, mute: boolean): Promise<void>;
}

export class ConfCreated extends Event {
  conf: WebConference;
  constructor(conf: WebConference) {
    super('ConfCreated');
    this.conf = conf;
  }
}

export class ConfEnded extends Event {
  conf: WebConference;
  constructor(conf: WebConference) {
    super('ConfEnded');
    this.conf = conf;
  }
}

export class ConfStateUpdate extends Event {
  conf: WebConference;
  oldState: ConferenceState;
  newState: ConferenceState;
  constructor(conf: WebConference, oldState: ConferenceState, newState: ConferenceState) {
    super('ConfStateUpdate');
    this.conf = conf;
    this.oldState = oldState;
    this.newState = newState;
  }
}

export class ConfOwnerChanged extends Event {
  conf: WebConference;
  oldOwner: string;
  newOwner: string;
  constructor(conf: WebConference, oldOwner: string, newOwner: string) {
    super('ConfOwnerChanged');
    this.conf = conf;
    this.oldOwner = oldOwner;
    this.newOwner = newOwner;
  }
}
