import WebLineDev from './weblinedev';
import WebCall from '../webcall/webcall';
import * as ExtInterface from '../telephonyexternalinterfacedef';
import { WebViperDriver } from '../webviperdriver/webviperdriver';
import { Diag } from '../common/diagClient';
const diag = new Diag('tddManager');

enum TddStatus {
  Idle, // TDD not connected
  BusyAnsw, // TDD connecting from Answering mode
  BusyOrig, // TDD connecting from Originating mode
  Connected, // TDD is connected
}

enum AnsweredType {
  Detect,
  Abort,
  ConnectOverride,
}

class AnswerEvent extends Event {
  answer: AnsweredType;
  constructor(answer: AnsweredType) {
    super('AnswerEvent');
    this.answer = answer;
  }
}

export class TddManager extends EventTarget {
  BAUDOT_DETECT_TIMEOUT = 15000; // 15 seconds timeout for Connection in Answering mode
  RECONNECT_DELAY = 500; // Delay before performing reconnection (500ms)
  lineDev: WebLineDev;
  webViperDriver: WebViperDriver | null;

  tddConnectedCall: WebCall | null; // The call currently connected to the TDD
  hcoCurrentMode: ExtInterface.HCOMode; // The current value of the HCO
  vcoCurrentMode: ExtInterface.VCOMode; // The current value of the VCO
  tddStatus: TddStatus; // The current status of the TDD

  constructor(lineDev: WebLineDev) {
    super();
    this.lineDev = lineDev;
    if (lineDev && lineDev.webViperDriver) {
      this.webViperDriver = lineDev.webViperDriver;
    } else {
      this.webViperDriver = null;
    }
    this.tddConnectedCall = null;
    this.hcoCurrentMode = ExtInterface.HCOMode.HCOOff;
    this.vcoCurrentMode = ExtInterface.VCOMode.VCOOff;
    this.tddStatus = TddStatus.Idle;

    // Bind WebViperDriver callbacks
    this.processTddConnectEvent = this.processTddConnectEvent.bind(this);
    this.processTddDisconnectEvent = this.processTddDisconnectEvent.bind(this);
    this.processTddDetectEvent = this.processTddDetectEvent.bind(this);
    this.processTddMessageEvent = this.processTddMessageEvent.bind(this);
    this.processHcoModeChange = this.processHcoModeChange.bind(this);
    this.processVcoModeChange = this.processVcoModeChange.bind(this);
    this.processStateUpdate = this.processStateUpdate.bind(this);
    this.processCtiHardwareUpdate = this.processCtiHardwareUpdate.bind(this);
    this.registerListeners();
  }

  public terminate() {
    this.unregisterListeners();
  }

  private registerListeners() {
    if (this.webViperDriver) {
      this.webViperDriver.addEventListener('TddConnectEvent', this.processTddConnectEvent as EventListener);
      this.webViperDriver.addEventListener('TddDisconnectEvent', this.processTddDisconnectEvent as EventListener);
      this.webViperDriver.addEventListener('TddDetectEvent', this.processTddDetectEvent as EventListener);
      this.webViperDriver.addEventListener('TddMessageEvent', this.processTddMessageEvent as EventListener);
      this.webViperDriver.addEventListener('HcoModeChange', this.processHcoModeChange as EventListener);
      this.webViperDriver.addEventListener('VcoModeChange', this.processVcoModeChange as EventListener);
      this.webViperDriver.addEventListener(
        ExtInterface.CSSEventType.CtiHardwareUpdate,
        this.processCtiHardwareUpdate as EventListener
      );
      this.lineDev.addEventListener(ExtInterface.CSSEventType.StateUpdate, this.processStateUpdate as EventListener);
    }
  }

  private unregisterListeners() {
    if (this.webViperDriver) {
      this.webViperDriver.removeEventListener('TddConnectEvent', this.processTddConnectEvent as EventListener);
      this.webViperDriver.removeEventListener('TddDisconnectEvent', this.processTddDisconnectEvent as EventListener);
      this.webViperDriver.removeEventListener('TddDetectEvent', this.processTddDetectEvent as EventListener);
      this.webViperDriver.removeEventListener('TddMessageEvent', this.processTddMessageEvent as EventListener);
      this.webViperDriver.removeEventListener('HcoModeChange', this.processHcoModeChange as EventListener);
      this.webViperDriver.removeEventListener('VcoModeChange', this.processVcoModeChange as EventListener);
      this.webViperDriver.removeEventListener(
        ExtInterface.CSSEventType.CtiHardwareUpdate,
        this.processCtiHardwareUpdate as EventListener
      );
      this.lineDev.removeEventListener(ExtInterface.CSSEventType.StateUpdate, this.processStateUpdate as EventListener);
    }
  }

