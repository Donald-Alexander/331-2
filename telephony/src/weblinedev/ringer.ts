import { WebLineDev } from './weblinedev';
import { WebLine } from '../webline/webline';
import {
  CallState,
  CallPriority,
  CSSEventType,
  StateUpdate,
  ConnectedStatus,
  LineChangeEvent,
} from '../telephonyexternalinterfacedef';
import { wavManager } from './wavManager';
import { Diag } from '../common/diagClient';
const diag = new Diag('Ringer');

export enum RingerMode {
  On = 'On',
  Off = 'Off',
}

interface LineRingerAttributes {
  priority: number;
  highPriority: number; // number of highPriority calls on the line
}

interface RouteRingerAttributes {
  priority: number;
  highPriority: number; // number of highPriority calls on the route
  nbActivation: number;
}

interface Cfg {
  fileName: string;
  onDuration: number;
  offDuration: number;
}

const TOTAL_PRIORITY: number = 10; // total number of Priority [0..9]
const HIGH_PRIORITY: number = 0;
const INVALID_PRIORITY: number = 10;
const ringingStates: Array<CallState> = [CallState.Offered, CallState.ReOffered, CallState.Abandoned];
const offeredStates: Array<CallState> = [CallState.Offered, CallState.ReOffered];

export class Ringer {
  private readonly linedev: WebLineDev;
  private readonly cfgREC: Array<Cfg> = new Array(TOTAL_PRIORITY); // fixed-length array of priority Config
  private priorityCount: Array<number> = new Array(TOTAL_PRIORITY); // fixed-length array of priority count

  private enabledLines: Map<string, LineRingerAttributes> = new Map(); // lineAddress => lineRingerAttributes
  private enabledRoutes: Map<string, RouteRingerAttributes> = new Map(); // routeAddress => routeRingerAttributes

  private _mode: RingerMode = RingerMode.Off;
  private _ringOnConnect: boolean = false;
  private _currentRingingPriority: number = INVALID_PRIORITY;
  private _isCallConnected: boolean = false;

  private onDurationHandler: number = 0;
  private offDurationHandler: number = 0;

  constructor(lineDev: WebLineDev) {
    this.linedev = lineDev;

    this.processEvents = this.processEvents.bind(this);
    this.pause = this.pause.bind(this);
    this.resume = this.resume.bind(this);
  }

  public set mode(md: RingerMode) {
    this._mode = md;

    // reset priorityCount on mode change
    for (let i = 0; i < TOTAL_PRIORITY; i++) {
      this.priorityCount[i] = 0;
    }

    // stop running ringer if mode change to Off
    if (this._mode === RingerMode.Off) {
      this.stop();
    }
  }

  public get mode(): RingerMode {
    return this._mode;
  }

  public set ringOnConnect(value: boolean) {
    this._ringOnConnect = value;
  }

  public get ringOnConnect(): boolean {
    return this._ringOnConnect;
  }

  public set currentRingingPriority(pr: number) {
    this._currentRingingPriority = pr;
  }

  public get currentRingingPriority(): number {
    return this._currentRingingPriority;
  }

  public get isCallConnected(): boolean {
    return this._isCallConnected;
  }

  public config(pr: number, filename: string, on: number, off: number): void {
    if (!this.isValidPriority(pr)) {
      diag.err('config', `Invalid priority: ${pr}`);
      return;
    }

    if (on < 0 || on > 10 || off < 0 || off > 10) {
      diag.err('config', `Ringer timer out of range: on=${on}, off=${off}`);
      return;
    }

    const valid = filename && this.isGoodWavFile(filename);

    // reset priority configuration if filename is invalid
    const cfg: Cfg = {
      fileName: valid ? filename : '',
      onDuration: valid ? on * 1000 : 1000, // convert to ms
      offDuration: valid ? off * 1000 : 1000,
    };

    this.cfgREC[pr] = cfg;

    // set ringer file for the pr in wavManager
    wavManager.setRingerFile(pr, filename);
  }

  public enable(): void {
    diag.trace?.('enable', 'enable ringer on lineDev');

    this.linedev.addEventListener(CSSEventType.StateUpdate, this.processEvents);
    this.linedev.addEventListener(CSSEventType.ConnectedStatus, this.processEvents);
    this.linedev.addEventListener(CSSEventType.LineChangeEvent, this.processEvents);
  }

