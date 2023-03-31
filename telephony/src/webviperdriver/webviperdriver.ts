import { WebViperDriverWS } from './webviperdriver-ws';
import * as ExtInterface from '../telephonyexternalinterfacedef';
import * as WebDriverDef from './webviperdriver-def';
import { VolumeControlDestination } from '../weblinedev/volumeController';
import { Diag } from '../common/diagClient';
import { apiClient } from 'client-web-api/src/api/ApiClient';
const diag = new Diag('webviperdriver.webviperdriver');
const diagHB = new Diag('webviperdriver.hb');

const InbandDialingDigitTimeout: number = 300;
const InterDigitTimeout: number = 75;

export class WebViperDriver extends EventTarget {
  private defaultSplitMode = false; // Combine by default
  private ws: WebViperDriverWS | null = null;
  private workstationCTIConfig: any;
  private wsLinkStatus: boolean;
  private heartbeatStatus: boolean;
  private systemInfoStatus: boolean;
  private configured: boolean;
  private ctiHardwareStatus: ExtInterface.CtiHardwareStatus;
  private heartbeatCounter: number;
  private systemInfoCounter: number;
  private isOffHook: boolean;
  private startup: boolean;
  private initialStartup: boolean;
  private handsetDetect: boolean;
  private radioDetect: boolean;
  private currentlyInSplitMode: boolean;
  private radioTxStatus: boolean;
  private radioRxStatus: boolean;
  private agcStatus: boolean;
  private callTakerAgcStatus: boolean;
  private callTakerNrStatus: boolean;
  private p911WebServerAddress: string;
  private pkgUpdateStatus: number;

  constructor() {
    super();
    this.wsLinkStatus = false;
    this.heartbeatStatus = false;
    this.systemInfoStatus = false;
    this.configured = false;
    this.ctiHardwareStatus = ExtInterface.CtiHardwareStatus.NotAvailable;
    this.heartbeatCounter = 0;
    this.systemInfoCounter = 0;
    this.isOffHook = false;
    this.startup = true;
    this.initialStartup = true;
    this.handsetDetect = false;
    this.radioDetect = false;
    this.currentlyInSplitMode = false;
    this.radioTxStatus = false;
    this.radioRxStatus = false;
    this.agcStatus = false;
    this.callTakerAgcStatus = false;
    this.callTakerNrStatus = false;
    this.configure = this.configure.bind(this);
    this.heartbeat = this.heartbeat.bind(this);
    this.systemInfo = this.systemInfo.bind(this);
    this.wsReadyState = this.wsReadyState.bind(this);
    this.p911WebServerAddress = '';
    this.pkgUpdateStatus = WebDriverDef.PkgUpdateStatusType.eDriverPkgUpdateStatusUnknown;
  }

  async terminate(): Promise<boolean> {
    if (this.ws != null) {
      this.ws.close();
    }

    return true;
  }

  public async initialize(
    ws_server_url: string,
    workstationCTIConfig: any,
    p911_server_addr: string
  ): Promise<boolean> {
    this.workstationCTIConfig = workstationCTIConfig;
    this.p911WebServerAddress = p911_server_addr;
    this.ws = new WebViperDriverWS(ws_server_url, workstationCTIConfig.WorkstationType === 'JestTest');
    this.ws.registerForMesssage(this.onMessage);
    this.ws.registerForConfiguration(this.configure);
    this.ws.registerForHeartbeat(this.heartbeat);
    this.ws.registerForSystemInfo(this.systemInfo);
    this.ws.registerForReadyState(this.wsReadyState);
    if (await this.ws.open(false)) {
      diag.out('initialize', `WebViperDriverWS connected`);
      return true;
    } else {
      this.ws.reconnect();
    }

    // Generate an initial status event
    this.updateCtiHardwareStatus();

    return false;
  }

  private async configure() {
    await this.sendConfigure();
    await this.sendLatestPkgInfo();
  }

  private async sendConfigure(): Promise<boolean> {
    let configured: boolean = false;
    try {
      let message = this.workstationCTIConfig;
      message.__CMD__ = WebDriverDef.commandSetConfiguration;

      if (this.ws != null) {
        let res = await this.ws.sendAndWaitForResponse(message);
        if (res) {
          let data = JSON.parse(res);
          let cfgChange: number = data.cfgChange;
          let errCode: number = data.errCode;

          if (errCode === 0 || errCode === 1) {
            configured = true;
            if (cfgChange === 0) {
              diag.out('sendConfigure', `WebViperDriver configuration is the same, running with current configuration`);

              if (this.initialStartup) {
                // Reset the driver at startup
                this.restartDriver();
                this.initialStartup = false;
              }
            } else {
              diag.out(
                'sendConfigure',
                `WebViperDriver configuration has changed, wait for WebViperDriver re-configuration`
              );
            }
          } else {
            diag.warn('sendConfigure', `WebViperDriver configuration has error: ${errCode.toString()}`);
          }
        }
      }
    } catch (e) {
      diag.warn('sendConfigure', `Cannot send a message due to: ${e.message}`);
      return false;
    }

    if (this.startup) {
      this.ws?.startHeatbeat();
      this.ws?.startSystemInfo();
      this.startup = false;
    }

    this.configured = configured;
    this.updateCtiHardwareStatus();
    return false;
  }

  private async sendLatestPkgInfo() {
    try {
      let pkgVersion: string = '';
      let pkgUrl: string = '';
      // get pkg version
      const versionsObj = await apiClient.getDriversVersions();
      let versionStr: string = JSON.stringify(versionsObj);
      diag.out('sendLatestPkgInfo', `Here are the driver versions: ${versionStr}`);
      switch (this.workstationCTIConfig.WorkstationType) {
        case ExtInterface.CtiHardwareType.Sonic:
          pkgVersion = versionsObj.SonicWebDriver;
          pkgUrl = 'https://' + this.p911WebServerAddress + ':2443/tools/SonicWeb/SonicWin10DriversPackage_Setup.exe';
          break;
        case ExtInterface.CtiHardwareType.PowerStationG3:
          pkgVersion = versionsObj.PowerStationGen3;
          pkgUrl = 'https://' + this.p911WebServerAddress + ':2443/tools/G3Web/PowerStationG3DriversPackage_Setup.exe';
          break;
        case ExtInterface.CtiHardwareType.SonicG3:
          pkgVersion = versionsObj.SonicG3WebDriver;
          pkgUrl = 'https://' + this.p911WebServerAddress + ':2443/tools/SonicG3Web/SonicG3DriversPackage_Setup.exe';
          break;
        default:
          break;
      }
      let pkgInfoMsg: any = {
        __CMD__: WebDriverDef.commandSetLatestPkgInfo,
        LatestDriverPkgVersion: pkgVersion,
        PkgDownloadURL: pkgUrl,
      };
      if (this.ws != null) {
        diag.out('sendLatestPkgInfo', JSON.stringify(pkgInfoMsg));
        this.ws.send(JSON.stringify(pkgInfoMsg));
      }
    } catch (e) {
      diag.warn('sendLatestPkgInfo', `Cannot send a message due to: ${e.message}`);
    }
  }

  private restartDriver() {
    try {
      let startAppMsg: any = {
        __CMD__: WebDriverDef.commandViperStartApplication,
      };
      if (this.ws != null) {
        this.ws.send(JSON.stringify(startAppMsg));
      }
    } catch (e) {
      diag.warn('restartDriver', `Cannot send a message due to: ${e.message}`);
    }
  }

  private async heartbeat(): Promise<boolean> {
    if (this.heartbeatCounter > 5) {
      // No response has been provided for the last five heartbeats declare the heartbeat status as failed
      this.heartbeatStatus = false;
      diagHB.warn('heartbeat', `No response to Heartbeat`);
      this.updateCtiHardwareStatus();
    }

    try {
      let message: any = {
        __CMD__: WebDriverDef.commandSendMessage,
        msgID: WebDriverDef.msgRtrvHeartBeat,
        Dummy: 'H',
      };
      if (this.ws != null) {
        this.ws.send(JSON.stringify(message));
        this.heartbeatCounter++;
        return true;
      }
    } catch (e) {
      diagHB.warn('heartbeat', `Cannot send a message due to: ${e.message}`);
      return false;
    }
    return false;
  }

  private async systemInfo(): Promise<boolean> {
    if (this.systemInfoCounter > 5) {
      // No response has been provided for the last five SystemInfo declare the SystemInfo status as failed
      this.systemInfoStatus = false;
      diagHB.warn('systemInfo', `No response to SystemInfo`);
      this.updateCtiHardwareStatus();
    }

    try {
      let message: any = {
        __CMD__: WebDriverDef.commandViperGetSystemInfo,
      };
      if (this.ws != null) {
        this.ws.send(JSON.stringify(message));
        this.systemInfoCounter++;
        return true;
      }
    } catch (e) {
      diagHB.warn('systemInfo', `Cannot send a message due to: ${e.message}`);
      return false;
    }
    return false;
  }