  processStateUpdate(event: ExtInterface.StateUpdate) {
    let call: WebCall = event.webCall;
    let state: ExtInterface.CallState = event.newState;

    if (this.tddConnectedCall === null || call === this.tddConnectedCall) {
      if (
        state === ExtInterface.CallState.Connected ||
        state === ExtInterface.CallState.Disconnected ||
        state === ExtInterface.CallState.Connecting
      ) {
        this.autoConnect(call);
      } else if (
        state === ExtInterface.CallState.Finished ||
        state === ExtInterface.CallState.Park ||
        state === ExtInterface.CallState.IHold
      ) {
        this.autoDisconnect(call);
      }
    }
  }

  private processTddConnectEvent(event: ExtInterface.TddConnectEvent) {
    if (this.tddConnectedCall) {
      diag.out(
        'processTddConnectEvent',
        `Received TddConnectEvent with initiation: ${
          event.initiation === ExtInterface.TddInitiationType.Originating ? 'Originating' : 'Answering'
        }`
      );
      // Forward event to Application
      this.lineDev.report(new ExtInterface.TddConnectEvent(this.tddConnectedCall, event.initiation));
    } else {
      diag.trace?.('processTddConnectEvent', `No tddConnectedCall`);
    }
  }

  private processTddDisconnectEvent(event: ExtInterface.TddDisconnectEvent) {
    if (this.tddConnectedCall) {
      diag.out('processTddDisconnectEvent', `Received TddDisconnectEvent`);
      // Forward event to Application
      this.lineDev.report(new ExtInterface.TddDisconnectEvent(this.tddConnectedCall));
      this.tddConnectedCall = null;
      this.setTddStatus(TddStatus.Idle, 'processTddDisconnectEvent');
      diag.trace?.('processTddDisconnectEvent', `Clear tddConnectedCall`);
    } else {
      diag.trace?.('processTddDisconnectEvent', `No tddConnectedCall`);
    }
  }

  private processTddDetectEvent(event: ExtInterface.TddDetectEvent) {
    diag.trace?.('processTddDetectEvent', `Received TddDetectEvent from WebViperDriver`);
    if (this.tddConnectedCall) {
      if (this.tddStatus === TddStatus.BusyOrig) {
        diag.out('processTddDetectEvent', `Detect Rx while in BusyOrig State, wait one char`);
      } else if (this.tddStatus === TddStatus.BusyAnsw) {
        diag.out('processTddDetectEvent', `Detect Rx while in BusyAnsw State, Report to application`);
        // Send event for asyncTddConnect process
        this.dispatchEvent(new AnswerEvent(AnsweredType.Detect));
        // Forward event to Application
        this.lineDev.report(new ExtInterface.TddDetectEvent(this.tddConnectedCall));
      } else {
        diag.trace?.('processTddDetectEvent', `Detect Evt Rx from Viper  while not waiting for it, ignore`);
      }
    } else {
      diag.trace?.('processTddDetectEvent', `No tddConnectedCall`);
    }
  }

  private processTddMessageEvent(event: ExtInterface.TddMessageEvent) {
    if (event.direction === ExtInterface.TddMessageDirectionType.Incoming) {
      diag.out(
        'processTddMessageEvent',
        `Received TddMessageEvent from WebViperDriver with direction: Incoming and message: ${event.message}`
      );
    } else {
      diag.trace?.(
        'processTddMessageEvent',
        `Received TddMessageEvent from WebViperDriver with direction: Outgoing and message: ${event.message}`
      );
    }

    if (event.direction === ExtInterface.TddMessageDirectionType.Incoming) {
      if (this.tddStatus === TddStatus.BusyOrig) {
        // Send event for asyncTddConnect process
        this.dispatchEvent(new AnswerEvent(AnsweredType.Detect));
        // Forward event to Application
        this.lineDev.report(new ExtInterface.TddDetectEvent(this.tddConnectedCall));
      }
    }

    // Forward event to Application
    this.lineDev.report(new ExtInterface.TddMessageEvent(event.direction, event.message));
  }

