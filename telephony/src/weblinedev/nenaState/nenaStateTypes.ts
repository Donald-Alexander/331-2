export enum NenaServiceState {
  None = 'None',
  Normal = 'Normal',
  Unmanned = 'Unmanned',
  ScheduledMaintenanceDown = 'ScheduledMaintenanceDown',
  ScheduledMaintenanceAvailable = 'ScheduledMaintenanceAvailable',
  MajorIncidentInProgress = 'MajorIncidentInProgress',
  PartialService = 'PartialService',
  Overloaded = 'Overloaded',
  GoingDown = 'GoingDown',
  Down = 'Down',
}

export class NenaServiceStateFull {
  serviceIdentifier: string;
  baseState: NenaServiceState;
  override: boolean;
  overrideState: NenaServiceState;
  overrideReason: string;

  constructor(
    serviceIdentifier: string,
    baseState: NenaServiceState,
    override: boolean = false,
    overrideState: NenaServiceState = NenaServiceState.None,
    overrideReason: string = ''
  ) {
    this.serviceIdentifier = serviceIdentifier;
    this.baseState = baseState;
    this.override = override;
    this.overrideState = overrideState;
    this.overrideReason = overrideReason;
  }

  activeState(): NenaServiceState {
    return this.override ? this.overrideState : this.baseState;
  }
}

export class NenaServiceStateChange extends Event {
  oldState: NenaServiceStateFull;
  newState: NenaServiceStateFull;
  constructor(oldState: NenaServiceStateFull, newState: NenaServiceStateFull) {
    super('NenaServiceStateChange');
    this.oldState = oldState;
    this.newState = newState;
  }
}

export interface NenaServiceStateManager {
  nenaServiceStateGetAll(): Promise<NenaServiceStateFull[]>;
  nenaServiceStateGet(serviceIdentifier: string): Promise<NenaServiceStateFull | undefined>;
  nenaServiceStateSetOverride(
    serviceIdentifier: string,
    overrideState: NenaServiceState,
    overrideReason: string
  ): Promise<void>;
  nenaServiceStateClearOverride(serviceIdentifier: string): Promise<void>;
}

export enum NenaQueueState {
  None = 'None',
  Active = 'Active',
  Inactive = 'Inactive',
  Disabled = 'Disabled',
  Full = 'Full',
  Standby = 'Standby',
}

export class NenaQueueStateFull {
  queueIdentifier: string;
  baseState: NenaQueueState;
  override: boolean;
  overrideState: NenaQueueState;
  overrideReason: string;

  constructor(
    queueIdentifier: string,
    baseState: NenaQueueState,
    override: boolean = false,
    overrideState: NenaQueueState = NenaQueueState.None,
    overrideReason: string = ''
  ) {
    this.queueIdentifier = queueIdentifier;
    this.baseState = baseState;
    this.override = override;
    this.overrideState = overrideState;
    this.overrideReason = overrideReason;
  }

  activeState(): NenaQueueState {
    return this.override ? this.overrideState : this.baseState;
  }
}

export class NenaQueueStateChange extends Event {
  oldState: NenaQueueStateFull;
  newState: NenaQueueStateFull;
  constructor(oldState: NenaQueueStateFull, newState: NenaQueueStateFull) {
    super('NenaQueueStateChange');
    this.oldState = oldState;
    this.newState = newState;
  }
}

export interface NenaQueueStateManager {
  nenaQueueStateGetAll(): Promise<NenaQueueStateFull[]>;
  nenaQueueStateGet(queueIdentifier: string): Promise<NenaQueueStateFull | undefined>;
  nenaQueueStateSetOverride(
    queueIdentifier: string,
    overrideState: NenaQueueState,
    overrideReason: string
  ): Promise<void>;
  nenaQueueStateClearOverride(queueIdentifier: string): Promise<void>;
}