  private onMessage = (parsedData: any) => {
    let message: string = parsedData.__MESSAGE__;
    let messageId: number = parsedData.msgID;
    let errCode: number = parsedData.errCode;

    diag.trace?.('onMessage', `Message Received:: ${JSON.stringify(parsedData)}`);

    if (message === '__EVENT__') {
      switch (messageId) {
        case WebDriverDef.msgRtrvHeartBeat:
          this.onHeartbeatEvent(errCode);
          break;
        case WebDriverDef.msgTelOnOffHook:
          let hook: number = parsedData.Hook;
          this.onHookEvent(hook, errCode);
          break;
        case WebDriverDef.msgStatTDDState:
          let mode: number = parsedData.Mode;
          switch (parsedData.TddStateCommand) {
            case WebDriverDef.StatTddState.eTelTddCharacterSent:
              this.onTddMessage(
                ExtInterface.TddMessageDirectionType.Outgoing,
                String.fromCharCode(parsedData.CharSent)
              );
              break;
            case WebDriverDef.StatTddState.eTelTddCharacterReceived:
              this.onTddMessage(
                ExtInterface.TddMessageDirectionType.Incoming,
                String.fromCharCode(parsedData.CharReceived)
              );
              break;
            case WebDriverDef.StatTddState.eTelTddConnection:
              this.onTddDetection(parsedData.Mode);
              break;
            case WebDriverDef.StatTddState.eTelTddDisconnection:
              this.onTddDisconnection();
              break;
            default:
              break;
          }
          break;
        case WebDriverDef.msgStatCtrlVolume:
          this.onCtrlVolume(
            parsedData.TypeCtrl,
            parsedData.TypeActivation,
            parsedData.LevelSet,
            parsedData.Direction,
            parsedData.Audio,
            parsedData.errCode
          );
          break;
        case WebDriverDef.msgTelHdCtrl:
          this.onTelHdCtrl(parsedData.Ctrl, parsedData.Hd, parsedData.EnaDis);
          break;
        case WebDriverDef.msgStatTel:
          switch (parsedData.CtrlID) {
            case WebDriverDef.StatTelCtrl.eTelStatOfInputCtrl:
              switch (parsedData.InputCtrl) {
                case WebDriverDef.InputCtrl.eInputSigHandsetDetected:
                  this.onHandsetDetected(parsedData.OnOff);
                  break;
                default:
                  break;
              }
              break;
            default:
              break;
          }
          break;
        case WebDriverDef.msgStatRadio:
          switch (parsedData.MessageID) {
            case WebDriverDef.RadioMessage.eRadioTXStat:
              this.onRadioTxStatus(parsedData.RdCtrl);
              break;
            case WebDriverDef.RadioMessage.eRadioRXStat:
              this.onRadioRxStatus(parsedData.RdCtrl);
              break;
            case WebDriverDef.RadioMessage.eRadioLog:
              this.onRadioHandsetDetected(parsedData.RdCtrl);
              break;
            case WebDriverDef.RadioMessage.eRadioMode:
              this.onRadioMode(parsedData.RdCtrl);
              break;
            default:
              break;
          }
          break;
        case WebDriverDef.msgTelDSPAudioState:
          switch (parsedData.DSPMsgID) {
            case WebDriverDef.DspMsgID.eDspAgc:
              this.onCalltakerAgc(parsedData.DSPDeviceID, parsedData.DSPStatus);
              break;
            case WebDriverDef.DspMsgID.eDspNoiseReduction:
              this.onCalltakerNr(parsedData.DSPDeviceID, parsedData.DSPStatus);
              break;
            default:
              break;
          }
          break;
        default:
          break;
      }
    } else if (message === '__RESPONSE__') {
      let fromCmd: string = parsedData.FromCmd;
      switch (fromCmd) {
        case WebDriverDef.commandViperGetSystemInfo:
          let alarmCritical: number = parsedData.AlarmCritical;
          let alarmMajor: number = parsedData.AlarmMajor;
          let alarmMinor: number = parsedData.AlarmMinor;
          let normalMode: number = parsedData.NormalMode;
          let swStarted: number = parsedData.SwStarted;
          this.onSystemInfo(alarmCritical, alarmMajor, alarmMinor, normalMode, swStarted);
          break;
        case WebDriverDef.commandSetLatestPkgInfo:
          this.pkgUpdateStatus = parsedData.resultCode;
          switch (this.pkgUpdateStatus) {
            case WebDriverDef.PkgUpdateStatusType.eDriverPkgUpdateStatusDownloadSuccessful:
              diag.out(
                'onMessage',
                `RESPONSE for SetLatestPkgInfo: New package downloaded successfully ${parsedData.localFilePath}.`
              );
              break;
            case WebDriverDef.PkgUpdateStatusType.eDriverPkgUpdateStatusAlreadyDownloaded:
              diag.out(
                'onMessage',
                `RESPONSE for SetLatestPkgInfo: New version already downloaded, no need to download ${parsedData.localFilePath}.`
              );
              break;
            case WebDriverDef.PkgUpdateStatusType.eDriverPkgUpdateStatusInstalledSuccessfully:
              diag.out(
                'onMessage',
                `RESPONSE for SetLatestPkgInfo: New version already installed, no need to download.`
              );
              break;
            case WebDriverDef.PkgUpdateStatusType.eDriverPkgUpdateStatusFailedToDownload:
              diag.err('onMessage', `RESPONSE for SetLatestPkgInfo: Failed to download.`);
              break;
            case WebDriverDef.PkgUpdateStatusType.eDriverPkgUpdateStatusMismatchVersion:
              diag.err(
                'onMessage',
                `RESPONSE for SetLatestPkgInfo: Mismatch detected between latest version and actual package.`
              );
              break;
            case WebDriverDef.PkgUpdateStatusType.eDriverPkgUpdateStatusMismatchCard:
              diag.err(
                'onMessage',
                `RESPONSE for SetLatestPkgInfo: Mismatch detected between audio card and actual card intended package.`
              );
              break;
            case WebDriverDef.PkgUpdateStatusType.eDriverPkgUpdateStatusFailedAutoUpdateNotSupported:
              diag.err('onMessage', `RESPONSE for SetLatestPkgInfo: Failed because auto-update is not supported.`);
              break;
            default:
              break;
          }
          break;
        default:
          break;
      }
    }
  };

  private onHeartbeatEvent(errCode: number) {
    this.heartbeatCounter = 0;
    if (errCode === WebDriverDef.errCodeSuccessFull.id) {
      diagHB.trace?.('onHeartbeatEvent', `Heartbeat status is successfull`);
      this.heartbeatStatus = true;
      this.updateCtiHardwareStatus();
    } else if (errCode === WebDriverDef.errToBeExecute.id) {
      diagHB.trace?.('onHeartbeatEvent', `Heartbeat status is not yet available`);
    } else {
      diagHB.warn('onHeartbeatEvent', `Heartbeat status failure: ${WebDriverDef.getErrorText(errCode)}`);
      this.heartbeatStatus = false;
      this.updateCtiHardwareStatus();
    }
  }

  private onSystemInfo(
    alarmCritical: number,
    alarmMajor: number,
    alarmMinor: number,
    normalMode: number,
    swStarted: number
  ) {
    this.systemInfoCounter = 0;
    let systemInfoStatus = true;

    diagHB.trace?.(
      'onSystemInfo',
      `SystemInfo: NormalMode: ${normalMode}, SwStarted: ${swStarted}, AlarmCritical: ${alarmCritical}, AlarmMajor: ${alarmMajor}, AlarmMinor: ${alarmMinor}`
    );

    if (normalMode === 0) {
      diagHB.warn('onSystemInfo', `Driver not in normal mode`);
      systemInfoStatus = false;
    }
    if (swStarted === 0) {
      diagHB.warn('onSystemInfo', `Driver software not started`);
      systemInfoStatus = false;
    }
    if (alarmMinor === 1) {
      diagHB.trace?.('onSystemInfo', `Driver signaled minor alarm`);
    }
    if (alarmMajor === 1) {
      diagHB.trace?.('onSystemInfo', `Driver signaled major alarm`);
    }
    if (alarmCritical === 1) {
      diagHB.trace?.('onSystemInfo', `Driver signaled critical alarm`);
    }

    this.systemInfoStatus = systemInfoStatus;
    this.updateCtiHardwareStatus();
  }

  private wsReadyState(readyState: number) {
    if (this.ws && readyState === this.ws.OPEN) {
      this.wsLinkStatus = true;
    } else if (this.ws && this.ws.CLOSED) {
      this.wsLinkStatus = false;
      this.heartbeatStatus = false;
      this.configured = false;
      this.systemInfoStatus = false;
      this.startup = true;
      this.radioTxStatus = false;
      this.radioRxStatus = false;
    } else {
      this.wsLinkStatus = false;
    }

    this.updateCtiHardwareStatus();
  }

  private async updateCtiHardwareStatus() {
    let prevStatus = this.ctiHardwareStatus;

    if (this.wsLinkStatus && this.heartbeatStatus && this.configured && this.systemInfoStatus) {
      this.ctiHardwareStatus = ExtInterface.CtiHardwareStatus.Up;
    } else {
      this.ctiHardwareStatus = ExtInterface.CtiHardwareStatus.Down;
    }

    if (prevStatus !== this.ctiHardwareStatus) {
      if (this.ctiHardwareStatus === ExtInterface.CtiHardwareStatus.Up) {
        await this.retrieveInitialStatus();
      }

      diag.out(
        'updateCtiHardwareStatus',
        `CtiHardwareStatus updated to ${this.ctiHardwareStatus === ExtInterface.CtiHardwareStatus.Up ? 'Up' : 'Down'}`
      );
      let ctiHwEvent: ExtInterface.CtiHardwareUpdate = new ExtInterface.CtiHardwareUpdate(
        this.ctiHardwareStatus,
        this.workstationCTIConfig.WorkstationType
      );
      this.dispatchEvent(ctiHwEvent);
    }
  }