  private processHcoModeChange(event: ExtInterface.HcoModeChange) {
    diag.trace?.(
      'processHcoModeChange',
      `Received HcoModeChange from WebViperDriver with mode: ${
        event.mode === ExtInterface.HCOMode.HCOOff ? 'HCOOff' : 'HcoOn'
      }`
    );

    this.hcoCurrentMode = event.mode;
    // Forward event to Application
    this.lineDev.report(new ExtInterface.HcoModeChange(event.mode));
  }

  private processVcoModeChange(event: ExtInterface.VcoModeChange) {
    diag.trace?.(
      'processVcoModeChange',
      `Received VcoModeChange from WebViperDriver with mode: ${
        event.mode === ExtInterface.VCOMode.VCOOff ? 'VcoOff' : 'VcoOn'
      }`
    );
    this.vcoCurrentMode = event.mode;
    // Forward event to Application
    this.lineDev.report(new ExtInterface.VcoModeChange(event.mode));
  }

  private processCtiHardwareUpdate(event: ExtInterface.CtiHardwareUpdate) {
    if (event.status === ExtInterface.CtiHardwareStatus.Down) {
      diag.trace?.('processCtiHardwareUpdate', `TDD Link Down`);
      this.lineDev.report(new ExtInterface.TddLinkDownEvent());
    } else if (event.status === ExtInterface.CtiHardwareStatus.Up) {
      diag.trace?.('processCtiHardwareUpdate', `TDD Link Up`);
      this.lineDev.report(new ExtInterface.TddLinkUpEvent());
    }
    // reset TDD status
    this.setTddStatus(TddStatus.Idle, 'processCtiHardwareUpdate');
    this.tddConnectedCall = null;
    diag.trace?.('processCtiHardwareUpdate', `Clear tddConnectedCall`);
  }

  public async autoConnect(call: WebCall) {
    if (call.initialTddConnection) {
      if (call.webLine?.lineCfgEx.isTTYAutoDetection) {
        diag.out('autoConnect', `Line configured for auto-connection; proceed with connection`);
        this.tddConnect(call, ExtInterface.TddInitiationType.Answering);
      }
    } else {
      if (call.hasConnnectedToTdd) {
        diag.out('autoConnect', `Line was connected previously; proceed with connection`);
        this.tddConnect(call, ExtInterface.TddInitiationType.Originating);
      }
    }
  }

  public autoDisconnect(call: WebCall) {
    if (call.hasConnnectedToTdd) {
      diag.out('autoDisconnect', `Line with active TDD; proceed with auto-disconnection`);
      this.tddDisconnect(call, true);
    }
  }

  public tddConnect(
    call: WebCall,
    initiation: ExtInterface.TddInitiationType = ExtInterface.TddInitiationType.Originating
  ) {
    if (this.webViperDriver && this.webViperDriver.status) {
      if (this.tddStatus !== TddStatus.Connected) {
        this.asyncTddConnect(call, initiation);
      } else {
        diag.trace?.('tddConnect', `TDD is already in Connected state, no need to connect`);
      }
    } else {
      diag.warn('tddConnect', `TDD interface is not up`);
    }
  }

