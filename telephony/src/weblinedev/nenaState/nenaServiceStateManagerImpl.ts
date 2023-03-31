import { Incapable } from '../../telephonyexternalinterfacedef';
import { WebNode } from '../webnode';
import {
  NenaServiceState,
  NenaServiceStateChange,
  NenaServiceStateFull,
  NenaServiceStateManager,
} from './nenaStateTypes';

interface INenaLineDev {
  webNodes: WebNode[];
  report: (event: Event) => void;
}

export class NenaServiceStateManagerImpl implements NenaServiceStateManager {
  private lineDev: INenaLineDev;
  private serviceStates: Map<string, NenaServiceStateFull> = new Map();

  constructor(lineDev: INenaLineDev) {
    this.lineDev = lineDev;
  }

  async nenaServiceStateGetAll(): Promise<NenaServiceStateFull[]> {
    const results = await Promise.allSettled(this.lineDev.webNodes.map((node) => node.nenaServiceStateGetAll()));

    results.forEach((r) => {
      if (r.status === 'fulfilled') {
        this.updateCache(r.value);
      }
    });

    if (!results.some((r) => r.status === 'fulfilled')) {
      throw new Incapable('Failed to fetch Nena Service states from any Node');
    }

    return Array.from(this.serviceStates.values());
  }

  async nenaServiceStateGet(serviceIdentifier: string): Promise<NenaServiceStateFull | undefined> {
    const results = await Promise.allSettled(
      this.lineDev.webNodes.map((node) => node.nenaServiceStateGet(serviceIdentifier))
    );

    results.forEach((r) => {
      if (r.status === 'fulfilled') {
        this.updateCache(r.value);
      }
    });

    if (!results.some((r) => r.status === 'fulfilled')) {
      throw new Incapable('Failed to fetch Nena Service states from any Node');
    }

    return this.serviceStates.get(serviceIdentifier);
  }

  async nenaServiceStateSetOverride(
    serviceIdentifier: string,
    overrideState: NenaServiceState,
    overrideReason: string
  ): Promise<void> {
    const results = await Promise.allSettled(
      this.lineDev.webNodes.map((node) =>
        node.nenaServiceStateSetOverride(serviceIdentifier, overrideState, overrideReason)
      )
    );

    if (!results.some((r) => r.status === 'fulfilled')) {
      throw new Incapable('Failed to set Nena Service state override on any Node');
    }
  }

  async nenaServiceStateClearOverride(serviceIdentifier: string): Promise<void> {
    const results = await Promise.allSettled(
      this.lineDev.webNodes.map((node) => node.nenaServiceStateClearOverride(serviceIdentifier))
    );

    if (!results.some((r) => r.status === 'fulfilled')) {
      throw new Incapable('Failed to clear Nena Service state override on any Node');
    }
  }

  updateCache(newStates: NenaServiceStateFull | NenaServiceStateFull[]) {
    if (newStates instanceof NenaServiceStateFull) {
      this._doUpdateState(newStates);
    } else {
      newStates.forEach((newState) => {
        this._doUpdateState(newState);
      });
    }
  }

  private _doUpdateState(newState: NenaServiceStateFull) {
    const oldState = this.serviceStates.get(newState.serviceIdentifier);
    this.serviceStates.set(newState.serviceIdentifier, newState);

    if (oldState) {
      if (
        oldState.baseState !== newState.baseState ||
        oldState.override !== newState.override ||
        oldState.overrideState !== newState.overrideState ||
        oldState.overrideReason !== newState.overrideReason
      ) {
        this.lineDev.report(new NenaServiceStateChange(oldState, newState));
      }
    }
  }
}

export default NenaServiceStateManagerImpl;