  private async retrieveInitialStatus() {
    // offHook status
    this.isOffHook = await this.retrieveIOControl(
      WebDriverDef.IOControlType.eIOTri_Loop1,
      WebDriverDef.HdContactType.eHdPTTalk
    );

    // Send off-hook on link-up if that is the last known status
    if (this.isOffHook) {
      this.offHook();
    }

    // HCO
    let hco = await this.retrieveIOControl(WebDriverDef.IOControlType.eIOHCO, null);
    // State from driver are inversed  (active => HCOMode.HCOOff, inactive => HCOMode.HCOOn)
    diag.trace?.('retrieveInitialStatus', `HCO ${hco ? 'Disabled' : 'Enabled'}`);
    let hcoModeEvent: ExtInterface.HcoModeChange = new ExtInterface.HcoModeChange(
      hco ? ExtInterface.HCOMode.HCOOff : ExtInterface.HCOMode.HCOOn
    );
    this.dispatchEvent(hcoModeEvent);

    // VCO
    let vco = await this.retrieveIOControl(WebDriverDef.IOControlType.eIOVCO, null);
    // State from driver are inversed  (active => VCOMode.VCOOff, inactive => VCOMode.VCOOn)
    diag.trace?.('retrieveInitialStatus', `VCO ${vco ? 'Disabled' : 'Enabled'}`);
    let vcoModeEvent: ExtInterface.VcoModeChange = new ExtInterface.VcoModeChange(
      vco ? ExtInterface.VCOMode.VCOOff : ExtInterface.VCOMode.VCOOn
    );
    this.dispatchEvent(vcoModeEvent);

    // Handset Mute
    let agentMute = await this.retrieveIOControl(
      WebDriverDef.IOControlType.eIOHdAgent,
      WebDriverDef.HdContactType.eHdPTMute
    );
    diag.trace?.('retrieveInitialStatus', `Handset Agent Mute ${agentMute ? 'On' : 'Off'}`);
    let muteChangeEvent: ExtInterface.MuteChange = new ExtInterface.MuteChange(
      ExtInterface.HandsetType.HandsetAgent,
      agentMute ? ExtInterface.MuteState.MuteOn : ExtInterface.MuteState.MuteOff
    );
    this.dispatchEvent(muteChangeEvent);

    let trainerMute = await this.retrieveIOControl(
      WebDriverDef.IOControlType.eIOHdTrainer,
      WebDriverDef.HdContactType.eHdPTMute
    );
    diag.trace?.('retrieveInitialStatus', `Handset Trainer Mute ${trainerMute ? 'On' : 'Off'}`);
    let muteChangeEvent2: ExtInterface.MuteChange = new ExtInterface.MuteChange(
      ExtInterface.HandsetType.HandsetTrainer,
      agentMute ? ExtInterface.MuteState.MuteOn : ExtInterface.MuteState.MuteOff
    );
    this.dispatchEvent(muteChangeEvent2);

    // Handset and Radio Detect
    this.handsetDetect = await this.retrieveIOControl(WebDriverDef.IOControlType.eIOHdsetDetection, null);
    diag.trace?.('retrieveInitialStatus', `Handset Detect ${this.handsetDetect ? 'On' : 'Off'}`);

    this.radioDetect = await this.retrieveIOControl(WebDriverDef.IOControlType.eIORdHdDetection, null);
    diag.trace?.('retrieveInitialStatus', `Radio Detect ${this.radioDetect ? 'On' : 'Off'}`);

    let handsetDetectChangeEvent: ExtInterface.HandsetDetectChange = new ExtInterface.HandsetDetectChange(
      this.handsetDetect || this.radioDetect
        ? ExtInterface.HandsetDetectType.AtLeastOneConnected
        : ExtInterface.HandsetDetectType.NoneConnected
    );
    this.dispatchEvent(handsetDetectChangeEvent);

    // Radio Mode
    this.currentlyInSplitMode = await this.retrieveIOControl(WebDriverDef.IOControlType.eIOSplitCombine, null);
    diag.trace?.('retrieveInitialStatus', `RadioMode ${this.currentlyInSplitMode ? 'Split' : 'Combined'}`);
    let radioModeEvent: ExtInterface.RadioModeChange = new ExtInterface.RadioModeChange(
      this.currentlyInSplitMode ? ExtInterface.RadioMode.Split : ExtInterface.RadioMode.Combine
    );
    this.dispatchEvent(radioModeEvent);

    if (this.currentlyInSplitMode !== this.defaultSplitMode) {
      // Force Radio Mode to default value
      this.setRadioMode(this.defaultSplitMode ? ExtInterface.RadioMode.Split : ExtInterface.RadioMode.Combine);
    }

    // Tx AGC Status
    await this.retrieveAgcStatus();
  }

  private async retrieveIOControl(
    control: WebDriverDef.IOControlType,
    contact: WebDriverDef.HdContactType | null
  ): Promise<boolean> {
    try {
      let message: any = {
        __CMD__: WebDriverDef.commandViperRtrvIOControl,
        IOControl: control,
        Contact: contact === null ? 0 : contact,
      };

      if (this.ws != null) {
        let res = await this.ws.sendAndWaitForResponse(message);
        if (res) {
          let data = JSON.parse(res);
          let active: boolean = data.Active;
          diag.trace?.(
            'retrieveIOControl',
            `Received ${active ? 'active' : 'inactive'} status for ${control} ${
              contact === null ? '' : 'for contact ' + contact
            }`
          );
          return active;
        }
      }
    } catch (e) {
      diag.warn('retrieveIOControl', `Cannot send a message due to ${e.message}`);
      return false;
    }

    return false;
  }

  public onHook() {
    if (this.ctiHardwareStatus === ExtInterface.CtiHardwareStatus.Up) {
      try {
        let message: any = {
          __CMD__: WebDriverDef.commandSendMessage,
          msgID: WebDriverDef.msgTelOnOffHook,
          Hook: WebDriverDef.TelHookType.eTelHookOn,
        };
        if (this.ws != null) {
          diag.trace?.('onHook', `Send onHook message`);
          this.ws.send(JSON.stringify(message));
        }
      } catch (e) {
        diag.warn('onHook', `Cannot send a message due to ${e.message}`);
      }
    } else {
      diag.warn('onHook', `Cannot send a message because of link down`);
    }
  }

  public offHook() {
    if (this.ctiHardwareStatus === ExtInterface.CtiHardwareStatus.Up) {
      try {
        let message: any = {
          __CMD__: WebDriverDef.commandSendMessage,
          msgID: WebDriverDef.msgTelOnOffHook,
          Hook: WebDriverDef.TelHookType.eTelHookOff,
        };
        if (this.ws != null) {
          diag.trace?.('offHook', `Send offHook message`);
          this.ws.send(JSON.stringify(message));
        }
      } catch (e) {
        diag.warn('offHook', `Cannot send a message due to ${e.message}`);
      }
    } else {
      diag.warn('offHook', `Cannot send a message because of link down`);
    }
  }

  private onHookEvent(hook: number, errCode: number) {
    if (hook === WebDriverDef.TelHookType.eTelHookOn) {
      diag.trace?.('onHookEvent', `onHook Status received`);
      this.isOffHook = false;
      // Send PTT Off
      diag.trace?.('onHookEvent', `Synchronize PTT With Radio; Sending PTT Off`);
      this.pttHandset(ExtInterface.PttState.PttOff);
    } else if (hook === WebDriverDef.TelHookType.eTelHookOff) {
      diag.trace?.('onHookEvent', `offHook Status received`);
      this.isOffHook = true;
    } else {
      diag.warn('offHook', `Unexpected hook status: ${hook.toString()}`);
    }
  }

  public muteHandset(handset: ExtInterface.HandsetType, state: ExtInterface.MuteState) {
    if (this.ctiHardwareStatus === ExtInterface.CtiHardwareStatus.Up) {
      try {
        let hd: string = '';
        switch (handset) {
          case ExtInterface.HandsetType.HandsetAgent:
            hd = WebDriverDef.HdType.eHdTypeAgent;
            break;
          case ExtInterface.HandsetType.HandsetTrainer:
            hd = WebDriverDef.HdType.eHdTypeTrainer;
            break;
          default:
            break;
        }
        let message: any = {
          __CMD__: WebDriverDef.commandSendMessage,
          msgID: WebDriverDef.msgTelHdCtrl,
          Ctrl: WebDriverDef.TelHdCtrlType.eTelHdCtrlMute,
          EnaDis:
            state === ExtInterface.MuteState.MuteOff
              ? WebDriverDef.EnableDisableType.eDis
              : WebDriverDef.EnableDisableType.eEna,
          Hd: hd,
        };
        if (this.ws != null) {
          diag.trace?.(
            'muteHandset',
            `Send Mute ${state === ExtInterface.MuteState.MuteOff ? 'Off' : 'On'} on ${
              handset === ExtInterface.HandsetType.HandsetAgent ? 'Agent' : 'Trainer'
            } Handset message`
          );
          this.ws.send(JSON.stringify(message));
        }
      } catch (e) {
        diag.warn('muteHandset', `Cannot send a message due to ${e.message}`);
      }
    } else {
      diag.warn('muteHandset', `Cannot send a message because of link down`);
    }
  }