  private async asyncTddConnect(call: WebCall, initiation: ExtInterface.TddInitiationType) {
    if (this.webViperDriver && this.webViperDriver.status) {
      diag.trace?.('asyncTddConnect', `Performing TDD connection`);
      let detectTimeout: number = this.BAUDOT_DETECT_TIMEOUT;
      let newTddStatus: TddStatus = TddStatus.BusyAnsw;
      if (initiation === ExtInterface.TddInitiationType.Originating) {
        newTddStatus = TddStatus.BusyOrig;
        detectTimeout = Number.MAX_SAFE_INTEGER;
      }

      if (this.tddStatus !== TddStatus.Idle && this.tddStatus !== newTddStatus) {
        // Reconnection asked with different initiation
        this.dispatchEvent(new AnswerEvent(AnsweredType.ConnectOverride));
        if (this.tddConnectedCall) {
          this.tddDisconnect(this.tddConnectedCall, false, true);

          await new Promise((resolve, reject) => {
            let maxTimer: number = 0;
            let onDiscTdd = (event: ExtInterface.TddDisconnectEvent) => {
              if (this.webViperDriver) {
                this.webViperDriver?.removeEventListener('TddDisconnectEvent', onDiscTdd as EventListener);
                this.webViperDriver?.addEventListener(
                  'TddDisconnectEvent',
                  this.processTddDisconnectEvent as EventListener
                );
              }
              if (maxTimer !== 0) {
                window.clearTimeout(maxTimer);
              }
              resolve('TDD is Disconnected');
            };

            maxTimer = window.setTimeout(() => {
              if (this.webViperDriver) {
                this.webViperDriver?.removeEventListener('TddDisconnectEvent', onDiscTdd as EventListener);
                this.webViperDriver?.addEventListener(
                  'TddDisconnectEvent',
                  this.processTddDisconnectEvent as EventListener
                );
              }
              reject(new Error('Disconnection Timeout'));
            }, this.RECONNECT_DELAY);

            if (this.webViperDriver) {
              this.webViperDriver?.removeEventListener(
                'TddDisconnectEvent',
                this.processTddDisconnectEvent as EventListener
              );
              this.webViperDriver?.addEventListener('TddDisconnectEvent', onDiscTdd as EventListener);
            }
          })
            .then((response) => {
              diag.trace?.('asyncTddConnect', `Response ${response}`);
            })
            .catch((err: Error) => {
              diag.warn('asyncTddConnect', `Error ${err.message}`);
            });
        }
      }

      diag.trace?.('asyncTddConnect', `Set tddConnectedCall`);
      this.tddConnectedCall = call;
      call.initialTddConnection = false;

      this.setTddStatus(newTddStatus, 'asyncTddConnect');

      await new Promise((resolve, reject) => {
        let timer: number = 0;
        let onAnswer = (event: AnswerEvent) => {
          if (event.answer === AnsweredType.Detect) {
            if (timer !== 0) {
              window.clearTimeout(timer);
            }
            diag.trace?.('asyncTddConnect', `Connection was successfull`);
            this.setTddStatus(TddStatus.Connected, 'asyncTddConnect');
            if (this.tddConnectedCall) {
              this.tddConnectedCall.hasConnnectedToTdd = true;
            }
            this.removeEventListener('AnswerEvent', onAnswer as EventListener);
            resolve('TDD is Connected');
          } else if (event.answer === AnsweredType.Abort) {
            diag.trace?.('asyncTddConnect', `Connection was aborted by application`);
            if (timer) {
              window.clearTimeout(timer);
            }
            this.removeEventListener('AnswerEvent', onAnswer as EventListener);
            reject(new Error('Aborted by Application'));
          } else if (event.answer === AnsweredType.ConnectOverride) {
            diag.trace?.('asyncTddConnect', `Connection was overrriden by application`);
            if (timer) {
              window.clearTimeout(timer);
            }
            this.removeEventListener('AnswerEvent', onAnswer as EventListener);
            reject(new Error('Connection was overrriden by application'));
          }
        };

        if (detectTimeout !== Number.MAX_SAFE_INTEGER) {
          timer = window.setTimeout(() => {
            this.lineDev.report(new ExtInterface.TddConnectTimeoutEvent(this.tddConnectedCall));
            this.webViperDriver?.tddDisconnect();
            this.removeEventListener('AnswerEvent', onAnswer as EventListener);
            reject(new Error('Connection Timeout'));
          }, detectTimeout);
        }

        this.addEventListener('AnswerEvent', onAnswer as EventListener);
        this.webViperDriver?.tddConnect(initiation);
      })
        .then((response) => {
          diag.trace?.('asyncTddConnect', `Response ${response}`);
        })
        .catch((err: Error) => {
          diag.trace?.('asyncTddConnect', `Error ${err.message}`);
        });
    } else {
      diag.warn('asyncTddConnect', `TDD interface is not up`);
    }
  }

  public tddDisconnect(call: WebCall, autoDisconnect: boolean = false, fromReconnection: boolean = false) {
    if (this.webViperDriver && this.webViperDriver.status) {
      if (this.tddConnectedCall === call) {
        if (this.tddStatus === TddStatus.BusyOrig || this.tddStatus === TddStatus.BusyAnsw) {
          diag.trace?.('tddDisconnect', `Send tddDisconnect to WebViperDriver on Busy status`);
          // Send event for asyncTddConnect process
          this.dispatchEvent(new AnswerEvent(AnsweredType.Abort));
          // Report Event to Application
          if (!fromReconnection) {
            this.lineDev.report(new ExtInterface.TddConnectAbortEvent(call));
          }
          this.setTddStatus(TddStatus.Idle, 'tddDisconnect');
          this.webViperDriver.tddDisconnect();
        } else if (this.tddStatus === TddStatus.Connected) {
          diag.trace?.('tddDisconnect', `Send tddDisconnect to WebViperDriver on Connected status`);
          if (!autoDisconnect) {
            if (this.tddConnectedCall) {
              this.tddConnectedCall.hasConnnectedToTdd = false;
            }
          }
          this.setTddStatus(TddStatus.Idle, 'tddDisconnect');
          this.webViperDriver.tddDisconnect();
        } else {
          diag.trace?.('tddDisconnect', `Disconnect on Idle state`);
        }
      } else {
      }
    } else {
      diag.warn('tddDisconnect', `TDD interface is not up`);
    }
  }

