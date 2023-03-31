import * as ExtInterface from 'telephony/src/telephonyexternalinterfacedef';
import { WebLineDev } from 'telephony/src/weblinedev/weblinedev';
import { defaultOptions, autoStartTelephony, LineRingerPriority } from 'telephony/src/config/options';
import * as guitestCallList from './callstore';
import { ConfStore } from './confstore';
import { WebTeleTest } from './webteletest';
import { apiClient } from 'client-web-api/src/api/ApiClient';
import { UserLogon } from 'client-web-api/src/api/UserLogon';
import { configHandler } from 'client-web-api/src/config/ConfigHandler';
import { webCfg } from 'telephony/src/config/webcfg';
import { RingerMode } from 'telephony/src/weblinedev/ringer';
import { VolumeControlFunction, VolumeControlDestination } from 'telephony/src/weblinedev/volumeController';
import { enableDefaultDiagModules } from './debugModule';
import { ISubsEventMsg } from 'telephony/src/webphone/interfaces/sip-subscribeNotify';
import { ListenJoinResponses, arrListenJoinResponses } from 'telephony/src/weblinedev/listenJoin';
import { WebCall } from 'telephony/src/webcall/webcall';

export class GuiTest {
  private readonly gui: WebTeleTest;
  private autoStart = autoStartTelephony;

  private lineDev: WebLineDev | null;
  private isAuthenticated = false;

  // PIT
  private subject: string = '';

  // for GUI
  private eventLog: string[] = [];
  private receivedEventCount = 0;

  private fakeAli: string = '';
  private greetingId = '';
  private savedConversations: string[] = [];
  private fileConversations: Array<ExtInterface.ItrrSection> = [];
  private exportFiles: string[] = [];
  private selectConv: number = 0;
  private rttCall: WebCall | undefined;

  constructor(gui: WebTeleTest) {
    this.gui = gui;
    this.lineDev = null;
    this.rttCall = undefined;

    defaultOptions.addEventListener('DefaultOptionsChanged', () => {
      this.gui.setState({ agentLogonName: defaultOptions.agentLogonName, positionName: defaultOptions.positionName });
    });

    this.authenticate = this.authenticate.bind(this);
    this.checkConfig = this.checkConfig.bind(this);
    this.start = this.start.bind(this);
    this.stop = this.stop.bind(this);
    this.agentLogin = this.agentLogin.bind(this);
    this.agentLogout = this.agentLogout.bind(this);
    this.rgLogin = this.rgLogin.bind(this);
    this.rgLogout = this.rgLogout.bind(this);
    this.getInitialStatus = this.getInitialStatus.bind(this);
    this.acdLogin = this.acdLogin.bind(this);
    this.acdLogout = this.acdLogout.bind(this);
    this.acdReady = this.acdReady.bind(this);
    this.acdNotReady = this.acdNotReady.bind(this);
    this.connect = this.connect.bind(this);
    this.hold = this.hold.bind(this);
    this.unhold = this.unhold.bind(this);
    this.park = this.park.bind(this);
    this.unpark = this.unpark.bind(this);
    this.setPitInitialMsg = this.setPitInitialMsg.bind(this);
    this.makeCall = this.makeCall.bind(this);
    this.ringDown = this.ringDown.bind(this);
    this.release = this.release.bind(this);
    this.register = this.register.bind(this);
    this.unRegister = this.unRegister.bind(this);
    this.listenJoin = this.listenJoin.bind(this);
    this.requestInfo = this.requestInfo.bind(this);
    this.requestAli = this.requestAli.bind(this);
    this.cancelAliRequest = this.cancelAliRequest.bind(this);
    this.dbrReason = this.dbrReason.bind(this);
    this.broadcastMsg = this.broadcastMsg.bind(this);
    this.logTransfer = this.logTransfer.bind(this);
    this.aliError = this.aliError.bind(this);
    this.recallAbandoned = this.recallAbandoned.bind(this);
    this.tandemTransfer = this.tandemTransfer.bind(this);
    this.cancelTandemTransfer = this.cancelTandemTransfer.bind(this);
    this.autoRequestInfo = this.autoRequestInfo.bind(this);
    this.enableRinger = this.enableRinger.bind(this);
    this.manualAliDump = this.manualAliDump.bind(this);
    this.automaticAliDump = this.automaticAliDump.bind(this);
    this.cancelConf = this.cancelConf.bind(this);
    this.connectConf = this.connectConf.bind(this);
    this.holdConf = this.holdConf.bind(this);
    this.unholdConf = this.unholdConf.bind(this);
    this.releaseConf = this.releaseConf.bind(this);
    this.transferConf = this.transferConf.bind(this);
    this.queueAcdLogOn = this.queueAcdLogOn.bind(this);
    this.queueAcdLogOff = this.queueAcdLogOff.bind(this);
    this.acdConnectRequest = this.acdConnectRequest.bind(this);
    this.noHoldConference = this.noHoldConference.bind(this);
    this.normalConference = this.normalConference.bind(this);
    this.callPatchConference = this.callPatchConference.bind(this);
    this.blindTransfer = this.blindTransfer.bind(this);
    this.processRecordStatusChange = this.processRecordStatusChange.bind(this);
    this.processItrrSectionUpdate = this.processItrrSectionUpdate.bind(this);
    this.processExportItrrFileChange = this.processExportItrrFileChange.bind(this);
    this.setPlaybackToCaller = this.setPlaybackToCaller.bind(this);
    this.itrrGetHostname = this.itrrGetHostname.bind(this);
    this.nextACDCall = this.nextACDCall.bind(this);
    this.subscribeDynamicACDStatus = this.subscribeDynamicACDStatus.bind(this);
    this.unSubscribeDynamicACDStatus = this.unSubscribeDynamicACDStatus.bind(this);

    enableDefaultDiagModules();
  }

  public getAutoStartTelephony() {
    return this.autoStart;
  }

  get defaultAgentLogonName() {
    return defaultOptions.agentLogonName;
  }

  get defaultPositionName() {
    return defaultOptions.positionName;
  }

  public async authenticate(agentLogonName: string, positionName: string) {
    let agentPassword = '';

    console.log(
      'authenticate(): agentLogonName=' +
        agentLogonName +
        ', positionName=' +
        positionName +
        ',agentPassword=' +
        agentPassword
    );

    await apiClient
      .getNonce()
      .then(async (nonce: string) => {
        await apiClient
          .loginUserManually(positionName, agentLogonName, nonce, Math.random().toString(), agentPassword)
          .then(async (userLogon: UserLogon) => {
            // TODO: agent may assigned to multiple PSAP
            if (userLogon.Code !== 0) {
              if (userLogon.RequiredPsapsAndRoles) {
                throw new Error(
                  'Not supported - Agent assigned to multiple PSAPs: ' +
                    userLogon.RequiredPsapsAndRoles.Psaps.map((item) => {
                      return item.Name;
                    })
                );
              }
              throw new Error('userLogon.Code=' + userLogon.Code);
            }

            try {
              // initialize configHandler singleton, this will retrieve all configuration
              await configHandler.init(userLogon);

              let telephonyId = configHandler.currentAgent.viperLoginId;
              let positionDN = configHandler.localPosition.extension;
              let role = configHandler.currentRole?.name;
              let psapName = configHandler.currentPsap.name;
              console.log(
                'Authentication success: agent=' +
                  telephonyId +
                  ', dn=' +
                  positionDN +
                  ', role=' +
                  role +
                  ', psap=' +
                  psapName
              );

              // display on teletest GUI
              this.gui.setState({ authenticationStatus: telephonyId + '/' + positionDN });
              this.gui.setState({ response: 'Authentication success: ' + telephonyId + '/' + positionDN });
              this.gui.setState({ playbackToCaller: false });
              this.isAuthenticated = true;

              if (this.gui.state.autoStart) {
                this.start();
              }
            } catch (e) {
              console.error('configHandler.init() error: ' + e.message);
              this.gui.setState({ response: 'Authentication error: ' + e.message });
            }
          })
          .catch((e: Error) => {
            console.error('apiClient.loginUserManually() error: ' + e.message);
            this.gui.setState({ response: 'Authentication error: ' + e.message });
          });
      })
      .catch((e: Error) => {
        console.error('apiClient.getNonce() error: ' + e.message);
        this.gui.setState({ response: 'Authentication error: ' + e.message });
      });
  }

  public checkConfig(name: string) {
    if (this.lineDev) {
      switch (name.toLowerCase()) {
        case 'agent':
          console.log(JSON.stringify(webCfg.agentConfig.json, null, 4));
          break;
        case 'position':
          console.log(JSON.stringify(webCfg.positionCfg.json, null, 4));
          break;
        case 'node':
          webCfg.nodeCfgMap.forEach((node) => {
            console.log(JSON.stringify(node.json, null, 4));
          });
          break;
        case 'line':
          webCfg.positionCfg.lineDataMap.forEach((line) => {
            console.log(JSON.stringify(line.json, null, 4));
          });
          break;
        case 'route':
          webCfg.routes.forEach((route) => {
            console.log(JSON.stringify(route.json, null, 4));
          });
          break;
        case 'npd2npa':
          console.log(JSON.stringify(webCfg.npd2npaList, null, 4));
          break;
        case 'system':
          console.log(JSON.stringify(webCfg.systemConfig.json, null, 4));
          break;
        case 'psap':
          console.log(JSON.stringify(webCfg.psapConfig.json, null, 4));
          break;
        case 'gateway':
          console.log('AppSrvGw: ' + JSON.stringify(webCfg.appSrvGwUrls, null, 4));
          console.log('VccGw: ' + JSON.stringify(webCfg.vccGwAddresses, null, 4));
          console.log('WebRTCGateway: ' + JSON.stringify(webCfg.webRtcConfigData, null, 4));
          break;
        default:
          console.error('Configuraion not available for: ' + name);
      }
    } else {
      alert('Please start Telephony first!');
    }
  }

  public getEventLog() {
    let log = '';
    this.eventLog.forEach((evtType) => {
      log += '<<<' + evtType;
    });
    return log;
  }

