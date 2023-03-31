/* eslint-disable no-empty-function */
import { webCfg, WebPhoneCfg } from '../config/webcfg';
import * as ExtInterface from '../telephonyexternalinterfacedef';
import * as InternalInterface from '../telephonyinternalinterfacedef';
import { CallHeader } from '../telephonyutil';
import { WebPhone } from '../webphone/interfaces/webphone';
import { WebLine } from '../webline/webline';
import WebNode from './webnode';
import WebCall from '../webcall/webcall';
//import { VccClient } from '../vcc/VccClient';
import { VccWebSocket } from '../vcc/VccWebSocket';
/*
import {
  AppServerClient,
  getAppServerNode,
  getFirstAppServerNode,
  AppServerClientResponse,
} from '../appserverclient/appserverclient';
*/
import { aliDecoder, DecodedAli, GoodAliTypes } from '../alidecoder/alidecoder';
import { ForceConnectSync } from './forceconnect/forceconnect';
import { initiateForceConnect } from './forceconnect/initiateForceConnect';
import { resetForceConnectInProgress } from './forceconnect/resetForceConnectInProgress';
import ActiveCalls from '../webcall/activecalls';
import {
  changeInputVolume,
  changeInputMuted,
  changeOutputVolume,
  changeOutputMuted,
  changeInputDevSelection,
  changeOutputDevSelection,
  registerInputDevicesCb,
  registerOutputDevicesCb,
  playTestTone,
} from './audio-management';
import { Ringer, RingerMode } from './ringer';
import { HttpCadOut } from './httpCadOut';
import { WebViperDriver } from '../webviperdriver/webviperdriver';
import { LineConfig, getLineConfig } from '../config/lineConfig';
import {
  AcdLoginState,
  AcdLoginStateChangeEvent,
  AcdLoginStatus,
  AcdOpStatus,
  AcdQueueMembership,
  consolidateAcdLoginOpStatus,
  consolidateAcdLoginState,
  isDynamicQueue,
  isDynamicOnQueue,
} from './loginState/acdLoginState';
import {
  consolidateRgLoginOpStatus,
  consolidateRgLoginState,
  RgLoginState,
  RgLoginStateChangeEvent,
  RgLoginStatus,
  RgOpStatus,
} from './loginState/rgLoginState';
import { CallState } from '../webcall/callState';
import { TddManager } from './tddManager';
import { volumeController, VolumeControlFunction, VolumeControlDestination } from './volumeController';
import { progressToneManager } from './progressToneManager';
import { wavManager } from './wavManager';
import { Diag } from '../common/diagClient';
import { CallOp } from '../webcall/callop';
//import { vccConnectionHandler } from './vccConnectionHandler';
import { getNodeId } from '../config/nodeId';
import { RecorderManager } from './recorderManager';
import { INotifyInfos } from '../webphone/sip/client';
import { ListenJoin, ListenJoinMonitoringMode, ListenJoinResponses, arrListenJoinResponses } from './listenJoin';
import { AudioPlay } from '../webviperdriver/webviperdriver-def';
import {
  NenaQueueState,
  NenaQueueStateFull,
  NenaQueueStateManager,
  NenaServiceState,
  NenaServiceStateFull,
  NenaServiceStateManager,
} from './nenaState/nenaStateTypes';
import { NenaQueueStateManagerImpl } from './nenaState/nenaQueueStateManagerImpl';
import { NenaServiceStateManagerImpl } from './nenaState/nenaServiceStateManagerImpl';
import {
  AgentQueueStatus,
  subscribeDynamicACDStatus,
  unSubscribeDynamicACDStatus,
} from './dynamicACDBySupervisor/dynamicACDStatus';

const diag = new Diag('weblinedev');

const diagWVD = new Diag('weblinedev.webviperdriver');

const diagASC = new Diag('weblinedev.appserverclient');

const diagITRR = new Diag('weblinedev.itrrclient');

const diagLJ = new Diag('weblinedev.ljvm');

export class WebLineDev extends EventTarget implements NenaQueueStateManager, NenaServiceStateManager {
  /*
   * Constructor.
   * @param WEBLineDev - the telephony linedev interface
   * @extenal
   */

  self: this;
  agentId: string;
  device: string;
  nBNodes: number;
  webNodes: Array<WebNode>;
  nBLines: number;
  webLines: Array<WebLine>;
  nBACD: number;
  forceConnectInProgress: WebCall | null = null;
  currentForceConnectSync: Array<ForceConnectSync> = [];
  callForwardingStatus: string;
  vccws: VccWebSocket;
  //vccClient: VccClient;
  callback: null;
  startState: ExtInterface.StartStat;
  webPhone!: WebPhone;
  //appServerClient = new AppServerClient();
  webViperDriver: WebViperDriver | null;
  tddManager: TddManager | null;
  maxDNLenght: number;
  addLocalPrefixOnUnformatted: boolean;
  agentStatusREC: InternalInterface.AgentLoginStatus;
  acdLoginState: AcdLoginState;
  storeProvidedQueueList: Array<AcdQueueMembership> = [];
  preferredAcdLoginState: AcdLoginState;
  rgLoginState: RgLoginState;
  preferredRgLoginState: RgLoginState;
  private theRinger: Ringer;
  private httpCadOut: HttpCadOut;
  connectCount: number;
  ljMonitoring: ListenJoin;
  private unassignedLineConfig = new Map<string, LineConfig>();
  recorderManager: RecorderManager | null;
  private isPlaybackToCaller: boolean = false;
  nenaQueueStateManager: NenaQueueStateManagerImpl;
  nenaServiceStateManager: NenaServiceStateManagerImpl;
  dynamicACDStatus: Array<AgentQueueStatus> = [];
  subscribedQueueList: Array<string> = [];
  dynamicACDSubscribed: boolean = false;
  agentPrimaryState: string = '';
  agentSecondaryState: string = '';

  constructor(options: ExtInterface.OptionsType, cfgData = {}) {
    super();
    this.self = this;
    this.nBNodes = 0;
    this.nBLines = 0;
    this.nBACD = 0;
    this.webNodes = [];
    this.webLines = [];
    this.callForwardingStatus = 'offCall'; //'onCall'
    this.vccws = new VccWebSocket({
      send: () => {
        throw new Error('VCC web socket not initialized');
      },
      close: () => {},
    });
    //this.vccClient = new VccClient(this.vccws);
    this.callback = null;
    this.agentStatusREC = new InternalInterface.AgentLoginStatus(null, null);
    this.theRinger = new Ringer(this);
    this.httpCadOut = new HttpCadOut(this);
    this.webViperDriver = null;
    this.tddManager = null;
    this.connectCount = 0;
    this.ljMonitoring = new ListenJoin(this);
    this.acdLoginState = {
      loginStatus: AcdLoginStatus.LoginUnknown,
      ready: false,
      qlist: [],
    };
    this.preferredAcdLoginState = { ...this.acdLoginState };
    this.rgLoginState = { loginStatus: RgLoginStatus.LoginUnknown, rgList: [] };
    this.preferredRgLoginState = { ...this.rgLoginState };
    webCfg.init(options);

    this.maxDNLenght = webCfg.systemConfig.MaxDNLength;
    this.addLocalPrefixOnUnformatted = webCfg.systemConfig.addLocalPrefixOnUnformatted;
    this.agentId = webCfg.agentConfig.id;
    this.device = webCfg.positionCfg.dn;
    this.recorderManager = null;
    this.nenaQueueStateManager = new NenaQueueStateManagerImpl(this);
    this.nenaServiceStateManager = new NenaServiceStateManagerImpl(this);

    //this.token = options.token;

    this.init();
    this.startState = ExtInterface.StartStat.Stopped;

    this.processCallIncoming = this.processCallIncoming.bind(this);
    this.processCallStatusUpdate = this.processCallStatusUpdate.bind(this);
    this.processCallAnswered = this.processCallAnswered.bind(this);
    this.processCallerASA = this.processCallerASA.bind(this);
    this.processDTMFinfo = this.processDTMFinfo.bind(this);

    // Bind ServerAppsClient callbacks
    this.processCallInformationUpdate = this.processCallInformationUpdate.bind(this);
    this.processServiceListUpdate = this.processServiceListUpdate.bind(this);
    this.processCallerDisconnectedUpdate = this.processCallerDisconnectedUpdate.bind(this);
    this.processAppSvrGwLinkStatus = this.processAppSvrGwLinkStatus.bind(this);

    // Bind WebViperDriver callbacks
    this.processCtiHardwareUpdate = this.processCtiHardwareUpdate.bind(this);
    this.processTddDetect = this.processTddDetect.bind(this);
    this.processMuteChange = this.processMuteChange.bind(this);
    this.processHandsetDetectChange = this.processHandsetDetectChange.bind(this);
    this.processRadioTransmitMode = this.processRadioTransmitMode.bind(this);
    this.processRadioReceptionMode = this.processRadioReceptionMode.bind(this);
    this.processRadioModeChange = this.processRadioModeChange.bind(this);
    this.processAgcStatus = this.processAgcStatus.bind(this);
    this.processCallTakerAgcStatus = this.processCallTakerAgcStatus.bind(this);
    this.processCallTakerNrStatus = this.processCallTakerNrStatus.bind(this);

    // Bind MSRP callback
    this.processMsrpIncMessage = this.processMsrpIncMessage.bind(this);

    // Bind RTT callback
    this.processRttIncMessage = this.processRttIncMessage.bind(this);
    this.processRttOutMessage = this.processRttOutMessage.bind(this);
    this.processRttMediaStatusUpdate = this.processRttMediaStatusUpdate.bind(this);

    // Bind Subscribe Notify message
    this.processSubsNotifyMessage = this.processSubsNotifyMessage.bind(this);

    // Bind L&J outgoing call event
    this.processLJOutoingCallEvent = this.processLJOutoingCallEvent.bind(this);
  }

  // Bind Audio management APIs
  public changeInputVolume = changeInputVolume.bind(this);
  public changeInputMuted = changeInputMuted.bind(this);
  public changeOutputVolume = changeOutputVolume.bind(this);
  public changeOutputMuted = changeOutputMuted.bind(this);
  public changeInputDevSelection = changeInputDevSelection.bind(this);
  public changeOutputDevSelection = changeOutputDevSelection.bind(this);
  public registerInputDevicesCb = registerInputDevicesCb.bind(this);
  public registerOutputDevicesCb = registerOutputDevicesCb.bind(this);
  public playTestTone = playTestTone.bind(this);

  /*feature of forceConnect */
  initiateForceConnect = initiateForceConnect.bind(this);
  resetForceConnectInProgress = resetForceConnectInProgress.bind(this);

  private init() {
    let nodesMap = webCfg.nodeCfgMap;
    if (nodesMap) {
      nodesMap.forEach((nodeData) => {
        const node = new WebNode(this.self, nodeData);
        this.webNodes.push(node);
      });
    }

    let linesMap = webCfg.lineDataMap;
    if (linesMap) {
      linesMap.forEach((lineData: LineConfig) => {
        let lineType = lineData.lineType;
        const webLine = new WebLine(this.self, lineData);
        this.addWebLine(webLine);
      });
    }

    wavManager.init(this);
    volumeController.init(this);
    progressToneManager.init(this);
  }

  public get ringer(): Ringer {
    return this.theRinger;
  }

  get state() {
    return this.startState;
  }

  get playbackToCaller() {
    return this.isPlaybackToCaller;
  }

  set playbackToCaller(value: boolean) {
    this.isPlaybackToCaller = value;
  }

  report(event: Event) {
    this.dispatchEvent(event);
  }

  getWebNodeById(nodeId: number) {
    return this.webNodes.find((webNode) => webNode.getNodeId() === nodeId);
  }

  getWebNodeByClusterName(clusterName: string) {
    return this.getWebNodeById(getNodeId(clusterName));
  }

  getWantedLineType(lineAddr: string, checkACD: boolean, checkBlindXfer?: boolean, callHeader?: CallHeader) {
    let wantedLineType = ExtInterface.LineType.LTADM;
    // Check if this call is ACD.
    if (checkACD && callHeader?.route && callHeader.route.startsWith('Q')) {
      wantedLineType = ExtInterface.LineType.LTACD;
      // lineAddr = GetACDLineAddress(); // For now, only one ACD line is supported.
    } else if (lineAddr) {
      // Check if this call is 911 or SIP
      if (lineAddr.startsWith('911')) {
        // Check if a BlindXfer was made to this position
        if (checkBlindXfer) {
          const blindTransferDest = callHeader?.referedBy?.match(/^blindxfer(.*)/)?.[1] || '';
          if (blindTransferDest === this.device) {
            diag.out(
              'getWantedLineType',
              'Incoming call was blind-transfered to this position only: Get an intercom line'
            );
            return ExtInterface.LineType.LTIntercom;
          }
        }
        wantedLineType = ExtInterface.LineType.LT911;
      } else if (lineAddr.startsWith('SIP')) {
        wantedLineType = ExtInterface.LineType.LTSIP;
      }
    }
    return wantedLineType;
  }

  public getFreeIntercomLine() {
    return this.getFreeLine(ExtInterface.LineType.LTIntercom, webCfg.positionCfg.dn, false, false);
  }

  public getFreeLine(
    lineType: ExtInterface.LineType,
    lineAddr: string,
    checkAvailabilityOnParkTimeout: boolean,
    checkUnassignedLine: boolean
  ) {
    let webLine: WebLine | undefined;
    if (lineType === ExtInterface.LineType.LTIntercom) {
      /* Before getting an Intercom line, check if it is allowed: the position should be not available at the time */
      let allow = true;
      if (checkAvailabilityOnParkTimeout) {
        const states: Array<CallState> = [
          CallState.Dialtone,
          CallState.Proceeding,
          CallState.Connected,
          CallState.Disconnected,
        ];
        const calls = ActiveCalls.callsInStatesOf(states);
        if (calls.length > 0) {
          diag.out('getFreeLine', 'Cannot accept park Timeout Call, because of existing calls state not allowed');
          allow = false;
        }
        if (allow) {
          const offeredCalls = ActiveCalls.callsInStatesOf([CallState.Offered]);
          if (offeredCalls.length > 0) {
            const call = calls.find((c) => c.webLine?.lineType === ExtInterface.LineType.LTACD);
            if (call) {
              diag.out(
                'getFreeLine',
                `Cannot accept park Timout Call on ${lineAddr}, because of the call:\n call<${call.webNode}> - state<${call.state}> - type<${ExtInterface.LineType.LTACD}>`
              );
              allow = false;
            }
          }
        }
      }
      if (allow) {
        webLine = this.webLines.find(
          (line) => line.lineCfgEx.lineType === lineType && line.status === ExtInterface.Status.Idle
        );
        if (!webLine) {
          const lineCfg = webCfg.positionCfg.getNextIntercomLineConfig();
          if (lineCfg) {
            webLine = new WebLine(this.self, lineCfg);
            this.addWebLine(webLine);
          }
        }
      }
    } else if (lineType === ExtInterface.LineType.LTACD) {
      /* Before getting an ACD line, check if it is allowed */
      const states: Array<CallState> = [
        CallState.Dialtone,
        CallState.Proceeding,
        CallState.Connected,
        CallState.Disconnected,
        CallState.IHold,
        CallState.Finishing,
      ];
      const calls = ActiveCalls.callsInStatesOf(states);
      if (calls.length > 0) {
        calls.forEach((c) => {
          diag.out(
            'getFreeLine',
            `Cannot accept incoming ACD call on ${lineAddr}, because of the following calls:\n call<${c.webNode}> - state<${c.state}`
          );
        });
      } else {
        webLine = this.webLines.find(
          (line) => line.lineCfgEx.lineType === lineType && line.status === ExtInterface.Status.Idle
        );
      }
    } else if (lineType !== ExtInterface.LineType.LTUnknown) {
      webLine = this.webLines.find(
        (line) => line.lineCfgEx.address === lineAddr && line.status === ExtInterface.Status.Idle
      );
      if (!webLine && checkUnassignedLine) {
        const calls = ActiveCalls.activeCallsOnLineAddr(lineAddr);
        if (calls.length !== 0) {
          const call = calls[0]; // Refer to the trunk call
          const line = call.webLine;
          const callsOnCurrentWebLine = line ? ActiveCalls.activeCallsOnWebLine(line) : [];

          // TODO: We will deal with incoming transfer after MVP

          if (!lineAddr.startsWith('SIP') && CallState.offered(call.state) && call.waitForAbandon) {
            callsOnCurrentWebLine.forEach((c) => {
              c.setCallState(CallState.Abandoned);
              c.finishCall();
            });
          }
          // Try to get same trunk line that is just cleaned-up
          webLine = this.webLines.find(
            (l) =>
              l.lineCfgEx.address === lineAddr &&
              (l.status === ExtInterface.Status.Idle || l.lineType === ExtInterface.LineType.LTSIP)
          );
        }
        if (!webLine) {
          diag.out(
            'getFreeLine',
            `No free <${lineType}> line for (lineAddr:${lineAddr}). Or the line not assigned. Get a free intercom line`
          );
          webLine = this.getFreeIntercomLine();
        }
      }
    }
    if (webLine) {
      diag.trace?.('getFreeLine', `Found a free <${lineType}> line for (Addr:<${webLine.addressv}>)`);
    } else {
      diag.warn('getFreeLine', `Failed to get free <${lineType}> line for (Addr:<${lineAddr}>)`);
    }
    return webLine;
  }

