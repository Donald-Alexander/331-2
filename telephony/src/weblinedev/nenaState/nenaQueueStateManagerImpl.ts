import { Incapable } from '../../telephonyexternalinterfacedef';
import { WebNode } from '../webnode';
import { NenaQueueState, NenaQueueStateChange, NenaQueueStateFull, NenaQueueStateManager } from './nenaStateTypes';

interface INenaLineDev {
  webNodes: WebNode[];
  report: (event: Event) => void;
}

export class NenaQueueStateManagerImpl implements NenaQueueStateManager {
  private lineDev: INenaLineDev;
  private queueStates: Map<string, NenaQueueStateFull> = new Map();

  constructor(lineDev: INenaLineDev) {
    this.lineDev = lineDev;
  }

  async nenaQueueStateGetAll(): Promise<NenaQueueStateFull[]> {
    const results = await Promise.allSettled(this.lineDev.webNodes.map((node) => node.nenaQueueStateGetAll()));

    results.forEach((r) => {
      if (r.status === 'fulfilled') {
        this.updateCache(r.value);
      }
    });

    if (!results.some((r) => r.status === 'fulfilled')) {
      throw new Incapable('Failed to fetch Nena Queue states from any Node');
    }

    return Array.from(this.queueStates.values());
  }

  async nenaQueueStateGet(queueIdentifier: string): Promise<NenaQueueStateFull | undefined> {
    const results = await Promise.allSettled(
      this.lineDev.webNodes.map((node) => node.nenaQueueStateGet(queueIdentifier))
    );

    results.forEach((r) => {
      if (r.status === 'fulfilled') {
        this.updateCache(r.value);
      }
    });

    if (!results.some((r) => r.status === 'fulfilled')) {
      throw new Incapable('Failed to fetch Nena Queue states from any Node');
    }

    return this.queueStates.get(queueIdentifier);
  }

  async nenaQueueStateSetOverride(
    queueIdentifier: string,
    overrideState: NenaQueueState,
    overrideReason: string
  ): Promise<void> {
    const results = await Promise.allSettled(
      this.lineDev.webNodes.map((node) =>
        node.nenaQueueStateSetOverride(queueIdentifier, overrideState, overrideReason)
      )
    );

    if (!results.some((r) => r.status === 'fulfilled')) {
      throw new Incapable('Failed to set Nena Queue state override on any Node');
    }
  }

  async nenaQueueStateClearOverride(queueIdentifier: string): Promise<void> {
    const results = await Promise.allSettled(
      this.lineDev.webNodes.map((node) => node.nenaQueueStateClearOverride(queueIdentifier))
    );

    if (!results.some((r) => r.status === 'fulfilled')) {
      throw new Incapable('Failed to clear Nena Queue state override on any Node');
    }
  }

  updateCache(newStates: NenaQueueStateFull | NenaQueueStateFull[]) {
    if (newStates instanceof NenaQueueStateFull) {
      this._doUpdateState(newStates);
    } else {
      newStates.forEach((newState) => {
        this._doUpdateState(newState);
      });
    }
  }

  private _doUpdateState(newState: NenaQueueStateFull) {
    const oldState = this.queueStates.get(newState.queueIdentifier);
    this.queueStates.set(newState.queueIdentifier, newState);

    if (oldState) {
      if (
        oldState.baseState !== newState.baseState ||
        oldState.override !== newState.override ||
        oldState.overrideState !== newState.overrideState ||
        oldState.overrideReason !== newState.overrideReason
      ) {
        this.lineDev.report(new NenaQueueStateChange(oldState, newState));
      }
    }
  }
}

export default NenaQueueStateManagerImpl;