  public async start() {
    if (!this.isAuthenticated) {
      window.alert('Please authenticate agent/position before start Telephony!');
      return;
    }

    // we should get these values from reverse proxy if available;
    // otherwise, we pass empty values and let telephony use its default
    const providedOptions: ExtInterface.OptionsType = {
      vccGwAddr: [],
      appSrvGwAddr: [],
      webRtcConfigData: [],
      configHandler: configHandler,
      providedQlistTest: [],
      dynamicACDSubscribedList: [],
    };

    this.lineDev = new WebLineDev(providedOptions, {});

    this.lineDev.addEventListener('TelephonyStartState', ((evt: ExtInterface.TelephonyStartState) => {
      let telephonyStartState = 'Stopped';
      switch (evt.startState) {
        default:
        case ExtInterface.StartStat.Stopped:
          telephonyStartState = 'Stopped';
          break;
        case ExtInterface.StartStat.WebPhoneStarted:
          telephonyStartState = 'WebPhoneStarted';
          break;
        case ExtInterface.StartStat.VccClientStarted:
          telephonyStartState = 'VccClientStarted';
          break;
        case ExtInterface.StartStat.Started:
          telephonyStartState = 'Telephony Started';
          if (this.gui.state.autoStart) {
            this.agentLogin();
          }
          this.gui.getDefaultVolumes();
          break;
      }

      this.gui.setState({ telephonyStartStatus: telephonyStartState });
      this.gui.setState({ receivedEventCount: ++this.receivedEventCount, receivedEventName: evt.type });
    }) as EventListener);

    this.lineDev.addEventListener('StateUpdate', ((evt: ExtInterface.StateUpdate) => {
      console.log(`Received ${evt.type} event`);
      console.dir(evt);
      let stat = evt.newState;
      if (stat === ExtInterface.CallState.Finished) {
        //Finished, Finishing
        guitestCallList.removeCall(evt.webCall.webCallId);
      } else if (!guitestCallList.findCall(evt.webCall.webCallId)) {
        guitestCallList.addCall(evt.webCall);
      }
      // Connected
      if (stat == ExtInterface.CallState.Connected) {
        if (evt.webCall.cfg.direction === ExtInterface.Direction.Outgoing && this.fakeAli) {
          evt.webCall.setCallInformation(this.fakeAli);

          // reset fakeAli
          this.fakeAli = '';
        }
      }

      this.gui.setState({ receivedEventCount: ++this.receivedEventCount, receivedEventName: evt.type });
    }) as EventListener);

    this.lineDev.addEventListener('LineStateUpdate', ((evt: ExtInterface.LineStateUpdate) => {}) as EventListener);

    this.lineDev.addEventListener('AgentLoginChange', ((evt: ExtInterface.AgentLoginChange) => {
      this.eventLog.push(evt.type);
      let stat = '';
      switch (evt.newStatus) {
        case ExtInterface.LoggedStatus.LoggedIn:
          stat = 'LoggedIn';
          break;
        case ExtInterface.LoggedStatus.LoggedOut:
          stat = 'LoggedOut';
          break;
        case ExtInterface.LoggedStatus.LoginUnknown:
        default:
          stat = 'Unknown';
          break;
      }
      let status = { status: stat, agentId: evt.loginId, loggedAt: evt.alreaydloggedAt };
      console.log('%s: received the evt <AgentLoginChange> from WebLineDev %o', this.constructor.name, status);

      this.gui.setState({ agentLoginStatus: stat });
      this.gui.setState({ receivedEventCount: ++this.receivedEventCount, receivedEventName: evt.type });
    }) as EventListener);

    this.lineDev.addEventListener('AcdLoginStateChange', ((evt: ExtInterface.AcdLoginStateChangeEvent) => {
      console.log(`Received ${evt.type} event`);
      console.dir(evt);
      this.gui.setState({
        acdLoginStatus:
          this.lineDev?.getAcdLoginState().loginStatus.toString() ||
          ExtInterface.AcdLoginStatus.LoginUnknown.toString(),
        acdReadyStatus: this.lineDev?.getAcdLoginState().ready ? 'Ready' : 'NotReady',
      });
      this.gui.setState({ receivedEventCount: ++this.receivedEventCount, receivedEventName: evt.type });
    }) as EventListener);

    this.lineDev.addEventListener('RgLoginStateChange', ((evt: ExtInterface.RgLoginStateChangeEvent) => {
      console.log(`Received ${evt.type} event`);
      console.dir(evt);
      this.gui.setState({
        rgLoginStatus:
          this.lineDev?.getRgLoginState().loginStatus.toString() || ExtInterface.RgLoginStatus.LoginUnknown.toString(),
      });
      this.gui.setState({ receivedEventCount: ++this.receivedEventCount, receivedEventName: evt.type });
    }) as EventListener);

    this.lineDev.addEventListener('InformationUpdate', ((evt: ExtInterface.InformationUpdate) => {
      if (evt.lisError) {
        this.gui.displayLisError(evt.call);
      } else {
        this.gui.displayCallInformation(evt.call);
      }
      if (evt.callingPartyData || evt.pidflo) {
        console.log(`New ALI received`);
      }
      this.gui.setState({ receivedEventCount: ++this.receivedEventCount, receivedEventName: evt.type });
    }) as EventListener);

    this.lineDev.addEventListener('ServiceUpdate', ((evt: ExtInterface.ServiceUpdate) => {
      this.gui.displayServiceInformation(evt.call);
      this.gui.setState({ receivedEventCount: ++this.receivedEventCount, receivedEventName: evt.type });
    }) as EventListener);

    this.lineDev.addEventListener('AutoRequestUpdate', ((evt: ExtInterface.AutoRequestUpdate) => {
      this.gui.displayAutoRequest(evt.call, evt.autoRequestActive);
      this.gui.setState({ receivedEventCount: ++this.receivedEventCount, receivedEventName: evt.type });
    }) as EventListener);

    this.lineDev.addEventListener('CtiHardwareUpdate', ((evt: ExtInterface.CtiHardwareUpdate) => {
      this.gui.setState({ ctiHwStatus: evt.status + ' on ' + evt.hardwareType });

      if (evt.status === ExtInterface.CtiHardwareStatus.Up) {
        if (this.lineDev) {
          this.gui.setState({ handsetsAvailable: this.lineDev.handsetsAvailable() });
          this.gui.setState({ radioAvailable: this.lineDev.radioAvailable() });
          this.gui.setState({ agcTxAvailable: this.lineDev.agcAvailable() });
          this.gui.setState({ agcRxAvailable: this.lineDev.callTakerAgcAvailable() });
          this.gui.setState({ nrRxAvailable: this.lineDev.callTakerNrAvailable() });
          this.gui.setState({ radioPttTx: this.lineDev.radioTransmitStatus() === ExtInterface.RadioStatus.Enable });
          this.gui.setState({ radioPttRx: this.lineDev.radioReceptionStatus() === ExtInterface.RadioStatus.Enable });
          this.gui.setState({ agcTxStatus: this.lineDev.getAGCStatus() === ExtInterface.AGCState.Enable });
          this.gui.setState({ agcRxStatus: this.lineDev.getCallTakerAGCStatus() === ExtInterface.AGCState.Enable });
          this.gui.setState({
            nrRxStatus: this.lineDev.getCallTakerNoiseReductionStatus() === ExtInterface.NRState.Enable,
          });
        }
      } else if (evt.status === ExtInterface.CtiHardwareStatus.Down) {
        this.gui.setState({ handsetsAvailable: false });
        this.gui.setState({ radioAvailable: false });
        this.gui.setState({ agcTxAvailable: false });
        this.gui.setState({ agcRxAvailable: false });
        this.gui.setState({ nrRxAvailable: false });
      }
    }) as EventListener);

    this.lineDev.addEventListener('AppSvrGwLinkStatus', ((evt: ExtInterface.AppSvrGwLinkStatus) => {
      this.gui.setState({ appSvrGwStatus: evt.status });
    }) as EventListener);

    this.lineDev.addEventListener('ParkReofferDevice', ((evt: ExtInterface.ParkReofferDevice) => {
      console.log(`Received ${evt.type} event`);
      console.dir(evt);
      this.gui.setState({ receivedEventCount: ++this.receivedEventCount, receivedEventName: evt.type });
    }) as EventListener);

    this.lineDev.addEventListener('ParkReofferRoute', ((evt: ExtInterface.ParkReofferRoute) => {
      console.log(`Received ${evt.type} event`);
      console.dir(evt);
      this.gui.setState({ receivedEventCount: ++this.receivedEventCount, receivedEventName: evt.type });
    }) as EventListener);

    this.lineDev.addEventListener('ParkTimeoutReached', ((evt: ExtInterface.ParkTimeoutReached) => {
      console.log(`Received ${evt.type} event`);
      console.dir(evt);
      this.gui.setState({ receivedEventCount: ++this.receivedEventCount, receivedEventName: evt.type });
    }) as EventListener);

    this.lineDev.addEventListener('ParkTimeoutWarning', ((evt: ExtInterface.ParkTimeoutWarning) => {
      console.log(`Received ${evt.type} event`);
      console.dir(evt);
      this.gui.setState({ receivedEventCount: ++this.receivedEventCount, receivedEventName: evt.type });
    }) as EventListener);

    this.lineDev.addEventListener('TddConnectEvent', ((evt: ExtInterface.TddConnectEvent) => {
      console.log(`Received ${evt.type} event`);
      console.dir(evt);
      let webCall = guitestCallList.getCurrentCall();
      if (webCall && webCall === evt.call) {
        this.gui.setState({ tddConnection: true });
        this.gui.setState({ tddDetection: false });
      }
    }) as EventListener);

    this.lineDev.addEventListener('TddDisconnectEvent', ((evt: ExtInterface.TddDisconnectEvent) => {
      console.log(`Received ${evt.type} event`);
      console.dir(evt);
      let webCall = guitestCallList.getCurrentCall();
      this.gui.setState({ tddConnection: false });
      this.gui.setState({ tddDetection: false });
    }) as EventListener);

    this.lineDev.addEventListener('TddConnectTimeoutEvent', ((evt: ExtInterface.TddConnectTimeoutEvent) => {
      console.log(`Received ${evt.type} event`);
      console.dir(evt);
      let webCall = guitestCallList.getCurrentCall();
      this.gui.setState({ tddConnection: false });
      this.gui.setState({ tddDetection: false });
    }) as EventListener);

    this.lineDev.addEventListener('TddConnectAbortEvent', ((evt: ExtInterface.TddConnectAbortEvent) => {
      console.log(`Received ${evt.type} event`);
      console.dir(evt);
      let webCall = guitestCallList.getCurrentCall();
      this.gui.setState({ tddConnection: false });
      this.gui.setState({ tddDetection: false });
    }) as EventListener);

    this.lineDev.addEventListener('TddDetectEvent', ((evt: ExtInterface.TddDetectEvent) => {
      console.log(`Received ${evt.type} event`);
      console.dir(evt);
      this.gui.setState({ tddDetection: true });
    }) as EventListener);

    this.lineDev.addEventListener('TddMessageEvent', ((evt: ExtInterface.TddMessageEvent) => {
      console.log(`Received ${evt.type} event`);
      console.dir(evt);
      let char: string = evt.message;
      if (char.charCodeAt(0) === 8) {
        char = '[BS]';
      } else if (char.charCodeAt(0) === 10) {
        char = '[LF]';
      } else if (char.charCodeAt(0) === 13) {
        char = '[CR]';
      }
      if (evt.direction === ExtInterface.TddMessageDirectionType.Incoming) {
        this.gui.setState((prevState) => ({ tddRxConversation: prevState.tddRxConversation.concat(char) }));
      } else {
        this.gui.setState((prevState) => ({ tddTxConversation: prevState.tddTxConversation.concat(char) }));
      }
    }) as EventListener);

    this.lineDev.addEventListener('TddLinkUpEvent', ((evt: ExtInterface.TddLinkUpEvent) => {
      console.log(`Received ${evt.type} event`);
      console.dir(evt);
      this.gui.setState({ tddLink: true });
    }) as EventListener);

    this.lineDev.addEventListener('TddLinkDownEvent', ((evt: ExtInterface.TddLinkDownEvent) => {
      console.log(`Received ${evt.type} event`);
      console.dir(evt);
      this.gui.setState({ tddLink: false });
      this.gui.setState({ tddConnection: false });
      this.gui.setState({ tddDetection: false });
    }) as EventListener);

    this.lineDev.addEventListener('HcoModeChange', ((evt: ExtInterface.HcoModeChange) => {
      console.log(`Received ${evt.type} event`);
      console.dir(evt);
      this.gui.setState({ hco: evt.mode === ExtInterface.HCOMode.HCOOn });
    }) as EventListener);

    this.lineDev.addEventListener('VcoModeChange', ((evt: ExtInterface.VcoModeChange) => {
      console.log(`Received ${evt.type} event`);
      console.dir(evt);
      this.gui.setState({ vco: evt.mode === ExtInterface.VCOMode.VCOOn });
    }) as EventListener);

    this.lineDev.addEventListener('MuteChange', ((evt: ExtInterface.MuteChange) => {
      console.log(`Received ${evt.type} event`);
      console.dir(evt);
      if (evt.handset === ExtInterface.HandsetType.HandsetAgent) {
        this.gui.setState({ handset1MuteTx: evt.state === ExtInterface.MuteState.MuteOn });
      } else if (evt.handset === ExtInterface.HandsetType.HandsetTrainer) {
        this.gui.setState({ handset2MuteTx: evt.state === ExtInterface.MuteState.MuteOn });
      }
    }) as EventListener);

    this.lineDev.addEventListener('HandsetDetectChange', ((evt: ExtInterface.HandsetDetectChange) => {
      console.log(`Received ${evt.type} event`);
      console.dir(evt);
      if (this.lineDev?.anyHandsetConnected() !== evt.state) {
        console.log(`Mismatch in HandsetDetect`);
      }
      if (evt.state === ExtInterface.HandsetDetectType.AtLeastOneConnected) {
        this.gui.setState({ handsetsPresent: true });
      } else if (evt.state === ExtInterface.HandsetDetectType.NoneConnected) {
        this.gui.setState({ handsetsPresent: false });
      }
    }) as EventListener);

    this.lineDev.addEventListener('RadioTransmitMode', ((evt: ExtInterface.RadioTransmitMode) => {
      console.log(`Received ${evt.type} event`);
      console.dir(evt);
      if (this.lineDev?.radioTransmitStatus() !== evt.status) {
        console.log(`Mismatch in radioTransmitStatus`);
      }
      if (evt.status === ExtInterface.RadioStatus.Enable) {
        this.gui.setState({ radioPttTx: true });
      } else if (evt.status === ExtInterface.RadioStatus.Disable) {
        this.gui.setState({ radioPttTx: false });
      }
    }) as EventListener);

    this.lineDev.addEventListener('RadioReceptionMode', ((evt: ExtInterface.RadioReceptionMode) => {
      console.log(`Received ${evt.type} event`);
      console.dir(evt);
      if (this.lineDev?.radioReceptionStatus() !== evt.status) {
        console.log(`Mismatch in radioReceptionStatus`);
      }
      if (evt.status === ExtInterface.RadioStatus.Enable) {
        this.gui.setState({ radioPttRx: true });
      } else if (evt.status === ExtInterface.RadioStatus.Disable) {
        this.gui.setState({ radioPttRx: false });
      }
    }) as EventListener);

    this.lineDev.addEventListener('RadioModeChange', ((evt: ExtInterface.RadioModeChange) => {
      console.log(`Received ${evt.type} event`);
      console.dir(evt);
      if (this.lineDev?.radioCombined() !== (evt.mode === ExtInterface.RadioMode.Combine)) {
        console.log(`Mismatch in radio mode`);
      }
      if (evt.mode === ExtInterface.RadioMode.Combine) {
        this.gui.setState({ radioModeSplit: false });
      } else if (evt.mode === ExtInterface.RadioMode.Split) {
        this.gui.setState({ radioModeSplit: true });
      }
    }) as EventListener);

    this.lineDev.addEventListener('AGCStatus', ((evt: ExtInterface.AGCStatus) => {
      console.log(`Received ${evt.type} event`);
      console.dir(evt);
      if (this.lineDev?.getAGCStatus() !== evt.status) {
        console.log(`Mismatch in AGCStatus`);
      }
      if (evt.status === ExtInterface.AGCState.Enable) {
        this.gui.setState({ agcTxStatus: true });
      } else if (evt.status === ExtInterface.AGCState.Disable) {
        this.gui.setState({ agcTxStatus: false });
      }
    }) as EventListener);

    this.lineDev.addEventListener('CallTakerAGCStatus', ((evt: ExtInterface.CallTakerAGCStatus) => {
      console.log(`Received ${evt.type} event`);
      console.dir(evt);
      if (this.lineDev?.getCallTakerAGCStatus() !== evt.status) {
        console.log(`Mismatch in CallTakerAGCStatus`);
      }
      if (evt.status === ExtInterface.AGCState.Enable) {
        this.gui.setState({ agcRxStatus: true });
      } else if (evt.status === ExtInterface.AGCState.Disable) {
        this.gui.setState({ agcRxStatus: false });
      }
    }) as EventListener);

    this.lineDev.addEventListener('CallTakerNRStatus', ((evt: ExtInterface.CallTakerNRStatus) => {
      console.log(`Received ${evt.type} event`);
      console.dir(evt);
      if (this.lineDev?.getCallTakerNoiseReductionStatus() !== evt.status) {
        console.log(`Mismatch in CallTakerNRStatus`);
      }
      if (evt.status === ExtInterface.NRState.Enable) {
        this.gui.setState({ nrRxStatus: true });
      } else if (evt.status === ExtInterface.NRState.Disable) {
        this.gui.setState({ nrRxStatus: false });
      }
    }) as EventListener);

    this.lineDev.addEventListener('LineChangeEvent', ((evt: ExtInterface.LineChangeEvent) => {
      console.log(`Received ${evt.type} event`);
      console.dir(evt);
      this.gui.setState({ receivedEventCount: ++this.receivedEventCount, receivedEventName: evt.type });
    }) as EventListener);

    this.lineDev.addEventListener('ConfCreated', ((evt: ExtInterface.ConfCreated) => {
      console.log(`Received ${evt.type} event`);
      console.dir(evt);
      ConfStore.addConf(evt.conf);
      this.gui.setState({ receivedEventCount: ++this.receivedEventCount, receivedEventName: evt.type });
    }) as EventListener);

    this.lineDev.addEventListener('ConfEnded', ((evt: ExtInterface.ConfEnded) => {
      console.log(`Received ${evt.type} event`);
      console.dir(evt);
      ConfStore.removeConf(evt.conf.confId);
      this.gui.setState({ receivedEventCount: ++this.receivedEventCount, receivedEventName: evt.type });
    }) as EventListener);

    this.lineDev.addEventListener('ConfStateUpdate', ((evt: ExtInterface.ConfStateUpdate) => {
      console.log(`Received ${evt.type} event`);
      console.dir(evt);
      this.gui.setState({ receivedEventCount: ++this.receivedEventCount, receivedEventName: evt.type });
    }) as EventListener);

    this.lineDev.addEventListener('ParticipantAdded', ((evt: ExtInterface.ParticipantAdded) => {
      console.log(`Received ${evt.type} event`);
      console.dir(evt);
      this.gui.setState({ receivedEventCount: ++this.receivedEventCount, receivedEventName: evt.type });
    }) as EventListener);

    this.lineDev.addEventListener('ParticipantRemoved', ((evt: ExtInterface.ParticipantRemoved) => {
      console.log(`Received ${evt.type} event`);
      console.dir(evt);
      this.gui.setState({ receivedEventCount: ++this.receivedEventCount, receivedEventName: evt.type });
    }) as EventListener);

    this.lineDev.addEventListener('ParticipantUpdated', ((evt: ExtInterface.ParticipantUpdated) => {
      console.log(`Received ${evt.type} event`);
      console.dir(evt);
      this.gui.setState({ receivedEventCount: ++this.receivedEventCount, receivedEventName: evt.type });
    }) as EventListener);

    this.lineDev.addEventListener('TextOwnerChange', ((evt: ExtInterface.TextOwnerChange) => {
      let call = evt.call;
      call.setMsrpTextOwnersip(evt.newOwner);
      this.gui.updMsrpGuiDisplay();
      console.log(`Received ${evt.type} event`);
      console.dir(evt);
      this.gui.setState({ receivedEventCount: ++this.receivedEventCount, receivedEventName: evt.type });
    }) as EventListener);

    this.lineDev.addEventListener('GreetingStarted', ((evt: ExtInterface.GreetingStarted) => {
      console.log(`Received ${evt.type} event`);
      console.dir(evt);
    }) as EventListener);

    this.lineDev.addEventListener('GreetingEnded', ((evt: ExtInterface.GreetingEnded) => {
      console.log(`Received ${evt.type} event`);
      console.dir(evt);
    }) as EventListener);

    this.lineDev.addEventListener('RecGreetingStarted', ((evt: ExtInterface.RecGreetingStarted) => {
      console.log(`Received ${evt.type} event`);
      console.dir(evt);
    }) as EventListener);

    this.lineDev.addEventListener('RecGreetingEnded', ((evt: ExtInterface.RecGreetingEnded) => {
      console.log(`Received ${evt.type} event`);
      console.dir(evt);
    }) as EventListener);

    this.lineDev.addEventListener('ExportSilentCallDigitInfo', ((evt: ExtInterface.ExportSilentCallDigitInfo) => {
      console.log(`guitest Received dtmf info ${evt.digit} event`);
      console.dir(evt);
      evt.call.setSilentCallDigit(`${evt.digit}`);
    }) as EventListener);

    this.lineDev.addEventListener('ExportVMNotifyEvent', ((evt: ExtInterface.ExportVMNotifyEvent) => {
      console.log(
        `guitest Received vm notify event (agentId: ${evt.agentId}, nbNewMsg: ${evt.nbNewMessage}, nbOldMsg: ${evt.nbOldMessage}, vmWaiting: ${evt.available})`
      );
      console.dir(evt);
    }) as EventListener);

    this.lineDev.addEventListener('ItrrStatusUpdate', ((evt: ExtInterface.ItrrStatusUpdate) => {
      let newStatus = evt.status;
      console.log(`Received ${evt.type} event`);
      console.dir(evt);
      this.gui.setState({ itrrStatus: newStatus });
      if (newStatus === 'Down') {
        this.gui.setState({
          itrrOpenFile: '',
          itrrOpenFileIndex: 0,
          itrrSavedFile: [],
          itrrFileConversation: [],
          itrrPlaybackType: '',
          itrrPlaybackTime: new Date(0),
          itrrSpeed: '1x',
          itrrTelephonyVolume: 0,
          itrrRadioVolume: 0,
          itrrExportFile: [],
        });
        this.savedConversations = [];
        this.fileConversations = [];
        this.exportFiles = [];
        this.selectConv = 0;
        this.gui.setState({ itrrSelSection: null });
      } else if (newStatus === 'Up') {
        this.itrrGetHostname();
      }
    }) as EventListener);

    this.lineDev.addEventListener('ItrrPlaybackUpdate', ((evt: ExtInterface.ItrrPlaybackUpdate) => {
      console.log(`Received ${evt.type} event`);
      console.dir(evt);

      let playbackType: string = '';
      switch (evt.state) {
        case ExtInterface.ItrrPlaybackState.Error:
          playbackType = 'Error';
          break;
        case ExtInterface.ItrrPlaybackState.Paused:
          playbackType = 'Paused';
          break;
        case ExtInterface.ItrrPlaybackState.PlaybackStarting:
          playbackType = 'PlaybackStarting';
          break;
        case ExtInterface.ItrrPlaybackState.Playing:
          playbackType = 'Playing';
          break;
        default:
          playbackType = 'Stopped';
          break;
      }

      this.gui.setState({ itrrPlaybackType: playbackType });

      if (playbackType !== 'PlaybackStarting' && playbackType !== 'Error') {
        this.gui.setState({ itrrPlaybackTime: evt.time });
      }
    }) as EventListener);

    this.lineDev.addEventListener('ItrrSectionUpdate', this.processItrrSectionUpdate as EventListener);
    this.lineDev.addEventListener('RecordStatusChange', this.processRecordStatusChange as EventListener);
    this.lineDev.addEventListener('ExportItrrFileChange', this.processExportItrrFileChange as EventListener);
    this.lineDev.addEventListener('NenaQueueStateChange', ((evt: ExtInterface.NenaQueueStateChange) => {
      console.log(`Received ${evt.type} event`);
      console.dir(evt);
    }) as EventListener);
    this.lineDev.addEventListener('NenaServiceStateChange', ((evt: ExtInterface.NenaServiceStateChange) => {
      console.log(`Received ${evt.type} event`);
      console.dir(evt);
    }) as EventListener);

    try {
      await this.lineDev.start();
      await this.lineDev.itrrInit(100);
    } catch (e) {
      console.log('Telephony failed to start. %o', e);
    }
  }