  private addWebLine(line: WebLine) {
    diag.trace?.('addWebLine', `Adding line <${line.addressv}>`);
    //temporary
    //LTSIP always free line
    this.webLines.push(line);
  }

  private processCallIncoming(event: CustomEvent) {
    diag.trace?.('processCallIncoming', `incoming call session ${event.detail}`);
    let lineType;
    const callHeader: CallHeader = event.detail;
    // Remove systemId
    callHeader.trunkAddress = callHeader.trunkAddress.substring(callHeader.trunkAddress.indexOf('-') + 1);

    // Check if the incoming call is tagged as a Re-Invite.  If so, check for an existing webCall.
    const reInvite = callHeader?.reInvite?.includes('yes') ? callHeader?.reInvite : null;
    const localChannel = callHeader.localChannel;
    const sipRemoteChannel = callHeader.remoteChannel;
    const callType = callHeader.callType;
    if (reInvite) {
      const originalCall = ActiveCalls.findByLocalChannel(localChannel);
      if (originalCall) {
        diag.out(
          'processCallIncoming',
          `WebRTCGw Re-Invite: Found the original call which match the incoming webCallId <${originalCall.webCallId}>`
        );
        const nodeId = originalCall.webNode.nodeCfgEx.id;

        // If call is MSRP, clear the entire MSRP conversation transcript because, all messages will be resent by the voip server.
        if (callType === ExtInterface.CallType.Text) originalCall.clearMsrpTranscript();

        // if webcall is IHold, update the client SIP stack session "holdState"
        if (originalCall.state === CallState.IHold) this.webPhone.updHoldState(callHeader.id, nodeId, true);

        // Make sure the call state was previously connected before answering.
        if (originalCall.state === CallState.Connected || originalCall.state === CallState.IHold) {
          diag.out(
            'processCallIncoming',
            `WebRTCGw Re-Invite: Auto-Answered re-invite for webCallId <${originalCall.webCallId}>`
          );
          this.webPhone.answer(callHeader.id, nodeId);
        }

        return;
      } else {
        diag.warn(
          'processCallIncoming',
          `The incoming call is tagged as a Re-Invite but, could not find an existing webCall with the SIP header "localChannel" = ${localChannel}.  Continue as a NEW INVITE !`
        );
      }

      return;
    }

    // handle Park timeout reoffer
    const sipParktimeout = callHeader?.parkTimeout?.includes('yes') ? callHeader?.parkTimeout : null;
    if (sipParktimeout) {
      const initialParkedCall = ActiveCalls.findByRemoteChannel(sipRemoteChannel);
      if (initialParkedCall) {
        diag.out('processCallIncoming', `found parkedTimeOut reoffered on call ${initialParkedCall.webCallId}`);
        initialParkedCall.callHeader.localChannel = callHeader.localChannel;
        initialParkedCall.sipId = callHeader.id;
        const line = this.getFreeIntercomLine();
        if (line) {
          initialParkedCall.changeLine(line);
          initialParkedCall.setCallState(ExtInterface.CallState.ReOffered);
        }
      }
      return;
    }
    // Continue to create the webCall for an incoming call
    const voipServerAddress = callHeader.voipAddress;
    const webNode = this.webNodes.find((node) => node.nodeCfgEx.proxyAddress === voipServerAddress);
    if (!webNode) return;

    let pos: number = callHeader.phoneNumber.indexOf('*');
    let lineAddr: string = '';
    let line: WebLine | undefined;
    if (pos !== -1) {
      //trunk call
      lineAddr = callHeader.phoneNumber.substring(pos + 1);
      lineType = this.getWantedLineType(lineAddr, true, true, callHeader);
    } else {
      lineType = this.getWantedLineType(lineAddr, true, false, callHeader);
      if (!lineAddr && lineType === ExtInterface.LineType.LTADM) {
        lineType = ExtInterface.LineType.LTIntercom;
      }
    }
    line = this.getFreeLine(lineType, lineAddr, false, true);

    if (line) {
      const call = line.receiveCall(webNode, callHeader);

      const forceConnect = callHeader.callInfo.includes('answer-after=0');
      if (forceConnect) {
        call.setZipToneFlag();
        if (!this.initiateForceConnect(call)) {
          diag.out('processCallIncoming', `unable to initiate force connect on call ${call.webCallId}`);
          call
            .reject()
            .catch((e) =>
              diag.warn('processCallIncoming', `failed to reject force-connect call ${call.webCallId}: ${e}`)
            );
        } else {
          call.connect().catch((e) => {
            diag.warn('processCallIncoming', `failed to connect force-connect call ${call.webCallId}: ${e}`);
          });
        }
      }

      // [MSRP] Report initial MSRP message from the Invite SUBJECT header
      const inviteMsrpSubject = callHeader.subject;
      if (call && inviteMsrpSubject) {
        diag.out('processCallIncoming', `Got a MSRP invite subject "${inviteMsrpSubject}"`);
      }
    } else {
      if (lineType === ExtInterface.LineType.LTACD) {
        diag.out('processCallIncoming', `cannot find freeline on line <${lineType}> with lineAddr <${lineAddr}>`);
        // webCall is not created yet. Use WebPhone API directly
        this.webPhone
          .reject(callHeader.id, webNode.nodeCfgEx.id)
          .then(() => {})
          .catch((e) => {});
      } else {
        diag.warn('processCallIncoming', `cannot find freeline on line <${lineType}> with lineAddress<${lineAddr}>`);
      }
    }
  }

  private async processCallStatusUpdate(event: CustomEvent) {
    diag.trace?.('processCallStatusUpdate', `call status update<${JSON.stringify(event.detail)}>`);
    const callSession = event.detail;

    // Reset L&J monitoring call information if, the remote position terminates the call being listened or Joined.
    // Please note there is no WebCall object created when we are making a L&J call to monitor a specific call channel.
    if (callSession.id === this.ljMonitoring.monPosSipCallId && callSession.status === 'terminated') {
      // Sonic Audio driver
      this.decrementConnectCount(undefined);

      this.ljMonitoring.monPosSipCallId = '';
      this.ljMonitoring.monPosCallNodeId = 0;
    }

    const call = this.getCallBySipId(callSession.id);
    if (call && callSession.status === 'terminated') {
      if (call.isNextGenCall() || call.isT1CasCall()) {
        if (call.state !== CallState.Disconnected && call.state !== CallState.Finishing) {
          // We need this trace for tracking the timing of nextGen or t1Cas call on possible caller disconnects
          diag.out('processCallStatusUpdate', `Call will be terminated from current state ${call.state}`);
        }
      }
      call.onSipCallTerminated();
    } else if (call) {
      diag.out(
        'processCallStatusUpdate',
        `got sip status <${callSession.status}> for an ${call.cfg.direction} call session Id <${callSession.id}>`
      );
      // Stop any 'ringback' tone in progress following a 183SessionProgress if:
      // - It is an outgoing call
      // - call state is already in "Proceeding" which means we got a 180 Ringing prior to get the 183SessionProgress
      // N.B.: if we do not get the provisioning 180Ringing response prior to the 183,
      //       the 'makeCall' function return promise will ensure no ringback tone is played up front.
      if (
        call.cfg.direction === 'Outgoing' &&
        callSession.status === 'SessionProgress' &&
        call.state === CallState.Proceeding
      ) {
        call.ringbackOnProceeding.needed = false;
        call.updateProgressTone(CallState.Proceeding);
      }
    } else {
      diag.warn('processCallStatusUpdate', `No call found for call session Id <${callSession.id}>`);
    }
  }

  private async processDTMFinfo(event: InternalInterface.DigitRecivedNotification) {
    diag.trace?.('processDTMFinfo', ` DTMF digit received for silent mode on event <${JSON.stringify(event)}>`);
    const digit = event.digit;
    const call = this.getCallBySipId(event.sipId);
    if (call && call.state != CallState.Finishing) {
      diag.trace?.('processDTMFinfo', ` DTMF digit ${digit} received for silent mode on call ${call.callHeader.uCI}`);
      // Report event to Application
      this.report(new ExtInterface.ExportSilentCallDigitInfo(digit, call));
    } else {
      diag.warn('processDTMFinfo', `Cannot get calls by sipId <${event.sipId}>`);
    }
  }

  private processCallerASA(event: InternalInterface.AudibleAlertASASipNotification) {
    diag.out('processCallerASA', `call status update<${JSON.stringify(event)}>`);
    const call = this.getCallBySipId(event.sipId);
    if (call) {
      const uci = call.callHeader.uCI;
      if (
        call.state != CallState.Finishing &&
        call.audibleAlertTimeout > 0 &&
        (call.isNextGenCall() || call.isT1CasCall())
      ) {
        // Received SIP BYE(ASA)
        diag.trace?.('processCallerASA', `audibleAlertTimeout is <${call.audibleAlertTimeout}>`);
        if (call.state !== CallState.Disconnected) {
          let calls = ActiveCalls.getCallsByUCI(uci);
          if (calls.length === 0) calls = ActiveCalls.getCallsByUCICallHeader(uci);
          if (calls.length > 0) {
            for (let c of calls) {
              c.setCallerDisc(true);
            }
          } else {
            diag.warn('processCallerASA', `can not get calls by uci <${uci}>`);
          }
        }

        if (call.state === CallState.Disconnected) {
          call.setCallState(CallState.Finishing);
          if (!call.audibleAlertToneStarted) {
            try {
              let result = call.audibleAlertProgress(call.audibleAlertTimeout);
              diag.trace?.('processCallerASA', `${result}`);
            } catch (e) {
              diag.warn('processCallerASA', `${e}`);
            } finally {
            }
          }
        }
      } else {
        diag.warn('processCallerASA', `Should not see SIP INFO with ASA body for the call <${call.webCallId}>`);
      }
    } else {
      diag.warn('processCallerASA', `No call found for call session Id <${event.sipId}>`);
    }
  }

  private processCallAnswered(event: CustomEvent) {
    let trace = `call Answered <${JSON.stringify(event.detail)}>`;
    diag.trace?.('processCallAnswered', trace);
    const data: InternalInterface.outgingCallAnsweredData = event.detail;
    const call = this.getCallBySipId(data.id);

    if (call) {
      if (data.trunkUci && data.cssId) {
        call.callHeader.trunkUniqueID = data.trunkUci;
      }
      if (data.connectedPotsSrv) {
        call.callHeader.potsSrvToConnect = data.connectedPotsSrv;
      }
      if (data.cssId) {
        call.callHeader.cSSID = data.cssId;
      }
      call.onSipCallAnswered();
    } else {
      trace = `No call found for Id <${data.id}>`;
      diag.warn?.('processCallAnswered', trace);
    }
  }

  private processLJOutoingCallEvent(event: CustomEvent) {
    diag.trace?.('processLJOutoingCallEvent', `L&J outgoing call ${event.detail}`);
    this.ljMonitoring.monPosSipCallId = event.detail.sessionId;
    this.ljMonitoring.monPosCallNodeId = event.detail.nodeId;
  }

  getLineByAddress(lineAddress: string) {
    return this.webLines.find((line) => line.lineCfgEx.address === lineAddress);
  }

  getLineByTrunkAddress(trunkAddress: string) {
    const lineAddress = trunkAddress.slice(trunkAddress.indexOf('-') + 1);

    return this.getLineByAddress(lineAddress);
  }

  getLineByWebCallId(webCallId: number) {
    const call = ActiveCalls.find(webCallId);

    return call ? call.webLine : null;
  }

  private getCallBySipId(sipId: string): WebCall | undefined {
    let call = ActiveCalls.findBySipId(sipId);

    return call;
  }

  //Return all calls that match the ucid
  getCallsByUcid(ucid: string): WebCall[] | undefined {
    let calls = ActiveCalls.getCallsByUCI(ucid);
    if (calls.length > 0) {
      return calls;
    } else {
      return undefined;
    }
  }