  public pttHandset(state: ExtInterface.PttState) {
    if (this.ctiHardwareStatus === ExtInterface.CtiHardwareStatus.Up) {
      try {
        let message: any = {
          __CMD__: WebDriverDef.commandSendMessage,
          msgID: WebDriverDef.msgTelHdCtrl,
          Ctrl: WebDriverDef.TelHdCtrlType.eTelHdCtrlPtt,
          EnaDis:
            state === ExtInterface.PttState.PttOff
              ? WebDriverDef.EnableDisableType.eDis
              : WebDriverDef.EnableDisableType.eEna,
          Hd: WebDriverDef.HdType.eHdTypeBoth,
        };
        if (this.ws != null) {
          diag.trace?.('pttHandset', `Send PTT ${state === ExtInterface.PttState.PttOff ? 'Off' : 'On'} message`);
          this.ws.send(JSON.stringify(message));
        }
      } catch (e) {
        diag.warn('pttHandset', `Cannot send a message due to ${e.message}`);
      }
    } else {
      diag.warn('pttHandset', `Cannot send a message because of link down`);
    }
  }

  public setVolume(dest: WebDriverDef.VolumeDestType, value: number): void {
    if (this.ctiHardwareStatus === ExtInterface.CtiHardwareStatus.Up) {
      try {
        let message = {
          __CMD__: WebDriverDef.commandViperSetVolume,
          Volume: dest,
          Value: value > 99 ? 99 : value < 0 ? 0 : value, // [0...99] to specify volume level
        };
        if (this.ws != null) {
          diag.trace?.('setVolume', `Send commandViperSetVolume: ${JSON.stringify(message)}`);
          this.ws.send(JSON.stringify(message));
        }
      } catch (e) {
        diag.warn('setVolume', `Cannot send a message due to ${e.message}`);
      }
    } else {
      diag.warn('setVolume', `Cannot send a message because of link down`);
    }
  }

  public setGreetingDestination(): void {
    if (this.ctiHardwareStatus === ExtInterface.CtiHardwareStatus.Up) {
      try {
        let message = {
          __CMD__: WebDriverDef.commandSendMessage,
          msgID: WebDriverDef.msgTelAudioPlay,
          Play: WebDriverDef.AudioPlayDevice.eGreetingDevice,
          EnaDis: WebDriverDef.EnableDisableType.eCfg,
          Line: 1,
          Handset: 1,
          Speaker: 0,
        };
        if (this.ws != null) {
          diag.trace?.('setGreetingDestination', `Send msgTelAudioPlay: ${JSON.stringify(message)}`);
          this.ws.send(JSON.stringify(message));
        }
      } catch (e) {
        diag.warn('setGreetingDestination', `Cannot send a message due to ${e.message}`);
      }
    } else {
      diag.warn('setGreetingDestination', `Cannot send a message because of link down`);
    }
  }

  public setPlaybackDestination(playbackToCaller: boolean): void {
    if (this.ctiHardwareStatus === ExtInterface.CtiHardwareStatus.Up) {
      try {
        let message = {
          __CMD__: WebDriverDef.commandSendMessage,
          msgID: WebDriverDef.msgTelAudioPlay,
          Play: WebDriverDef.AudioPlayDevice.ePlaybackDevice,
          EnaDis: WebDriverDef.EnableDisableType.eCfg,
          Line: playbackToCaller ? 1 : 0,
          Handset: 1,
          // Radio: 1,
          Speaker: 1,
        };
        if (this.ws != null) {
          diag.trace?.('setPlaybackDestination', `Send msgTelAudioPlay: ${JSON.stringify(message)}`);
          this.ws.send(JSON.stringify(message));
        }
      } catch (e) {
        diag.warn('setPlaybackDestination', `Cannot send a message due to ${e.message}`);
      }
    } else {
      diag.warn('setPlaybackDestination', `Cannot send a message because of link down`);
    }
  }

  public setRingerDestination(dest: VolumeControlDestination): void {
    if (this.ctiHardwareStatus === ExtInterface.CtiHardwareStatus.Up) {
      try {
        let message = {
          __CMD__: WebDriverDef.commandSendMessage,
          msgID: WebDriverDef.msgTelAudioPlay,
          Play: WebDriverDef.AudioPlayDevice.eRingerAnnouncementDevice,
          EnaDis: WebDriverDef.EnableDisableType.eCfg,
          Line: 0,
          Handset:
            dest === VolumeControlDestination.Handset || dest === VolumeControlDestination.HandsetSpeaker ? 1 : 0,
          Speaker:
            dest === VolumeControlDestination.Speaker || dest === VolumeControlDestination.HandsetSpeaker ? 1 : 0,
        };
        if (this.ws != null) {
          diag.trace?.('setRingerDestination', `Send msgTelAudioPlay: ${JSON.stringify(message)}`);
          this.ws.send(JSON.stringify(message));
        }
      } catch (e) {
        diag.warn('setRingerDestination', `Cannot send a message due to ${e.message}`);
      }
    } else {
      diag.warn('setRingerDestination', `Cannot send a message because of link down`);
    }
  }

  public setRecordingSource(
    source: WebDriverDef.AudioPlay.eTelAudioRecording | WebDriverDef.AudioPlay.eTelAudiorecordingAnalog
  ): void {
    if (this.ctiHardwareStatus === ExtInterface.CtiHardwareStatus.Up) {
      try {
        let message = {
          __CMD__: WebDriverDef.commandSendMessage,
          msgID: WebDriverDef.msgTelAudioPlay,
          Play: source,
          EnaDis: WebDriverDef.EnableDisableType.ePrep,
        };
        if (this.ws != null) {
          diag.trace?.('setRecordingSource', `Send msgTelAudioPlay: ${JSON.stringify(message)}`);
          this.ws.send(JSON.stringify(message));
        }
      } catch (e) {
        diag.warn('setRecordingSource', `Cannot send a message due to ${e.message}`);
      }
    } else {
      diag.warn('setRecordingSource', `Cannot send a message because of link down`);
    }
  }

  public startGreetingRecording(): void {
    if (this.ctiHardwareStatus === ExtInterface.CtiHardwareStatus.Up) {
      try {
        let message = {
          __CMD__: WebDriverDef.commandSendMessage,
          msgID: WebDriverDef.msgTelAudioPlay,
          Play: WebDriverDef.AudioPlay.eTelAudioRecording,
          EnaDis: WebDriverDef.EnableDisableType.eEna,
        };
        if (this.ws != null) {
          diag.trace?.('startGreetingRecording', `Send msgTelAudioPlay: ${JSON.stringify(message)}`);
          this.ws.send(JSON.stringify(message));
        }
      } catch (e) {
        diag.warn('startGreetingRecording', `Cannot send a message due to ${e.message}`);
      }
    } else {
      diag.warn('startGreetingRecording', `Cannot send a message because of link down`);
    }
  }

  public stopGreetingRecording(): void {
    if (this.ctiHardwareStatus === ExtInterface.CtiHardwareStatus.Up) {
      try {
        let message = {
          __CMD__: WebDriverDef.commandSendMessage,
          msgID: WebDriverDef.msgTelAudioPlay,
          Play: WebDriverDef.AudioPlay.eTelAudioRecording,
          EnaDis: WebDriverDef.EnableDisableType.eDis,
        };
        if (this.ws != null) {
          diag.trace?.('stopGreetingRecording', `Send msgTelAudioPlay: ${JSON.stringify(message)}`);
          this.ws.send(JSON.stringify(message));
        }
      } catch (e) {
        diag.warn('stopGreetingRecording', `Cannot send a message due to ${e.message}`);
      }
    } else {
      diag.warn('stopGreetingRecording', `Cannot send a message because of link down`);
    }
  }

  public startPlayback(): void {
    if (this.ctiHardwareStatus === ExtInterface.CtiHardwareStatus.Up) {
      try {
        let message = {
          __CMD__: WebDriverDef.commandSendMessage,
          msgID: WebDriverDef.msgTelAudioPlay,
          Play: WebDriverDef.AudioPlayDevice.ePlaybackDevice,
          EnaDis: WebDriverDef.EnableDisableType.eEna,
        };
        if (this.ws != null) {
          diag.trace?.('startPlayback', `Send msgTelAudioPlay: ${JSON.stringify(message)}`);
          this.ws.send(JSON.stringify(message));
        }
      } catch (e) {
        diag.warn('startPlayback', `Cannot send a message due to ${e.message}`);
      }
    } else {
      diag.warn('startPlayback', `Cannot send a message because of link down`);
    }
  }

  public stopPlayback(): void {
    if (this.ctiHardwareStatus === ExtInterface.CtiHardwareStatus.Up) {
      try {
        let message = {
          __CMD__: WebDriverDef.commandSendMessage,
          msgID: WebDriverDef.msgTelAudioPlay,
          Play: WebDriverDef.AudioPlayDevice.ePlaybackDevice,
          EnaDis: WebDriverDef.EnableDisableType.eDis,
        };
        if (this.ws != null) {
          diag.trace?.('stopPlayback', `Send msgTelAudioPlay: ${JSON.stringify(message)}`);
          this.ws.send(JSON.stringify(message));
        }
      } catch (e) {
        diag.warn('stopPlayback', `Cannot send a message due to ${e.message}`);
      }
    } else {
      diag.warn('stopGreetinstopPlaybackgRecording', `Cannot send a message because of link down`);
    }
  }