  public processRecordStatusChange(evt: ExtInterface.RecordStatusChange) {
    console.log(`Received ${evt.type} event`);
    console.dir(evt);

    evt.recordsStatus.forEach((record: ExtInterface.RecordStatus) => {
      if (record.status === ExtInterface.RecordAvailabilityStatusType.eRecordSaved) {
        let index = this.savedConversations.findIndex((file) => file === record.ctxId.toString());
        if (index === -1) {
          this.savedConversations.push(record.ctxId.toString());
          this.gui.setState({ itrrSavedFile: this.savedConversations });
        }
      } else {
        let index = this.savedConversations.findIndex((file) => file === record.ctxId.toString());
        if (index !== -1) {
          this.savedConversations.splice(index, 1);
          this.gui.setState({ itrrSavedFile: this.savedConversations });
        }
      }
    });
  }

  public processExportItrrFileChange(evt: ExtInterface.ExportItrrFileChange) {
    console.log(`Received ${evt.type} event`);
    console.dir(evt);

    evt.files.forEach((file: ExtInterface.ExportItrrFile) => {
      if (file.saved) {
        let index = this.exportFiles.findIndex((fileName) => fileName === file.fileName);
        if (index === -1) {
          this.exportFiles.push(file.fileName);
          this.gui.setState({ itrrExportFile: this.exportFiles });
        }
      } else {
        let index = this.exportFiles.findIndex((fileName) => fileName === file.fileName);
        if (index !== -1) {
          this.exportFiles.splice(index, 1);
          this.gui.setState({ itrrExportFile: this.exportFiles });
        }
      }
    });
  }