  async start() {
    diag.out('start', 'Starting Telephony WebLineDev');

/*    try {
      // To start VccClient using vccConnectionHandler
      const urlsInfo = {
        token: 'eyhbgci0IJid.eyJadWioIMMONll30.4pcPyModellPSYLLXnrXCJo4b',
        vccVersion: 'vcc-p911-v1',
        gwAddrList: webCfg.vccGwAddresses,
      };
      await vccConnectionHandler(this, urlsInfo);
      this.startState = ExtInterface.StartStat.VccClientStarted;
      diag.out('start', `VccClient started`);
    } catch (e) {
      diag.warn('start', `VccClient failed to create globally. VccConnectionHandler re-trying`);
    }
*/

/*
    if (this.appServerClient) {
      this.appServerClient.addEventListener('AppSvrGwLinkStatus', this.processAppSvrGwLinkStatus as EventListener);
      await this.appServerClient
        .initialize(webCfg.appSrvGwUrls, webCfg.positionCfg.id, webCfg.positionCfg.name, webCfg.positionCfg.dn)
        .then(async () => {
          diagASC.out('start', 'AppServerClient started');

          // Register ServerAppsClient callbacks
          this.appServerClient.addEventListener(
            'call_information_update',
            this.processCallInformationUpdate as EventListener
          );
          this.appServerClient.addEventListener('service_list_update', this.processServiceListUpdate as EventListener);
          this.appServerClient.addEventListener(
            'caller_disconnected_update',
            this.processCallerDisconnectedUpdate as EventListener
          );
        })
        .catch(async (e: string) => {
          diagASC.warn('start', 'Failed to initiate AppServerClient ' + e);
        });
    }
*/

    if (webCfg.positionCfg.ctiHardwareType != ExtInterface.CtiHardwareType.None) {
      this.webViperDriver = new WebViperDriver();
      this.tddManager = new TddManager(this);
      this.registerWebViperDriverListeners();

      await this.webViperDriver
        .initialize('ws://127.0.0.1:61911', webCfg.positionCfg.ctiCfg, webCfg.p911WebServerAddr)
        .then(async () => {
          diagWVD.out('start', 'WebViperDriver started');
        });
    }

    if (webCfg.positionCfg.itrrSupport) {
      diagITRR.out('start', 'ITRR support is activated');
      this.recorderManager = new RecorderManager(this);
    }

    /*  Start webPhone */
    let phoneCfg: WebPhoneCfg = {
      userId: webCfg.positionCfg.dn,
      username: webCfg.positionCfg.name,
      password: webCfg.positionCfg.dn,
      webRTCGWConfigData: webCfg.webRtcConfigData,
    };

    this.webPhone = new WebPhone(phoneCfg);

    if (this.webPhone) {
      await this.webPhone
        .register()
        .then(async () => {
          diag.out('start', 'Telephony WebPhone registered');
        })
        .catch(async (e: string) => {
          diag.warn('start', 'Failed to register WebPhone ' + e);
        });

      // handle WebPhone events
      this.webPhone.addEventListener('newIncCall', this.processCallIncoming as EventListener); // new incoming SIP calls
      this.webPhone.addEventListener('outCallAnswered', this.processCallAnswered as EventListener); //outgoing call answered
      this.webPhone.addEventListener('updCallStatus', this.processCallStatusUpdate as unknown as EventListener); // call status update
      this.webPhone.addEventListener('DigitRecivedNotification', this.processDTMFinfo as unknown as EventListener); // DTMF info notified by SIP INFO for silent Call
      this.webPhone.addEventListener(
        'AudibleAlertASASipNotification',
        this.processCallerASA as unknown as EventListener
      ); // Caller disconnect notified by SIP INFO

      this.webPhone.addEventListener('incMsrpMsg', this.processMsrpIncMessage as EventListener); // msrp incoming message event
      this.webPhone.addEventListener('incRttMsg', this.processRttIncMessage as EventListener); // rtt incoming message event
      this.webPhone.addEventListener('outRttMsg', this.processRttOutMessage as EventListener); // rtt outgoing message event
      this.webPhone.addEventListener('rttMediaStatusUpdate', this.processRttMediaStatusUpdate as EventListener); // rtt media status update event
      this.webPhone.addEventListener('incSubsNotifyMsg', this.processSubsNotifyMessage as EventListener); // Subscribe/Notify message event
      this.webPhone.addEventListener('LJOutoingCallEvent', this.processLJOutoingCallEvent as EventListener); // L&J outgoing call message event
      this.webPhone.addEventListener(
        'keepAliveStateUpd',
        this.ljMonitoring.processClientKeepAliveStateUpd as EventListener
      ); // Client network disconnect event
      this.webPhone.addEventListener(
        'subsTerminatedMsg',
        this.ljMonitoring.processSubsTerminatedMessageHandler as unknown as EventListener
      ); // Add subscribe terminated event

      // Listen and Join VCC Viper node Down/Up change
      this.addEventListener('ViperNodesStates', this.ljMonitoring.processNodeStateChange as EventListener);

      ActiveCalls.updateActiveCallsWithWebphone(this.webPhone); // To update initial call

      if (this.startState === ExtInterface.StartStat.VccClientStarted) {
        this.startState = ExtInterface.StartStat.Started;
        diag.out('start', 'Telephony started fully started');
      } else if (this.startState !== ExtInterface.StartStat.Started) {
        this.startState = ExtInterface.StartStat.WebPhoneStarted;
        diag.out('start', 'Telephony- WebPhone started Only');
      } else {
      }
    }

    this.report(new ExtInterface.TelephonyStartState('TelephonyStartState', this.startState));
  }

  async stop() {
    // TODO Terminate telephony sub-layer

/*
    if (this.appServerClient) {
      // Unregister ServerAppsClient callbacks
      this.appServerClient.removeEventListener(
        'call_information_update',
        this.processCallInformationUpdate as EventListener
      );
      this.appServerClient.removeEventListener('AppSvrGwLinkStatus', this.processAppSvrGwLinkStatus as EventListener);
      this.appServerClient.removeEventListener('service_list_update', this.processServiceListUpdate as EventListener);
      this.appServerClient.removeEventListener(
        'caller_disconnected_update',
        this.processCallerDisconnectedUpdate as EventListener
      );

      await this.appServerClient
        .terminate()
        .then(async () => {
          diagASC.out('stop', 'AppServerClient terminated');
        })
        .catch(async (e: string) => {
          diagASC.warn('stop', 'Failed to terminate AppServerClient ' + e);
        });
    }
*/

    if (this.webViperDriver) {
      this.unregisterWebViperDriverListeners();
      if (this.tddManager) this.tddManager.terminate();
      await this.webViperDriver
        .terminate()
        .then(async () => {
          diagWVD.out('stop', 'WebViperDriver terminated');
        })
        .catch(async (e: string) => {
          diagWVD.warn('stop', 'Failed to terminate WebViperDriver ' + e);
        });
    }

    if (this.recorderManager) {
      await this.recorderManager.terminate();
    }

    // stop MSRP and RTT clients
    this.webPhone.stopMsrpClients(this.webPhone.webPhoneCfg);
    this.webPhone.stopRttClients(this.webPhone.webPhoneCfg);

    // unregister client from webrtc-srv
    this.unRegister();

    // handle WebPhone events
    this.webPhone.removeEventListener('newIncCall', this.processCallIncoming as EventListener); // new incoming SIP calls
    this.webPhone.removeEventListener('outCallAnswered', this.processCallAnswered as EventListener); //outgoing call answered
    this.webPhone.removeEventListener('updCallStatus', this.processCallStatusUpdate as unknown as EventListener); // call status update
    this.webPhone.removeEventListener('DigitRecivedNotification', this.processDTMFinfo as unknown as EventListener); // call status update
    this.webPhone.removeEventListener('incMsrpMsg', this.processMsrpIncMessage as EventListener); // msrp incoming message event
    this.webPhone.removeEventListener('incRttMsg', this.processRttIncMessage as EventListener); // rtt incoming message event
    this.webPhone.removeEventListener('outRttMsg', this.processRttOutMessage as EventListener); // rtt outgoing message event
    this.webPhone.removeEventListener('rttMediaStatusUpdate', this.processRttMediaStatusUpdate as EventListener); // rtt media status update event
    this.webPhone.removeEventListener('incSubsNotifyMsg', this.processSubsNotifyMessage as EventListener); // Subscribe/Notify message event
    this.webPhone.removeEventListener('LJOutoingCallEvent', this.processLJOutoingCallEvent as EventListener); // L&J outgoing call message event
    this.webPhone.removeEventListener(
      'keepAliveStateUpd',
      this.ljMonitoring.processClientKeepAliveStateUpd as EventListener
    ); // SIP Client network keep alive event
    this.webPhone.removeEventListener(
      'subsTerminatedMsg',
      this.ljMonitoring.processSubsTerminatedMessageHandler as unknown as EventListener
    ); // Remove subscribe terminated event

    this.webPhone.removeEventListener(
      'AudibleAlertASASipNotification',
      this.processCallerASA as unknown as EventListener
    ); // Caller disconnect notified by SIP INFO

    // Listen and Join VCC Viper node Down/Up change
    this.removeEventListener('ViperNodesStates', this.ljMonitoring.processNodeStateChange as EventListener);

    this.startState = ExtInterface.StartStat.Stopped;
    this.report(new ExtInterface.TelephonyStartState('TelephonyStartState', this.startState));
  }

  setAgentLogin(newStatus: ExtInterface.LoggedStatus, reportEvent: boolean) {
    this.agentStatusREC.loginStatus = newStatus;
    let evt = new ExtInterface.AgentLoginChange('AgentLoginChange', {
      loginStatus: newStatus,
      loginId: this.agentStatusREC.loginId,
      loggedAtOtherDevice: this.agentStatusREC.loggedAtOtherDevice,
    });

    if (reportEvent) {
      this.report(evt);
    } else {
      return evt;
    }
    // Reset Agent Data
    if (newStatus === ExtInterface.LoggedStatus.LoggedIn) {
      this.agentStatusREC = new InternalInterface.AgentLoginStatus(null, null);
      this.agentStatusREC.loginStatus = newStatus;
    }
  }

  /* consolidation */
  agentLoginOnNode(webNode: WebNode, forIntialStatus: boolean) {
    let newAgentStatus = webNode.GetAgentLoginStatusRec();
    if (!newAgentStatus) return;
    diag.trace?.(
      'agentLoginOnNode',
      `Update for agent ${newAgentStatus.loginId}  ${newAgentStatus.loginStatus} from node ${webNode.nodeCfgEx.proxyName}`
    );

    // Try to find if any other node is already Logged On.  If so, do not report status to GUI.
    let loggedinNode = this.webNodes.find(
      (node) => node !== webNode && node.agentLoginStatus.loginStatus === ExtInterface.LoggedStatus.LoggedIn
    );
    if (newAgentStatus.loginStatus === ExtInterface.LoggedStatus.LoggedIn) {
      if (loggedinNode?.agentLoginStatus.loginStatus === ExtInterface.LoggedStatus.LoggedIn) {
        diag.trace?.(
          'agentLoginOnNode',
          `node ${loggedinNode.nodeCfgEx.proxyName} already logged in no needs to set global agent status`
        );
      } else {
        //  if no anyone else is logged on yet. Report Log on event
        this.agentStatusREC.loginId = newAgentStatus.loginId;
        diag.trace?.('agentLoginOnNode', `Set Global agent status to <LoggedIn>`);
        this.setAgentLogin(ExtInterface.LoggedStatus.LoggedIn, true); //report event
        //or return this.setAgentLogin('LoggedIn', false);  //return response
      }
    } else if (newAgentStatus.loginStatus === ExtInterface.LoggedStatus.LoggedOut) {
      if (forIntialStatus) {
        if (this.agentStatusREC.loginStatus === ExtInterface.LoggedStatus.LoggedIn) {
          const loginData = {
            agentId: this.agentId,
            device: this.device,
            password: '',
            firstName: this.agentStatusREC.firstName,
            middleName: this.agentStatusREC.middleName,
            lastName: this.agentStatusREC.lastName,
            psapName: this.agentStatusREC.pSAPName,
            psapId: this.agentStatusREC.pSAPId,
            role: this.agentStatusREC.role,
          };
          webNode.reSendAgentLogin(loginData);
        }
      }

      // check if any other node is logged on . if so, keep the global status 'LoggedIn'.
      // Please Note, all node must be looged off ot channge the global status to 'LoggedOut'
      if (loggedinNode?.agentLoginStatus.loginStatus === ExtInterface.LoggedStatus.LoggedIn) {
        // Not all nodes logged out
      } else {
        // all nodes loggedout
        diag.trace?.('agentLoginOnNode', `Set global agent status to <LoggedOut>`);
        this.setAgentLogin(ExtInterface.LoggedStatus.LoggedOut, true);
        // Or return this.setAgentLogin('LoggedOut', false);
      }
    }
  }

  async agentLogin(loginData: {
    agentId: string;
    device: string;
    password: string;
    firstName: string;
    middleName: string;
    lastName: string;
    psapName: string;
    psapId: string;
    role: string;
  }) {
    diag.trace?.('agentLogin', 'Enter...');
    this.agentStatusREC.firstName = loginData.firstName;
    this.agentStatusREC.middleName = loginData.middleName;
    this.agentStatusREC.lastName = loginData.lastName;
    this.agentStatusREC.pSAPName = loginData.psapName;
    this.agentStatusREC.pSAPId = loginData.psapId;
    this.agentStatusREC.role = loginData.role;
    this.agentStatusREC.loginId = loginData.agentId;

    // If an exception is caught, we will send the same exception to the caller if all nodes fail on agentlogon
    let allNodesFailed: Array<string> = [];

    if (
      this.startState === ExtInterface.StartStat.VccClientStarted ||
      this.startState === ExtInterface.StartStat.Started
    ) {
      for await (let webNode of this.webNodes) {
        try {
          await webNode.agentLogin(loginData);
          allNodesFailed.push('no');
        } catch (e: any) {
          if (e instanceof ExtInterface.AgentLogonException) {
            // re-throw: we want this exception to reach the application as soon as it is thrown.
            diag.warn(
              'agentLogin',
              `LineDev Exception while calling AgentLogOn on node: ${webNode.nodeCfgEx.proxyName}: Agent ${e.agentId} already logged on ${e.otherPosition}`
            );
            throw e;
          }
          diag.warn(
            'agentLogin',
            `LineDev Exception while calling AgentLogOn on node: ${webNode.nodeCfgEx.proxyName}: ${e}`
          );
          if (e instanceof ExtInterface.AgentAlreadyLogonLocally) {
            allNodesFailed.push('no');
          } else {
            allNodesFailed.push('yes');
          }
        }
      }

      const element = allNodesFailed.find((elem) => elem === 'no');
      if (element && element === 'no') {
        diag.trace?.('agentLogin', `LineDev calling AgentLogOn did NOT get global failure`);

/*
        //Proceed with login at the ServerAppClient Level
        if (this.appServerClient) {
          await this.appServerClient
            .login(
              loginData.agentId,
              loginData.firstName,
              loginData.middleName,
              loginData.lastName,
              loginData.role,
              loginData.psapId,
              loginData.psapName
            )
            .then(async () => {
              diagASC.trace?.('agentLogin', `AppServerClient logged in`);
              this.computeAgentState();
            })
            .catch(async (e: string) => {
              diagASC.warn('agentLogin', `AppServerClient login failure: ${e}`);
            });
          }
       */
        } else {
        this.report(
          new ExtInterface.GlobalLogInFailure('GlobalLogInFailure', loginData.agentId, ExtInterface.ErrorCode.Incapble)
        );
      }
    }
  }

  async agentLogout() {
    diag.trace?.('agentLogout', `Enter...`);
    if (this.startState) {
      for await (let webNode of this.webNodes) {
        try {
          await webNode.agentLogout();
        } catch (e) {}
      }

      await this.computeAgentState();


/*
      //Proceed with logoff at the ServerAppClient Level
      if (this.appServerClient) {
        await this.appServerClient
          .logoff()
          .then(async () => {
            diagASC.trace?.('agentLogout', `AppServerClient logged out`);
          })
          .catch(async (e: string) => {
            diagASC.trace?.('agentLogout', `AppServerClient login failure: ${e}`);
          });
      }
      */
    }
  }

  getAcdLoginState(): AcdLoginState {
    return this.acdLoginState;
  }

  setAcdLoginState(acdLoginState: AcdLoginState) {
    const oldState = this.acdLoginState;
    const newState = acdLoginState;

    this.acdLoginState = acdLoginState;

    this.report(new AcdLoginStateChangeEvent(oldState, newState));
  }