  public tddConnect(initiation: ExtInterface.TddInitiationType) {
    if (this.ctiHardwareStatus === ExtInterface.CtiHardwareStatus.Up) {
      try {
        let message: any = {
          __CMD__: WebDriverDef.commandSendMessage,
          msgID: WebDriverDef.msgTelDSPCtrl,
          Ch: WebDriverDef.TelCh.eTelCh2,
          CtrlID: WebDriverDef.DspCtrlIdType.eTelDSPCtrlTDDRxTx,
          Action: WebDriverDef.DspCtrlActionType.eTelDSPCtrlActionEna,
          TDDInitiation:
            initiation === ExtInterface.TddInitiationType.Answering
              ? WebDriverDef.DspTddInitiation.eTelTddAnswering
              : WebDriverDef.DspTddInitiation.eTelTddOriginating,
          TDDMode: WebDriverDef.DspTddMode.eTelTddTypeA_1400_1800, // Baudot Mode
          TDDSpeed: WebDriverDef.DspTddSpeed.eTelTdd45Bps, // 45 Bps
        };
        if (this.ws != null) {
          diag.trace?.('tddConnect', `Send tddConnect message`);
          this.ws.send(JSON.stringify(message));

          // Send back a connection event
          this.onTddConnection(initiation);
        }
      } catch (e) {
        diag.warn('tddConnect', `Cannot send a message due to ${e.message}`);
      }
    } else {
      diag.warn('tddConnect', `Cannot send a message because of link down`);
    }
  }

  public tddDisconnect() {
    if (this.ctiHardwareStatus === ExtInterface.CtiHardwareStatus.Up) {
      try {
        let message: any = {
          __CMD__: WebDriverDef.commandSendMessage,
          msgID: WebDriverDef.msgTelDSPCtrl,
          Ch: WebDriverDef.TelCh.eTelCh2,
          CtrlID: WebDriverDef.DspCtrlIdType.eTelDSPCtrlTDDRxTx,
          Action: WebDriverDef.DspCtrlActionType.eTelDSPCtrlActionDis,
        };
        if (this.ws != null) {
          diag.trace?.('tddDisconnect', `Send tddDisconnect message`);
          this.ws.send(JSON.stringify(message));
        }
      } catch (e) {
        diag.warn('tddDisconnect', `Cannot send a message due to ${e.message}`);
      }
    } else {
      diag.warn('tddDisconnect', `Cannot send a message because of link down`);
    }
  }

  public tddSend(msg: string) {
    if (this.ctiHardwareStatus === ExtInterface.CtiHardwareStatus.Up) {
      try {
        let message: any = {
          __CMD__: WebDriverDef.commandSendMessage,
          msgID: WebDriverDef.msgTelTDDSendData,
          Data: msg,
        };
        if (this.ws != null) {
          diag.trace?.('tddSend', `Send tddSendData message`);
          this.ws.send(JSON.stringify(message));
        }
      } catch (e) {
        diag.warn('tddSend', `Cannot send a message due to ${e.message}`);
      }
    } else {
      diag.warn('tddSend', `Cannot send a message because of link down`);
    }
  }

  public tddAbortTx() {
    if (this.ctiHardwareStatus === ExtInterface.CtiHardwareStatus.Up) {
      try {
        let message: any = {
          __CMD__: WebDriverDef.commandSendMessage,
          msgID: WebDriverDef.msgTelDSPCtrl,
          Ch: WebDriverDef.TelCh.eTelCh2,
          CtrlID: WebDriverDef.DspCtrlIdType.eTelDSPCtrlTDDRxTx,
          Action: WebDriverDef.DspCtrlActionType.eTelDSPCtrlActionAbort,
        };
        if (this.ws != null) {
          diag.trace?.('tddAbortTx', `Send TDDRxTx Abort message`);
          this.ws.send(JSON.stringify(message));
        }
      } catch (e) {
        diag.warn('tddAbortTx', `Cannot send a message due to ${e.message}`);
      }
    } else {
      diag.warn('tddAbortTx', `Cannot send a message because of link down`);
    }
  }

  public setHCO(mode: ExtInterface.HCOMode) {
    if (this.ctiHardwareStatus === ExtInterface.CtiHardwareStatus.Up) {
      try {
        // State to driver are inversed (HCOMode.HCOOff => eTelCtrlOn, HCOMode.HCOOn => eTelCtrlOff)
        let message: any = {
          __CMD__: WebDriverDef.commandSendMessage,
          msgID: WebDriverDef.msgTelCtrlVolume,
          TypeCtrl: WebDriverDef.TelCtrlVol.eCtrlVolPreSet,
          TypeActivation:
            mode === ExtInterface.HCOMode.HCOOn
              ? WebDriverDef.TypeOnOff.eTelCtrlOff
              : WebDriverDef.TypeOnOff.eTelCtrlOn,
          LevelSet: WebDriverDef.TelTypeSetCtrl.eCtrlTDDPreSet,
          Direction: WebDriverDef.TelDirection.eTransmission,
          Audio: WebDriverDef.TelAudio.eAudioHandset,
        };
        if (this.ws != null) {
          diag.trace?.('setVCO', `Send HCO ${mode === ExtInterface.HCOMode.HCOOn ? 'On' : 'Off'} message`);
          this.ws.send(JSON.stringify(message));
        }
      } catch (e) {
        diag.warn('setHCO', `Cannot send a message due to ${e.message}`);
      }
    } else {
      diag.warn('setHCO', `Cannot send a message because of link down`);
    }
  }

  public setVCO(mode: ExtInterface.VCOMode) {
    if (this.ctiHardwareStatus === ExtInterface.CtiHardwareStatus.Up) {
      try {
        // State to driver are inversed (VCOMode.VCOOff => eTelCtrlOn, HVOMode.VCOOn => eTelCtrlOff)
        let message: any = {
          __CMD__: WebDriverDef.commandSendMessage,
          msgID: WebDriverDef.msgTelCtrlVolume,
          TypeCtrl: WebDriverDef.TelCtrlVol.eCtrlVolPreSet,
          TypeActivation:
            mode === ExtInterface.VCOMode.VCOOn
              ? WebDriverDef.TypeOnOff.eTelCtrlOff
              : WebDriverDef.TypeOnOff.eTelCtrlOn,
          LevelSet: WebDriverDef.TelTypeSetCtrl.eCtrlTDDPreSet,
          Direction: WebDriverDef.TelDirection.eReceive,
          Audio: WebDriverDef.TelAudio.eAudioHandset,
        };
        if (this.ws != null) {
          diag.trace?.('setVCO', `Send VCO ${mode === ExtInterface.VCOMode.VCOOn ? 'On' : 'Off'} message`);
          this.ws.send(JSON.stringify(message));
        }
      } catch (e) {
        diag.warn('setVCO', `Cannot send a message due to ${e.message}`);
      }
    } else {
      diag.warn('setVCO', `Cannot send a message because of link down`);
    }
  }

  private onTddMessage(direction: ExtInterface.TddMessageDirectionType, message: string) {
    diag.trace?.(
      'onTddMessage',
      `TDD ${direction === ExtInterface.TddMessageDirectionType.Incoming ? 'RX' : 'TX'}: ${message}`
    );
    let tddMessageEvent: ExtInterface.TddMessageEvent = new ExtInterface.TddMessageEvent(direction, message);
    this.dispatchEvent(tddMessageEvent);
  }

  private onTddConnection(initiation: ExtInterface.TddInitiationType) {
    diag.trace?.('onTddConnection', `TDD Connection`);
    let tddConnectEvent: ExtInterface.TddConnectEvent = new ExtInterface.TddConnectEvent(null, initiation);
    this.dispatchEvent(tddConnectEvent);
  }

  private onTddDisconnection() {
    diag.trace?.('onTddDisconnection', `TDD Connection`);
    let tddDisconnectEvent: ExtInterface.TddDisconnectEvent = new ExtInterface.TddDisconnectEvent(null);
    this.dispatchEvent(tddDisconnectEvent);
  }

  private onTddDetection(mode: WebDriverDef.DspTddMode) {
    if (mode !== WebDriverDef.DspTddMode.eTelTddTypeA_1400_1800) {
      diag.warn('onTddDetection', `TDD Mode is not Baudot`);
    }
    diag.trace?.('onTddDetection', `TDD Detection`);
    let tddDetectEvent: ExtInterface.TddDetectEvent = new ExtInterface.TddDetectEvent(null);
    this.dispatchEvent(tddDetectEvent);
  }