  public disable(): void {
    diag.trace?.('disable', 'disable ringer on lineDev');

    this.linedev.removeEventListener(CSSEventType.StateUpdate, this.processEvents);
    this.linedev.removeEventListener(CSSEventType.ConnectedStatus, this.processEvents);
    this.linedev.removeEventListener(CSSEventType.LineChangeEvent, this.processEvents);
  }

  // Enable line ringer, using pr provided by P911 because priority could be overridden in profile
  public enableLine(line: WebLine, pr: number): void {
    if (!this.isValidPriority(pr)) {
      diag.warn('enableLine', `Invalid priority: ${pr}`);
      return;
    }

    diag.trace?.('enableLine', `line=${line.addressv}, pr=${pr}`);
    const lineRingerAttr: LineRingerAttributes = {
      priority: pr,
      highPriority: 0,
    };
    this.enabledLines.set(line.addressv, lineRingerAttr);
  }

  // Disable line ringer, running ringer will be stopped when mode is Off
  public disableLine(line: WebLine): void {
    diag.trace?.('disableLine', `line=${line.addressv}`);
    this.enabledRoutes.delete(line.addressv);
  }

  // Enable route ringer, using pr provided by P911 because priority could be overridden in profile
  public enableRoute(address: string, pr: number): void {
    if (!this.isValidPriority(pr)) {
      diag.warn('enableRoute()', `Invalid priority: ${pr}`);
      return;
    }

    diag.trace?.('enableRoute', `route=${address}, pr=${pr}`);
    const routeRingerAttr: RouteRingerAttributes = {
      priority: pr,
      highPriority: 0,
      nbActivation: 0,
    };
    this.enabledRoutes.set(address, routeRingerAttr);
  }

  // Disable route ringer, running ringer will be stopped when mode is Off
  public disableRoute(address: string): void {
    diag.trace?.('disableRoute', `route=${address}`);
    this.enabledRoutes.delete(address);
  }

  // private
  private isGoodWavFile(filename: string): boolean {
    return !!filename.match(/^.*\.wav$/i);
  }

  private isValidPriority(pr: number): boolean {
    return pr >= 0 && pr < 10;
  }

  // Process LineDev events
  private processEvents(event: Event) {
    // StateUpdate
    if (event instanceof StateUpdate) {
      const { newState } = event;
      const { oldState } = event;
      const { callPriority } = event.webCall;
      const line = event.webCall.webLine;
      const routeAddress = event.webCall.infoRec.route;

      const lineRingerAttr = line ? this.enabledLines.get(line.lineCfgEx.baseAddr) : undefined;
      const routeRingerAttr = this.enabledRoutes.get(routeAddress);

      this.checkActivationDeactivation(newState, oldState, callPriority, lineRingerAttr, routeRingerAttr);
    }
    // ConnectedStatus
    else if (event instanceof ConnectedStatus) {
      this._isCallConnected = event.connected;

      // !ConnectedStatus: play next availabe priority
      if (!this._isCallConnected) {
        this.playAvailable();
      }
      // ConnectedStatus: stop playing only if ringOnConnect is not set
      else if (!this.ringOnConnect) {
        this.stop();
      }
    }
    // LineChangeEvent
    else if (event instanceof LineChangeEvent) {
      const oldLineRingerAttr = event.oldLine ? this.enabledLines.get(event.oldLine.lineCfgEx.baseAddr) : undefined;
      // If the callstate of the call performing line change is in a ringing state, check if ringer must be deactivated
      this.checkActivationDeactivation(CallState.Finished, event.call.state, CallPriority.CPNormal, oldLineRingerAttr);

      // TODO: get callPriority from the call on newLine
      // let newCall = event.newLine.get
      const newCallPriority = CallPriority.CPNormal;

      const newLineRingerAttr = event.newLine ? this.enabledLines.get(event.newLine?.lineCfgEx.baseAddr) : undefined;
      this.checkActivationDeactivation(event.callState, CallState.Finished, newCallPriority, newLineRingerAttr);
    }
  }