  async acdLogin(qlist: AcdQueueMembership[]) {
    diag.trace?.('acdLogin', `Enter...`);

    this.preferredAcdLoginState = {
      loginStatus: AcdLoginStatus.LoggedIn,
      ready: false,
      qlist,
    };

    this.storeProvidedQueueList = qlist;

    const results = await Promise.allSettled(
      this.webNodes.map((node) => node.acdLogin(this.agentId, this.device, qlist))
    );

    const acdLoginState = consolidateAcdLoginState(this.webNodes.map((node) => node.acdLoginState));
    const opStatus = consolidateAcdLoginOpStatus(
      results.map((r) => (r.status === 'fulfilled' ? r.value.status : AcdOpStatus.Error))
    );

    this.setAcdLoginState(acdLoginState);

    if (acdLoginState.loginStatus === AcdLoginStatus.LoggedIn /*&& this.appServerClient*/) {
/*
      this.appServerClient
        .reportAcdLogOn(acdLoginState.qlist.map((qmem) => `Q${qmem.queue}`).join(';'))
        .catch(async (e: string) => {
          diagASC.warn('acdLogin', `Failure to report AcdLogOn to AppServerClient: ${e}`);
        });
     */
      this.computeAgentState();
    }

    if (opStatus !== AcdOpStatus.Ok) {
      throw new Error(opStatus.toString());
    }
  }

  async acdLogout(reasonCode?: number, reasonDesc?: string) {
    diag.trace?.('acdLogout', `Enter...`);

    this.preferredAcdLoginState = {
      loginStatus: AcdLoginStatus.LoggedOut,
      ready: false,
      reasonCode,
      reasonDesc,
      qlist: [],
    };

    const results = await Promise.allSettled(
      this.webNodes.map((node) => node.acdLogout(this.agentId, this.device, reasonCode, reasonDesc))
    );

    const acdLoginState = consolidateAcdLoginState(this.webNodes.map((node) => node.acdLoginState));
    const opStatus = consolidateAcdLoginOpStatus(
      results.map((r) => (r.status === 'fulfilled' ? r.value.status : AcdOpStatus.Error))
    );

    const oldAcdLoginState = this.acdLoginState;
    this.setAcdLoginState(acdLoginState);

    if (acdLoginState.ready === false) {
      const offeredCalls = ActiveCalls.callsInStatesOf([CallState.Offered]);
      offeredCalls.forEach((c) => {
        if (c.webLine?.lineType === ExtInterface.LineType.LTACD) {
          c.reject();
        }
      });
    }

    if (acdLoginState.loginStatus === AcdLoginStatus.LoggedOut /*&& this.appServerClient*/) {
/*      await this.appServerClient
        .reportAcdLogOff(
          oldAcdLoginState.qlist.map((qmem) => `Q${qmem.queue}`).join(';'),
          reasonCode?.toString() || '',
          reasonDesc || ''
        )
        .catch(async (e: string) => {
          diagASC.warn('acdLogout', `Failure to report AcdLogOff to AppServerClient: ${e}`);
        });
        */
      this.computeAgentState();
    }

    if (opStatus !== AcdOpStatus.Ok) {
      if (acdLoginState.loginStatus === AcdLoginStatus.LoggedOut && opStatus === AcdOpStatus.NotExist) {
        // Rare situaion seen in single node that Voip probably cleaned up its ACD database prior to acdLogout request.
        // we could get 'NotExist' response to acdLogOut request. Take it as a logout success.
      } else {
        throw new Error(opStatus.toString());
      }
    }
  }

  async acdReady() {
    diag.trace?.('acdReady', `Enter...`);

    if (this.acdLoginState.loginStatus !== AcdLoginStatus.LoggedIn) {
      throw new Error(AcdOpStatus.AgentNotInQueue);
    }

    this.preferredAcdLoginState.ready = true;
    delete this.preferredAcdLoginState.reasonCode;
    delete this.preferredAcdLoginState.reasonDesc;

    const results = await Promise.allSettled(this.webNodes.map((node) => node.acdReady(this.agentId, this.device)));

    const acdLoginState = consolidateAcdLoginState(this.webNodes.map((node) => node.acdLoginState));
    const opStatus = consolidateAcdLoginOpStatus(
      results.map((r) => (r.status === 'fulfilled' ? r.value.status : AcdOpStatus.Error))
    );

    this.setAcdLoginState(acdLoginState);

    if (acdLoginState.ready === true /*&& this.appServerClient*/) {
/*      await this.appServerClient
        .reportAcdReady(acdLoginState.qlist.map((qmem) => `Q${qmem.queue}`).join(';'))
        .catch(async (e: string) => {
          diagASC.warn('acdReady', `Failure to report AcdReady to AppServerClient: ${e}`);
        });
        */
      this.computeAgentState();
    }

    if (opStatus !== AcdOpStatus.Ok) {
      throw new Error(opStatus.toString());
    }
  }

  async acdNotReady(reasonCode?: number, reasonDesc?: string) {
    diag.trace?.('acdNotReady', `Enter...`);

    if (this.acdLoginState.loginStatus !== AcdLoginStatus.LoggedIn) {
      throw new Error(AcdOpStatus.AgentNotInQueue);
    }

    this.preferredAcdLoginState.ready = false;
    this.preferredAcdLoginState.reasonCode = reasonCode;
    this.preferredAcdLoginState.reasonDesc = reasonDesc;

    const results = await Promise.allSettled(
      this.webNodes.map((node) => node.acdNotReady(this.agentId, this.device, reasonCode, reasonDesc))
    );

    const acdLoginState = consolidateAcdLoginState(this.webNodes.map((node) => node.acdLoginState));
    const opStatus = consolidateAcdLoginOpStatus(
      results.map((r) => (r.status === 'fulfilled' ? r.value.status : AcdOpStatus.Error))
    );

    this.setAcdLoginState(acdLoginState);

    if (acdLoginState.ready === false) {
      const offeredCalls = ActiveCalls.callsInStatesOf([CallState.Offered]);
      offeredCalls.forEach((c) => {
        if (c.webLine?.lineType === ExtInterface.LineType.LTACD) {
          c.reject();
        }
      });
    }

    if (acdLoginState.ready === false /*&& this.appServerClient*/) {
/*      await this.appServerClient
        .reportAcdNotReady(
          acdLoginState.qlist.map((qmem) => `Q${qmem.queue}`).join(';'),
          reasonCode?.toString() || '',
          reasonDesc || ''
        )
        .catch(async (e: string) => {
          diagASC.warn('acdNotReady', `Failure to report AcdNotReady to AppServerClient: ${e}`);
        });
        */
      this.computeAgentState();
    }

    if (opStatus !== AcdOpStatus.Ok) {
      throw new Error(opStatus.toString());
    }
  }

  async queueAcdLogOn(queue: string, agent?: string) {
    diag.trace?.('queueAcdLogOn', `Enter... this agentID : ${this.agentId} this device : ${this.device}`);

    if (!agent?.localeCompare(this.agentId)) {
      if (this.storeProvidedQueueList.length === 0) {
        diag.trace?.('queueAcdLogOn', 'No provided queueList: abort');
        throw new Error(AcdOpStatus.NoQueue);
      }

      if (!isDynamicQueue(this.storeProvidedQueueList, queue)) {
        diag.trace?.('queueAcdLogOn', `Queue ${queue} is not dynamic : abort`);
        throw new Error(AcdOpStatus.QueueNotDynamic);
      }

      if (this.acdLoginState.loginStatus !== AcdLoginStatus.LoggedIn) {
        diag.trace?.('queueAcdLogOn', 'Agent is not yet login on ACD queue');
        throw new Error(AcdOpStatus.AgentNotInQueue);
      }
    }
    const fcs = new ForceConnectSync(null, this, CallOp.QueueAcdLogOn);
    if (!fcs.getGoAhead()) {
      diag.trace?.('queueAcdLogOn', 'A Force connect operation has been initiated on call');
      throw new Error(AcdOpStatus.FcInitiatedOnDynamicQueue);
    }

    const results = await Promise.allSettled(
      this.webNodes.map((node) => node.queueAcdLogOn(queue, this.device, agent ? agent : this.agentId))
    );

/*
    if (this.appServerClient) {
      if (isDynamicOnQueue(this.storeProvidedQueueList, queue)) {
        await this.appServerClient
          .reportDynamicOnAcdLogOn(queue, agent ? agent : this.agentId)
          .catch(async (e: string) => {
            diagASC.warn('queueAcdLogOn', `Failure to report DynamicOnAcdLogOn to AppServerClient: ${e}`);
          });
      } else {
        await this.appServerClient
          .reportDynamicAcdLogOn(queue, agent ? agent : this.agentId)
          .catch(async (e: string) => {
            diagASC.warn('queueAcdLogOn', `Failure to report DynamicAcdLogOn to AppServerClient: ${e}`);
          });
      }
    }
    */

    if (!agent?.localeCompare(this.agentId)) {
      // Only expect response of queueAcdLogOn myself

      const acdLoginState = consolidateAcdLoginState(this.webNodes.map((node) => node.acdLoginState));

      const opStatus = consolidateAcdLoginOpStatus(
        results.map((r) => (r.status === 'fulfilled' ? r.value.status : AcdOpStatus.Error))
      );

      this.setAcdLoginState(acdLoginState);

      if (opStatus !== AcdOpStatus.Ok) {
        throw new Error(opStatus.toString());
      }
    }
  }

  async queueAcdLogOff(queue: string, agent?: string) {
    diag.trace?.('queueAcdLogOff', `Enter... this agentID : ${this.agentId} this device : ${this.device}`);

    if (!agent?.localeCompare(this.agentId)) {
      if (this.storeProvidedQueueList.length === 0) {
        diag.trace?.('queueAcdLogOff', 'No provided queueList: abort');
        throw new Error(AcdOpStatus.NoQueue);
      }

      if (!isDynamicQueue(this.storeProvidedQueueList, queue)) {
        diag.trace?.('queueAcdLogOff', `Queue ${queue} is not dynamic : abort`);
        throw new Error(AcdOpStatus.QueueNotDynamic);
      }

      if (this.acdLoginState.loginStatus !== AcdLoginStatus.LoggedIn) {
        diag.trace?.('queueAcdLogOff', 'Agent is not yet login on ACD queue');
        throw new Error(AcdOpStatus.AgentNotInQueue);
      }
    }
    const fcs = new ForceConnectSync(null, this, CallOp.QueueAcdLogOff);
    if (!fcs.getGoAhead()) {
      diag.trace?.('queueAcdLogOff', 'A Force connect operation has been initiated on call');
      throw new Error(AcdOpStatus.FcInitiatedOnDynamicQueue);
    }

    const results = await Promise.allSettled(
      this.webNodes.map((node) => node.queueAcdLogOff(queue, this.device, agent ? agent : this.agentId))
    );

/*
    if (this.appServerClient) {
      if (isDynamicOnQueue(this.storeProvidedQueueList, queue)) {
        await this.appServerClient
          .reportDynamicOnAcdLogOff(queue, agent ? agent : this.agentId)
          .catch(async (e: string) => {
            diagASC.warn('queueAcdLogOn', `Failure to report DynamicOnAcdLogOff to AppServerClient: ${e}`);
          });
      } else {
        await this.appServerClient
          .reportDynamicAcdLogOff(queue, agent ? agent : this.agentId)
          .catch(async (e: string) => {
            diagASC.warn('queueAcdLogOff', `Failure to report DynamicAcdLogOff to AppServerClient: ${e}`);
          });
      }
    }
    */

    if (!agent?.localeCompare(this.agentId)) {
      const acdLoginState = consolidateAcdLoginState(this.webNodes.map((node) => node.acdLoginState));

      const opStatus = consolidateAcdLoginOpStatus(
        results.map((r) => (r.status === 'fulfilled' ? r.value.status : AcdOpStatus.Error))
      );

      this.setAcdLoginState(acdLoginState);

      if (opStatus !== AcdOpStatus.Ok) {
        throw new Error(opStatus.toString());
      }
    }
  }

  async nextACDCall() {
    diag.trace?.('nextACDCall', `Enter...`);
    const fcs = new ForceConnectSync(null, this, CallOp.NextAcdCall);
    if (!fcs.getGoAhead()) {
      diag.trace?.('nextACDCall', 'A Force connect operation has been initiated on call');
      throw new Error(AcdOpStatus.FcInitiatedOnNextAcdCall);
    }

    await Promise.allSettled(this.webNodes.map((node) => node.nextACDCall(this.agentId, this.device)));
  }

  getRgLoginState(): RgLoginState {
    return this.rgLoginState;
  }

  setRgLoginState(rgLoginState: RgLoginState) {
    const oldState = this.rgLoginState;
    const newState = rgLoginState;

    this.rgLoginState = rgLoginState;

    this.report(new RgLoginStateChangeEvent(oldState, newState));
  }

  async rgLogin(rgList: string[]) {
    diag.trace?.('rgLogin', `Enter...`);

    this.preferredRgLoginState = { loginStatus: RgLoginStatus.LoggedIn, rgList };

    const results = await Promise.allSettled(
      this.webNodes.map((node) => node.rgLogin(this.agentId, this.device, rgList))
    );

    const rgLoginState = consolidateRgLoginState(this.webNodes.map((node) => node.rgLoginState));
    const opStatus = consolidateRgLoginOpStatus(
      results.map((r) => (r.status === 'fulfilled' ? r.value.status : RgOpStatus.Error))
    );

    this.setRgLoginState(rgLoginState);

/*
    if (rgLoginState.loginStatus === RgLoginStatus.LoggedIn && this.appServerClient) {
      await this.appServerClient
        .reportRingGroupLogOn(rgLoginState.rgList.map((rg) => `RG${rg.slice(1)}`).join(';'))
        .catch(async (e: string) => {
          diagASC.warn('rgLogin', `Failure to report RingGroupLogOn to AppServerClient: ${e}`);
        });
    }
    */

    if (opStatus !== RgOpStatus.Ok) {
      throw new Error(opStatus.toString());
    }
  }

  async rgLogout() {
    diag.trace?.('rgLogout', `Enter...`);

    this.preferredRgLoginState = { loginStatus: RgLoginStatus.LoggedOut, rgList: [] };

    const results = await Promise.allSettled(this.webNodes.map((node) => node.rgLogout(this.agentId, this.device)));

    const rgLoginState = consolidateRgLoginState(this.webNodes.map((node) => node.rgLoginState));
    const opStatus = consolidateRgLoginOpStatus(
      results.map((r) => (r.status === 'fulfilled' ? r.value.status : RgOpStatus.Error))
    );

    const oldRgLoginState = this.rgLoginState;
    this.setRgLoginState(rgLoginState);

/*
    if (rgLoginState.loginStatus === RgLoginStatus.LoggedOut && this.appServerClient) {
      await this.appServerClient
        .reportRingGroupLogOff(oldRgLoginState.rgList.map((rg) => `RG${rg.slice(1)}`).join(';'))
        .catch(async (e: string) => {
          diagASC.warn('rgLogout', `Failure to report RingGroupLogOff to AppServerClient: ${e}`);
        });
    }
    */

    if (opStatus !== RgOpStatus.Ok) {
      if (rgLoginState.loginStatus == RgLoginStatus.LoggedOut && opStatus === RgOpStatus.NotExist) {
        // Rare situaion seen that Voip probably cleaned up it RG database prior to rgLogout request.
        // we could get 'NotExist' response to rgLogOut request. Take it as a logout success.
      } else {
        throw new Error(opStatus.toString());
      }
    }
  }