  public tddSend(msg: string) {
    if (this.webViperDriver && this.webViperDriver.status) {
      if (this.tddStatus === TddStatus.BusyOrig || this.tddStatus === TddStatus.Connected) {
        while (msg.length > 60) {
          // Need to break down message in 60 char block for the driver
          let partialMsg = msg.substr(0, 60);
          msg = msg.substr(60);
          diag.out('tddSend', `Sending TDD message in part: ${partialMsg}`);
          this.webViperDriver.tddSend(partialMsg);
        }
        diag.out('tddSend', `Sending TDD message: ${msg}`);
        this.webViperDriver.tddSend(msg);
      } else {
        diag.trace?.(
          'tddSend',
          `Cannot Send with status: ${this.tddStatus === TddStatus.Idle ? 'Idle' : 'Busy'}`
        );
      }
    } else {
      diag.warn('tddSend', `TDD interface is not up`);
    }
  }

  public tddAbortTx() {
    if (this.webViperDriver && this.webViperDriver.status) {
      if (this.tddStatus === TddStatus.BusyOrig || this.tddStatus === TddStatus.Connected) {
        diag.trace?.('tddAbortTx', `Sending tddAbortTx to WebViperDriver`);
        this.webViperDriver.tddAbortTx();
      } else {
        diag.trace?.(
          'tddAbortTx',
          `Cannot AbortTx with status: ${this.tddStatus === TddStatus.Idle ? 'Idle' : 'Busy'}`
        );
      }
    } else {
      diag.warn(
        'tddAbortTx',
        `Cannot AbortTx with status: ${this.tddStatus === TddStatus.Idle ? 'Idle' : 'Busy'}`
      );
    }
  }

  public hcoEnable() {
    if (this.webViperDriver && this.webViperDriver.status) {
      diag.trace?.('hcoEnable', `Set HCO Enable`);
      this.webViperDriver.setHCO(ExtInterface.HCOMode.HCOOn);
    } else {
      diag.warn('hcoEnable', `HCO interface is not up`);
    }
  }

  public hcoDisable() {
    if (this.webViperDriver && this.webViperDriver.status) {
      diag.trace?.('hcoDisable', `Set HCO Disable`);
      this.webViperDriver.setHCO(ExtInterface.HCOMode.HCOOff);
    } else {
      diag.warn('hcoDisable', `HCO interface is not up`);
    }
  }

  public vcoEnable() {
    if (this.webViperDriver && this.webViperDriver.status) {
      diag.trace?.('vcoEnable', `Set VCO Enable`);
      this.webViperDriver.setVCO(ExtInterface.VCOMode.VCOOn);
    } else {
      diag.warn('vcoEnable', `VCO interface is not up`);
    }
  }

  public vcoDisable() {
    if (this.webViperDriver && this.webViperDriver.status) {
      diag.trace?.('vcoDisable', `Set VCO Disable`);
      this.webViperDriver.setVCO(ExtInterface.VCOMode.VCOOff);
    } else {
      diag.warn('vcoDisable', `VCO interface is not up`);
    }
  }

  public getHcoMode(): ExtInterface.HCOMode {
    return this.hcoCurrentMode;
  }

  public getVcoMode(): ExtInterface.VCOMode {
    return this.vcoCurrentMode;
  }

  private setTddStatus(status: TddStatus, funct: string) {
    this.tddStatus = status;

    let tddStatus: string;
    switch (this.tddStatus) {
      case TddStatus.Idle:
        tddStatus = 'Idle';
        break;
      case TddStatus.BusyAnsw:
        tddStatus = 'BusyAnsw';
        break;
      case TddStatus.BusyOrig:
        tddStatus = 'BusyOrig';
        break;
      case TddStatus.Connected:
        tddStatus = 'Connected';
        break;
      default:
        tddStatus = 'Unknown';
        break;
    }
    diag.trace?.('setTddStatus', `Set tddStatus: ${tddStatus} [${funct}]`);
  }
}