  private checkActivationDeactivation(
    newState: CallState,
    oldState: CallState,
    callPriority: CallPriority,
    lineRingerAttr?: LineRingerAttributes,
    routeRingerAttr?: RouteRingerAttributes
  ): void {
    // If new state is an offered state and oldState is not a ringing state, activate priority of the line
    if (offeredStates.includes(newState) && !ringingStates.includes(oldState)) {
      if (callPriority > CallPriority.CPNormal) {
        this.activate(HIGH_PRIORITY);
        if (routeRingerAttr) routeRingerAttr.highPriority++;
        if (lineRingerAttr) lineRingerAttr.highPriority++;
      } else {
        // both route and line priority
        if (routeRingerAttr && lineRingerAttr) {
          if (lineRingerAttr.priority < routeRingerAttr.priority) {
            this.activate(lineRingerAttr.priority);
          } else {
            this.activate(routeRingerAttr.priority);
            routeRingerAttr.nbActivation++;
          }
        }
        // only routeRingerAttr, no line priority
        else if (routeRingerAttr) {
          this.activate(routeRingerAttr.priority);
          routeRingerAttr.nbActivation++;
        }
        // only lineRingerAttr, no route priority
        else if (lineRingerAttr) {
          this.activate(lineRingerAttr.priority);
        }
        // no route ringer, no line ringer
        else {
          // do nothing
        }
      }
    }
    // If new state is not an offered state and oldState is a ringing state, deactivate priority of the line
    else if (!offeredStates.includes(newState) && ringingStates.includes(oldState)) {
      if (callPriority > CallPriority.CPNormal) {
        this.deactivate(HIGH_PRIORITY);
        if (routeRingerAttr) routeRingerAttr.highPriority--;
        if (lineRingerAttr) lineRingerAttr.highPriority--;
      } else {
        // both route and line priority
        if (routeRingerAttr && lineRingerAttr) {
          if (lineRingerAttr.priority < routeRingerAttr.priority) {
            this.deactivate(lineRingerAttr.priority);
          } else {
            this.deactivate(routeRingerAttr.priority);
            if (routeRingerAttr.nbActivation > 0) {
              routeRingerAttr.nbActivation--;
            }
          }
        }
        // only routeRingerAttr, no line priority
        else if (routeRingerAttr) {
          this.deactivate(routeRingerAttr.priority);
          if (routeRingerAttr.nbActivation > 0) {
            routeRingerAttr.nbActivation--;
          }
        }
        // only lineRingerAttr, no route priority
        else if (lineRingerAttr) {
          this.deactivate(lineRingerAttr.priority);
        }
        // no route ringer, no line ringer
        else {
          // do nothing
        }
      }
    }
  }

  private activate(pr: number) {
    if (!this.isValidPriority(pr)) {
      return;
    }

    this.priorityCount[pr]++;

    diag.trace?.('activate', `priority=${pr}, count= ${this.priorityCount[pr]}`);

    this.playAvailable();
  }

  private deactivate(pr: number) {
    if (!this.isValidPriority(pr)) {
      return;
    }

    if (this.priorityCount[pr] > 0) {
      this.priorityCount[pr]--;
    }

    diag.trace?.('deactivate', `priority=${pr}, count=${this.priorityCount[pr]}`);

    if (this.mode === RingerMode.On) {
      // Stop current
      if (pr === this.currentRingingPriority && this.priorityCount[pr] === 0) {
        this.stop();
      }

      this.playAvailable();
    }
  }

  private playAvailable() {
    if (this.mode === RingerMode.On) {
      // find next highest to play
      const found = this.priorityCount.findIndex((n) => n > 0);
      if (found !== -1) {
        this.play(found);
      }
    }
  }

  // play control functions
  private play(pr: number) {
    if (this.currentRingingPriority < pr) {
      // a higher priority ringer is playing, do nothing
    } else {
      // a lower/same priority ringer is playing, stop it
      if (this.currentRingingPriority !== INVALID_PRIORITY) {
        this.stop();
      }

      if (this.isCallConnected && !this.ringOnConnect) {
        diag.trace?.('play', `Ignore during conversation`);
      } else {
        // send command to start playing
        wavManager.play(pr);

        this.currentRingingPriority = pr;
        this.onDurationHandler = window.setTimeout(this.pause, this.cfgREC[pr].onDuration);
      }
    }
  }

  private pause() {
    // send command to stop playing
    wavManager.stop();

    this.offDurationHandler = window.setTimeout(this.resume, this.cfgREC[this.currentRingingPriority].offDuration);
  }

  private resume() {
    // send command to start playing
    wavManager.play(this.currentRingingPriority);

    this.onDurationHandler = window.setTimeout(this.pause, this.cfgREC[this.currentRingingPriority].onDuration);
  }

  private stop() {
    // send command to stop playing
    wavManager.stop();

    clearTimeout(this.onDurationHandler);
    clearTimeout(this.offDurationHandler);
    this.currentRingingPriority = INVALID_PRIORITY;
  }
}
