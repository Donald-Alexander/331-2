import { WebConferenceImpl } from '../webconference/webconference';
import { CallOpDoneNotif } from '../telephonyinternalinterfacedef';
import { WebCall } from './webcall';

// eslint-disable-next-line import/export
export enum CallOp {
  Answer = 'Answer',
  Barge = 'Barge',
  BlindTransfer = 'BlindTransfer',
  Cancelled = 'Cancelled',
  Dial = 'Dial',
  Drop = 'Drop',
  Hold = 'Hold',
  Park = 'Park',
  Reject = 'Reject',
  Unhold = 'Unhold',
  Unpark = 'Unpark',
  MakeCall = 'MakeCall',
  AcdLogOn = 'AcdLogOn',
  AcdLogOff = 'AcdLogOff',
  AcdReady = 'AcdReady',
  AcdNotReady = 'AcdNotReady',
  NextAcdCall = 'NextAcdCall',
  QueueAcdLogOn = 'QueueAcdLogOn',
  QueueAcdLogOff = 'QueueAcdLogOff',
  CallPickup = 'CallPickup',
  Msrp = 'Msrp',
  ConfConnect = 'ConfConnect',
  ConfPatch = 'ConfPatch',
  ListenJoin = 'ListenJoin',
  ListenJoinConnect = 'ListenJoinConnect',
  ListenJoinCancel = 'ListenJoinCancel',
  ConfInfoCreatingConf = 'ConfInfoCreatingConf',
  ConfCreatingNoholdConsultation = 'ConfCreatingNoholdConsultation',
  ConfCreatingNormalConsultation = 'ConfCreatingNormalConsultation',
  VMSubscribe = 'VMSubscribe',
  Rtt = 'Rtt',
}

// eslint-disable-next-line import/export, @typescript-eslint/no-redeclare
export declare namespace CallOp {
  export function start(obj: any, op: CallOp): void;
  export function end(obj: any): void;
  export function inProgress(obj: any): CallOp | undefined;
  export function some(predicate: (obj: any, op: CallOp) => unknown, thisArg?: any): boolean;
  export function get(): Map<any, CallOp>;
}

const inProgressOps: Map<any, CallOp> = new Map();
CallOp.get = function (): Map<any, CallOp> {
  return inProgressOps;
};

CallOp.start = (obj: any, op: CallOp) => {
  inProgressOps.set(obj, op);
};

CallOp.end = (obj: any) => {
  inProgressOps.delete(obj);
  if (obj instanceof WebCall) {
    obj.dispatchEvent(new CallOpDoneNotif(obj.callHeader.uCI));
  }
  if (obj instanceof WebConferenceImpl) {
    obj.eventTarget.dispatchEvent(new CallOpDoneNotif(''));
  }
};

CallOp.inProgress = (obj: any) => {
  return inProgressOps.get(obj);
};

CallOp.some = (predicate: (obj: any, op: CallOp) => unknown, thisArg?: any) => {
  return Array.from(inProgressOps.entries()).some((val) => {
    return predicate(val[0], val[1]);
  }, thisArg);
};

export default CallOp;