  private onCtrlVolume(
    ctrl: WebDriverDef.TelCtrlVol,
    activation: WebDriverDef.TypeOnOff,
    levelSet: WebDriverDef.TelTypeSetCtrl,
    direction: WebDriverDef.TelDirection,
    audio: WebDriverDef.TelAudio,
    errCode: number
  ) {
    if (ctrl === WebDriverDef.TelCtrlVol.eCtrlVolPreSet) {
      if (levelSet === WebDriverDef.TelTypeSetCtrl.eCtrlTDDPreSet) {
        if (audio === WebDriverDef.TelAudio.eAudioHandset || audio === WebDriverDef.TelAudio.eAudioRadio) {
          if (
            (audio === WebDriverDef.TelAudio.eAudioHandset && direction === WebDriverDef.TelDirection.eReceive) ||
            (audio === WebDriverDef.TelAudio.eAudioRadio && direction === WebDriverDef.TelDirection.eTransmission)
          ) {
            // State from driver are inversed  (eTelCtrlOn => VCOMode.VCOOff, eTelCtrlOff => VCOMode.VCOOn)
            diag.trace?.(
              'onCtrlVolume',
              `VCO ${activation === WebDriverDef.TypeOnOff.eTelCtrlOn ? 'Disabled' : 'Enabled'}`
            );
            let vcoModeEvent: ExtInterface.VcoModeChange = new ExtInterface.VcoModeChange(
              activation === WebDriverDef.TypeOnOff.eTelCtrlOn
                ? ExtInterface.VCOMode.VCOOff
                : ExtInterface.VCOMode.VCOOn
            );
            this.dispatchEvent(vcoModeEvent);
          } else if (
            (audio === WebDriverDef.TelAudio.eAudioHandset && direction === WebDriverDef.TelDirection.eTransmission) ||
            (audio === WebDriverDef.TelAudio.eAudioRadio && direction === WebDriverDef.TelDirection.eReceive)
          ) {
            // State from driver are inversed  (eTelCtrlOn => HCOMode.HCOOff, eTelCtrlOff => HCOMode.HCOOn)
            diag.trace?.(
              'onCtrlVolume',
              `HCO ${activation === WebDriverDef.TypeOnOff.eTelCtrlOn ? 'Disabled' : 'Enabled'}`
            );
            let hcoModeEvent: ExtInterface.HcoModeChange = new ExtInterface.HcoModeChange(
              activation === WebDriverDef.TypeOnOff.eTelCtrlOn
                ? ExtInterface.HCOMode.HCOOff
                : ExtInterface.HCOMode.HCOOn
            );
            this.dispatchEvent(hcoModeEvent);
          }
        }
      }
    }
  }

  private onTelHdCtrl(ctrl: string, hd: string, enaDis: string) {
    switch (ctrl) {
      case WebDriverDef.TelHdCtrlType.eTelHdCtrlMute:
        if (hd === WebDriverDef.HdType.eHdTypeAgent) {
          diag.trace?.(
            'onTelHdCtrl',
            `Mute ${enaDis === WebDriverDef.EnableDisableType.eEna ? 'On' : 'Off'} on Agent handset`
          );
          let muteChangeEvent: ExtInterface.MuteChange = new ExtInterface.MuteChange(
            ExtInterface.HandsetType.HandsetAgent,
            enaDis === WebDriverDef.EnableDisableType.eEna
              ? ExtInterface.MuteState.MuteOn
              : ExtInterface.MuteState.MuteOff
          );
          this.dispatchEvent(muteChangeEvent);
        } else if (hd === WebDriverDef.HdType.eHdTypeTrainer) {
          diag.trace?.(
            'onTelHdCtrl',
            `Mute ${enaDis === WebDriverDef.EnableDisableType.eEna ? 'On' : 'Off'} on Trainer handset`
          );
          let muteChangeEvent: ExtInterface.MuteChange = new ExtInterface.MuteChange(
            ExtInterface.HandsetType.HandsetTrainer,
            enaDis === WebDriverDef.EnableDisableType.eEna
              ? ExtInterface.MuteState.MuteOn
              : ExtInterface.MuteState.MuteOff
          );
          this.dispatchEvent(muteChangeEvent);
        }
        break;
      default:
        break;
    }
  }

  private onHandsetDetected(onOff: WebDriverDef.TypeInputOnOff) {
    this.handsetDetect = onOff === WebDriverDef.TypeInputOnOff.eTelInputCtrlOn;

    if (onOff === WebDriverDef.TypeInputOnOff.eTelInputCtrlOff && this.radioDetect) {
      diag.trace?.('onHandsetDetected', `Radio Detect is On do not report HandsetDetectChange off`);
    } else {
      diag.trace?.('onHandsetDetected', `HandsetDetected: ${this.handsetDetect ? 'On' : 'Off'}`);
      let handsetDetectChangeEvent: ExtInterface.HandsetDetectChange = new ExtInterface.HandsetDetectChange(
        onOff === WebDriverDef.TypeInputOnOff.eTelInputCtrlOn
          ? ExtInterface.HandsetDetectType.AtLeastOneConnected
          : ExtInterface.HandsetDetectType.NoneConnected
      );
      this.dispatchEvent(handsetDetectChangeEvent);
    }
  }

  private onRadioHandsetDetected(onOff: WebDriverDef.RadioCtrl) {
    this.radioDetect = onOff === WebDriverDef.RadioCtrl.eRdCtrlOn;

    if (onOff === WebDriverDef.RadioCtrl.eRdCtrlOff && this.handsetDetect) {
      diag.trace?.('onRadioHandsetDetected', `Handset Detect is On do not report HandsetDetectChange off`);
    } else {
      diag.trace?.('onRadioHandsetDetected', `RadioHandsetDetected: ${this.radioDetect ? 'On' : 'Off'}`);
      let handsetDetectChangeEvent: ExtInterface.HandsetDetectChange = new ExtInterface.HandsetDetectChange(
        onOff === WebDriverDef.RadioCtrl.eRdCtrlOn
          ? ExtInterface.HandsetDetectType.AtLeastOneConnected
          : ExtInterface.HandsetDetectType.NoneConnected
      );
      this.dispatchEvent(handsetDetectChangeEvent);
    }
  }

  public anyHandsetConnected(): ExtInterface.HandsetDetectType {
    return this.handsetDetect || this.radioDetect
      ? ExtInterface.HandsetDetectType.AtLeastOneConnected
      : ExtInterface.HandsetDetectType.NoneConnected;
  }

  private onRadioTxStatus(onOff: WebDriverDef.RadioCtrl) {
    this.radioTxStatus = onOff === WebDriverDef.RadioCtrl.eRdCtrlOn;
    diag.trace?.('onRadioTxStatus', `RadioTxStatus: ${this.radioTxStatus ? 'Enable' : 'Disable'}`);
    let radioTxModeEvent: ExtInterface.RadioTransmitMode = new ExtInterface.RadioTransmitMode(
      this.radioTxStatus ? ExtInterface.RadioStatus.Enable : ExtInterface.RadioStatus.Disable
    );
    this.dispatchEvent(radioTxModeEvent);
  }

  private onRadioRxStatus(onOff: WebDriverDef.RadioCtrl) {
    this.radioRxStatus = onOff === WebDriverDef.RadioCtrl.eRdCtrlOn;
    diag.trace?.('radioRxStatus', `RadioRxStatus: ${this.radioRxStatus ? 'Enable' : 'Disable'}`);
    let radioRxModeEvent: ExtInterface.RadioReceptionMode = new ExtInterface.RadioReceptionMode(
      this.radioRxStatus ? ExtInterface.RadioStatus.Enable : ExtInterface.RadioStatus.Disable
    );
    this.dispatchEvent(radioRxModeEvent);
  }

  private onRadioMode(onOff: WebDriverDef.RadioCtrl) {
    let oldMode: boolean = this.currentlyInSplitMode;
    this.currentlyInSplitMode = onOff === WebDriverDef.RadioCtrl.eRdCtrlOff; //Off Split, On Combine
    diag.trace?.('onRadioMode', `RadioMode: ${this.currentlyInSplitMode ? 'Split' : 'Combine'}`);

    if (this.currentlyInSplitMode && oldMode !== this.currentlyInSplitMode) {
      diag.trace?.('onRadioMode', `Force PTT Off on split mode`);
      this.pttHandset(ExtInterface.PttState.PttOff);
    }

    let radioModeEvent: ExtInterface.RadioModeChange = new ExtInterface.RadioModeChange(
      this.currentlyInSplitMode ? ExtInterface.RadioMode.Split : ExtInterface.RadioMode.Combine
    );
    this.dispatchEvent(radioModeEvent);
  }

  public radioTransmitStatus(): ExtInterface.RadioStatus {
    return this.radioTxStatus ? ExtInterface.RadioStatus.Enable : ExtInterface.RadioStatus.Disable;
  }

  public radioReceptionStatus(): ExtInterface.RadioStatus {
    return this.radioRxStatus ? ExtInterface.RadioStatus.Enable : ExtInterface.RadioStatus.Disable;
  }

  public radioCombined(): boolean {
    return !this.currentlyInSplitMode;
  }

  public setRadioMode(mode: ExtInterface.RadioMode) {
    if (this.ctiHardwareStatus === ExtInterface.CtiHardwareStatus.Up) {
      try {
        let message: any = {
          __CMD__: WebDriverDef.commandSendMessage,
          msgID: WebDriverDef.msgTelRdCtrlMsg,
          Fnc: WebDriverDef.RadioCtrlFunction.eTelRdCtrlSplit,
          EnaDis:
            mode === ExtInterface.RadioMode.Split
              ? WebDriverDef.EnableDisableType.eEna
              : WebDriverDef.EnableDisableType.eDis,
        };
        if (this.ws != null) {
          diag.trace?.('setRadioMode', `Send RadioMode ${mode === ExtInterface.RadioMode.Split ? 'Split' : 'Combine'}`);
          this.ws.send(JSON.stringify(message));
        }
      } catch (e) {
        diag.warn('setRadioMode', `Cannot send a message due to ${e.message}`);
      }
    } else {
      diag.warn('setRadioMode', `Cannot send a message because of link down`);
    }
  }