  public processItrrSectionUpdate(evt: ExtInterface.ItrrSectionUpdate) {
    if (
      evt.channelId === ExtInterface.ItrrChannelType.Telephony ||
      evt.channelId == ExtInterface.ItrrChannelType.Radio
    ) {
      //Do not display Telephony or Radio channel update since they are too frequent
      //console.log(`Received ${evt.type} event`);
      //console.dir(evt);
    } else {
      //Do not display super channel update since they are too frequent
      //console.log(`Received ${evt.type} event`);
      //console.dir(evt);
    }
    if (evt.fileIndex === this.gui.state.itrrOpenFileIndex) {
      evt.sections.forEach((section: ExtInterface.ItrrSection) => {
        if (
          evt.channelId === ExtInterface.ItrrChannelType.Telephony ||
          evt.channelId == ExtInterface.ItrrChannelType.Radio
        ) {
          if (section.updateStatus === ExtInterface.ItrrSectionUpdateType.SectionDeleted) {
            let index = this.fileConversations.findIndex(
              (sect) => sect.sectionInfo.ctxId === section.sectionInfo.ctxId
            );
            if (index !== -1) {
              this.fileConversations.splice(index, 1);
              this.gui.setState({ itrrFileConversation: this.fileConversations });
            }
          } else {
            let index = this.fileConversations.findIndex(
              (sect) => sect.sectionInfo.ctxId === section.sectionInfo.ctxId
            );
            if (index === -1) {
              if (this.gui.state.itrrPlaybackTime) {
                this.gui.setState({ itrrPlaybackTime: section.startTime });
              }
              this.fileConversations.push(section);
              this.gui.setState({ itrrFileConversation: this.fileConversations });
            } else {
              //Section already present update start and end time
              if (section.startTime < this.fileConversations[index].startTime) {
                this.fileConversations[index].startTime = section.startTime;
              }
              if (section.endTime > this.fileConversations[index].endTime) {
                this.fileConversations[index].endTime = section.endTime;
              }
              if (section.sectionInfo.phoneNumber !== '') {
                this.fileConversations[index].sectionInfo.phoneNumber = section.sectionInfo.phoneNumber;
              }

              if (this.selectConv === section.sectionInfo.ctxId) {
                // Refresh section
                this.gui.setState({ itrrSelSection: this.fileConversations[index] });
              }
            }
          }
        }
      });
    }
  }

  public async stop() {
    if (this.lineDev) {
      await this.lineDev.stop();
      //this.lineDev = null;
    }
  }

  public async agentLogin() {
    console.log('%s.%s:', this.constructor.name, this.agentLogin.name);
    if (this.lineDev) {
      console.log('%s.%s: calling WebLineDev to send request', this.constructor.name, this.agentLogin.name);
    } else {
      return;
    }
    const loginInfo = {
      agentId: webCfg.agentConfig.id,
      device: webCfg.positionCfg.dn,
      password: '',
      firstName: webCfg.agentConfig.firstName,
      lastName: webCfg.agentConfig.lastName,
      middleName: webCfg.agentConfig.middleName,
      psapName: webCfg.psapConfig.name,
      psapId: webCfg.psapConfig.id.toString(),
      role: webCfg.roleConfig ? webCfg.roleConfig.name : '',
    };

    this.gui.setState({ response: 'The agent is logging in' });

    try {
      await this.lineDev.agentLogin(loginInfo);
    } catch (e) {
      this.gui.setState({ response: '[agentLogin] Error from WebLineDev: ' + e });
      console.dir(e);
    }
  }

  public async agentLogout() {
    console.log('%s.%s:', this.constructor.name, this.agentLogout.name);
    if (this.lineDev) {
      console.log('%s.%s: calling WebLineDev to send request', this.constructor.name, this.agentLogin.name);
    } else {
      return;
    }

    this.gui.setState({ response: 'The agent is logging out' });

    try {
      await this.lineDev.agentLogout();
    } catch (e) {
      console.dir(e);
      this.gui.setState({ response: '[agentLogout] Error from WebLineDev: ' + e });
    }
  }

  public async getInitialStatus() {
    try {
      //TODO: not defined??
      //await this.lineDev.getInitialStatus();
    } catch (e) {
      console.log('%s.%s:', this.constructor.name, this.getInitialStatus.name);
    }
  }

  public async acdLogin() {
    console.log(`${this.constructor.name}.${this.acdLogin.name}`);

    if (this.lineDev) {
      try {
        // you can also pass optional qlist param
        console.log(`${this.constructor.name}.${this.acdLogin.name}: calling WebLineDev to send request`);
        await this.lineDev.acdLogin(defaultOptions.providedQlistTest);
        console.log(`${this.constructor.name}.${this.acdLogin.name}: got response`);
        this.gui.setState({ response: '[acdLogin] Ok' });
      } catch (e) {
        console.warn(`${this.constructor.name}.${this.acdLogin.name}: exception ${e}`);
        this.gui.setState({ response: '[acdLogin] Error from WebLineDev: ' + e });
      }
    }
  }

  public async acdLogout() {
    console.log('%s.%s:', this.constructor.name, this.acdLogout.name);

    if (this.lineDev) {
      try {
        console.log(`${this.constructor.name}.${this.acdLogout.name}: calling WebLineDev to send request`);
        await this.lineDev.acdLogout(22, 'shift ended');
        console.log(`${this.constructor.name}.${this.acdLogout.name}: got response`);
        this.gui.setState({ response: '[agentLogout] Ok' });
      } catch (e) {
        this.gui.setState({ response: '[agentLogout] Error from WebLineDev: ' + e });
        console.warn(`${this.constructor.name}.${this.acdLogout.name}: exception ${e}`);
      }
    }
  }

  public async acdReady() {
    console.log('%s.%s:', this.constructor.name, this.acdReady.name);

    if (this.lineDev) {
      try {
        console.log(`${this.constructor.name}.${this.acdReady.name}: calling WebLineDev to send request`);
        const res = await this.lineDev.acdReady();
        console.log(`${this.constructor.name}.${this.acdReady.name}: got response`);
        this.gui.setState({ response: '[acdReady] Ok' });
      } catch (e) {
        this.gui.setState({ response: '[acdReady] Error from WebLineDev: ' + e });
        console.warn(`${this.constructor.name}.${this.acdReady.name}: exception ${e}`);
      }
    }
  }

  public async acdNotReady(reasonCode: number, reasonCodeDesc: string) {
    console.log('%s.%s:', this.constructor.name, this.acdNotReady.name);

    if (this.lineDev) {
      try {
        // you can also pass optional reasonCode and reasonDesc string params. For example:
        console.log(
          `${this.constructor.name}.${this.acdNotReady.name}:  reasonCode: ${reasonCode}, reasonCodeDesc: ${reasonCodeDesc}`
        );
        const res = await this.lineDev.acdNotReady(reasonCode, reasonCodeDesc);
        console.log(`${this.constructor.name}.${this.acdNotReady.name}: got response`);
        this.gui.setState({ response: '[agentNotReady] Ok' });
      } catch (e) {
        this.gui.setState({ response: '[agentNotReady] Error from WebLineDev: ' + e });
        console.warn(`${this.constructor.name}.${this.acdNotReady.name}: exception ${e}`);
      }
    }
  }

  public async queueAcdLogOn(queue: string, agent?: string) {
    console.log('guites-core.queueAcdLogOn: starting');
    if (this.lineDev) {
      try {
        console.log(`guites-core.queueAcdLogOn: calling WebLineDev to send request`);
        await this.lineDev.queueAcdLogOn(queue, agent);
        console.log(`guites-core.queueAcdLogOn: got response`);
        this.gui.setState({ response: '[queueAcdLogOn] Ok' });
      } catch (e) {
        console.warn(`guites-core.queueAcdLogOn: exception ${e}`);
        this.gui.setState({ response: '[queueAcdLogOn] Error from WebLineDev: ' + e });
      }
    }
  }

  public async queueAcdLogOff(queue: string, agent?: string) {
    console.log('guites-core.queueAcdLogOff: starting');
    if (this.lineDev) {
      try {
        console.log(`guites-core.queueAcdLogOff: calling WebLineDev to send request`);
        await this.lineDev.queueAcdLogOff(queue, agent);
        console.log(`guites-core.queueAcdLogOff: got response`);
        this.gui.setState({ response: '[queueAcdLogOff] Ok' });
      } catch (e) {
        console.warn(`guites-core.queueAcdLogOff: exception ${e}`);
        this.gui.setState({ response: '[queueAcdLogOff] Error from WebLineDev: ' + e });
      }
    }
  }

  public async nextACDCall() {
    console.log('%s.%s:', this.constructor.name, this.nextACDCall.name);

    if (this.lineDev) {
      try {
        console.log(`${this.constructor.name}.${this.nextACDCall.name}: calling WebLineDev to send request`);
        await this.lineDev.nextACDCall();
        console.log(`${this.constructor.name}.${this.nextACDCall.name}: got response`);
        this.gui.setState({ response: '[nextACDCall] Ok' });
      } catch (e) {
        this.gui.setState({ response: '[nextACDCall] Error from WebLineDev: ' + e });
        console.warn(`${this.constructor.name}.${this.nextACDCall.name}: exception ${e}`);
      }
    }
  }

  public async removeFromConference(participantId: string) {
    console.log('guites-core.removeFromConference: starting');
    const conf = ConfStore.getCurrent();
    let participant = conf?.participantsMap.get(participantId);
    if (participant) {
      try {
        console.log(`guites-core.removeFromConference: removing Participant astChannel=${participant.astChannel}`);
        await conf?.removeFromConference(participant);
        console.log(`guites-core.removeFromConference: got response`);
        this.gui.setState({ response: '[removeFromConference] Ok' });
      } catch (e) {
        console.warn(`guites-core.removeFromConference: exception ${e}`);
        this.gui.setState({ response: '[removeFromConference] Error from WebConference: ' + e });
      }
    }
  }

  public async removeAllFromConference() {
    console.log('guites-core.removeAllFromConference: starting');
    const conf = ConfStore.getCurrent();
    if (conf) {
      try {
        console.log(`guites-core.removeAllFromConference: removing all participant from confId=${conf.confId}`);
        await conf?.removeAllFromConference();
        console.log(`guites-core.removeAllFromConference: got response`);
        this.gui.setState({ response: '[removeAllFromConference] Ok' });
      } catch (e) {
        console.warn(`guites-core.removeAllFromConference: exception ${e}`);
        this.gui.setState({ response: '[removeAllFromConference] Error from WebConference: ' + e });
      }
    }
  }

  public async deafenParticipant(participantId: string, deafen: boolean) {
    let deafestr: string = deafen ? 'deafen' : 'undeafen';
    console.log('guites-core.deafenParticipant: starting');
    const conf = ConfStore.getCurrent();
    let participant = conf?.participantsMap.get(participantId);
    if (participant) {
      try {
        console.log(`guites-core.deafenParticipant: ${deafestr} Participant astChannel=${participant.astChannel}`);
        await conf?.deafenParticipant(participant, deafen);
        console.log(`guites-core.deafenParticipant: got response`);
        this.gui.setState({ response: '[deafenParticipant] Ok' });
      } catch (e) {
        console.warn(`guites-core.deafenParticipant: exception ${e}`);
        this.gui.setState({ response: '[deafenParticipant] Error from WebConference: ' + e });
      }
    }
  }

  public async muteParticipant(participantId: string, mute: boolean) {
    let deafestr: string = mute ? 'mute' : 'unmute';
    console.log('guites-core.muteParticipant: starting');
    const conf = ConfStore.getCurrent();
    let participant = conf?.participantsMap.get(participantId);
    if (participant) {
      try {
        console.log(`guites-core.muteParticipant: ${deafestr} Participant astChannel=${participant.astChannel}`);
        await conf?.muteParticipant(participant, mute);
        console.log(`guites-core.muteParticipant: got response`);
        this.gui.setState({ response: '[muteParticipant] Ok' });
      } catch (e) {
        console.warn(`guites-core.muteParticipant: exception ${e}`);
        this.gui.setState({ response: '[muteParticipant] Error from WebConference: ' + e });
      }
    }
  }

  public async rgLogin() {
    console.log(`${this.constructor.name}.${this.rgLogin.name}`);

    if (this.lineDev) {
      try {
        // you can also pass optional rgList param
        console.log(`${this.constructor.name}.${this.rgLogin.name}: calling WebLineDev to send request`);
        await this.lineDev.rgLogin([]);
        console.log(`${this.constructor.name}.${this.rgLogin.name}: got response`);
        this.gui.setState({ response: '[rgLogin] Ok' });
      } catch (e) {
        console.warn(`${this.constructor.name}.${this.rgLogin.name}: exception ${e}`);
        this.gui.setState({ response: '[rgLogin] Error from WebLineDev: ' + e });
      }
    }
  }