  async register() {
    if (this.startState && this.webPhone) {
      const response = await this.webPhone
        .register() // {options}, timeout
        .catch(async (e) => {
          diag.warn('register', `${e}`);
          //throw e;
        });
    }
  }

  async unRegister() {
    if (this.startState && this.webPhone) {
      const response = await this.webPhone
        .unregister() // {options}, timeout
        .catch(async (e) => {
          diag.warn('unregister', `${e}`);
          //throw e;
        });
    }
  }

  // eslint-disable-next-line class-methods-use-this
  public async makeCall(
    dialingAddr: string,
    dialingPrefix: ExtInterface.DialingPrefix | null,
    subject: string,
    rttMediaEnable: boolean
  ): Promise<WebCall> {
    return new Promise<WebCall>(async (resolve, reject) => {
      diag.out(
        'makeCall',
        `Dialing <${dialingAddr}> ${dialingPrefix ? 'with prefix: ' + JSON.stringify(dialingPrefix) : ''}`
      );

      let parkedCall = ActiveCalls.findByParkDN(dialingAddr);
      if (parkedCall) {
        try {
          await parkedCall.unpark();

          diag.out(
            'makeCall',
            `success unpark <${dialingAddr}> ${dialingPrefix ? 'with prefix: ' + JSON.stringify(dialingPrefix) : ''}`
          );
          resolve(parkedCall);
          ActiveCalls.replace(parkedCall);
          return;
        } catch (e: any) {
          diag.warn('makeCall', `Failed to make unpark call: ${e}`);
          reject(e);
        }
      }

      let line = this.getFreeIntercomLine();
      if (line) {
        try {
          resolve(await line.makeCall(dialingAddr, dialingPrefix, subject, rttMediaEnable));
        } catch (e: any) {
          diag.warn('makeCall', `Failed to make call: ${e}`);
          reject(e);
        }
      } else {
        diag.err('makeCall', `No more free intercom lines`);
        reject(new Error('intercom lines unavailable'));
      }
    });
  }

  async acdConnectRequest(uci: string, acdAgent: string): Promise<string> {
    const agent = acdAgent || this.agentId;
    if (!uci) {
      diag.warn('acdConnectRequest', `uci: <${uci ? uci : 'no uci'}> ACDAgentID: <${agent}> feature not allowed`);
      throw 'Incapable';
    } else if (
      this.startState !== ExtInterface.StartStat.VccClientStarted &&
      this.startState !== ExtInterface.StartStat.Started
    ) {
      diag.warn('acdConnectRequest', `Telephony or VccClient not started yet. Acction not allowed`);
      throw 'Incapable';
    } else if (!this.getFreeLine(ExtInterface.LineType.LTACD, '', false, false)) {
      diag.warn('acdConnectRequest', `ACD line isn't idle.  Action not allowed`);
      throw 'Incapable';
    }
    diag.trace?.('acdConnectRequest', `Starting, UCI:<${uci}> ACDAgentID:<${agent}>`);
    let requests = [];
    for (const node of this.webNodes) {
      requests.push(node.acdConnectRequest(uci, agent));
    }
    try {
      await Promise.any(requests);
      return 'Success';
    } catch (e) {
      diag.warn('acdConnectRequest', `All failed ${e}`);
      throw 'Incapable';
    }
  }

  public async listenJoin(mode: ListenJoinMonitoringMode, posOrAgent: string) {
    return new Promise<ListenJoinResponses>(async (resolve, reject) => {
      if (CallOp.some((_obj, op) => op !== CallOp.Cancelled)) {
        diagLJ.warn('listenJoin', 'L&J unable to start or modify listenJoin. Call operation already in progress');
        return reject(ListenJoinResponses.Error_CallOperationAlreadyInProgress);
      }

      // Note: No capability for Listen/Join operation under a list of callstat below (Behavior complies with P911).
      const connectedStates: CallState[] = [
        CallState.Connected,
        CallState.Disconnected,
        CallState.Proceeding,
        CallState.Dialtone,
      ];
      const calls = ActiveCalls.callsInStatesOf(connectedStates);

      if (calls.length > 0) {
        diagLJ.warn(
          'listenJoin',
          `L&J unable to start or modify listenJoin. Existing calls in state that prevents Listen & Join operations`
        );

        diagLJ.trace?.(
          'listenJoin',
          `L&J calls preventing operation: ${JSON.stringify(
            calls.map((c) => {
              return [c.webCallId, c.state.toString()];
            })
          )}`
        );

        return reject(ListenJoinResponses.Error_ExistingCallInState);
      }

      const fcs = new ForceConnectSync(null, this, CallOp.ListenJoin);
      if (!fcs.getGoAhead()) {
        diagLJ.warn(
          'listenJoin',
          `A Force connect operation has been initiated on call <${fcs.getForceConnectCall()?.webCallId}>`
        );
        return reject(ListenJoinResponses.Error_ForceConnectOperationHasBeenInitiated);
      }

      const callOpObj = {};
      try {
        CallOp.start(callOpObj, CallOp.ListenJoin);

        await this.ljMonitoring
          .monitor(mode, posOrAgent)
          .then(async (successId: ListenJoinResponses) => {
            return resolve(successId);
          })
          .catch(async (errorId: ListenJoinResponses) => {
            return reject(errorId);
          });
      } finally {
        CallOp.end(callOpObj);
        ForceConnectSync.erase(fcs);
      }
    });
  }

  public async listenJoinCancel() {
    return new Promise<string>(async (resolve, reject) => {
      if (CallOp.some((_obj, op) => op !== CallOp.Cancelled)) {
        diagLJ.warn('listenJoinCancel', 'L&J unable to cancel. Call operation already in progress');
        return reject('L&J unable to cancel. Call operation already in progress');
      }

      const fcs = new ForceConnectSync(null, this, CallOp.ListenJoinCancel);
      if (!fcs.getGoAhead()) {
        diagLJ.warn(
          'listenJoinCancel',
          `A Force connect operation has been initiated on call <${fcs.getForceConnectCall()?.webCallId}>`
        );
        return reject(`A Force connect operation has been initiated on call <${fcs.getForceConnectCall()?.webCallId}>`);
      }

      const callOpObj = {};

      try {
        CallOp.start(callOpObj, CallOp.ListenJoinCancel);
        return await this.ljMonitoring
          .cancel()
          .then(async () => {
            return resolve('Success');
          })
          .catch(async () => {
            return resolve('Failed to Cancel');
          });
      } finally {
        CallOp.end(callOpObj);
        ForceConnectSync.erase(fcs);
      }
    });
  }

  processCallInformationUpdate(event: CustomEvent) {
    let body = event.detail;
    switch (body.version) {
      case '0.0.0.1':
      default:
        let ucid: string = body.ucid;
        let ani: string = body.ani;
        let aniDc: string = body.ani_dc;
        let ali: string = body.ali;
        let callerIdName: string = body.caller_id_name;
        let pidflo: string = body.pidflo;
        let additionalData: string = body.additional_data;
        let locationBy: string = body.location_by;
        let timeCount: number = parseInt(body.time_count);
        let lisErrorCode: string = body.lis_error_code;
        let lisErrorMessage: string = body.lis_error_message;
        let lisErrorData: string = body.lis_error_data;

        let decAli: DecodedAli = new DecodedAli();
        decAli.ali = ali;
        if (ali === undefined || ali === '') {
          diag.warn('processCallInformationUpdate', `ALI is empty`);
        } else {
          let canModifyAli: boolean = pidflo === undefined || pidflo === '' ? true : false;
          if (canModifyAli) {
            aliDecoder.modifyAli(decAli);
          }
        }

        if (ucid) {
          let calls = this.getCallsByUcid(ucid);
          if (calls && calls.length > 0) {
            calls.forEach((call) =>
              call.receiveCallInformation(
                ani,
                decAli,
                timeCount,
                aniDc,
                callerIdName,
                pidflo,
                additionalData,
                locationBy,
                lisErrorCode,
                lisErrorMessage,
                lisErrorData
              )
            );
          } else {
            diag.warn('processCallInformationUpdate', `No call found for received CallInformation`);
          }
        }

        break;
    }
  }

  processCallerDisconnectedUpdate(event: CustomEvent) {
    let body = event.detail;
    switch (body.version) {
      case '0.0.0.1':
      default:
        let ucid: string = body.ucid;
        let disconnected: boolean = body.disconnected;

        if (ucid) {
          let calls = this.getCallsByUcid(ucid);
          if (calls) {
            calls.forEach((call) => call.setCallerDisc(disconnected));
          }
        }
        break;
    }
  }

  processServiceListUpdate(event: CustomEvent) {
    let body = event.detail;
    switch (body.version) {
      case '0.0.0.1':
      default:
        let ucid: string = body.ucid;
        let urnServiceCounseling: string = body['urn:service:counseling'];
        let urnServiceCounselingChildren: string = body['urn:service:counseling.children'];
        let urnServiceCounselingMentalHealth: string = body['urn:service:counseling.mental-health'];
        let urnServiceCounselingSuicide: string = body['urn:service:counseling.suicide'];
        let urnServiceSos: string = body['urn:service:sos'];
        let urnServiceSosAmbulance: string = body['urn:service:sos.ambulance'];
        let urnServiceSosAnimalControl: string = body['urn:service:sos.animal-control'];
        let urnServiceSosFire: string = body['urn:service:sos.fire'];
        let urnServiceSosGas: string = body['urn:service:sos.gas'];
        let urnServiceSosMarine: string = body['urn:service:sos.marine'];
        let urnServiceSosMountain: string = body['urn:service:sos.mountain'];
        let urnServiceSosPhysician: string = body['urn:service:sos.physician'];
        let urnServiceSosPoison: string = body['urn:service:sos.poison'];
        let urnServiceSosPolice: string = body['urn:service:sos.police'];

        if (ucid !== undefined && ucid !== '') {
          let calls = this.getCallsByUcid(ucid);
          if (calls) {
            calls.forEach((call) =>
              call.receiveServiceList(
                urnServiceCounseling,
                urnServiceCounselingChildren,
                urnServiceCounselingMentalHealth,
                urnServiceCounselingSuicide,
                urnServiceSos,
                urnServiceSosAmbulance,
                urnServiceSosAnimalControl,
                urnServiceSosFire,
                urnServiceSosGas,
                urnServiceSosMarine,
                urnServiceSosMountain,
                urnServiceSosPhysician,
                urnServiceSosPoison,
                urnServiceSosPolice
              )
            );
          }
        }
        break;
    }
  }

  public async incrementConnectCount(call: WebCall | undefined) {
    // TODO Manage increment of connect call

    // NOTE: Please note 'call' is undefined for L&J

    this.connectCount++;

    if (this.connectCount === 1) {
      const evt = new ExtInterface.ConnectedStatus(true);
      this.report(evt);

      volumeController.applyVolume(VolumeControlFunction.Conversation, true);

/*
      if (call) {
        await this.appServerClient.positionConnect(
          getAppServerNode(call.webNode.getNodeId()),
          call.infoRec.uniqueCallId
        );
      }
*/

      if (this.webViperDriver) {
        if (call) {
          if (call.useZipToneFlag()) {
            diagWVD.trace?.('incrementConnectCount', `Incoming call "force connected": send zip tone`);
            await this.webViperDriver.zipToneEnable();
          }
          call.enableBeepInjection();
        }
        this.webViperDriver.offHook();
      }
    }
  }

  public async decrementConnectCount(call: WebCall | undefined) {
    // TODO Manage decrement of connect call

    // NOTE: Please note 'call' is undefined for L&J

    if (this.connectCount > 0) {
      this.connectCount--;

      if (this.connectCount === 0) {
        const evt = new ExtInterface.ConnectedStatus(false);
        this.report(evt);

        volumeController.applyVolume(VolumeControlFunction.Conversation, false);

/*
        if (call) {
          await this.appServerClient.positionDisconnect(
            getAppServerNode(call.webNode.getNodeId()),
            call.infoRec.uniqueCallId
          );
        }
*/

        if (this.webViperDriver) {
          if (call) call.disableBeepInjection();
          this.webViperDriver.onHook();
        }
      }
    }
  }

  async logAgentCallActivityToCDR(call: WebCall, onCall: boolean) {
    /*
    try {
      if (onCall) {
        await this.appServerClient.reportOnCall(
          call.infoRec.uniqueCallId,
          getAppServerNode(call.webNode.getNodeId()),
          call.infoRec.route,
          call.cfg.direction === ExtInterface.Direction.Incoming
        );
      } else {
        await this.appServerClient.reportOffCall(call.infoRec.uniqueCallId, getAppServerNode(call.webNode.getNodeId()));
      }
    } catch (e) {}
    */
  }

  async logTransferInformationToCDR(
    call: WebCall,
    key: string,
    short_value: string,
    long_value: string,
    agency_id: string,
    agency_name: string,
    agency_type_id: string,
    agency_type_name: string,
    transfer_failure: boolean
  ) {
/*
    try {
      await this.appServerClient.reportCallTransfer(
        getAppServerNode(call.webNode.getNodeId()),
        call.infoRec.uniqueCallId,
        key,
        short_value,
        long_value,
        agency_id,
        agency_name,
        agency_type_id,
        agency_type_name,
        transfer_failure
      );
    } catch (e) {}
*/
  }

  async requestInfo(call: WebCall) {
/*    return new Promise<void>(async (resolve, reject) => {
      if (call) {
        await this.appServerClient
          .retransmit(getAppServerNode(call.webNode.getNodeId()), call.infoRec.uniqueCallId)
          .then(() => {
            resolve();
          })
          .catch((error) => {
            reject(error);
          });
      }
    });
    */
  }

  private getAliType(aliResult: string): string {
    let aliType: string;
    switch (aliResult) {
      case 'Success':
        aliType = GoodAliTypes.GoodAliWithoutXY.toString(16).toUpperCase();
        break;
      case 'NotFound':
        aliType = GoodAliTypes.NoAliFound.toString(16).toUpperCase();
        break;
      default:
        aliType = GoodAliTypes.NoAliOtherReason.toString(16).toUpperCase();
        break;
    }
    return aliType;
  }

  public async requestAli(ani: string, reason: string = '', db_number: number = 0): Promise<ExtInterface.DbrResponse> {
    let result: ExtInterface.DbrResponse = {
      ani: ani,
      request_id: '',
      ali: '',
      aliTimeCount: 0n,
      pidflo: '',
    };

    let aliResult: string = '';
    if (ani) {
      /*
      await this.appServerClient
        .dbr_ex(ani, db_number, reason)
        .then((dbrResponse) => {
          result.request_id = dbrResponse.request_id;
          result.ali = dbrResponse.ali;
          result.pidflo = dbrResponse.pidflo;
          result.aliTimeCount = BigInt(dbrResponse.time_count);
          aliResult = dbrResponse.ali_result;
          diagASC.trace?.('requestAli', `ALI: ${dbrResponse.ali}`);
        })
        .catch((error: Error) => {
          diagASC.warn('requestAli', `Error: ${error.message}`);
          throw error;
        });
        */
    }

    if (result.ali.length > 0) {
      let decAli: DecodedAli = new DecodedAli();
      decAli.ali = result.ali;
      aliDecoder.decodeAli(decAli, true);
      result.ali = this.getAliType(aliResult) + decAli.ali;
    }

    return result;
  }