  public async autoDial(
    address: string,
    durationMs: number = InbandDialingDigitTimeout,
    interDigitTimeout: number = InterDigitTimeout
  ) {
    if (this.ctiHardwareStatus === ExtInterface.CtiHardwareStatus.Up) {
      for (const singleDtmf of address) {
        await this.generateDtmfTone(singleDtmf, durationMs);
        await new Promise((r) => window.setTimeout(r, interDigitTimeout));
      }
    } else {
      diag.warn('autoDial', `Cannot Dial DTMF because of link down`);
    }
  }

  private async generateDtmfTone(singleDtmf: string, durationMs: number) {
    if (this.ctiHardwareStatus === ExtInterface.CtiHardwareStatus.Up) {
      let dtmf: string = '';
      switch (singleDtmf) {
        case '0':
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
        case '7':
        case '8':
        case '9':
        case '*':
        case '#':
        case 'A':
        case 'B':
        case 'C':
        case 'D':
          dtmf = singleDtmf;
          break;
        default:
          diag.warn('generateDtmfTone', `DTMF ${singleDtmf} not supported`);
          break;
      }

      if (dtmf.length === 1) {
        try {
          let message: any = {
            __CMD__: WebDriverDef.commandSendMessage,
            msgID: WebDriverDef.msgTelDSPCtrl,
            CtrlID: WebDriverDef.DspCtrlIdType.eTelDSPCtrlDTMF,
            Action: 'w',
            Ch: WebDriverDef.TelCh.eTelCh1,
            DTMF: dtmf,
          };
          if (this.ws != null) {
            diag.trace?.('generateDtmfTone', `Send TelDSPCtrlDTMF message for ${singleDtmf}`);
            this.ws.send(JSON.stringify(message));

            await new Promise((r) => window.setTimeout(r, durationMs));

            await this.stopDtmfTone();
          }
        } catch (e) {
          diag.warn('generateDtmfTone', `Cannot send a message due to ${e.message}`);
        }
      }
    } else {
      diag.warn('generateDtmfTone', `Cannot send a message because of link down`);
    }
  }

  private async stopDtmfTone() {
    if (this.ctiHardwareStatus === ExtInterface.CtiHardwareStatus.Up) {
      try {
        let message: any = {
          __CMD__: WebDriverDef.commandSendMessage,
          msgID: WebDriverDef.msgTelDSPCtrl,
          CtrlID: WebDriverDef.DspCtrlIdType.eTelDSPCtrlDTMF,
          Action: 'a',
          Ch: WebDriverDef.TelCh.eTelCh1,
        };
        if (this.ws != null) {
          diag.trace?.('stopDtmfTone', `Send TelDSPCtrlDTMF to stop DTMF`);
          this.ws.send(JSON.stringify(message));
        }
      } catch (e) {
        diag.warn('stopDtmfTone', `Cannot send a message due to ${e.message}`);
      }
    } else {
      diag.warn('stopDtmfTone', `Cannot send a message because of link down`);
    }
  }

  public agcState(): ExtInterface.AGCState {
    return this.agcStatus ? ExtInterface.AGCState.Enable : ExtInterface.AGCState.Disable;
  }

  public callTakerAgcState(): ExtInterface.AGCState {
    return this.callTakerAgcStatus ? ExtInterface.AGCState.Enable : ExtInterface.AGCState.Disable;
  }

  public callTakerNrState(): ExtInterface.NRState {
    return this.callTakerNrStatus ? ExtInterface.NRState.Enable : ExtInterface.NRState.Disable;
  }

  public setAgc(state: ExtInterface.AGCState) {
    if (this.ctiHardwareStatus === ExtInterface.CtiHardwareStatus.Up) {
      try {
        let message: any = {
          __CMD__: WebDriverDef.commandSendMessage,
          msgID: WebDriverDef.msgTelDSPCtrl,
          CtrlID: WebDriverDef.DspCtrlIdType.eTelDSPCtrlAGCActivation,
          Action:
            state === ExtInterface.AGCState.Enable
              ? WebDriverDef.DspCtrlActionType.eTelDSPCtrlActionEna
              : WebDriverDef.DspCtrlActionType.eTelDSPCtrlActionDis,
          Ch: WebDriverDef.TelCh.eTelCh1,
        };
        if (this.ws != null) {
          diag.trace?.(
            'setAgc',
            `Send AGCActivation ${state === ExtInterface.AGCState.Enable ? 'Enable' : 'Disable'} message`
          );
          this.ws.send(JSON.stringify(message));
        }
      } catch (e) {
        diag.warn('setAgc', `Cannot send a message due to ${e.message}`);
      }
    } else {
      diag.warn('setAgc', `Cannot send a message because of link down`);
    }

    this.retrieveAgcStatus();
  }

  private async retrieveAgcStatus() {
    this.agcStatus = await this.retrieveIOControl(WebDriverDef.IOControlType.eIOAGC, null);
    diag.trace?.('retrieveAgcStatus', `AGC Tx Status: ${this.agcStatus ? 'Enable' : 'Disable'}`);
    let agcStatusEvent: ExtInterface.AGCStatus = new ExtInterface.AGCStatus(
      this.agcStatus ? ExtInterface.AGCState.Enable : ExtInterface.AGCState.Disable
    );
    this.dispatchEvent(agcStatusEvent);
  }

  public setCallTakerAgc(state: ExtInterface.AGCState) {
    if (this.ctiHardwareStatus === ExtInterface.CtiHardwareStatus.Up) {
      try {
        let message: any = {
          __CMD__: WebDriverDef.commandSendMessage,
          msgID: WebDriverDef.msgTelDSPCtrl,
          CtrlID: WebDriverDef.DspCtrlIdType.eTelDSPCtrlDeviceAGC,
          DeviceDestination: WebDriverDef.DspDeviceID.eTelDSPDeviceVoipIn,
          Action:
            state === ExtInterface.AGCState.Enable
              ? WebDriverDef.DspCtrlActionType.eTelDSPCtrlActionEna
              : WebDriverDef.DspCtrlActionType.eTelDSPCtrlActionDis,
          Ch: WebDriverDef.TelCh.eTelCh1,
        };
        if (this.ws != null) {
          diag.trace?.(
            'setCallTakerAgc',
            `Send DSPCtrlDeviceAGC: ${state === ExtInterface.AGCState.Enable ? 'Enable' : 'Disable'} message`
          );
          this.ws.send(JSON.stringify(message));
        }
      } catch (e) {
        diag.warn('setCallTakerAgc', `Cannot send a message due to ${e.message}`);
      }
    } else {
      diag.warn('setCallTakerAgc', `Cannot send a message because of link down`);
    }
  }

  public setCallTakerNr(state: ExtInterface.NRState) {
    if (this.ctiHardwareStatus === ExtInterface.CtiHardwareStatus.Up) {
      try {
        let message: any = {
          __CMD__: WebDriverDef.commandSendMessage,
          msgID: WebDriverDef.msgTelDSPCtrl,
          CtrlID: WebDriverDef.DspCtrlIdType.eTelDSPCtrlDeviceNoiseReduction,
          DeviceDestination: WebDriverDef.DspDeviceID.eTelDSPDeviceVoipIn,
          Action:
            state === ExtInterface.NRState.Enable
              ? WebDriverDef.DspCtrlActionType.eTelDSPCtrlActionEna
              : WebDriverDef.DspCtrlActionType.eTelDSPCtrlActionDis,
          Ch: WebDriverDef.TelCh.eTelCh1,
        };
        if (this.ws != null) {
          diag.trace?.(
            'setCallTakerNr',
            `Send DSPCtrlDeviceNoiseReduction: ${state === ExtInterface.NRState.Enable ? 'Enable' : 'Disable'} message`
          );
          this.ws.send(JSON.stringify(message));
        }
      } catch (e) {
        diag.warn('setCallTakerNr', `Cannot send a message due to ${e.message}`);
      }
    } else {
      diag.warn('setCallTakerNr', `Cannot send a message because of link down`);
    }
  }

  private onCalltakerAgc(device: number, status: number) {
    if (device === WebDriverDef.DspDeviceID.eTelDSPDeviceVoipIn) {
      this.callTakerAgcStatus = status === WebDriverDef.DspStatus.eDspFeatureOn;
      diag.trace?.('onCalltakerAgc', `CallTakerAgcStatus: ${this.callTakerAgcStatus ? 'Enable' : 'Disable'}`);
      let callTakerAgcEvent: ExtInterface.CallTakerAGCStatus = new ExtInterface.CallTakerAGCStatus(
        this.callTakerAgcStatus ? ExtInterface.AGCState.Enable : ExtInterface.AGCState.Disable
      );
      this.dispatchEvent(callTakerAgcEvent);
    }
  }

  private onCalltakerNr(device: number, status: number) {
    if (device === WebDriverDef.DspDeviceID.eTelDSPDeviceVoipIn) {
      this.callTakerNrStatus = status === WebDriverDef.DspStatus.eDspFeatureOn;
      diag.trace?.('onCalltakerNr', `CallTakerNrStatus: ${this.callTakerNrStatus ? 'Enable' : 'Disable'}`);
      let callTakerNrEvent: ExtInterface.CallTakerNRStatus = new ExtInterface.CallTakerNRStatus(
        this.callTakerNrStatus ? ExtInterface.NRState.Enable : ExtInterface.NRState.Disable
      );
      this.dispatchEvent(callTakerNrEvent);
    }
  }