  public async rgLogout() {
    console.log('%s.%s:', this.constructor.name, this.rgLogout.name);

    if (this.lineDev) {
      try {
        console.log(`${this.constructor.name}.${this.rgLogout.name}: calling WebLineDev to send request`);
        await this.lineDev.rgLogout();
        console.log(`${this.constructor.name}.${this.rgLogout.name}: got response`);
        this.gui.setState({ response: '[rgLogout] Ok' });
      } catch (e) {
        console.warn(`${this.constructor.name}.${this.rgLogout.name}: exception ${e}`);
        this.gui.setState({ response: '[rgLogout] Error from WebLineDev: ' + e });
      }
    }
  }

  public async register() {
    if (this.lineDev) {
      try {
        const res = await this.lineDev.register();
        this.gui.setState({ response: `[register] Succeed: ${res}` });
      } catch (e) {
        this.gui.setState({ response: `[register] Failed: ${e}` });
      }
    }
  }

  public async unRegister() {
    if (this.lineDev) {
      try {
        const res = await this.lineDev.unRegister();
        this.gui.setState({ response: `[unRegister] Succeed: ${res}` });
      } catch (e) {
        this.gui.setState({ response: `[un-register] Failed: ${e}` });
      }
    }
  }

  public async connect() {
    console.log('%s.%s:', this.constructor.name, this.connect.name);

    let webCall = guitestCallList.getCurrentCall();
    if (webCall) {
      try {
        await webCall.connect();
      } catch (e) {
        console.warn(`${this.constructor.name}.${this.connect.name}, caught: <${e}>`);
      }
    }
  }

  // Set Psap Initiated Text(PIT) call
  public async setPitInitialMsg(initialMsg: string) {
    this.subject = initialMsg;
  }

  public async makeCall(
    localPrefix: string,
    lDistPrefix: string,
    npaNxx: string,
    forceNpa: string,
    rttMediaEnable: boolean
  ) {
    const dialingAddr: string = this.gui.state.dialing;
    console.log('%s.%s: dialing <%s> to make call', this.constructor.name, this.makeCall.name, dialingAddr);

    if (localPrefix.startsWith('ADM') || localPrefix.startsWith('AIM') || localPrefix.startsWith('SIP')) {
      // Use line directly to make call
      if (this.lineDev) {
        let line = this.lineDev.getLineByAddress(localPrefix);
        if (line !== undefined) {
          try {
            await line.makeCall(dialingAddr, null, '', rttMediaEnable);
          } catch (e) {
            console.warn('%s.%s: failed to make call <%s>', this.constructor.name, this.makeCall.name, e);
          }
        }
      }
    } else {
      // Use Intercom to makeCall
      let dialingPrefix: ExtInterface.DialingPrefix | null = null;

      if (npaNxx.indexOf('-') !== -1) {
        let npa: string = npaNxx.substr(0, npaNxx.indexOf('-'));
        let nxx: string = npaNxx.substr(npaNxx.indexOf('-') + 1);
        let forceNpaOnLocal: ExtInterface.ForceNpaOnLocalCalls = ExtInterface.ForceNpaOnLocalCalls.Default;

        if (forceNpa === 'true') {
          forceNpaOnLocal = ExtInterface.ForceNpaOnLocalCalls.True;
        } else if (forceNpa === 'false') {
          forceNpaOnLocal = ExtInterface.ForceNpaOnLocalCalls.False;
        }

        dialingPrefix = new ExtInterface.DialingPrefix(localPrefix, lDistPrefix, npa, nxx, forceNpaOnLocal);
      } else if (dialingAddr.includes('sip:') || dialingAddr.includes('sips:') || dialingAddr.includes('tel:')) {
        // uri dialing, the local prefix is the linepool access code
        dialingPrefix = new ExtInterface.DialingPrefix(
          localPrefix,
          lDistPrefix,
          '',
          '',
          ExtInterface.ForceNpaOnLocalCalls.False
        );
      }

      if (this.lineDev) {
        try {
          this.lineDev.addEventListener('CallRingingProgress', ((evt: ExtInterface.CallRingingProgress) => {
            let call = evt.call;
            if (call === webCall) {
              console.warn(`${this.constructor.name}.${this.makeCall.name} call in progress'`);
            }
          }) as EventListener);
          const webCall = await this.lineDev.makeCall(dialingAddr, dialingPrefix, this.subject, rttMediaEnable);
        } catch (e) {
          console.log('%s.%s: failed to make call <%o>', this.constructor.name, this.makeCall.name, e);
        }
      }
    }
  }

  public async ringDown(lineNumber: string) {
    if (lineNumber.startsWith('AIM')) {
      // Use line directly to make call
      if (this.lineDev) {
        let line = this.lineDev.getLineByAddress(lineNumber);
        if (line !== undefined) {
          try {
            await line.makeCall('', null, '', false);
          } catch (e) {
            console.warn('%s.%s: failed to ringDown<%s>', this.constructor.name, this.makeCall.name, e);
          }
        }
      }
    }
  }

  public async acdConnectRequest(uci: string, agentId: string) {
    if (this.lineDev) {
      try {
        await this.lineDev.acdConnectRequest(uci, agentId || this.lineDev.agentId);
      } catch (e) {
        console.warn('%s.%s: failed to perform acdConnectRequest <%s>', this.constructor.name, this.makeCall.name, e);
      }
    }
  }

  public async noHoldConference(localPrefix: string, lDistPrefix: string, npaNxx: string, forceNpa: string) {
    const webCall = guitestCallList.getCurrentCall();
    const dialingAddr = this.gui.state.dialing.trim();

    if (!webCall) {
      console.log('GuiTest.noHoldConference: need call selected for operation');
      return;
    }
    if (!dialingAddr) {
      console.log('GuiTest.noHoldConference: need dial string for operation');
      return;
    }

    console.log('GuiTest.noHoldConference: dialing <%s> for NoHold Conference', dialingAddr);

    const npaNxxArr = npaNxx.split('-');
    let forceNpaOnLocal = ExtInterface.ForceNpaOnLocalCalls.Default;

    if (forceNpa === 'true') {
      forceNpaOnLocal = ExtInterface.ForceNpaOnLocalCalls.True;
    } else if (forceNpa === 'false') {
      forceNpaOnLocal = ExtInterface.ForceNpaOnLocalCalls.False;
    }

    const dialingPrefix = new ExtInterface.DialingPrefix(
      localPrefix,
      lDistPrefix,
      npaNxxArr[0] || '',
      npaNxxArr[1] || '',
      forceNpaOnLocal
    );

    if (webCall.webConf) {
      console.log('GuiTest.noHoldConference: inviting to existing conference');
      webCall.webConf.inviteCall(dialingAddr, dialingPrefix, ExtInterface.ConferenceConsultType.NoHold);
    } else {
      console.log('GuiTest.noHoldConference: setup new conference');
      await webCall.setupConference(dialingAddr, dialingPrefix, ExtInterface.ConferenceConsultType.NoHold);
    }
  }

  public async normalConference(localPrefix: string, lDistPrefix: string, npaNxx: string, forceNpa: string) {
    const webCall = guitestCallList.getCurrentCall();
    const dialingAddr = this.gui.state.dialing.trim();

    if (!webCall) {
      console.log('GuiTest.normalConference: need call selected for operation');
      return;
    }
    if (!dialingAddr) {
      console.log('GuiTest.normalConference: need dial string for operation');
      return;
    }

    console.log('GuiTest.normalConference: dialing <%s> for Normal Conference', dialingAddr);

    const npaNxxArr = npaNxx.split('-');
    let forceNpaOnLocal = ExtInterface.ForceNpaOnLocalCalls.Default;

    if (forceNpa === 'true') {
      forceNpaOnLocal = ExtInterface.ForceNpaOnLocalCalls.True;
    } else if (forceNpa === 'false') {
      forceNpaOnLocal = ExtInterface.ForceNpaOnLocalCalls.False;
    }

    const dialingPrefix = new ExtInterface.DialingPrefix(
      localPrefix,
      lDistPrefix,
      npaNxxArr[0] || '',
      npaNxxArr[1] || '',
      forceNpaOnLocal
    );

    if (webCall.webConf) {
      console.log('GuiTest.normalConference: inviting to existing conference');
      webCall.webConf.inviteCall(dialingAddr, dialingPrefix, ExtInterface.ConferenceConsultType.Normal);
    } else {
      console.log('GuiTest.normalConference: setup new conference');
      await webCall.setupConference(dialingAddr, dialingPrefix, ExtInterface.ConferenceConsultType.Normal);
    }
  }

  public async callPatchConference() {
    const connectedCall = guitestCallList
      .getCallList()
      .map((ele) => ele[1])
      .find((call) => call.state === ExtInterface.CallState.Connected);
    const otherCall = guitestCallList.getCurrentCall();

    if (!connectedCall) {
      console.log('GuiTest.setupNormalConference: need connected call for operation');
      return;
    }
    if (!otherCall) {
      console.log('GuiTest.setupNormalConference: need call selected for operation');
      return;
    }
    if (otherCall === connectedCall) {
      console.log('GuiTest.setupNormalConference: selected call cannot be the connected call for operation');
      return;
    }

    if (connectedCall.webConf) {
      console.log('GuiTest.normalConference: patching to existing conference');
      await connectedCall.webConf.patchCall(otherCall);
    } else if (otherCall.webConf) {
      console.log('GuiTest.normalConference: patching to existing conference');
      await otherCall.webConf.patchCall(connectedCall);
    } else {
      console.log('GuiTest.normalConference: setup new conference');
      await connectedCall.setupConferenceWithCall(otherCall);
    }
  }

  public async blindTransfer(localPrefix: string, lDistPrefix: string, npaNxx: string, forceNpa: string) {
    const webCall = guitestCallList.getCurrentCall();
    const dialingAddr = this.gui.state.dialing.trim();

    if (!webCall) {
      console.log('GuiTest.blindTransfer: need call selected for operation');
      return;
    }
    if (!dialingAddr) {
      console.log('GuiTest.blindTransfer: need dial string for operation');
      return;
    }

    console.log('GuiTest.blindTransfer: transfer to <%s>', dialingAddr);

    const npaNxxArr = npaNxx.split('-');
    let forceNpaOnLocal = ExtInterface.ForceNpaOnLocalCalls.Default;

    if (forceNpa === 'true') {
      forceNpaOnLocal = ExtInterface.ForceNpaOnLocalCalls.True;
    } else if (forceNpa === 'false') {
      forceNpaOnLocal = ExtInterface.ForceNpaOnLocalCalls.False;
    }

    const dialingPrefix = new ExtInterface.DialingPrefix(
      localPrefix,
      lDistPrefix,
      npaNxxArr[0] || '',
      npaNxxArr[1] || '',
      forceNpaOnLocal
    );

    await webCall.blindTransfer(dialingAddr, dialingPrefix);
  }

  public async dial() {
    console.log('%s.%s:', this.constructor.name, this.dial.name);
    let webCall = guitestCallList.getCurrentCall();
    if (webCall) {
      try {
        let dialingAddr = this.gui.state.dialing;
        await webCall.dial(dialingAddr, null, this.subject, false);
      } catch (e) {
        //
      }
    }
  }

  async hold(exclusive?: boolean) {
    console.log('%s.%s:', this.constructor.name, this.hold.name);
    let webCall = guitestCallList.getCurrentCall();
    if (webCall) {
      try {
        let options = { exclusive };
        await webCall.hold(options);
      } catch (e) {
        //
      }
    }
  }

  public async unhold() {
    console.log('%s.%s:', this.constructor.name, this.unhold.name);
    let webCall = guitestCallList.getCurrentCall();
    if (webCall) {
      try {
        await webCall.unhold();
      } catch (e) {
        console.warn(`${this.constructor.name}.${this.unhold.name}, caught: <${e}>`);
      }
    }
  }

  public async park() {
    console.log('%s.%s:', this.constructor.name, this.park.name);
    let webCall = guitestCallList.getCurrentCall();
    if (webCall) {
      try {
        await webCall.park();
      } catch (e) {
        //
      }
    }
  }

  public async unpark() {
    console.log('%s.%s:', this.constructor.name, this.unpark.name);
    let webCall = guitestCallList.getCurrentCall();
    if (webCall) {
      try {
        await webCall.unpark();
      } catch (e) {
        //
      }
    }
  }

  async reject() {
    // console.log('%s.%s:', this.constructor.name, this.reject.name);
    const webCall = guitestCallList.getCurrentCall();
    if (webCall) {
      try {
        await webCall.reject();
      } catch (e) {
        //
      }
    }
  }

