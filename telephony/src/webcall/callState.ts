export enum CallState {
  Abandoned = 'Abandoned',
  Busy = 'Busy',
  Conference = 'Conference',
  ConferenceHold = 'ConferenceHold',
  Connected = 'Connected',
  Connecting = 'Connecting',
  ConsultationHold = 'ConsultationHold',
  DialCompleted = 'DialCompleted',
  Dialtone = 'Dialtone',
  Disconnected = 'Disconnected',
  Failed = 'Failed',
  Finished = 'Finished',
  Finishing = 'Finishing',
  Hold = 'Hold',
  Idle = 'Idle',
  IHold = 'IHold',
  Offered = 'Offered',
  OnHoldPendingConference = 'OnHoldPendingConference',
  Park = 'Park',
  PendingConsultation = 'PendingConsultation',
  Proceeding = 'Proceeding',
  ReOffered = 'ReOffered',
  Ringback = 'Ringback',
  Unknown = 'Unknown',
}

const CallStateTable = {
  Abandoned: 0,
  Busy: 1,
  Conference: 2,
  ConferenceHold: 3,
  Connected: 4,
  Connecting: 5,
  ConsultationHold: 6,
  DialCompleted: 7,
  Dialtone: 8,
  Disconnected: 9,
  Failed: 10,
  Finished: 11,
  Finishing: 12,
  Hold: 13,
  Idle: 14,
  IHold: 15,
  Offered: 16,
  OnHoldPendingConference: 17,
  Park: 18,
  PendingConsultation: 19,
  Proceeding: 20,
  ReOffered: 21,
  Ringback: 22,
  Unknown: 23,
};

export declare namespace CallState {
  export function connected(state: CallState): boolean;
  export function ringing(state: CallState): boolean;
  export function hold(state: CallState): boolean;
  export function offered(state: CallState): boolean;
  export function parked(state: CallState): boolean;
  export function busy(state: CallState): boolean;
  export function toInt(state: CallState): number;
}

CallState.connected = function connected(state: CallState): boolean {
  return (
    state === CallState.Connected ||
    state === CallState.Disconnected ||
    state === CallState.Proceeding ||
    state === CallState.Ringback ||
    state === CallState.Dialtone ||
    state === CallState.Connecting ||
    state === CallState.Finishing
  );
};

CallState.ringing = function ringing(state: CallState): boolean {
  return state === CallState.Offered || state === CallState.ReOffered || state === CallState.Abandoned;
};

CallState.hold = function hold(state: CallState): boolean {
  return state === CallState.Hold || state === CallState.IHold;
};

CallState.offered = function offered(state: CallState): boolean {
  return state === CallState.Offered || state === CallState.ReOffered;
};

CallState.parked = function parked(state: CallState): boolean {
  return state === CallState.Park;
};

CallState.busy = function busy(state: CallState): boolean {
  return state === CallState.Busy;
};

CallState.toInt = function toInt(state: CallState): number {
  return CallStateTable[state];
};

export enum CongestionState {
  NotCongested = 'NotCongested',
  CongestedClientTone = 'CongestedClientTone',
  CongestedServerTone = 'CongestedServerTone',
}

export default CallState;