  public async zipToneEnable() {
    if (this.ctiHardwareStatus === ExtInterface.CtiHardwareStatus.Up) {
      let lineSelectGenOutputID: number = 0;
      if (this.workstationCTIConfig.WorkstationType === ExtInterface.CtiHardwareType.PowerStationG3) {
        lineSelectGenOutputID = this.workstationCTIConfig.LineSelectGenOutputIDA9CG3;
      } else if (
        this.workstationCTIConfig.WorkstationType === ExtInterface.CtiHardwareType.SonicG3 &&
        this.workstationCTIConfig.LineSelectGenOutputIDSonicG3
      ) {
        lineSelectGenOutputID = this.workstationCTIConfig.LineSelectGenOutputIDSonicG3;
      } else {
        lineSelectGenOutputID = this.workstationCTIConfig.LineSelectGenOutputID;
      }

      if (lineSelectGenOutputID > 0 && !this.currentlyInSplitMode) {
        // Force the line Select so zipTone can be heard if in combine mode
        try {
          let message: any = {
            __CMD__: WebDriverDef.commandSendMessage,
            msgID: WebDriverDef.msgIOActivation,
            IO_NUMBER: lineSelectGenOutputID,
            IO_ON_OFF: WebDriverDef.IOOnOff.ON,
          };
          if (this.ws != null) {
            diag.trace?.('zipToneEnable', `Send IOActivation message to force the line Select so zipTone can be heard`);
            this.ws.send(JSON.stringify(message));
          }
        } catch (e) {
          diag.warn('zipToneEnable', `Cannot send a message due to ${e.message}`);
        }
      }

      try {
        let message: any = {
          __CMD__: WebDriverDef.commandSendMessage,
          msgID: WebDriverDef.msgTelToneInjection,
          EnaDis: WebDriverDef.TelToneInjectionEnaDis.eToneZip,
          Ch: WebDriverDef.TelCh.eTelCh1,
        };
        if (this.ws != null) {
          diag.trace?.('zipToneEnable', `Send TelToneInjection Zip message`);
          this.ws.send(JSON.stringify(message));

          // Wait for the zipTone to complete
          await new Promise((r) => window.setTimeout(r, 500));
        }
      } catch (e) {
        diag.warn('zipToneEnable', `Cannot send a message due to ${e.message}`);
      }
    } else {
      diag.warn('zipToneEnable', `Cannot send a message because of link down`);
    }
  }

  public beepInjection(enable: boolean) {
    if (this.ctiHardwareStatus === ExtInterface.CtiHardwareStatus.Up) {
      try {
        let message: any = {
          __CMD__: WebDriverDef.commandSendMessage,
          msgID: WebDriverDef.msgTelToneInjection,
          EnaDis: enable
            ? WebDriverDef.TelToneInjectionEnaDis.eToneBeepEna
            : WebDriverDef.TelToneInjectionEnaDis.eToneBeepDis,
          Ch: WebDriverDef.TelCh.eTelCh1,
        };
        if (this.ws != null) {
          diag.trace?.('beepInjection', `Send TelToneInjection Beep message`);
          this.ws.send(JSON.stringify(message));
        }
      } catch (e) {
        diag.warn('beepInjection', `Cannot send a message due to ${e.message}`);
      }
    } else {
      diag.warn('beepInjection', `Cannot send a message because of link down`);
    }
  }

  public generateProgressTone(tone: ExtInterface.ProgressTone) {
    if (this.ctiHardwareStatus === ExtInterface.CtiHardwareStatus.Up) {
      try {
        let callProgression: number = 0;
        let progressToneTxt: string = '';
        switch (tone) {
          case ExtInterface.ProgressTone.DialTone:
            callProgression = WebDriverDef.CallProgression.eTelDSPCtrlCallProgDialTone;
            progressToneTxt = 'DialTone';
            break;
          case ExtInterface.ProgressTone.BusyTone:
            callProgression = WebDriverDef.CallProgression.eTelDSPCtrlCallProgBusy;
            progressToneTxt = 'BusyTone';
            break;
          case ExtInterface.ProgressTone.RingbackTone:
            callProgression = WebDriverDef.CallProgression.eTelDSPCtrlCallProgAudibleRing;
            progressToneTxt = 'RingbackTone';
            break;
          case ExtInterface.ProgressTone.ReorderTone:
            callProgression = WebDriverDef.CallProgression.eTelDSPCtrlCallProgReorder;
            progressToneTxt = 'ReorderTone';
            break;
          default:
        }

        if (callProgression !== 0) {
          // Stop the current progress tone if any
          this.stopProgressTone();

          let message: any = {
            __CMD__: WebDriverDef.commandSendMessage,
            msgID: WebDriverDef.msgTelDSPCtrl,
            CtrlID: WebDriverDef.DspCtrlIdType.eTelDSPCtrlCPTConnection,
            Action: WebDriverDef.DspCtrlActionType.eTelDSPCtrlActionWrite,
            Ch: WebDriverDef.TelCh.eTelCh1,
            CallProgression: callProgression,
            CPTConnectionGroup: WebDriverDef.TelAudio.eAudioHandset,
          };
          if (this.ws != null) {
            diag.trace?.('generateProgressTone', `Send DSPCtrlCPTConnection message to start ${progressToneTxt}`);
            this.ws.send(JSON.stringify(message));
          }
        }
      } catch (e) {
        diag.warn('generateProgressTone', `Cannot send a message due to ${e.message}`);
      }
    } else {
      diag.warn('generateProgressTone', `Cannot send a message because of link down`);
    }
  }

  public stopProgressTone() {
    if (this.ctiHardwareStatus === ExtInterface.CtiHardwareStatus.Up) {
      try {
        let message: any = {
          __CMD__: WebDriverDef.commandSendMessage,
          msgID: WebDriverDef.msgTelDSPCtrl,
          CtrlID: WebDriverDef.DspCtrlIdType.eTelDSPCtrlCPTConnection,
          Action: WebDriverDef.DspCtrlActionType.eTelDSPCtrlActionAbort,
          Ch: WebDriverDef.TelCh.eTelCh1,
          CallProgression: 0,
          CPTConnectionGroup: 0,
        };
        if (this.ws != null) {
          diag.trace?.('stopProgressTone', `Send DSPCtrlCPTConnection message to stop progress tone`);
          this.ws.send(JSON.stringify(message));
        }
      } catch (e) {
        diag.warn('stopProgressTone', `Cannot send a message due to ${e.message}`);
      }
    } else {
      diag.warn('stopProgressTone', `Cannot send a message because of link down`);
    }
  }

  public async beep(type: ExtInterface.BeepType): Promise<boolean> {
    if (this.ctiHardwareStatus === ExtInterface.CtiHardwareStatus.Up) {
      try {
        let frequency: number = 0;
        let duration: number = 0;
        let beepType: number = -1;
        let beepText: string = '';
        switch (type) {
          case ExtInterface.BeepType.Abandon:
            beepType = WebDriverDef.beepType.INTRADO_BEEP_TYPE_ABANDON;
            frequency = 1700;
            duration = 500;
            beepText = 'Abandon';
            break;
          case ExtInterface.BeepType.Alarm:
            beepType = WebDriverDef.beepType.INTRADO_BEEP_TYPE_ALARM;
            frequency = 3000;
            duration = 300;
            beepText = 'Alarm';
            break;
          case ExtInterface.BeepType.Broadcast:
            beepType = WebDriverDef.beepType.INTRADO_BEEP_TYPE_BROADCAST;
            frequency = 2000;
            duration = 125;
            beepText = 'Broadcast';
            break;
          case ExtInterface.BeepType.Incident:
            beepType = WebDriverDef.beepType.INTRADO_BEEP_TYPE_INCIDENT;
            frequency = 1700;
            duration = 500;
            beepText = 'Incident';
            break;
          case ExtInterface.BeepType.NewText:
            beepType = WebDriverDef.beepType.INTRADO_BEEP_TYPE_NEWTEXT;
            frequency = 1800;
            duration = 175;
            beepText = 'NewText';
            break;
          case ExtInterface.BeepType.TtyValidateBaudot:
            beepType = WebDriverDef.beepType.INTRADO_BEEP_TYPE_TTY_VALIDATE_BAUDOT;
            frequency = 4000;
            duration = 20;
            beepText = 'TtyValidateBaudot';
            break;
          default:
        }

        let message = {
          __CMD__: WebDriverDef.commandIntradoBeep,
          freq: frequency,
          duration: duration,
          beepType: beepType,
        };

        if (this.ws != null) {
          diag.trace?.('beep', `Send IntradoBeep command for ${beepText}`);
          let res = await this.ws.sendAndWaitForResponse(message);
          if (res) {
            let data = JSON.parse(res);
            let result: number = data.result;

            if (result === 0 || result === 1) {
              return true;
            } else {
              diag.warn('beep', `Driver unable to play beep`);
            }
          }
        }
      } catch (e) {
        diag.warn('beep', `Cannot send a message due to ${e.message}`);
      }
    } else {
      diag.warn('beep', `Cannot send a message because of link down`);
    }

    return false;
  }

  get workstationType(): string {
    return this.workstationCTIConfig.WorkstationType;
  }

  get status(): boolean {
    return this.ctiHardwareStatus === ExtInterface.CtiHardwareStatus.Up;
  }
}