  public async release() {
    console.log('%s.%s:', this.constructor.name, this.release.name);
    let webCall = guitestCallList.getCurrentCall();
    if (webCall) {
      try {
        await webCall.drop();
      } catch (e) {
        // TODO: add handling or logging here
      }
    }
  }

  public async listenJoin(mode: ExtInterface.ListenJoinMonitoringMode, position: string) {
    console.log('%s.%s:', this.constructor.name, this.listenJoin.name);
    return new Promise<ListenJoinResponses>(async (resolve, reject) => {
      await this.lineDev
        ?.listenJoin(mode, position)
        .then(async (successId: ListenJoinResponses) => {
          return resolve(successId);
        })
        .catch(async (errorId: ListenJoinResponses) => {
          return reject(errorId);
        });
    });
  }

  public async listenJoinCancel(position: string, mode: ExtInterface.ListenJoinMonitoringMode) {
    console.log('%s.%s:', this.constructor.name, this.listenJoinCancel.name);
    return new Promise<string>(async (resolve, reject) => {
      await this.lineDev
        ?.listenJoinCancel()
        .then(async (success: string) => {
          return resolve(success);
        })
        .catch(async (error: string) => {
          return reject(error);
        });
    });
  }

  public async requestInfo() {
    let webCall = guitestCallList.getCurrentCall();
    if (webCall) {
      try {
        await webCall.requestInfo();
        console.log('GuiTest.requestInfo: requestInfo sent');
      } catch (e) {
        console.log('GuiTest.requestInfo: Exception on requestInfo');
      }
    }
  }

  public async requestAli(ani: string, reason: string, db_number: number) {
    if (this.lineDev) {
      this.lineDev
        .requestAli(ani, reason, db_number)
        .then((dbrResponse) => {
          this.gui.setState({ response: 'DBR: ' + dbrResponse.ali + 'PIDFLO: ' + dbrResponse.pidflo });
        })
        .catch((err: Error) => {
          this.gui.setState({ response: 'DBR: ' + err.message });
        });
    } else {
      alert('You need to start Telephony first!');
    }
  }

  public async cancelAliRequest() {
    if (this.lineDev) {
      this.lineDev
        .cancelAliRequest()
        .then(() => {
          this.gui.setState({ response: 'cancelAliRequest(): DBR cancelled' });
        })
        .catch((err: Error) => {
          this.gui.setState({ response: 'cancelAliRequest() Error: ' + err.message });
        });
    }
  }

  public async dbrReason(requestId: string, ani: string, reason: string) {
    if (this.lineDev) {
      this.lineDev.dbrReason(requestId, ani, reason).catch((err: Error) => {
        this.gui.setState({ response: 'DBR Reason: ' + err.message });
      });
    } else {
      alert('You need to start Telephony first!');
    }
  }

  public async broadcastMsg(msg_destination: string, message: string, priority: string, incident_key: string) {
    if (this.lineDev) {
      this.lineDev.broadcastMsg(msg_destination, message, priority, incident_key).catch((err: Error) => {
        this.gui.setState({ response: 'BroadcastMessage: ' + err.message });
      });
    } else {
      alert('You need to start Telephony first!');
    }
  }

  public async logTransfer(key: string, agency_name: string, agency_type_name: string, transfer_failure: boolean) {
    if (this.lineDev) {
      let webCall = guitestCallList.getCurrentCall();
      if (webCall) {
        try {
          await webCall.logTransferInformation(
            key,
            '43',
            '1944',
            '2',
            agency_name,
            '4',
            agency_type_name,
            transfer_failure
          );
        } catch (e) {
          // TODO: add handling or logging here
        }
      } else {
        alert('You need an active call to log Transfer');
      }
    } else {
      alert('You need to start Telephony first!');
    }
  }

  public async aliError(error: boolean, ucid: string) {
    if (this.lineDev) {
      let webCall = guitestCallList.getCurrentCall();
      if (webCall) {
        try {
          await this.lineDev.reportAliError(webCall.infoRec.uniqueCallId, error);
        } catch (e) {
          // TODO: add handling or logging here
        }
      } else if (ucid !== undefined && ucid !== '') {
        try {
          await this.lineDev.reportAliError(ucid, error);
        } catch (e) {
          // TODO: add handling or logging here
        }
      }
    } else {
      alert('You need to start Telephony first!');
    }
  }

  public async recallAbandoned(abandonedUcid: string, dir: string) {
    if (this.lineDev) {
      let webCall = guitestCallList.getCurrentCall();
      let direction: ExtInterface.Direction =
        dir == 'incoming' ? ExtInterface.Direction.Incoming : ExtInterface.Direction.Outgoing;
      if (webCall) {
        try {
          await webCall.recallAbandonedCall(abandonedUcid, direction);
        } catch (e) {
          // TODO: add handling or logging here
        }
      } else {
        alert('You need an active call to report Recall Abandoned');
      }
    } else {
      alert('You need to start Telephony first!');
    }
  }

  public async abandonedCallDisposition(abandonedUcid: string, reason: string) {
    if (this.lineDev) {
      try {
        await this.lineDev.abandonedCallDisposition(abandonedUcid, reason);
      } catch (e) {
        // TODO: add handling or logging here
      }
    } else {
      alert('You need to start Telephony first!');
    }
  }

  public async tandemTransfer() {
    let dialingAddr = this.gui.state.dialing;
    if (this.lineDev) {
      let webCall = guitestCallList.getCurrentCall();
      if (webCall) {
        try {
          await webCall.tandemTransfer(dialingAddr, null);
        } catch (e) {
          // TODO: add handling or logging here
        }
      } else {
        alert('You need an active call to perform hookflash');
      }
    } else {
      alert('You need to start Telephony first!');
    }
  }

  public async cancelTandemTransfer() {
    let dialingAddr = this.gui.state.dialing;
    if (this.lineDev) {
      let webCall = guitestCallList.getCurrentCall();
      if (webCall) {
        try {
          await webCall.cancelTandemTransfer(dialingAddr);
        } catch (e) {
          // TODO: add handling or logging here
        }
      } else {
        alert('You need an active call to perform hookflash canellation');
      }
    } else {
      alert('You need to start Telephony first!');
    }
  }

  public async autoRequestInfo(activation: boolean, repetitions: number) {
    if (this.lineDev) {
      let webCall = guitestCallList.getCurrentCall();
      if (webCall) {
        try {
          if (activation) {
            webCall.activateAutoRequestInfo(repetitions);
          } else {
            webCall.cancelAutoRequestInfo();
          }
        } catch (e) {
          alert('No valid rule found for activation');
        }
      } else {
        alert('You need an active call to perform Auto request');
      }
    } else {
      alert('You need to start Telephony first!');
    }
  }

  async playTestTone(device: { selection: ''; volume: number }) {
    if (this.lineDev) {
      try {
        await this.lineDev.playTestTone(device);
      } catch (e) {
        // TODO: add handling or logging here
      }
    } else {
      alert('You need to start Telephony first!');
    }
  }

  async changeInputVolume(val: number) {
    if (this.lineDev) {
      try {
        await this.lineDev.changeInputVolume(val);
      } catch (e) {
        // TODO: add handling or logging here
      }
    } else {
      alert('You need to start Telephony first!');
    }
  }

  async changeInputMuted(checked: boolean) {
    if (this.lineDev) {
      try {
        await this.lineDev.changeInputMuted(checked);
      } catch (e) {
        // TODO: add handling or logging here
      }
    } else {
      alert('You need to start Telephony first!');
    }
  }

  async changeOutputVolume(val: number) {
    if (this.lineDev) {
      try {
        await this.lineDev.changeOutputVolume(val);
      } catch (e) {
        // TODO: add handling or logging here
      }
    } else {
      alert('You need to start Telephony first!');
    }
  }

  async changeOutputMuted(checked: boolean) {
    if (this.lineDev) {
      try {
        await this.lineDev.changeOutputMuted(checked);
      } catch (e) {
        // TODO: add handling or logging here
      }
    } else {
      alert('You need to start Telephony first!');
    }
  }

  async changeInputDevSelection(device: { value: any; label: string }) {
    if (this.lineDev) {
      try {
        await this.lineDev.changeInputDevSelection(device);
      } catch (e) {
        // TODO: add handling or logging here
      }
    } else {
      alert('You need to start Telephony first!');
    }
  }

  async changeOutputDevSelection(device: { value: any; label: string }) {
    if (this.lineDev) {
      try {
        await this.lineDev.changeOutputDevSelection(device);
      } catch (e) {
        // TODO: add handling or logging here
      }
    } else {
      alert('You need to start Telephony first!');
    }
  }

  async registerInputDevicesCb(inDevCb: Function) {
    if (this.lineDev) {
      try {
        return this.lineDev.registerInputDevicesCb(inDevCb);
      } catch (e) {
        // TODO: add handling or logging here
      }
    } else {
      //alert('You need to start Telephony first!');
    }
  }

  async registerOutputDevicesCb(inDevCb: Function) {
    if (this.lineDev) {
      try {
        return this.lineDev.registerOutputDevicesCb(inDevCb);
      } catch (e) {
        // TODO: add handling or logging here
      }
    } else {
      //alert('You need to start Telephony first!');
    }
  }

  public enableRinger(): void {
    if (this.lineDev) {
      this.lineDev.ringer.enable();
      this.lineDev.ringer.mode = RingerMode.On;
      this.lineDev.ringer.ringOnConnect = !defaultOptions.ringerMuteOnConnect;

      const RingerFileNames = [
        'Ringers/HighPriority_10_10.wav',
        'Ringers/Ring1_1_1.wav',
        'Ringers/Ring2_2_2.wav',
        'Ringers/Ring3_3_3.wav',
        'Ringers/Ring4_4_4.wav',
        'Ringers/Ring5_5_5.wav',
        'Ringers/Ring6_6_6.wav',
        'Ringers/Ring7_7_7.wav',
        'Ringers/Ring8_8_8.wav',
        'Ringers/Ring9_9_9.wav',
      ];

      for (let i = 0; i < RingerFileNames.length; i++) {
        this.lineDev.ringer.config(i, RingerFileNames[i], 2, 4);
      }

      // enable line ringer
      this.lineDev.webLines.forEach((line) => {
        let pr = line.lineCfgEx.ringerPriority;

        // override if configured in options.json
        defaultOptions.lineRingerPriorites?.forEach((item) => {
          if (item.address === line.addressv) {
            pr = item.priority;
          }
        });

        if (pr === 0) {
          this.lineDev?.ringer.disableLine(line);
        } else {
          this.lineDev?.ringer.enableLine(line, pr);
        }
      });

      // enable route ringer
      webCfg.routes.forEach((route) => {
        let pr = route.ringerPriority;

        // override if configured in options.json
        defaultOptions.routeRingerPriorites?.forEach((item) => {
          if (item.address === route.address) {
            pr = item.priority;
          }
        });

        if (pr === 0) {
          this.lineDev?.ringer.disableRoute(route.address);
        } else {
          this.lineDev?.ringer.enableRoute(route.address, pr);
        }
      });
    }
  }

  public disableRinger(): void {
    if (this.lineDev) {
      // disable line ringer
      this.lineDev.webLines.forEach((line) => {
        this.lineDev?.ringer.disableLine(line);
      });

      // disable route ringer
      webCfg.routes.forEach((route) => {
        this.lineDev?.ringer.disableRoute(route.name);
      });

      this.lineDev.ringer.mode = RingerMode.Off;
      this.lineDev.ringer.disable();
    }
  }

  public async msrpSend(message: string) {
    console.log('%s.%s:', this.constructor.name, this.msrpSend.name);
    let webCall = guitestCallList.getCurrentCall();
    if (webCall) {
      try {
        await webCall.msrpSend(message);
      } catch (e) {
        //
      }
    }
  }

  public async rttSend(message: string) {
    console.log('%s.%s: %s', this.constructor.name, this.rttSend.name, message);
    let webCall = guitestCallList.getCurrentCall();
    if (webCall) {
      try {
        await webCall.rttSend(message);
      } catch (e) {
        //
      }
    }
  }

  public tddSend(message: string) {
    if (this.lineDev) {
      this.lineDev.tddSend(message);
    }
  }

  public tddSendTranscript(transcript: string) {
    if (this.lineDev) {
      let webCall = guitestCallList.getCurrentCall();
      if (webCall) {
        this.lineDev.tddAttachConversation(webCall, transcript);
      }
    }
  }

  public abortTx() {
    if (this.lineDev) {
      this.lineDev.tddAbortTx();
    }
  }