  public async cancelAliRequest() {
    /*
    try {
      this.appServerClient.cancelBlockingDbr();
    } catch (e) {}
    */
  }

  public async dbrReason(request_id: string, ani: string, reason: string) {
    /*
    try {
      await this.appServerClient.reportDbrReason(request_id, ani, reason);
    } catch (e) {}
    */
  }

  public async broadcastMsg(msg_destination: string, message: string, priority: string, incident_key: string) {
    /*
    try {
      await this.appServerClient.reportBroadcastMessage(msg_destination, message, priority, incident_key);
    } catch (e) {}
    */
  }

  public async reportAliError(uniqueCallId: string, error: boolean) {
    /*
    try {
      if (uniqueCallId) {
        let call = ActiveCalls.findBySipId(uniqueCallId);
        if (call) {
          await this.appServerClient.reportAliError(uniqueCallId, getAppServerNode(call.webNode.getNodeId()), error);
        } else {
          // Call no longer active; report on first interface available
          await this.appServerClient.reportAliError(uniqueCallId, getFirstAppServerNode(), error);
        }
      }
    } catch (e) {}
    */
  }

  async recallAbandonedCall(
    call: WebCall,
    abandonedCallUcid: string,
    dir: ExtInterface.Direction = ExtInterface.Direction.Outgoing
  ) {
/*    try {
      if (call) {
        await this.appServerClient.reportRecallAbandoned(
          call.infoRec.uniqueCallId,
          getAppServerNode(call.webNode.getNodeId()),
          abandonedCallUcid,
          dir
        );
      }
    } catch (e) {}
    */
  }

  public async abandonedCallDisposition(abandonedCallUcid: string, reason: string) {
    /*
    try {
      await this.appServerClient.reportAbandonedCallDisposition(abandonedCallUcid, reason);
    } catch (e) {}
    */
  }

  async hookFlashWithTci(call: WebCall): Promise<boolean> {
    let hookflashSuccessful = false;
    /*
    try {
      if (call) {
        let response: AppServerClientResponse = await this.appServerClient.hookflash(
          getAppServerNode(call.webNode.getNodeId()),
          call.infoRec.uniqueCallId
        );
        if (response.status === 'success') {
          hookflashSuccessful = true;
        }
      }
    } catch (e) {}
    */

    return hookflashSuccessful;
  }

  async dialWithTci(call: WebCall, number: string): Promise<boolean> {
    let dialSuccessful = false;
    /*
    try {
      if (call) {
        let response: AppServerClientResponse = await this.appServerClient.dial(
          getAppServerNode(call.webNode.getNodeId()),
          call.infoRec.uniqueCallId,
          number
        );
        if (response.status === 'success') {
          dialSuccessful = true;
        }
      }
    } catch (e) {}
    */

    return dialSuccessful;
  }

  private processAppSvrGwLinkStatus(event: ExtInterface.AppSvrGwLinkStatus) {
    if (event.status === ExtInterface.AppSvrGwLink.Down) {
      diag.out('processAppSvrGwLinkStatus', `AppSvrGw Link is DOWN`);
    } else if (event.status === ExtInterface.AppSvrGwLink.Up) {
      diag.out('processAppSvrGwLinkStatus', `AppSvrGw Link is UP`);
    }

    // Forward event to Application
    this.report(new ExtInterface.AppSvrGwLinkStatus(event.status));
  }

  private splitTaggedMsg(taggedMsg: string): { senderInfo: string; sequenceNumber: number; receivedText: string } {
    let tagMsg = taggedMsg; // taggedMsg looks like -> [[IndexNbr@Sender]]
    let senderInfo = '';
    let sequenceNumber = 0;
    let receivedText = '';

    var startPos = tagMsg.startsWith('[[');
    var atChar = tagMsg.indexOf('@');
    var endSender = tagMsg.indexOf(']]');
    if (tagMsg && startPos && atChar && endSender) {
      sequenceNumber = Number(tagMsg.substring(2, atChar));
      senderInfo = tagMsg.substring(atChar + 1, endSender);
      receivedText = tagMsg.substr(endSender + 2);
    } else {
      diag.trace?.('splitTaggedMsg', `MSRP Incoming tagged message(${tagMsg}) is misformatted or empty`);
    }
    return { senderInfo, sequenceNumber, receivedText };
  }

  private processMsrpIncMessage(event: CustomEvent) {
    diag.trace?.('processMsrpIncMessage', `Process incoming MSRP message`);

    const call = this.getCallBySipId(event.detail.sipCallID);
    if (call) {
      let taggedMsg = event.detail.taggedMsg;
      diag.trace?.('processMsrpIncMessage', `Found MSRP call(call.sipId).  Report message = taggedMsg`);
      let e = this.splitTaggedMsg(taggedMsg);

      this.report(new ExtInterface.MsrpMessageEvent(call, e.senderInfo, e.sequenceNumber, e.receivedText));

/*
      if (this.appServerClient) {
        if (e.senderInfo === 'CALLER' || e.senderInfo === 'TCC') {
          this.appServerClient.reportNonRtpMsg(
            getAppServerNode(call.webNode.getNodeId()),
            call.infoRec.uniqueCallId,
            e.receivedText,
            'incoming',
            'MSRP'
          );
        } else if (e.senderInfo == this.device) {
          this.appServerClient.reportNonRtpMsg(
            getAppServerNode(call.webNode.getNodeId()),
            call.infoRec.uniqueCallId,
            e.receivedText,
            'outgoing',
            'MSRP'
          );
        }
      }
    */
    } else {
      diag.warn('processMsrpIncMessage', `Failed finding call for incoming MSRP message`);
    }
  }

  private processRttIncMessage(event: CustomEvent) {
    diag.trace?.('processRttIncMessage', 'Process incoming RTT message');

    const call = this.getCallBySipId(event.detail.sipCallID);
    if (call) {
      let e = event.detail;
      diag.trace?.('processRttIncMessage', `Found RTT call(${call.sipId}).  INCOMING Report message = ${e.msg}`);
      this.report(
        new ExtInterface.RttMessageEvent(call, call.callHeader.phoneNumber /*e.senderInfo*/, e.sequenceNumber, e.msg)
      );
    } else diag.warn('processRttIncMessage', 'Failed finding call for incoming RTT message');
  }

  private processRttOutMessage(event: CustomEvent) {
    diag.trace?.('processRttOutMessage', 'Process outgoing RTT message');

    const call = this.getCallBySipId(event.detail.sipCallID);
    if (call) {
      let e = event.detail;
      diag.trace?.('processRttOutMessage', `Found RTT call(${call.sipId}).  OUTGOING Report message = ${e.msg}`);
      this.report(new ExtInterface.OutRttMessageEvent(call, e.senderInfo, e.sequenceNumber, e.msg));
    } else diag.warn('processRttOutMessage', 'Failed finding call for outgoing RTT message');
  }

  private processRttMediaStatusUpdate(event: CustomEvent) {
    diag.trace?.('processRttMediaStatusUpdate', 'Called');

    const call = this.getCallBySipId(event.detail.sipCallID);
    if (call) {
      let e = event.detail;
      diag.out('processRttMediaStatusUpdate', `Found RTT call(${call.sipId}).  Report status update = ${e.state}`);
      call.setRttMediaStatus(e.state);
    } else
      diag.warn(
        'processRttMediaStatusUpdate',
        `Failed finding call(${event.detail.sipCallID}) for reporting RTT status ${event.detail.state}`
      );
  }

  private processSubsNotifyMessage(event: CustomEvent) {
    const notifyInfo: INotifyInfos = event.detail;
    const subscribeEvent = notifyInfo.event;
    if (!notifyInfo.body) {
      diagLJ.out('processSubsNotifyMessage', `SIP initial notify for subscribe event=${subscribeEvent}`);
      return;
    }

    // This notify is coming fromm a L&J subscribe
    if (subscribeEvent === 'x-viper-monitor') {
      diagLJ.out(
        'processSubsNotifyMessage',
        `L&J new call monitoring notify:\n- event(${notifyInfo.event})\n- subscriptionState(${notifyInfo.subscriptionState})\n- body[${notifyInfo.body}]\n- status=(${notifyInfo.status})`
      );

      if (notifyInfo.subscriptionState === 'active') {
        for (let callOpValue of CallOp.get().values()) {
          diagLJ.out('processSubsNotifyMessage', `L&J current existing CallOp = ${callOpValue}`);
        }

        if (CallOp.some((_obj, op) => op !== CallOp.Cancelled && op !== CallOp.ListenJoin)) {
          diagLJ.warn('processSubsNotifyMessage', `L&J cannot connect listen join session. Call operation in progress`);
          return;
        }

        const fcs = new ForceConnectSync(null, this, CallOp.ListenJoinConnect);
        if (!fcs.getGoAhead()) {
          diagLJ.warn(
            'processSubsNotifyMessage',
            `A Force connect operation has been initiated on call <${fcs.getForceConnectCall()?.webCallId}>`
          );
          return;
        }

        const callOpObj = {}; // temp obj for CallOp blocking
        try {
          CallOp.start(callOpObj, CallOp.ListenJoinConnect);

          // Get XML infos
          const parser = new DOMParser();
          const xmlDoc = parser ? parser.parseFromString(notifyInfo.body, 'text/xml') : null;
          const chanspy = xmlDoc ? xmlDoc.getElementById('chanspy') : null;
          const nodeIp = chanspy ? chanspy.getElementsByTagName('node')[0] : null;
          const channel = chanspy ? chanspy.getElementsByTagName('ListenJoinChannel')[0] : null;
          const hangupSpyCall = chanspy ? chanspy.getElementsByTagName('HangupSpyCallFlag')[0] : null;
          const cancel = chanspy ? chanspy.getElementsByTagName('CancelFlag')[0] : null;

          // Send INVITE to proper VoIP to chanspy
          if (nodeIp?.textContent) {
            const webNode = this.webNodes.find((node) => node.nodeCfgEx.proxyAddress === nodeIp?.textContent);
            if (!webNode) {
              diagLJ.err(
                'processSubsNotifyMessage',
                `Failed getting nodeId from notify message nodeIp = ${nodeIp.textContent}`
              );
              return;
            }

            // prettier-ignore
            if (hangupSpyCall?.textContent === 'false' && cancel?.textContent === 'false' && channel?.textContent)
              this.ljMonitoring.connect(webNode, channel.textContent);
            else if (hangupSpyCall?.textContent === 'true')
              this.ljMonitoring.disconnect();
            else if (cancel?.textContent === 'true')
              this.ljMonitoring.cancel();
          }
        } finally {
          CallOp.end(callOpObj);
          ForceConnectSync.erase(fcs);
        }
      }
    }
    // This notify is for VM
    if (subscribeEvent === 'message-summary') {
      diagLJ.trace?.(
        'processSubsNotifyMessage',
        `VM new notify:\n- event(${notifyInfo.event})\n- subscriptionState(${notifyInfo.subscriptionState})\n- body[${notifyInfo.body}]\n- status=(${notifyInfo.status})`
      );
      if (notifyInfo.subscriptionState === 'active') {
        const callOpObj = {}; // temp obj for CallOp blocking
        try {
          CallOp.start(callOpObj, CallOp.VMSubscribe);

          const notifyDataArr = notifyInfo.body.split(/\r?\n/);
          const vmWaiting: any = notifyDataArr[0];
          const vmAccount: any = notifyDataArr[1];
          const vmMessages: any = notifyDataArr[2];

          let bvmWaiting: boolean = false;

          if (vmWaiting && vmWaiting.split(':').pop().split(';')[0].trim() === 'yes') {
            bvmWaiting = true;
          }
          const accountId: number = vmAccount.split(':').pop().split('@')[0].trim() || 0;
          const newMsgOldMsg: any = vmMessages.split(':').pop().split('(')[0].trim() || '0/0';
          const newMsgOldMsgArr = newMsgOldMsg.split('/');
          const nbNewMsg: number = newMsgOldMsgArr[0];
          const nbOldMsg: number = newMsgOldMsgArr[1];

          diagLJ.out(
            'processSubsNotifyMessage',
            `VM new update:\n- nbNewMessage(${nbNewMsg})\n- nbOldMsg(${nbOldMsg})\n- agenId(${accountId})\n- waiting (${bvmWaiting})`
          );

          // Report event to Application

          this.report(new ExtInterface.ExportVMNotifyEvent(accountId, nbNewMsg, nbOldMsg, bvmWaiting));
        } finally {
          CallOp.end(callOpObj);
        }
      }
    }
  }

  private registerWebViperDriverListeners() {
    if (this.webViperDriver) {
      this.webViperDriver.addEventListener(
        ExtInterface.CSSEventType.CtiHardwareUpdate,
        this.processCtiHardwareUpdate as EventListener
      );
      this.addEventListener('TddDetectEvent', this.processTddDetect as EventListener);
      this.webViperDriver.addEventListener('MuteChange', this.processMuteChange as EventListener);
      this.webViperDriver.addEventListener('HandsetDetectChange', this.processHandsetDetectChange as EventListener);
      this.webViperDriver.addEventListener('RadioTransmitMode', this.processRadioTransmitMode as EventListener);
      this.webViperDriver.addEventListener('RadioReceptionMode', this.processRadioReceptionMode as EventListener);
      this.webViperDriver.addEventListener('RadioModeChange', this.processRadioModeChange as EventListener);
      this.webViperDriver.addEventListener('AGCStatus', this.processAgcStatus as EventListener);
      this.webViperDriver.addEventListener('CallTakerAGCStatus', this.processCallTakerAgcStatus as EventListener);
      this.webViperDriver.addEventListener('CallTakerNRStatus', this.processCallTakerNrStatus as EventListener);
    }
  }

  private unregisterWebViperDriverListeners() {
    if (this.webViperDriver) {
      this.webViperDriver.removeEventListener(
        ExtInterface.CSSEventType.CtiHardwareUpdate,
        this.processCtiHardwareUpdate as EventListener
      );
      this.removeEventListener('TddDetectEvent', this.processTddDetect as EventListener);
      this.webViperDriver.removeEventListener('MuteChange', this.processMuteChange as EventListener);
      this.webViperDriver.removeEventListener('HandsetDetectChange', this.processHandsetDetectChange as EventListener);
      this.webViperDriver.removeEventListener('RadioTransmitMode', this.processRadioTransmitMode as EventListener);
      this.webViperDriver.removeEventListener('RadioReceptionMode', this.processRadioReceptionMode as EventListener);
      this.webViperDriver.removeEventListener('RadioModeChange', this.processRadioModeChange as EventListener);
      this.webViperDriver.removeEventListener('AGCStatus', this.processAgcStatus as EventListener);
      this.webViperDriver.removeEventListener('CallTakerAGCStatus', this.processCallTakerAgcStatus as EventListener);
      this.webViperDriver.removeEventListener('CallTakerNRStatus', this.processCallTakerNrStatus as EventListener);
    }
  }