  public tddConnect() {
    if (this.lineDev) {
      let webCall = guitestCallList.getCurrentCall();
      if (webCall) {
        this.lineDev.tddConnect(webCall);
      }
    }
  }

  public tddDisconnect() {
    if (this.lineDev) {
      let webCall = guitestCallList.getCurrentCall();
      if (webCall) {
        this.lineDev.tddDisconnect(webCall);
      }
    }
  }

  public hcoEnable() {
    if (this.lineDev) {
      this.lineDev.hcoEnable();
    }
  }

  public hcoDisable() {
    if (this.lineDev) {
      this.lineDev.hcoDisable();
    }
  }

  public vcoEnable() {
    if (this.lineDev) {
      this.lineDev.vcoEnable();
    }
  }

  public vcoDisable() {
    if (this.lineDev) {
      this.lineDev.vcoDisable();
    }
  }

  public manualAliDump(rawAli: string) {
    this.lineDev?.manualAliDump(rawAli);
  }

  public automaticAliDump(rawAli: string) {
    this.fakeAli = rawAli;
    let dialingAddr = this.gui.state.dialing;
    this.lineDev?.makeCall(dialingAddr, null, this.subject, false);
  }

  public handset1MuteOff() {
    if (this.lineDev) {
      this.lineDev.muteOff(ExtInterface.HandsetType.HandsetAgent);
    }
  }

  public handset1MuteOn() {
    if (this.lineDev) {
      this.lineDev.muteOn(ExtInterface.HandsetType.HandsetAgent);
    }
  }

  public handset2MuteOff() {
    if (this.lineDev) {
      this.lineDev.muteOff(ExtInterface.HandsetType.HandsetTrainer);
    }
  }

  public handset2MuteOn() {
    if (this.lineDev) {
      this.lineDev.muteOn(ExtInterface.HandsetType.HandsetTrainer);
    }
  }

  public pttOff() {
    if (this.lineDev) {
      this.lineDev.radioPttDeactivate();
    }
  }

  public pttOn() {
    if (this.lineDev) {
      this.lineDev.radioPttActivate();
    }
  }

  public radioCombine() {
    if (this.lineDev) {
      this.lineDev.radioCombine();
    }
  }

  public radioSplit() {
    if (this.lineDev) {
      this.lineDev.radioSplit();
    }
  }

  public agcTxOff() {
    if (this.lineDev) {
      this.lineDev.agcDisable();
    }
  }

  public agcTxOn() {
    if (this.lineDev) {
      this.lineDev.agcEnable();
    }
  }

  public agcRxOff() {
    if (this.lineDev) {
      this.lineDev.toCallTakerAgcDisable();
    }
  }

  public agcRxOn() {
    if (this.lineDev) {
      this.lineDev.toCallTakerAgcEnable();
    }
  }

  public nrRxOff() {
    if (this.lineDev) {
      this.lineDev.toCallTakerNoiseReductionDisable();
    }
  }

  public nrRxOn() {
    if (this.lineDev) {
      this.lineDev.toCallTakerNoiseReductionEnable();
    }
  }

  public dialTone(checked: boolean) {
    if (this.lineDev) {
      let webCall = guitestCallList.getCurrentCall();
      if (webCall) {
        if (checked) {
          this.lineDev.addProgressTone(ExtInterface.ProgressTone.DialTone, webCall);
        } else {
          this.lineDev.stopToneInProgress(ExtInterface.ProgressTone.DialTone, webCall);
        }
        this.gui.setState({ chkDialTone: checked });
        this.gui.setState({ chkRingTone: false });
        this.gui.setState({ chkReorderTone: false });
        this.gui.setState({ chkBusyTone: false });
      } else {
        alert('You need an active call for Progress tone');
      }
    }
  }

  public ringTone(checked: boolean) {
    if (this.lineDev) {
      let webCall = guitestCallList.getCurrentCall();
      if (webCall) {
        if (checked) {
          this.lineDev.addProgressTone(ExtInterface.ProgressTone.RingbackTone, webCall);
        } else {
          this.lineDev.stopToneInProgress(ExtInterface.ProgressTone.RingbackTone, webCall);
        }
        this.gui.setState({ chkDialTone: false });
        this.gui.setState({ chkRingTone: checked });
        this.gui.setState({ chkReorderTone: false });
        this.gui.setState({ chkBusyTone: false });
      } else {
        alert('You need an active call for Progress tone');
      }
    }
  }

  public reorderTone(checked: boolean) {
    if (this.lineDev) {
      let webCall = guitestCallList.getCurrentCall();
      if (webCall) {
        if (checked) {
          this.lineDev.addProgressTone(ExtInterface.ProgressTone.ReorderTone, webCall);
        } else {
          this.lineDev.stopToneInProgress(ExtInterface.ProgressTone.ReorderTone, webCall);
        }
        this.gui.setState({ chkDialTone: false });
        this.gui.setState({ chkRingTone: false });
        this.gui.setState({ chkReorderTone: checked });
        this.gui.setState({ chkBusyTone: false });
      } else {
        alert('You need an active call for Progress tone');
      }
    }
  }

  public busyTone(checked: boolean) {
    if (this.lineDev) {
      let webCall = guitestCallList.getCurrentCall();
      if (webCall) {
        if (checked) {
          this.lineDev.addProgressTone(ExtInterface.ProgressTone.BusyTone, webCall);
        } else {
          this.lineDev.stopToneInProgress(ExtInterface.ProgressTone.BusyTone, webCall);
        }
        this.gui.setState({ chkDialTone: false });
        this.gui.setState({ chkRingTone: false });
        this.gui.setState({ chkReorderTone: false });
        this.gui.setState({ chkBusyTone: checked });
      } else {
        alert('You need an active call for Progress tone');
      }
    }
  }

  public getDefaultVolume(fn: VolumeControlFunction, dest: VolumeControlDestination): number {
    if (this.lineDev) {
      return this.lineDev.getDefaultVolume(fn, dest);
    }
    return -1;
  }

  public getCurrentVolume(fn: VolumeControlFunction, dest: VolumeControlDestination): number {
    if (this.lineDev) {
      return this.lineDev.getCurrentVolume(fn, dest);
    }
    return -1;
  }

  public setVolume(fn: VolumeControlFunction, dest: VolumeControlDestination, v: number): void {
    this.lineDev?.setVolume(fn, dest, v);
  }

  public playGreeting(filename: string): void {
    if (this.lineDev) {
      this.lineDev.playGreeting(filename, false).then((id) => {
        this.greetingId = id;
        this.gui.setState({ response: 'Playing greeting... ID=' + this.greetingId });
      });
      return;
    }

    throw new Error('LineDev not found');
  }

  public stopGreeting(): void {
    if (this.lineDev) {
      return this.lineDev.stopGreeting(this.greetingId);
    }

    throw new Error('LineDev not found');
  }

  public startRecGreeting(): void {
    if (this.lineDev) {
      return this.lineDev.startRecGreeting();
    }

    throw new Error('LineDev not found');
  }

  public stopRecGreeting(): void {
    if (this.lineDev) {
      return this.lineDev.stopRecGreeting();
    }

    throw new Error('LineDev not found');
  }

  public async beep(beepType: string) {
    if (this.lineDev) {
      let type: ExtInterface.BeepType;
      switch (beepType) {
        case 'abandon':
          type = ExtInterface.BeepType.Abandon;
          break;
        case 'alarm':
          type = ExtInterface.BeepType.Alarm;
          break;
        case 'broadcast':
          type = ExtInterface.BeepType.Broadcast;
          break;
        case 'incident':
          type = ExtInterface.BeepType.Incident;
          break;
        case 'newText':
          type = ExtInterface.BeepType.NewText;
          break;
        case 'ttyValidate':
          type = ExtInterface.BeepType.TtyValidateBaudot;
          break;
        default:
          type = ExtInterface.BeepType.Abandon;
      }

      if (!(await this.lineDev.beep(type))) {
        alert('Beep was not played by driver');
      }
    }
  }

  async cancelConf() {
    console.log(`cancelConf confId=${ConfStore.getCurrent()?.confId}`);
    await ConfStore.getCurrent()?.cancel();
  }

  async connectConf() {
    console.log(`connectConf confId=${ConfStore.getCurrent()?.confId}`);
    await ConfStore.getCurrent()?.connect();
  }

  async holdConf() {
    console.log(`holdConf confId=${ConfStore.getCurrent()?.confId}`);
    await ConfStore.getCurrent()?.hold();
  }

  public async unholdConf() {
    console.log(`unholdConf confId=${ConfStore.getCurrent()?.confId}`);
    await ConfStore.getCurrent()?.unhold();
  }

  public async releaseConf() {
    console.log(`releaseConf confId=${ConfStore.getCurrent()?.confId}`);
    await ConfStore.getCurrent()?.drop();
  }

  public async transferConf() {
    console.log(`transferConf confId=${ConfStore.getCurrent()?.confId}`);
    await ConfStore.getCurrent()?.transfer();
  }

  public async itrrOpen(filename: string, fromExport: boolean) {
    if (this.lineDev) {
      if (this.gui.state.itrrOpenFileIndex != 0) {
        alert('Please close opened file prior to opening a new one');
        return;
      }

      let index: number | null = null;
      if (filename === 'ContRec') {
        index = await this.lineDev.itrrOpenContRec();
      } else if (fromExport) {
        index = await this.lineDev.itrrOpenExportFile(filename);
      } else {
        let result = this.lineDev.itrrConversationAvailable(parseInt(filename));
        if (result.conversationAvailable && !result.withinContRec) {
          index = await this.lineDev.itrrOpenConversation(parseInt(filename));
        } else {
          alert('Conversation available in ContRec, select it from it');
        }
      }

      if (index !== null) {
        this.gui.setState({ itrrOpenFile: filename });
        this.gui.setState({ itrrOpenFileIndex: index });

        this.lineDev.itrrSetSelection(
          index,
          ExtInterface.ItrrChannelType.Super,
          ExtInterface.ItrrMinusInfinity,
          ExtInterface.ItrrPlusInfinity,
          ExtInterface.ItrrSelectionMode.NoLoop
        );

        await this.lineDev.itrrAdvise(
          index,
          ExtInterface.ItrrChannelType.Super,
          ExtInterface.ItrrSinkFlagConstants.PlaybackUpdateEvents |
            ExtInterface.ItrrSinkFlagConstants.SectionUpdateEvents
        );
        await this.lineDev.itrrAdvise(
          index,
          ExtInterface.ItrrChannelType.Telephony,
          ExtInterface.ItrrSinkFlagConstants.SectionUpdateEvents
        );
        await this.lineDev.itrrAdvise(
          index,
          ExtInterface.ItrrChannelType.Radio,
          ExtInterface.ItrrSinkFlagConstants.SectionUpdateEvents
        );

        await this.itrrGetSpeed();
        await this.itrrGetVolume(ExtInterface.ItrrChannelType.Telephony);
        await this.itrrGetVolume(ExtInterface.ItrrChannelType.Radio);
      }
    }
  }

  public async itrrClose() {
    if (this.lineDev && this.gui.state.itrrOpenFileIndex) {
      await this.lineDev.itrrUnadvise(this.gui.state.itrrOpenFileIndex, ExtInterface.ItrrChannelType.Super);
      await this.lineDev.itrrUnadvise(this.gui.state.itrrOpenFileIndex, ExtInterface.ItrrChannelType.Telephony);
      await this.lineDev.itrrUnadvise(this.gui.state.itrrOpenFileIndex, ExtInterface.ItrrChannelType.Radio);
      if (await this.lineDev.itrrCloseFile(this.gui.state.itrrOpenFileIndex)) {
        this.gui.setState({ itrrOpenFile: '' });
        this.gui.setState({ itrrOpenFileIndex: 0 });
      }
      this.fileConversations.splice(0, this.fileConversations.length);
      this.gui.setState({ itrrFileConversation: this.fileConversations });

      this.gui.setState({ itrrPlaybackTime: new Date(0) });
      this.gui.setState({ itrrPlaybackType: '' });

      this.selectConv = 0;
      this.gui.setState({ itrrSelSection: null });

      await this.itrrGetSpeed();
    }
  }

  public async itrrPlay() {
    if (this.lineDev) {
      if (
        await this.lineDev.itrrPlay(
          this.gui.state.itrrOpenFileIndex,
          ExtInterface.ItrrChannelType.Super,
          this.gui.state.itrrPlaybackTime
        )
      ) {
        console.log(`itrrPlay Playing`);
      }
    }
  }

  public async itrrStop() {
    if (this.lineDev) {
      if (await this.lineDev.itrrPlayStop(this.gui.state.itrrOpenFileIndex, ExtInterface.ItrrChannelType.Super)) {
        console.log(`itrrStop Stop playing`);
      }
    }
  }

  public async itrrPause() {
    if (this.lineDev) {
      if (await this.lineDev.itrrPlayPause(this.gui.state.itrrOpenFileIndex, ExtInterface.ItrrChannelType.Super)) {
        console.log(`itrrPause Pause playing`);
      }
    }
  }

  public async itrrResume() {
    if (this.lineDev) {
      if (await this.lineDev.itrrPlayResume(this.gui.state.itrrOpenFileIndex, ExtInterface.ItrrChannelType.Super)) {
        console.log(`itrrResume Resume playing`);
      }
    }
  }

  public async itrrSeek(plus: boolean) {
    if (this.lineDev) {
      let currentDate = new Date();
      let date;
      if (plus) {
        date = new Date(this.gui.state.itrrPlaybackTime.getTime() + 5000); //Seek 5 second later
      } else {
        date = new Date(this.gui.state.itrrPlaybackTime.getTime() - 5000); //Seek 5 second before
      }
      if (await this.lineDev.itrrSeek(this.gui.state.itrrOpenFileIndex, ExtInterface.ItrrChannelType.Super, date)) {
        console.log(`itrrSeek Seek playing`);
      }
    }
  }

  public async itrrSetSpeed(speed: number) {
    if (this.lineDev && this.gui.state.itrrOpenFileIndex !== 0) {
      if (
        await this.lineDev.itrrSetSpeed(this.gui.state.itrrOpenFileIndex, ExtInterface.ItrrChannelType.Super, speed)
      ) {
        console.log(`itrrSetSpeed SetSpeed`);
        await this.itrrGetSpeed();
      }
    }
  }

  public async itrrGetSpeed() {
    let speedTxt: string = '1x';
    if (this.lineDev && this.gui.state.itrrOpenFileIndex !== 0) {
      let speed: number | null = await this.lineDev.itrrGetSpeed(
        this.gui.state.itrrOpenFileIndex,
        ExtInterface.ItrrChannelType.Super
      );
      console.log(`itrrGetSpeed GetSpeed: ` + (speed ? speed.toString() : 'null'));
      if (speed === 50) {
        speedTxt = '1/2x';
      } else if (speed === 200) {
        speedTxt = '2x';
      }
    }
    this.gui.setState({ itrrSpeed: speedTxt });
  }

  public async itrrSetVolume(channel: number, volume: number) {
    if (this.lineDev && this.gui.state.itrrOpenFileIndex !== 0) {
      if (
        await this.lineDev.itrrSetVolume(
          this.gui.state.itrrOpenFileIndex,
          channel === 1 ? ExtInterface.ItrrChannelType.Telephony : ExtInterface.ItrrChannelType.Radio,
          volume * 10
        )
      ) {
        console.log(`itrrSetVolume SetVolume`);
        await this.itrrGetVolume(channel);
      }
    }
  }

  public async itrrGetVolume(channel: number) {
    if (this.lineDev && this.gui.state.itrrOpenFileIndex !== 0) {
      let volume: number | null = await this.lineDev.itrrGetVolume(
        this.gui.state.itrrOpenFileIndex,
        channel === 1 ? ExtInterface.ItrrChannelType.Telephony : ExtInterface.ItrrChannelType.Radio
      );
      console.log(`itrrGetSpeed GetVolume: ` + (volume !== null ? volume.toString() : 'null'));

      if (volume !== null) {
        let range = Math.round(volume / 10);
        if (channel === 1) {
          this.gui.setState({ itrrTelephonyVolume: range });
        } else {
          this.gui.setState({ itrrRadioVolume: range });
        }
      }
    }
  }

  public async itrrSetSelection(ctxId: number) {
    if (this.lineDev) {
      let index = this.fileConversations.findIndex((sect) => sect.sectionInfo.ctxId === ctxId);
      if (index !== -1) {
        this.itrrOnConvSelect(ctxId);
        if (
          await this.lineDev.itrrSetSelection(
            this.gui.state.itrrOpenFileIndex,
            ExtInterface.ItrrChannelType.Super,
            this.fileConversations[index].startTime,
            this.fileConversations[index].endTime,
            ExtInterface.ItrrSelectionMode.Loop
          )
        ) {
          console.log(`itrrSetSelection SetSelection`);
          this.gui.setState({ itrrPlaybackTime: this.fileConversations[index].startTime });
        }
      }
    }
  }

  public async itrrExport(start: Date, end: Date, filename: string) {
    if (this.lineDev) {
      if (
        await this.lineDev.itrrExport(
          this.gui.state.itrrOpenFileIndex,
          ExtInterface.ItrrChannelType.Super,
          filename,
          start,
          end
        )
      ) {
        console.log(`itrrSetSelection Export`);
      }
    }
  }

  public async itrrDelete(filename: string) {
    if (this.lineDev) {
      if (await this.lineDev.itrrDelete(filename)) {
        console.log(`itrrSetSelection Export`);
      }
    }
  }

  public async itrrSave(ctxId: number) {
    if (this.lineDev) {
      if (await this.lineDev.itrrSave(ctxId)) {
        console.log(`itrrSave Save`);
      }
    }
  }

  public async itrrUnsave(ctxId: number) {
    if (this.lineDev) {
      if (await this.lineDev.itrrUnsave(ctxId)) {
        console.log(`itrrUnsave Unsave`);
      }
    }
  }

  public async itrrExportConv(ctxId: number) {
    if (this.lineDev) {
      let recording: Blob | null = await this.lineDev.itrrImportRecording(ctxId);

      if (recording === null) {
        console.log(`itrrExportConv Recording could not be imported`);
      } else {
        console.log(`itrrExportConv Recording received`);
        if (await this.lineDev.itrrSaveRecording(recording, 'Remote_' + ctxId.toString() + '.wav')) {
          console.log(`itrrExportConv Recording saved`);
        } else {
          console.log(`itrrExportConv Recording could not be saved`);
        }
      }
    }
  }

  public async itrrGetHostname() {
    if (this.lineDev) {
      let hostname = await this.lineDev.itrrGetHostname();
      this.gui.setState({ itrrHostname: hostname });
    }
  }

  public itrrOnConvSelect(ctxId: number) {
    let index = this.fileConversations.findIndex((sect) => sect.sectionInfo.ctxId === ctxId);
    if (index !== -1) {
      this.selectConv = ctxId;
      this.gui.setState({ itrrSelSection: this.fileConversations[index] });
    } else {
      this.selectConv = 0;
      this.gui.setState({ itrrSelSection: null });
    }
  }

  public setPlaybackToCaller(value: boolean) {
    if (this.lineDev) {
      this.lineDev.playbackToCaller = value;
    }
  }

  public async nenaQueueStateGet(identifier: string) {
    try {
      const res = await this.lineDev?.nenaQueueStateGet(identifier);
      if (res) {
        this.gui.setState({ nenaStateData: JSON.stringify(res) });
      } else {
        this.gui.setState({ nenaStateData: 'unknown identifier' });
      }
    } catch (e) {
      this.gui.setState({ nenaStateData: `err: ${e.message}` });
    }
  }

  public async nenaQueueStateGetAll() {
    try {
      const res = await this.lineDev?.nenaQueueStateGetAll();
      this.gui.setState({ nenaStateData: JSON.stringify(res) });
    } catch (e) {
      this.gui.setState({ nenaStateData: `err: ${e.message}` });
    }
  }

  public async nenaQueueStateSetOverride(identifier: string, overrideState: string, overrideReason: string) {
    try {
      await this.lineDev?.nenaQueueStateSetOverride(
        identifier,
        overrideState as ExtInterface.NenaQueueState,
        overrideReason
      );
      this.gui.setState({ nenaStateData: `queue override on ${identifier} set to ${overrideState}` });
    } catch (e) {
      this.gui.setState({ nenaStateData: `err: ${e.message}` });
    }
  }

  public async nenaQueueStateClearOverride(identifier: string) {
    try {
      await this.lineDev?.nenaQueueStateClearOverride(identifier);
      this.gui.setState({ nenaStateData: `queue override on ${identifier} cleared` });
    } catch (e) {
      this.gui.setState({ nenaStateData: `err: ${e.message}` });
    }
  }

  public async nenaServiceStateGet(identifier: string) {
    try {
      const res = await this.lineDev?.nenaServiceStateGet(identifier);
      if (res) {
        this.gui.setState({ nenaStateData: JSON.stringify(res) });
      } else {
        this.gui.setState({ nenaStateData: 'unknown identifier' });
      }
    } catch (e) {
      this.gui.setState({ nenaStateData: `err: ${e.message}` });
    }
  }

  public async nenaServiceStateGetAll() {
    try {
      const res = await this.lineDev?.nenaServiceStateGetAll();
      this.gui.setState({ nenaStateData: JSON.stringify(res) });
    } catch (e) {
      this.gui.setState({ nenaStateData: `err: ${e.message}` });
    }
  }

  public async nenaServiceStateSetOverride(identifier: string, overrideState: string, overrideReason: string) {
    try {
      await this.lineDev?.nenaServiceStateSetOverride(
        identifier,
        overrideState as ExtInterface.NenaServiceState,
        overrideReason
      );
      this.gui.setState({ nenaStateData: `service override on ${identifier} set to ${overrideState}` });
    } catch (e) {
      this.gui.setState({ nenaStateData: `err: ${e.message}` });
    }
  }

  public async nenaServiceStateClearOverride(identifier: string) {
    try {
      await this.lineDev?.nenaServiceStateClearOverride(identifier);
      this.gui.setState({ nenaStateData: `service override on ${identifier} cleared` });
    } catch (e) {
      this.gui.setState({ nenaStateData: `err: ${e.message}` });
    }
  }

  public async subscribeDynamicACDStatus() {
    try {
      const resp = await this.lineDev?.subscribeDynamicACDStatus(defaultOptions.dynamicACDSubscribedList);
      console.log(`${this.constructor.name}.${this.subscribeDynamicACDStatus.name}: snapshot: ${JSON.stringify(resp)}`);
    } catch (e) {
      console.warn(`${e}`);
    }
  }

  public async unSubscribeDynamicACDStatus() {
    try {
      const resp = await this.lineDev?.unSubscribeDynamicACDStatus();
      console.log(`${this.constructor.name}.${this.unSubscribeDynamicACDStatus.name}: done`);
    } catch (e) {
      console.warn(`${e}`);
    }
  }

  public async rttDetect() {
    if (this.lineDev) {
      let webCall = guitestCallList.getCurrentCall();
      if (webCall) {
        this.rttCall = webCall;
        this.lineDev.rttDetect(this.rttCall);
      }
    }
  }

  public rttTranscript(transcript: string) {
    if (this.lineDev) {
      if (this.rttCall) {
        this.lineDev.rttAttachTranscript(this.rttCall, transcript);
        this.rttCall = undefined;
      }
    }
  }

  public addToCallCDR(params: object) {
    if (this.lineDev) {
      let webCall = guitestCallList.getCurrentCall();
      if (webCall) {
        webCall.addToCallCDR(params);
      }
    }
  }

  public addToAgentCDR(params: object) {
    if (this.lineDev) {
      this.lineDev.addToAgentCDR(params);
    }
  }

  public async lvfRequest(requestId: string, civicAddress: string, serviceURI: string) {
    if (this.lineDev) {
      let webCall = guitestCallList.getCurrentCall();
      if (webCall) {
        this.lineDev
        .requestLvf(requestId, civicAddress, serviceURI, webCall.infoRec.uniqueCallId)
        .then((lvfResponse) => {
          if (requestId == lvfResponse.request_id) {
            this.gui.setState({ response: 'LVF: ' + lvfResponse.response });
          }
          else {
            this.gui.setState({ response: 'LVF: ' + 'Not matching requestId: ' + lvfResponse.request_id});
          }
        })
        .catch((err: Error) => {
          this.gui.setState({ response: 'LVF: (Exception) ' + err.message });
        });
      }
    }
  }

  public async lvfCancel(requestId: string) {
    if (this.lineDev) {
      this.lineDev
      .cancelLvf(requestId)
      .then((response) => {
          this.gui.setState({ response: 'LVF: Cancelled' });
      })
      .catch((err: Error) => {
        this.gui.setState({ response: 'LVF: (Exception) ' + err.message });
      });
    }
  }

}