  private processCtiHardwareUpdate(event: ExtInterface.CtiHardwareUpdate) {
    // TODO manage SIP registration on failure and reconnection
    if (event.status === ExtInterface.CtiHardwareStatus.Down) {
      diagWVD.trace?.('processCtiHardwareUpdate', `CtiHardwareStatus is DOWN`);
    } else if (event.status === ExtInterface.CtiHardwareStatus.Up) {
      diagWVD.trace?.('processCtiHardwareUpdate', `CtiHardwareStatus is UP`);
      progressToneManager.refreshToneGeneration();
    }

    // Forward event to Application
    this.report(new ExtInterface.CtiHardwareUpdate(event.status, event.hardwareType));
  }

  private processTddDetect(event: ExtInterface.TddDetectEvent) {
/*
    if (event.call && this.appServerClient) {
      this.appServerClient.detectTdd(getAppServerNode(event.call.webNode.getNodeId()), event.call.infoRec.uniqueCallId);
    }
    */
  }

  public tddAvailable(): boolean {
    return this.webViperDriver !== null;
  }

  public tddConnect(call: WebCall): void {
    if (this.tddManager) this.tddManager.tddConnect(call);
  }

  public tddDisconnect(call: WebCall): void {
    if (this.tddManager) this.tddManager.tddDisconnect(call);
  }

  public tddSend(msg: string): void {
    if (this.tddManager) this.tddManager.tddSend(msg);
  }

  public tddAbortTx(): void {
    if (this.tddManager) this.tddManager.tddAbortTx();
  }

  public tddAttachConversation(call: WebCall, conversation: string): void {
/*    if (call && this.appServerClient) {
      this.appServerClient.attachTdd(
        getAppServerNode(call.webNode.getNodeId()),
        call.infoRec.uniqueCallId,
        conversation
      );
    }
    */
  }

  public hcoEnable(): void {
    if (this.tddManager) this.tddManager.hcoEnable();
  }

  public hcoDisable(): void {
    if (this.tddManager) this.tddManager.hcoDisable();
  }

  public vcoEnable(): void {
    if (this.tddManager) this.tddManager.vcoEnable();
  }

  public vcoDisable(): void {
    if (this.tddManager) this.tddManager.vcoDisable();
  }

  public getHcoMode(): ExtInterface.HCOMode {
    if (this.tddManager) {
      return this.tddManager.getHcoMode();
    } else {
      return ExtInterface.HCOMode.HCOOff;
    }
  }

  public getVcoMode(): ExtInterface.VCOMode {
    if (this.tddManager) {
      return this.tddManager.getVcoMode();
    } else {
      return ExtInterface.VCOMode.VCOOff;
    }
  }

  public hcoAvailable(): boolean {
    return this.webViperDriver !== null;
  }

  public vcoAvailable(): boolean {
    return this.webViperDriver !== null;
  }

  public manualAliDump(rawAli: string): void {
    this.httpCadOut.manualAliDump(rawAli);
  }

  public handsetsAvailable(): boolean {
    return this.webViperDriver !== null;
  }

  public muteOn(handset: ExtInterface.HandsetType): void {
    if (this.webViperDriver && this.webViperDriver.status) {
      this.webViperDriver.muteHandset(handset, ExtInterface.MuteState.MuteOn);
    } else {
      diagWVD.warn('muteOn', `Handset interface is not up`);
    }
  }

  public muteOff(handset: ExtInterface.HandsetType): void {
    if (this.webViperDriver && this.webViperDriver.status) {
      this.webViperDriver.muteHandset(handset, ExtInterface.MuteState.MuteOff);
    } else {
    }
  }

  private processMuteChange(event: ExtInterface.MuteChange) {
    // Forward event to Application
    this.report(new ExtInterface.MuteChange(event.handset, event.state));
  }

  private processHandsetDetectChange(event: ExtInterface.HandsetDetectChange) {
    // Forward event to Application
    this.report(new ExtInterface.HandsetDetectChange(event.state));
  }

  public anyHandsetConnected(): ExtInterface.HandsetDetectType {
    let handsetConnected = ExtInterface.HandsetDetectType.NoneConnected;
    if (this.webViperDriver && this.webViperDriver.status) {
      handsetConnected = this.webViperDriver.anyHandsetConnected();
    } else {
      diagWVD.warn('anyHandsetConnected', `Handset interface is not up`);
    }
    return handsetConnected;
  }

  public radioAvailable(): boolean {
    return this.webViperDriver !== null;
  }

  public radioPttActivate(): void {
    if (this.webViperDriver && this.webViperDriver.status) {
      this.webViperDriver.pttHandset(ExtInterface.PttState.PttOn);
    } else {
      diagWVD.warn('radioPttActivate', `PTT interface is not up`);
    }
  }

  public radioPttDeactivate(): void {
    if (this.webViperDriver && this.webViperDriver.status) {
      this.webViperDriver.pttHandset(ExtInterface.PttState.PttOff);
    } else {
      diagWVD.warn('radioPttDeactivate', `PTT interface is not up`);
    }
  }

  public radioTransmitStatus(): ExtInterface.RadioStatus {
    if (this.webViperDriver && this.webViperDriver.status) {
      return this.webViperDriver.radioTransmitStatus();
    } else {
      diagWVD.warn('radioTransmitStatus', `Radio interface is not up`);
      return ExtInterface.RadioStatus.Disable;
    }
  }

  public radioReceptionStatus(): ExtInterface.RadioStatus {
    if (this.webViperDriver && this.webViperDriver.status) {
      return this.webViperDriver.radioReceptionStatus();
    } else {
      diagWVD.warn('radioReceptionStatus', `Radio interface is not up`);
      return ExtInterface.RadioStatus.Disable;
    }
  }

  public radioCombined(): boolean {
    if (this.webViperDriver && this.webViperDriver.status) {
      return this.webViperDriver.radioCombined();
    } else {
      diagWVD.warn('radioCombined', `Radio interface is not up`);
      return false;
    }
  }

  public radioSplit(): void {
    if (this.webViperDriver && this.webViperDriver.status) {
      if (webCfg.positionCfg.radioSplitCombineSupport) {
        this.webViperDriver.setRadioMode(ExtInterface.RadioMode.Split);
      } else {
        diagWVD.warn('radioSplit', `Radio mode does not support Radio Split`);
      }
    } else {
      diagWVD.warn('radioSplit', `Radio interface is not up`);
    }
  }

  public radioCombine(): void {
    if (this.webViperDriver && this.webViperDriver.status) {
      if (webCfg.positionCfg.radioSplitCombineSupport) {
        this.webViperDriver.setRadioMode(ExtInterface.RadioMode.Combine);
      } else {
        diagWVD.warn('radioCombine', `Radio mode does not support Radio Combine`);
      }
    } else {
      diagWVD.warn('radioCombine', `Radio interface is not up`);
    }
  }

  private processRadioTransmitMode(event: ExtInterface.RadioTransmitMode) {
    // Forward event to Application
    this.report(new ExtInterface.RadioTransmitMode(event.status));
  }

  private processRadioReceptionMode(event: ExtInterface.RadioReceptionMode) {
    // Forward event to Application
    this.report(new ExtInterface.RadioReceptionMode(event.status));
  }

  private processRadioModeChange(event: ExtInterface.RadioModeChange) {
    // Forward event to Application
    this.report(new ExtInterface.RadioModeChange(event.mode));
  }

  public agcAvailable(): boolean {
    return this.webViperDriver !== null;
  }

  public getAGCStatus(): ExtInterface.AGCState {
    if (this.webViperDriver && this.webViperDriver.status) {
      return this.webViperDriver.agcState();
    } else {
      diagWVD.warn('getAGCStatus', `AGC interface is not up`);
      return ExtInterface.AGCState.Disable;
    }
  }

  public agcEnable(): void {
    if (this.webViperDriver && this.webViperDriver.status) {
      return this.webViperDriver.setAgc(ExtInterface.AGCState.Enable);
    } else {
      diagWVD.warn('agcEnable', `AGC interface is not up`);
    }
  }

  public agcDisable(): void {
    if (this.webViperDriver && this.webViperDriver.status) {
      return this.webViperDriver.setAgc(ExtInterface.AGCState.Disable);
    } else {
      diagWVD.warn('agcDisable', `AGC interface is not up`);
    }
  }

  public callTakerAgcAvailable(): boolean {
    return this.webViperDriver
      ? this.webViperDriver.workstationType === ExtInterface.CtiHardwareType.PowerStationG3 ||
          this.webViperDriver.workstationType === ExtInterface.CtiHardwareType.SonicG3
      : false;
  }

  public getCallTakerAGCStatus(): ExtInterface.AGCState {
    if (this.webViperDriver && this.webViperDriver.status) {
      return this.webViperDriver.callTakerAgcState();
    } else {
      diagWVD.warn('getCallTakerAGCStatus', `CallTaker AGC interface is not up`);
      return ExtInterface.AGCState.Disable;
    }
  }

  private processAgcStatus(event: ExtInterface.AGCStatus) {
    // Forward event to Application
    this.report(new ExtInterface.AGCStatus(event.status));
  }

  public toCallTakerAgcEnable(): void {
    if (this.webViperDriver && this.webViperDriver.status) {
      return this.webViperDriver.setCallTakerAgc(ExtInterface.AGCState.Enable);
    } else {
      diagWVD.warn('toCallTakerAgcEnable', `CallTaker AGC interface is not up`);
    }
  }

  public toCallTakerAgcDisable(): void {
    if (this.webViperDriver && this.webViperDriver.status) {
      return this.webViperDriver.setCallTakerAgc(ExtInterface.AGCState.Disable);
    } else {
      diagWVD.warn('toCallTakerAgcDisable', `CallTaker AGC interface is not up`);
    }
  }

  private processCallTakerAgcStatus(event: ExtInterface.CallTakerAGCStatus) {
    // Forward event to Application
    this.report(new ExtInterface.CallTakerAGCStatus(event.status));
  }

  public callTakerNrAvailable(): boolean {
    return this.webViperDriver
      ? this.webViperDriver.workstationType === ExtInterface.CtiHardwareType.PowerStationG3 ||
          this.webViperDriver.workstationType === ExtInterface.CtiHardwareType.SonicG3
      : false;
  }

  public getCallTakerNoiseReductionStatus(): ExtInterface.NRState {
    if (this.webViperDriver && this.webViperDriver.status) {
      return this.webViperDriver.callTakerNrState();
    } else {
      diagWVD.warn('getCallTakerNoiseReductionStatus', `CallTaker NR interface is not up`);
      return ExtInterface.NRState.Disable;
    }
  }

  public toCallTakerNoiseReductionEnable(): void {
    if (this.webViperDriver && this.webViperDriver.status) {
      return this.webViperDriver.setCallTakerNr(ExtInterface.NRState.Enable);
    } else {
      diagWVD.warn('toCallTakerNoiseReductionEnable', `CallTaker NR interface is not up`);
    }
  }

  public toCallTakerNoiseReductionDisable(): void {
    if (this.webViperDriver && this.webViperDriver.status) {
      return this.webViperDriver.setCallTakerNr(ExtInterface.NRState.Disable);
    } else {
      diagWVD.warn('toCallTakerNoiseReductionDisable', `CallTaker NR interface is not up`);
    }
  }

  private processCallTakerNrStatus(event: ExtInterface.CallTakerNRStatus) {
    // Forward event to Application
    this.report(new ExtInterface.CallTakerNRStatus(event.status));
  }

  public beepInjection(enable: boolean) {
    if (this.webViperDriver && this.webViperDriver.status) {
      diagWVD.trace?.('beepInjection', `${enable ? 'Enable' : 'Disable'} Beep injection`);
      return this.webViperDriver.beepInjection(enable);
    } else {
      diagWVD.warn('beepInjection', `WebViperDriver interface is not up`);
    }
  }

  public getTrunkConfig(trunkAddress: string): LineConfig | undefined {
    if (trunkAddress.length === 0) {
      return undefined;
    } else {
      let webLine = this.getLineByAddress(trunkAddress);
      if (webLine !== undefined) {
        return webLine.lineCfgEx;
      } else {
        return this.getUnassignedLineConfig(trunkAddress);
      }
    }
  }

  private getUnassignedLineConfig(lineAddress: string): LineConfig | undefined {
    let lineConfig = this.unassignedLineConfig.get(lineAddress);

    if (lineConfig != undefined) {
      return lineConfig;
    } else {
      let lineConfig = getLineConfig(lineAddress);
      if (lineConfig != undefined) {
        this.unassignedLineConfig.set(lineAddress, lineConfig);
        return lineConfig;
      } else {
        return undefined;
      }
    }
  }

  public getDefaultVolume(fn: VolumeControlFunction, dest: VolumeControlDestination): number {
    return volumeController.getDefaultVolume(fn, dest);
  }

  public getCurrentVolume(fn: VolumeControlFunction, dest: VolumeControlDestination): number {
    return volumeController.getCurrentVolume(fn, dest);
  }

  public setVolume(fn: VolumeControlFunction, dest: VolumeControlDestination, v: number): void {
    volumeController.setVolume(fn, dest, v);
  }

  public addProgressTone(tone: ExtInterface.ProgressTone, call: WebCall): void {
    progressToneManager.addToneToGenerate(tone, call);
  }

  public stopToneInProgress(tone: ExtInterface.ProgressTone, call: WebCall): void {
    progressToneManager.stopToneGeneration(tone, call);
  }

  public generateProgressTone(tone: ExtInterface.ProgressTone): void {
    if (this.webViperDriver && this.webViperDriver.status) {
      diagWVD.trace?.('generateProgressTone', `Generate ${this.toneToText(tone)}`);
      return this.webViperDriver.generateProgressTone(tone);
    } else {
      diagWVD.warn('generateProgressTone', `WebViperDriver interface is not up`);
    }
  }

  public stopProgressTone(): void {
    if (this.webViperDriver && this.webViperDriver.status) {
      diagWVD.trace?.('stopProgressTone', `Stop progress tone generation`);
      return this.webViperDriver.stopProgressTone();
    } else {
      diagWVD.warn('stopProgressTone', `WebViperDriver interface is not up`);
    }
  }

  public toneToText(tone: ExtInterface.ProgressTone): string {
    switch (tone) {
      case ExtInterface.ProgressTone.BusyTone:
        return 'Busy Tone';
      case ExtInterface.ProgressTone.DialTone:
        return 'Dial Tone';
      case ExtInterface.ProgressTone.ReorderTone:
        return 'Reorder Tone';
      case ExtInterface.ProgressTone.RingbackTone:
        return 'Ringback Tone';
      default:
        return 'Unknown';
    }
  }

  public msrpAttachTranscript(call: WebCall, transcript: string): void {
/*
    if (call && this.appServerClient) {
      this.appServerClient.attachMsrp(
        getAppServerNode(call.webNode.getNodeId()),
        call.infoRec.uniqueCallId,
        transcript
      );
    }
    */
  }

  public enableSilentCall(call: WebCall) {
/*
    if (call && this.appServerClient) {
      this.appServerClient.enableDtmf(getAppServerNode(call.webNode.getNodeId()), call.infoRec.uniqueCallId);
    }
    */
  }

  public attachDtmfTranscript(call: WebCall, transcript: string): void {
/*
    if (call && this.appServerClient) {
      this.appServerClient.attachDtmf(
        getAppServerNode(call.webNode.getNodeId()),
        call.infoRec.uniqueCallId,
        transcript
      );
    }
    */
  }

  public rttDetect(call: WebCall) {
/*
    if (call && this.appServerClient) {
      this.appServerClient.detectRtt(getAppServerNode(call.webNode.getNodeId()), call.infoRec.uniqueCallId);
    }
    */
  }

  public rttAttachTranscript(call: WebCall, transcript: string): void {
    /*
    if (call && this.appServerClient) {
      this.appServerClient.attachRtt(getAppServerNode(call.webNode.getNodeId()), call.infoRec.uniqueCallId, transcript);
    }
    */
  }

  public async playGreeting(filename: string, local: boolean): Promise<string> {
    if (this.webViperDriver && this.webViperDriver.status) {
      this.webViperDriver.setGreetingDestination();
      return wavManager.playGreeting(filename, local);
    }

    return '';
  }

  public stopGreeting(handle: string): void {
    wavManager.stopGreeting(handle);
  }

  public startRecGreeting() {
    if (this.webViperDriver && this.webViperDriver.status) {
      this.webViperDriver.setRecordingSource(AudioPlay.eTelAudioRecording);
      this.webViperDriver.startGreetingRecording();
    }
    wavManager.startRecGreeting();
  }

  public stopRecGreeting() {
    if (this.webViperDriver && this.webViperDriver.status) {
      this.webViperDriver.stopGreetingRecording();
    }
    wavManager.stopRecGreeting();
  }

  public setPlaybackDestination() {
    if (this.webViperDriver && this.webViperDriver.status) {
      this.webViperDriver.setPlaybackDestination(this.playbackToCaller);
    }
  }

  public reportPlaybackPaused() {
    if (this.webViperDriver && this.webViperDriver.status) {
      this.webViperDriver.stopPlayback();
    }
  }

  public async setGreetingRecordingMode(value: boolean): Promise<boolean> {
    return wavManager.setGreetingRecordingMode(value);
  }

  public async beep(type: ExtInterface.BeepType): Promise<boolean> {
    if (this.webViperDriver && this.webViperDriver.status) {
      return await this.webViperDriver.beep(type);
    } else {
      diagWVD.warn('beep', `WebViperDriver interface is not up`);
      return false;
    }
  }

  public itrrInit(savedConvLifetime: number, convSubDir: string = '', exportSubDir: string = ''): boolean {
    diagITRR.trace?.('itrrInit', 'Starting ITRR initialisation');
    if (this.recorderManager) {
      this.recorderManager.init(savedConvLifetime, convSubDir, exportSubDir);
      diagITRR.trace?.('itrrInit', 'Successfully init ITRR');
      return true;
    } else {
      diagITRR.trace?.('itrrInit', 'Unable to init ITRR');
      return false;
    }
  }

  public itrrStatus(): ExtInterface.ItrrStatus {
    if (this.recorderManager?.itrrClient) {
      return this.recorderManager.itrrClient.status;
    } else {
      return ExtInterface.ItrrStatus.NotAvailable;
    }
  }

  public async itrrOpenContRec(): Promise<number | null> {
    if (this.recorderManager?.itrrClient) {
      return await this.recorderManager.itrrClient.openFile('', false);
    } else {
      return null;
    }
  }

  public async itrrOpenConversation(ctxId: number): Promise<number | null> {
    if (this.recorderManager) {
      return await this.recorderManager.itrrOpenSavedConv(ctxId);
    } else {
      return null;
    }
  }

  public async itrrOpenExportFile(fileName: string): Promise<number | null> {
    if (this.recorderManager) {
      return await this.recorderManager.itrrOpenExportFile(fileName);
    } else {
      return null;
    }
  }

  public async itrrCloseFile(fileIndex: number): Promise<boolean> {
    if (this.recorderManager?.itrrClient) {
      return await this.recorderManager.itrrClient.closeFile(fileIndex);
    } else {
      return false;
    }
  }

  public async itrrAdvise(
    fileIndex: number,
    channel: ExtInterface.ItrrChannelType,
    sinkFlags: number
  ): Promise<boolean> {
    if (this.recorderManager?.itrrClient) {
      return await this.recorderManager.itrrClient.advise(fileIndex, channel, sinkFlags);
    } else {
      return false;
    }
  }

  public async itrrUnadvise(fileIndex: number, channel: ExtInterface.ItrrChannelType): Promise<boolean> {
    if (this.recorderManager?.itrrClient) {
      return await this.recorderManager.itrrClient.unadvise(fileIndex, channel);
    } else {
      return false;
    }
  }

  public async itrrPlay(fileIndex: number, channel: ExtInterface.ItrrChannelType, playTime: Date): Promise<boolean> {
    if (this.recorderManager?.itrrClient) {
      if (this.webViperDriver && this.webViperDriver.status) {
        this.webViperDriver.startPlayback();
      }
      return await this.recorderManager.itrrClient.play(fileIndex, channel, playTime);
    } else {
      return false;
    }
  }

  public async itrrPlayStop(fileIndex: number, channel: ExtInterface.ItrrChannelType): Promise<boolean> {
    if (this.recorderManager?.itrrClient) {
      if (this.webViperDriver && this.webViperDriver.status) {
        this.webViperDriver.stopPlayback();
      }
      return await this.recorderManager.itrrClient.playStop(fileIndex, channel);
    } else {
      return false;
    }
  }

  public async itrrPlayPause(fileIndex: number, channel: ExtInterface.ItrrChannelType): Promise<boolean> {
    if (this.recorderManager?.itrrClient) {
      return await this.recorderManager.itrrClient.playPause(fileIndex, channel);
    } else {
      return false;
    }
  }

  public async itrrPlayResume(fileIndex: number, channel: ExtInterface.ItrrChannelType): Promise<boolean> {
    if (this.recorderManager?.itrrClient) {
      return await this.recorderManager.itrrClient.playResume(fileIndex, channel);
    } else {
      return false;
    }
  }

  public async itrrSeek(fileIndex: number, channel: ExtInterface.ItrrChannelType, seekTime: Date): Promise<boolean> {
    if (this.recorderManager?.itrrClient) {
      return await this.recorderManager.itrrClient.seek(fileIndex, channel, seekTime);
    } else {
      return false;
    }
  }

  public async itrrSetSpeed(fileIndex: number, channel: ExtInterface.ItrrChannelType, speed: number): Promise<boolean> {
    if (this.recorderManager?.itrrClient) {
      return await this.recorderManager.itrrClient.setSpeed(fileIndex, channel, speed);
    } else {
      return false;
    }
  }

  public async itrrGetSpeed(fileIndex: number, channel: ExtInterface.ItrrChannelType): Promise<number | null> {
    if (this.recorderManager?.itrrClient) {
      return await this.recorderManager.itrrClient.getSpeed(fileIndex, channel);
    } else {
      return null;
    }
  }

  public async itrrSetVolume(
    fileIndex: number,
    channel: ExtInterface.ItrrChannelType,
    volume: number
  ): Promise<boolean> {
    if (this.recorderManager?.itrrClient) {
      return await this.recorderManager.itrrClient.setVolume(fileIndex, channel, volume);
    } else {
      return false;
    }
  }

  public async itrrGetVolume(fileIndex: number, channel: ExtInterface.ItrrChannelType): Promise<number | null> {
    if (this.recorderManager?.itrrClient) {
      return await this.recorderManager.itrrClient.getVolume(fileIndex, channel);
    } else {
      return null;
    }
  }

  public async itrrSetSelection(
    fileIndex: number,
    channel: ExtInterface.ItrrChannelType,
    startTime: Date,
    endTime: Date,
    mode: ExtInterface.ItrrSelectionMode
  ): Promise<boolean> {
    if (this.recorderManager?.itrrClient) {
      return await this.recorderManager.itrrClient.setSelection(fileIndex, channel, startTime, endTime, mode);
    } else {
      return false;
    }
  }

  public async itrrExport(
    fileIndex: number,
    channel: ExtInterface.ItrrChannelType,
    filename: string,
    startTime: Date,
    endTime: Date
  ): Promise<boolean> {
    if (this.recorderManager) {
      return await this.recorderManager.export(fileIndex, channel, filename, startTime, endTime);
    } else {
      return false;
    }
  }

  public async itrrDelete(filename: string): Promise<boolean> {
    if (this.recorderManager) {
      return await this.recorderManager.delete(filename);
    } else {
      return false;
    }
  }

  public itrrConversationAvailable(contextId: number): { conversationAvailable: boolean; withinContRec: boolean } {
    if (this.recorderManager?.itrrClient) {
      return this.recorderManager.conversationAvailable(contextId);
    } else {
      return { conversationAvailable: false, withinContRec: false };
    }
  }

  public async itrrSave(contextId: number): Promise<boolean> {
    if (this.recorderManager) {
      return await this.recorderManager.save(contextId);
    } else {
      return false;
    }
  }

  public async itrrUnsave(contextId: number): Promise<boolean> {
    if (this.recorderManager) {
      return await this.recorderManager.unsave(contextId);
    } else {
      return false;
    }
  }

  public async itrrImportRecording(contextId: number): Promise<Blob | null> {
    if (this.recorderManager) {
      return await this.recorderManager.importRecording(contextId);
    } else {
      return null;
    }
  }

  public async itrrSaveRecording(recording: Blob, filename: string): Promise<boolean> {
    if (this.recorderManager) {
      return await this.recorderManager.saveRecording(recording, filename);
    } else {
      return false;
    }
  }

  public async itrrGetHostname(): Promise<string> {
    if (this.recorderManager?.itrrClient) {
      return await this.recorderManager.itrrClient.getHostname();
    } else {
      return '';
    }
  }

  public nenaQueueStateGetAll(): Promise<NenaQueueStateFull[]> {
    return this.nenaQueueStateManager.nenaQueueStateGetAll();
  }

  public nenaQueueStateGet(queueIdentifier: string): Promise<NenaQueueStateFull | undefined> {
    return this.nenaQueueStateManager.nenaQueueStateGet(queueIdentifier);
  }

  public nenaQueueStateSetOverride(
    queueIdentifier: string,
    overrideState: NenaQueueState,
    overrideReason: string
  ): Promise<void> {
    return this.nenaQueueStateManager.nenaQueueStateSetOverride(queueIdentifier, overrideState, overrideReason);
  }

  public nenaQueueStateClearOverride(queueIdentifier: string): Promise<void> {
    return this.nenaQueueStateManager.nenaQueueStateClearOverride(queueIdentifier);
  }

  public nenaServiceStateGetAll(): Promise<NenaServiceStateFull[]> {
    return this.nenaServiceStateManager.nenaServiceStateGetAll();
  }

  public nenaServiceStateGet(serviceIdentifier: string): Promise<NenaServiceStateFull | undefined> {
    return this.nenaServiceStateManager.nenaServiceStateGet(serviceIdentifier);
  }

  public nenaServiceStateSetOverride(
    serviceIdentifier: string,
    overrideState: NenaServiceState,
    overrideReason: string
  ): Promise<void> {
    return this.nenaServiceStateManager.nenaServiceStateSetOverride(serviceIdentifier, overrideState, overrideReason);
  }

  public nenaServiceStateClearOverride(serviceIdentifier: string): Promise<void> {
    return this.nenaServiceStateManager.nenaServiceStateClearOverride(serviceIdentifier);
  }

  public async subscribeDynamicACDStatus(queueList: string[]): Promise<Array<AgentQueueStatus>> {
    return subscribeDynamicACDStatus(this, queueList);
  }

  public async unSubscribeDynamicACDStatus(): Promise<void> {
    return unSubscribeDynamicACDStatus(this);
  }

  public async computeAgentState(): Promise<void> {
    let agentPrimaryState: string = 'NotAvailable';
    let agentSecondaryState: string = '';

    if (this.agentStatusREC.loginStatus === ExtInterface.LoggedStatus.LoggedIn) {
      agentPrimaryState = 'Available';
    }

    //Compute Secondary Agent State for Logging Service
    let onConnectedCall = false;
    let connectedUcid = '';

    // Check for active connected call
    const calls = ActiveCalls.get().filter((call) => CallState.connected(call.state));
    if (calls.length > 0) {
      onConnectedCall = true;

      const call = calls.find((c) => c.infoRec.uniqueCallId !== '');
      if (call) {
        connectedUcid = call.infoRec.uniqueCallId;
      }
    }

    if (onConnectedCall) {
      agentSecondaryState = 'Active';
    } else {
      // Check for IHold Call
      const calls = ActiveCalls.get().filter((call) => call.state === CallState.IHold);
      if (calls.length > 0) {
        agentSecondaryState = 'Hold';
      } else {
        // Check for ACD status and ready state
        if (this.acdLoginState.loginStatus !== AcdLoginStatus.LoggedIn) {
          agentSecondaryState = 'LoggedOut';
        } else {
          if (this.acdLoginState.ready) {
            agentSecondaryState = 'Waiting';
          } else {
            agentSecondaryState = 'Break';
          }
        }
      }
    }

    if (this.agentPrimaryState !== agentPrimaryState || this.agentSecondaryState !== agentSecondaryState) {
      // UCID empty means that the Active call has not been created on asterisk side, so this call is not in TS.
      // We need to wait till the state of this call changes to "Connected" to see if a UCID is present.
      // If yes we it means that a call has been created on asterisk and in TS, so we send this action to TS,
      // If not we do not report this action to TS, as TS will not associate this action to a call
      if (!(agentSecondaryState === 'Active' && connectedUcid === '')) {
        this.agentPrimaryState = agentPrimaryState;
        this.agentSecondaryState = agentSecondaryState;
        /*NOAPPSRVGW
        this.appServerClient.reportAgentState(agentPrimaryState, agentSecondaryState, connectedUcid);
        */
      }
    }
  }

  async addToCallCDR(call: WebCall, params: object) {
/*
    try {
      await this.appServerClient.reportToCallCDR(
        getAppServerNode(call.webNode.getNodeId()),
        call.infoRec.uniqueCallId,
        params
      );
    } catch (e) {}
    */
  }

  public async addToAgentCDR(params: object) {
/*NOAPPSRVGW
    if (params !== null && params !== undefined) {
      try {
        await this.appServerClient.reportToAgentCDR(params);
      } catch (e) {}
    } else {
      diag.warn('addToAgentCDR', 'Null or undefined params');
    }
    */
  }

  public async requestLvf(
    request_id: string,
    civic_address: string,
    service_uri: string,
    ucid: string
  ): Promise<ExtInterface.LvfResponse> {
    let result: ExtInterface.LvfResponse = {
      request_id: '',
      response: '',
    };

    /*
    let viper_node;
    if (ucid) {
      let call = ActiveCalls.findBySipId(ucid);
      if (call) {
        viper_node = getAppServerNode(call.webNode.getNodeId());
      }
    }

    await this.appServerClient
      .lvf_ex(request_id, civic_address, service_uri, ucid, viper_node)
      .then((lvfResponse) => {
        result.request_id = lvfResponse.request_id;
        result.response = lvfResponse.response;
        diagASC.trace?.('requestLvf', `request_id: ${lvfResponse.request_id}`);
      })
      .catch((error: Error) => {
        diagASC.warn('requestLvf', `Error: ${error.message}`);
        throw error;
      });
   */

    return result;
  }

  public async cancelLvf(request_id: string) {
    /*
    try {
      this.appServerClient.cancelLvf(request_id);
    } catch (e) {}
    */
  }
}

export default WebLineDev;
