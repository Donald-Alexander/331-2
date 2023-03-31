import { WebLineDev } from '../weblinedev/weblinedev';
import { WebLine } from '../webline/webline';
import { WebNode } from '../weblinedev/webnode';
import { WebPhone } from '../webphone/interfaces/webphone';
import { CallState, CongestionState } from './callState';
import {
  AutoRequestUpdate,
  Direction,
  Information,
  InformationUpdate,
  LineType,
  Service,
  ServiceUpdate,
  StateUpdate,
  UserData,
  Status,
  CallType,
  CallRingingStatus,
  LineTrunkType,
  CallPriority,
} from '../telephonyexternalinterfacedef';
import {
  CallRinging,
  DirectionCfg,
  HoldCurrConnectedFailure,
  OutCallAttemptFailure,
  MidCallDialingFailure,
  OutCallForbidden,
  FinishAudibleAlert,
} from '../telephonyinternalinterfacedef';
import { CallHeader } from '../telephonyutil';
import { DecodedAli, AliDecoderType, aliDecoder } from '../alidecoder/alidecoder';
import * as ExtInterface from '../telephonyexternalinterfacedef';
import { CallOp } from './callop';
import { ForceConnectSync } from '../weblinedev/forceconnect/forceconnect';
import { autoRebidRuleManager, AutoRebidRule } from '../autorebid/autorebid';
import { webCfg } from '../config/webcfg';
import { VccError } from '../vcc/VccError';
import { ConferenceConsultType, WebConference } from '../webconference/conferenceTypes';
import { conferenceCreateConsult, conferenceCreateCallPatch } from '../webconference/conferenceCreate';
import { prepareDialAddrs } from '../webconference/conferenceUtil';
import { ActiveCalls } from './activecalls';
import { Diag } from '../common/diagClient';
import { SipMsrp } from '../webphone/interfaces/sip-msrp';
import { SipRtt } from '../webphone/interfaces/sip-rtt';
import { CtxId } from '../common/ctxId';

const diag = new Diag('webcall');

const diagAni = new Diag('webcall.ani');

const diagAli = new Diag('webcall.ali');

const CANCELLED_DELAY_TIMEOUT = 1000;
const GENERIC_DIAL_FILTER = /^[#*-ABCD0-9]+$/;
const SPECIAL_DIAL_FILTER = /^[HJR,]+$/;
const GENERIC_DTMF_FILTER = /^[#*ABCD0-9]+$/;
const HOOT_N_HOLLER_ACCESS_CODE = '*9900';

// used to generate unique Id for each new call object
let webCallIdSeq = 0;

function nextWebCallId() {
  webCallIdSeq++;
  return webCallIdSeq;
}

function callPriorityToEnum(priority: string): CallPriority {
  let enumPriority: CallPriority;
  switch (priority) {
    case 'lowest':
      enumPriority = CallPriority.CPLowest;
      break;
    case 'low':
      enumPriority = CallPriority.CPLow;
      break;
    case 'belownormal':
      enumPriority = CallPriority.CPBelowNormal;
      break;
    case 'normal':
      enumPriority = CallPriority.CPNormal;
      break;
    case 'abovenormal':
      enumPriority = CallPriority.CPAboveNormal;
      break;
    case 'high':
      enumPriority = CallPriority.CPHigh;
      break;
    case 'highest':
      enumPriority = CallPriority.CPHighest;
      break;
    default:
      enumPriority = CallPriority.CPNormal;
      break;
  }
  return enumPriority;
}

enum SingleRebidState {
  DISABLE,
  ON_ONGOING,
  ON_RESTART,
}

class AutoRebidRuleEx extends AutoRebidRule {
  rebidOnPhase1: boolean;
  aliWirelessPhase1: boolean;
  rebidCount: number;
  rebidTimer: number;

  constructor(rule: AutoRebidRule) {
    super();
    this.repetitions = rule.repetitions;
    this.initialDelay = rule.initialDelay;
    this.subsequentDelay = rule.subsequentDelay;
    this.provider = rule.provider;
    this.classOfService = rule.classOfService;
    this.npaNxxStart = rule.npaNxxStart;
    this.npaNxxEnd = rule.npaNxxEnd;
    this.i3Pidflo = rule.i3Pidflo;
    this.rebidOnPhase1 = false;
    this.aliWirelessPhase1 = false;
    this.rebidCount = 0;
    this.rebidTimer = 0;
  }

  public compare(rule: AutoRebidRuleEx): boolean {
    return (
      this.repetitions === rule.repetitions &&
      this.initialDelay === rule.initialDelay &&
      this.subsequentDelay === rule.subsequentDelay &&
      this.provider === rule.provider &&
      this.classOfService === rule.classOfService &&
      this.npaNxxStart === rule.npaNxxStart &&
      this.npaNxxEnd === rule.npaNxxEnd &&
      this.i3Pidflo === rule.i3Pidflo &&
      this.rebidOnPhase1 === rule.rebidOnPhase1 &&
      this.aliWirelessPhase1 === rule.aliWirelessPhase1
    );
  }
}

export class DialError extends Error {
  hasAlternatePrefix: boolean;
  constructor(hasAlternatePrefix: boolean, errText: string) {
    super(errText);
    this.hasAlternatePrefix = hasAlternatePrefix;
  }
}

export class WebCall extends EventTarget {
  self: WebCall;
  webCallId: number;
  contextObjId: CtxId | null;
  confContextObjId: CtxId | null;
  webNode: WebNode;
  webLine: WebLine | null;
  webConf: WebConference | null = null;
  private lineDev: WebLineDev;
  private webPhone: WebPhone;
  cfg: DirectionCfg;
  initialState: CallState;
  infoRec: Information;
  service: Service;
  sipId?: string;
  callHeader: CallHeader;
  state: CallState;
  extra: UserData | null;
  callerDisconnected: boolean;
  geoprivMethod: string;
  serviceMobility: string;
  initialAli: boolean;
  activeRebidRule: AutoRebidRuleEx | undefined;
  forceSingleRebid: SingleRebidState;
  forceContinousRebid: boolean;
  hookFlashJustTokenized: boolean;
  firstDial: boolean;
  firstDialEver: boolean;
  isLongDistance: boolean;
  originalOutgoingNumber: string;
  cssId?: string;
  initialTddConnection: boolean;
  hasConnnectedToTdd: boolean;
  zipToneOnConnected: boolean;
  beepInjectionEnabled: boolean;
  toBeDropByDial: boolean;
  callType: CallType;
  parkDN: string;
  waitForAbandon: boolean;
  congestionState: CongestionState = CongestionState.NotCongested;
  audibleAlertToneStarted: boolean = false;
  ringbackOnProceeding = { needed: false, playing: false };
  interComCall?: boolean;
  dtmfInfo?: string;
  private hasReceived1stPhase1Ali = false;
  private dataTable: Map<any, any> = new Map();
  private msrpTranscript: string[];
  private msrpTextOwnership: string;
  private rttTranscript: string[];
  private rttLocalMsgs: { ts: Date; data: string }[];
  private rttRemoteMsgs: { ts: Date; data: string }[];
  rttEnabled: boolean;
  rttMediaStatus: ExtInterface.RttMediaStatus;
  private unsupervisedTransferBlocked: boolean = false;

  constructor(
    webLine: WebLine | null,
    webNode: WebNode,
    options?: {
      callHeader?: CallHeader;
      cfg?: DirectionCfg;
      initialState?: CallState;
      sipId?: string;
      uniqueCallId?: string; // call UCI
      initContextObjId?: CtxId;
    }
  ) {
    super();
    this.self = this;
    this.webCallId = nextWebCallId();
    this.contextObjId = null;
    this.confContextObjId = null;
    this.webNode = webNode;
    this.lineDev = webNode.lineDev;
    this.webPhone = webNode.lineDev.webPhone;
    this.webLine = webLine;
    this.cfg = (options && options.cfg) || new DirectionCfg(Direction.None);
    this.initialState = (options && options.initialState) || CallState.Unknown;
    this.sipId = options && options.sipId;
    this.callHeader = options?.callHeader || new CallHeader();
    this.infoRec = new Information();
    this.infoRec.uniqueCallId = (options && options.uniqueCallId) || '';
    this.infoRec.route = options?.callHeader?.route || '';
    this.infoRec.initRoute = options?.callHeader?.initialRoute || '';
    this.infoRec.trunkAddress = options?.callHeader?.trunkAddress || '';
    this.infoRec.m911CallOrigin = options?.callHeader?.m911CallOrigin || '';
    this.infoRec.subject = options?.callHeader?.subject || '';
    this.infoRec.referredBy = options?.callHeader?.referredBy || '';
    this.infoRec.callPriority = callPriorityToEnum(options?.callHeader?.callPriority || '');
    this.callType = this.callHeader.callType;
    this.parkDN = '';
    this.service = new Service();
    this.state = CallState.Idle;
    this.extra = null;
    this.callerDisconnected = false;
    this.geoprivMethod = '';
    this.serviceMobility = '';
    this.initialAli = true;
    this.activeRebidRule = undefined;
    this.forceSingleRebid = SingleRebidState.DISABLE;
    this.forceContinousRebid = false;
    this.hookFlashJustTokenized = false;
    this.firstDial = true;
    this.firstDialEver = true;
    this.isLongDistance = false;
    this.originalOutgoingNumber = '';
    this.initialTddConnection = true;
    this.hasConnnectedToTdd = false;
    this.zipToneOnConnected = false;
    this.beepInjectionEnabled = false;
    this.toBeDropByDial = false;
    this.resumeAutoRebid = this.resumeAutoRebid.bind(this);
    this.waitForAbandon = false;
    this.msrpTranscript = [];
    this.msrpTextOwnership = '';
    this.rttTranscript = [];
    this.rttLocalMsgs = [];
    this.rttRemoteMsgs = [];
    this.dtmfInfo = '';
    this.rttEnabled = this.callHeader.rttEnabled;
    this.rttMediaStatus = ExtInterface.RttMediaStatus.RttMediaNotConnected;

    // If a contextObjId was provided in constructor, assign it to the call
    if (options?.initContextObjId) {
      this.assignContextId(options.initContextObjId);
    }

    // Trim phone number from trunk component (phoneNumber format from header is 5141112222*911001)
    let phoneNumber: string = options?.callHeader?.phoneNumber || '';
    const starPos = phoneNumber.indexOf('*');
    if (starPos > -1) phoneNumber = phoneNumber.substr(0, starPos);

    // Set callingPartyId or callingPartyExt depending on length of phoneNumber
    if (phoneNumber.length <= this.lineDev.maxDNLenght) {
      this.infoRec.callingPartyExt = phoneNumber;
    } else {
      this.infoRec.callingPartyId = phoneNumber;
    }

    // Set ALIRequestKey to phone number
    this.infoRec.aliRequestKey = phoneNumber;

    // Set callingPartyName using displayName
    this.infoRec.callingPartyName = options?.callHeader?.callerName || '';

    // Set DNIS. If routing mode is DNIS, use that header
    if (options?.callHeader?.routingMode.includes('dnis')) {
      this.infoRec.dnis = options.callHeader.routingMode.substr(4);
    }
    // Otherwise use initialRoute but only if it starts with Q or RG
    else {
      let ir: string = options?.callHeader?.initialRoute || '';
      if (ir.substr(0, 1) === 'Q' || ir.substr(0, 2) === 'RG') {
        this.infoRec.dnis = ir;
      }
    }
  }

  setWebPhone(webPhone: WebPhone) {
    this.webPhone = webPhone;
  }

  getWebPhone() {
    return this.webPhone;
  }

  getCallHeader() {
    return this.callHeader;
  }

  getInitNHConfPosition() {
    return this.cssId?.includes(this.lineDev.device);
  }

  isOutgoing() {
    return this.cfg.direction === ExtInterface.Direction.Outgoing;
  }

  get callPriority() {
    return this.infoRec.callPriority;
  }

  get haveToProcessDigits() {
    return this.firstDial;
  }

  is911Call() {
    return /^(911)/.test(this.infoRec.trunkAddress.slice(this.infoRec.trunkAddress.indexOf('-') + 1));
  }

  isSIPCall() {
    return /^(SIP)/.test(this.infoRec.trunkAddress.slice(this.infoRec.trunkAddress.indexOf('-') + 1));
  }

  isTrunkCall() {
    return (
      !this.interComCall &&
      /^(911|ADM|AIM|SIP)/.test(this.infoRec.trunkAddress.slice(this.infoRec.trunkAddress.indexOf('-') + 1))
    );
  }

  isSharedlineCall() {
    return /^(911|ADM|AIM)/.test(this.infoRec.trunkAddress.slice(this.infoRec.trunkAddress.indexOf('-') + 1));
  }

  isInternodeCall() {
    return /^(SIP9)/.test(this.infoRec.trunkAddress.slice(this.infoRec.trunkAddress.indexOf('-') + 1));
  }

  isConsultationCall() {
    return this.callHeader.cSSID.includes('_CONF');
  }

  isPendingConsultationCall() {
    return this.isConsultationCall() && !this.isTrunkCall();
  }

  isHootNHollerCall() {
    return (
      this.infoRec.connectedPartyName.startsWith(HOOT_N_HOLLER_ACCESS_CODE) ||
      this.infoRec.connectedPartyId.startsWith(HOOT_N_HOLLER_ACCESS_CODE)
    );
  }

  isTextCall() {
    return this.callHeader.callType === CallType.Text;
  }

  isRttEnabled(): boolean {
    return this.rttEnabled;
  }

  isNextGenCall(): boolean {
    return this.callHeader.m911CallOrigin === 'NextGen' || this.webLine?.lineCfgEx.trunkType === LineTrunkType.LTTNG911;
  }

  isT1CasCall(): boolean {
    return this.callHeader.outsideBridge === 'INFO_M1K' || this.webLine?.lineCfgEx.trunkType === LineTrunkType.LTTCAS;
  }

  // This function is to check if RTT media connected event should be generated.
  // It expected to be called only if the call state is set to connected in order
  // for the RttMediaConnected event not to be generated too early.
  async checkRttConnected() {
    if (this.sipId) {
      diag.out('checkRttConnected', 'Verifying if RTT media is connected...');
      const rttIndex = this.webNode.nodeCfgEx.id;
      const rtt = this.webPhone.getRtt(rttIndex); // RTT Clients array index starts at 0
      if (rtt) {
        await (rtt as SipRtt)
          .checkMediaStatus(this.sipId)
          .then(async () => {
            diag.out('checkRttConnected', `${this.webLine?.lineType} line, checked RTT media status successfully`);
          })
          .catch(async (e: string) => {
            diag.warn('checkRttConnected', `err: ${e}`);
            //throw e;
          });
      }
    }
  }

  get audibleAlertTimeout() {
    if (this.isNextGenCall()) {
      return webCfg.systemConfig.audibleAlertTimeoutNG911;
    } else if (this.isT1CasCall()) {
      return webCfg.systemConfig.audibleAlertTimeoutT1CAS;
    }
    return 0;
  }

  getCSSID(suffix: string | undefined) {
    return `CSS${this.lineDev.device}@${this.webCallId}${suffix}`;
  }

  async answer() {
    const { remoteChannel, localChannel, phoneNumber } = this.callHeader;
    const { sipId } = this;

    if (CallOp.inProgress(this)) {
      diag.warn('answer', `call ${CallOp.inProgress(this)} already in progress for <${this.webCallId}>`);
      throw new ExtInterface.Incapable(`${CallOp.inProgress(this)} already in progress`);
    }

    if (!this.webLine) {
      throw new ExtInterface.Incapable(`Unable to answer call. Call not on a line`);
    }

    const fcs = new ForceConnectSync(this, this.lineDev, CallOp.Answer);
    if (!fcs.getGoAhead()) {
      diag.warn(
        'answer',
        `A Force connect operation has been initiated on call <${fcs.getForceConnectCall()?.webCallId}>`
      );
      throw new ExtInterface.Incapable(
        `A Force connect operation has been initiated on call <${fcs.getForceConnectCall()?.webCallId}>`
      );
    }

    try {
      if ((this.state !== CallState.Offered && this.state !== CallState.ReOffered) || !sipId) {
        diag.warn('answer', `sip call in ${this.state} is not available to answer.`);
        throw new ExtInterface.Incapable(`sip call in <${this.state}> state is not available to answer.`);
      }

      if (!remoteChannel || !localChannel) {
        diag.warn('answer', `missing remote and/or local channel names for <${this.webCallId}>`);
        throw new ExtInterface.Incapable(`missing remote and/or local channel names`);
      }

      try {
        CallOp.start(this, CallOp.Answer);
        /* Do holdCurrentConnected() first to hold existing connected call
         * Proceed to answer the call only if the holdCurrentConnected successful
         */
        await ActiveCalls.holdCurrentConnected();

        // Cancel any active Listen & Join session. Call control operartions take precedence
        await this.lineDev.ljMonitoring.cancel();

        // because of async operations above, we need to re-check the call state
        // @ts-ignore - TS not considering that state can change across async calls, so was reporting warning
        if (this.state === CallState.Busy) {
          // someone else answered
          diag.warn('answer', `sip call in <${this.state}> answered by other Pos while holding cur connected.`);
          throw new ExtInterface.LineLocked('answered by other Pos already');
        } else if ((this.state !== CallState.Offered && this.state !== CallState.ReOffered) || !sipId) {
          diag.warn('answer', `sip call in <${this.state}> is no longer available to answer.`);
          throw new ExtInterface.Incapable(`sip call in <${this.state}> state is no longer available to answer.`);
        }

        const nodeId = this.webNode.nodeCfgEx.id;
        if (!this.isTrunkCall()) {
          await this.webPhone.answer(sipId, nodeId);
          if (this.callHeader.baseTrunkChannel) {
            const sharedlineCall = ActiveCalls.findByRemoteChannel(this.callHeader.baseTrunkChannel);
            const consultConfParams = this.callHeader.consultConf.split(';');

            if (sharedlineCall && !sharedlineCall.callHeader.localChannel) {
              // the incoming call is related to an existing sharedline appearance call
              this.callHeader.phoneNumber = sharedlineCall.callHeader.phoneNumber;
              this.callHeader.trunkAddress = sharedlineCall.callHeader.trunkAddress;
              this.infoRec = { ...sharedlineCall.infoRec };
              // if the consultation call type is NoHold, replace the sharedline call with this one
              if (
                consultConfParams.includes('type=NoHold') ||
                (consultConfParams.includes('type=Normal') && !this.callHeader.cSSID)
              ) {
                const newLine = sharedlineCall.webLine;
                this.callHeader.remoteChannel = this.callHeader.baseTrunkChannel;
                this.cfg = { ...sharedlineCall.cfg };
                sharedlineCall.finishCall();
                this.changeLine(newLine);
              }
            } else if (this.callHeader.trunkAddress || this.callHeader.uiTrunkAddress) {
              // No sharedline appearance for the call, so it is private either because of ACD or a SIP trunk call
              // If it is a SIP trunk call, we move it to its SIP trunk line since this is a private line anyway
              const newLine = this.lineDev.getLineByTrunkAddress(
                this.callHeader.trunkAddress || this.callHeader.uiTrunkAddress
              );

              if (
                newLine?.lineType === LineType.LTSIP ||
                consultConfParams.includes('type=NoHold') ||
                (consultConfParams.includes('type=Normal') && !this.cssId)
              ) {
                this.infoRec.trunkAddress = this.callHeader.trunkAddress || this.callHeader.uiTrunkAddress;
                this.callHeader.remoteChannel = this.callHeader.baseTrunkChannel;
              }

              if (newLine?.lineType === LineType.LTSIP) {
                this.changeLine(newLine);
              }
            }
          }
        } else {
          // set up the callLink event waiter before we answer the webPhone call
/*
          const callLinkWaiter = this.webNode.callLinkWait(remoteChannel, localChannel, 3100).then(() => {});
          */

          // NOTE: There appears to be a bug in SIP.js 0.15.6 which causes webPhone.answer() to never resolve under race conditions.
          //       so, a timeout is added for the webPhone.answer() operation,
          //       and also check for the callLink event in case it was answered by another position while waiting for the timeout
          let answerTimerId: any;
          await Promise.race([
            this.webPhone.answer(sipId, nodeId),
            new Promise<void>((_res, reject) => {
              answerTimerId = setTimeout(reject, 3000, new ExtInterface.Incapable('webPhone call answer timeout'));
            }),
            /*callLinkWaiter,*/
          ]).finally(() => clearTimeout(answerTimerId));

          diag.out(
            'answer',
            `sip call <phoneNumber: ${phoneNumber}> <callid: ${sipId}> is answered. Wait for Vcc callLink event`
          );

          /*
          // wait for successful callLink event, unless call is terminated while waiting
          // add 500 ms to the callTerminated notifier in case there is a race condition with callLink
          let callTerminatedTimerId: any;
          await Promise.race([
            //callLinkWaiter,
            this.webPhone.callTerminated(sipId, nodeId).then(() => {
              return new Promise((_res, reject) => {
                callTerminatedTimerId = setTimeout(
                  reject,
                  500,
                  new ExtInterface.Incapable('call terminated during operation')
                );
              });
            }),
          ]).finally(() => clearTimeout(callTerminatedTimerId));
*/
          await this.webNode.callAnswer(remoteChannel, localChannel);

          if (this.webLine.lineType === LineType.LTIntercom) {
            // once answered, the trunk call needs to be moved from Intercom to the trunk line
            const newLine = this.lineDev.getLineByTrunkAddress(this.infoRec.trunkAddress);

            if (newLine?.status === Status.Idle) {
              this.changeLine(newLine);
            }
          }
        }

        // Call was answered succesfully, set connected ID
        const infoUpdate = new InformationUpdate(this);
        this.infoRec.connectedPartyId = this.infoRec.callingPartyId;
        infoUpdate.connectedPartyId = true;
        this.lineDev.report(infoUpdate);

        diag.trace?.(
          'answer',
          `${localChannel} answered ${remoteChannel} successfully. LineType <${this.webLine.lineType}>. `
        );

        this.setCallState(CallState.Connected);
      } catch (e) {
        diag.warn('answer', `${localChannel} failed to answer ${remoteChannel}, ${e}`);
        // for SaaS GUI
        if (e instanceof Error) {
          throw e;
        } else {
          throw new ExtInterface.Incapable(`${JSON.stringify(e)}`);
        }
      } finally {
        CallOp.end(this);
        this.checkRttConnected();
      }
    } finally {
      ForceConnectSync.erase(fcs);
      this.lineDev.resetForceConnectInProgress();
    }
  }

  async barge() {
    if (CallOp.inProgress(this)) {
      diag.warn('barge', `call ${CallOp.inProgress(this)} already in progress for <${this.webCallId}>`);
      throw new ExtInterface.Incapable(`call ${CallOp.inProgress(this)} already in progress`);
    }

    try {
      CallOp.start(this, CallOp.Barge);

      if (this.state !== CallState.Busy || this.sipId) {
        diag.warn('barge', `sip call in state<${this.state}> is not availabe for Barge`);
        throw new ExtInterface.Incapable(`sip call in state<${this.state}> is not availabe for Barge`);
      } else {
        let callTerminated = false;
        try {
          /* Do holdCurrentConnected() first to hold existing connected call
           * Proceed to barge the call only if the holdCurrentConnected successful
           */
          await ActiveCalls.holdCurrentConnected();

          // Cancel any active Listen & Join session. Call control operartions take precedence
          await this.lineDev.ljMonitoring.cancel();

          const nodeId = this.webNode.nodeCfgEx.id;
          const proxySrvAddr = this.webNode.nodeCfgEx.proxyAddress;
          const { sessionId, headers } = await this.webPhone.makeVccCall(
            `sip:CallConnect@${proxySrvAddr}:5060`,
            this.callType,
            nodeId,
            [`Call-Connect: op=barge;call=${this.callHeader.remoteChannel}`],
            this.rttEnabled
          );
          // we have a new session for this call. Update internal session state
          this.sipId = sessionId;
          diag.trace?.('barge', `Got a new sessionId <${this.sipId}> update to the webCall`);

          const xLocalChannel = headers['X-Localchannel'];
          if (xLocalChannel && xLocalChannel[0]) {
            this.callHeader.localChannel = (xLocalChannel[0] as { parsed?: any; raw: string }).raw;
          }

          // perform VCC barge operation
          const { localChannel, remoteChannel } = this.callHeader;

          await Promise.race([
            this.webNode.callBarge(remoteChannel, localChannel),
            this.webPhone.callTerminated(sessionId, nodeId).then(() => {
              callTerminated = true;
              return Promise.reject(new ExtInterface.Incapable('Sip call terminated'));
            }),
          ]);

          diag.out('barge', `(VCC) barge call (${remoteChannel}, ${localChannel})`);

          this.setCallState(CallState.Connected);
        } catch (e) {
          diag.warn('barge', `failed to barge call on ${this.state}. catch: ${e}`);
          // clean up the CallConnect SIP call if yet to terminate by Asterisk
          const nodeId = this.webNode.nodeCfgEx.id;
          if (!callTerminated && this.sipId) {
            this.webPhone.hangupCall(this.sipId, nodeId).catch(() => {
              diag.warn('barge', `failed to hangup CallConnect call after failed barge operation`);
            });
            /* this.sipId will be cleaned in processCallStatusUpdate ,
             *   which is the confirmation of call terminated from sip session.
             */
          }
          // for SaaS GUI
          if (e instanceof Error) {
            throw e;
          } else throw new ExtInterface.Incapable(`${JSON.stringify(e)}`);
        }
      }
    } finally {
      CallOp.end(this);
      this.checkRttConnected();
    }
  }

  async blindTransfer(destAddr: string, prefix: ExtInterface.DialingPrefix | null): Promise<void> {
    if (CallOp.inProgress(this)) {
      diag.warn('blindTransfer', `call ${CallOp.inProgress(this)} already in progress for <${this.webCallId}>`);
      return;
    }

    try {
      CallOp.start(this, CallOp.BlindTransfer);

      if (this.state !== CallState.Connected) {
        diag.warn('blindTransfer', `Cannot blind transfer call in state <${this.state}>`);
      } else if (this.webConf) {
        diag.warn('blindTransfer', `Cannot blind transfer call in conference`);
      } else if (this.isInternodeCall()) {
        diag.warn('blindTransfer', `Cannot blind transfer internode call`);
      } else if (this.isConsultationCall()) {
        diag.warn('blindTransfer', `Cannot blind transfer consultation call`);
      } else if (this.isHootNHollerCall()) {
        diag.warn('blindTransfer', `Cannot blind transfer Hoot n Holler call`);
      } else {
        const dialAddrs = prepareDialAddrs(this, destAddr, prefix);

        if (dialAddrs.length === 0) {
          diag.warn('blindTransfer', `Cannot blind transfer call. dial address empty`);
          throw new Error('dial address empty');
        } else if (dialAddrs.find((da) => da.tokens.length > 0 && da.tokens[0].startsWith(HOOT_N_HOLLER_ACCESS_CODE))) {
          diag.warn('blindTransfer', `Cannot blind transfer to Hoot n Holler destination`);
        } else {
          const { localChannel, remoteChannel } = this.callHeader;
          if (!this.cssId) {
            this.cssId = this.getCSSID('');
          }
          const satelliteSideId = ''; // TODO: get satelliteSideId param
          await this.webNode.callBlindTransfer(remoteChannel, localChannel, this.cssId, satelliteSideId, dialAddrs);
        }
      }
    } finally {
      CallOp.end(this);
    }
  }

  async connect() {
    try {
      if (this.state === CallState.Offered || this.state === CallState.ReOffered) {
        await this.answer();
      } else if (
        this.state === CallState.Busy &&
        this.webLine?.lineSharedType !== ExtInterface.LineSharedType.LSTPrivate
      ) {
        await this.barge();
      } else {
        diag.warn(
          'connect',
          `sip call in <${this.state}> is not availabe to connect (Line is ${this.webLine?.lineSharedType}).`
        );
        throw new ExtInterface.Incapable(
          `sip call in <${this.state}> is not availabe to connect (Line is ${this.webLine?.lineSharedType}).`
        );
      }
    } catch (e) {
      if (e instanceof Error) throw e;
      else throw new ExtInterface.Incapable(`${JSON.stringify(e)}`);
    }
  }

  async drop() {
    if (CallOp.inProgress(this) && this.state !== CallState.Dialtone) {
      diag.warn('drop', `call ${CallOp.inProgress(this)} already in progress for <${this.webCallId}>`);
      return;
    }

    try {
      CallOp.start(this, CallOp.Drop);
      if (this.state === CallState.Dialtone && this.webLine) this.webLine.cancelOutgoing = true;
      if (!CallState.connected(this.state) && this.state !== CallState.Finishing) {
        diag.warn('drop', `sip call in <${this.state}> state, is not alow to drop.`);
      } else if (!this.sipId) {
        diag.out('drop', `sip call in <${this.state}> state, clean up on no SIP call leg.`);

        if (this.state === CallState.Finishing || this.state === CallState.Disconnected) {
          (this.isNextGenCall() || this.isT1CasCall()) && this.dispatchEvent(new FinishAudibleAlert());
        }

        this.finishCall(true);
      } else if (this.state === CallState.Proceeding || this.state === CallState.Dialtone) {
        //clear waitforCallring timer, if the listener still there
        this.state === CallState.Dialtone &&
          this.dispatchEvent(
            new CallRinging({
              node: 0,
              cssid: '',
              uci: '',
              status: CallRingingStatus.RingingAbort,
            })
          );
        await this.cancel(this.sipId);
      } else if (!this.isTrunkCall()) {
        const nodeId = this.webNode.nodeCfgEx.id;
        await this.webPhone.hangupCall(this.sipId, nodeId);
        if (this.state === CallState.Disconnected) {
          (this.isNextGenCall() || this.isT1CasCall()) && this.dispatchEvent(new FinishAudibleAlert());
        }
        this.finishCall(true);
      } else {
        if (this.state === CallState.Finishing) {
          (this.isNextGenCall() || this.isT1CasCall()) && this.dispatchEvent(new FinishAudibleAlert());
        }
        try {
          const { localChannel, remoteChannel } = this.callHeader;
          const { status, meetmeOnHold } = {status: "Released", meetmeOnHold: false };//await this.webNode.callDrop(remoteChannel, localChannel);
          diag.trace?.('drop', `(VCC) dropped call (${remoteChannel}, ${localChannel}) successfully`);

          // TODO: we should be waiting for the call to hang up from the asterisk side

          if (this.sipId) {
            this.sipId = '';
            this.callHeader.localChannel = '';
          }
          if (
            status === 'Released' ||
            this.webLine?.lineType === LineType.LTIntercom ||
            this.webLine?.lineType === LineType.LTACD
          ) {
            if (meetmeOnHold) {
              this.setCallState(CallState.Hold);
            } else {
              this.finishCall(true);
            }
          } else if (status === 'Disconnected') {
            this.setCallState(meetmeOnHold ? CallState.Hold : CallState.Busy);
          } else if (status === 'Hold') {
            this.setCallState(CallState.Hold);
          } else {
            this.setCallState(CallState.Busy);
          }
        } catch (e) {
          // VCC operation error
          if (!this.sipId) {
            // Call terminated during VCC operation. Assume call is finished
            this.finishCall(true);
          }
          if (e instanceof VccError) {
            diag.warn('drop', `${e.err}`);
          }
          throw e;
        }
      }
    } finally {
      if (
        (this.state === CallState.Disconnected || this.state === CallState.Finishing) &&
        this.audibleAlertToneStarted
      ) {
        diag.out('drop', `Still in <${this.state}> state and audible alerting. Procceed to finish the call`);
        (this.isNextGenCall() || this.isT1CasCall()) && this.dispatchEvent(new FinishAudibleAlert());
      }
      CallOp.end(this);
    }
  }

  async cancel(sipId: string) {
    if (this.state !== CallState.Proceeding && this.state !== CallState.Dialtone) {
      diag.warn('cancel', `sip call in state <${this.state}> cannot be CANCEL.`);
    } else {
      const nodeId = this.webNode.nodeCfgEx.id;
      await this.lineDev.webPhone
        .cancel(sipId, nodeId)
        .then(async () => {
          diag.trace?.('cancel', `${this.webLine?.lineType} line, outgoing call <${sipId}> canceled successfully`);
        })
        .catch(async (e: string) => {
          diag.warn('cancel', `${e}`);
          throw e;
        });
      this.finishCall();
    }
  }

  async park() {
    if (CallOp.inProgress(this)) {
      diag.warn('park', `call ${CallOp.inProgress(this)} already in progress for <${this.webCallId}>`);
      return;
    }

    try {
      CallOp.start(this, CallOp.Park);

      if (this.state !== CallState.Connected || !this.sipId || this.webConf) {
        diag.warn('park', `sip call in state<${this.state}> is not availabe to park.`);
      } else {
        try {
          const { parkDN } = await this.webNode.callPark(this.callHeader.remoteChannel, this.callHeader.localChannel);
          diag.trace?.(
            'park',
            `(VCC) ${this.callHeader.localChannel} parked ${this.callHeader.remoteChannel} successfully at ${parkDN}`
          );
          this.parkDN = parkDN;
          this.setCallState(CallState.Park);
          this.changeLine(null);

          // Clear MSRP call messages history.  All call recorded messages are sent back during an unpark.
          this.clearMsrpTranscript();
        } catch (e) {
          if (e instanceof VccError) {
            diag.warn(
              'park',
              `(VCC) ${this.callHeader.localChannel} park ${this.callHeader.remoteChannel} failed: ${e.err}`
            );
            if (e.err === 'CallerHangup' || e.err === 'CallerNotFound') {
              this.finishCall();
            }
          }
          throw e;
        }
      }
    } finally {
      CallOp.end(this);
    }
  }

  async unpark() {
    if (CallOp.inProgress(this)) {
      diag.warn('unpark', `call ${CallOp.inProgress(this)} already in progress for <${this.webCallId}>`);
      return;
    }

    const fcs = new ForceConnectSync(this, this.lineDev, CallOp.Unpark);
    if (!fcs.getGoAhead()) {
      diag.warn(
        'unpark',
        `A Force connect operation has been initiated on call <${fcs.getForceConnectCall()?.webCallId}>`
      );
      return;
    }

    try {
      CallOp.start(this, CallOp.Unpark);

      if (this.state !== CallState.Park) {
        diag.warn('unpark', `sip call in state<${this.state}> is not availabe to un-park.`);
      } else {
        let callTerminated = false;

        try {
          /* Do holdCurrentConnected() first to hold existing connected call
           * Proceed to unPark the parked call only if the holdCurrentConnected successful
           */
          await ActiveCalls.holdCurrentConnected();

          // Cancel any active Listen & Join session. Call control operartions take precedence
          await this.lineDev.ljMonitoring.cancel();

          const nodeId = this.webNode.nodeCfgEx.id;
          const proxySrvAddr = this.webNode.nodeCfgEx.proxyAddress;
          const { sessionId, headers } = await this.webPhone.makeVccCall(
            `sip:CallConnect@${proxySrvAddr}:5060`,
            this.callType,
            nodeId,
            [`Call-Connect: op=unpark;call=${this.callHeader.remoteChannel};parkDN=${this.parkDN}`],
            this.rttEnabled
          );

          // we have a new session for this call. Update internal session state
          this.sipId = sessionId;

          const xLocalChannel = headers['X-Localchannel'];
          if (xLocalChannel && xLocalChannel[0]) {
            this.callHeader.localChannel = (xLocalChannel[0] as { parsed?: any; raw: string }).raw;
          }

          // perform VCC unpark operation
          const { localChannel, remoteChannel } = this.callHeader;

          this.webPhone.callTerminated(sessionId, nodeId).then(() => {
            callTerminated = true;
          });

          await this.webNode.callUnpark(remoteChannel, localChannel);

          diag.trace?.('unpark', `${localChannel} un-Park ${remoteChannel} successfully`);

          this.parkDN = '';

          // once answered, the trunk call needs to be moved to the trunk line
          if (!this.webLine) {
            let newLine = this.lineDev.getLineByTrunkAddress(this.infoRec.trunkAddress);

            if (!newLine || (newLine.status !== Status.Idle && newLine.lineType !== LineType.LTSIP)) {
              newLine = this.lineDev.getFreeIntercomLine();
            }

            this.changeLine(newLine || null);
          }

          this.setCallState(CallState.Connected);
        } catch (e) {
          diag.warn('unpark', `failed to un-park call <${this.state}>`);
          if (e instanceof HoldCurrConnectedFailure) {
            throw new Error(e.message);
          }

          if (e instanceof VccError) {
            if (e.err === 'CallerHangup' || e.err === 'CallerNotFound' || (e.err === 'Timeout' && callTerminated)) {
              this.finishCall();
            }
          } else if (callTerminated) {
            this.finishCall();
          }

          // clean up the CallConnect SIP call
          if (!callTerminated && this.sipId) {
            const nodeId = this.webNode.nodeCfgEx.id;
            this.webPhone.hangupCall(this.sipId, nodeId).catch(() => {
              diag.warn('unpark', `failed to hangup CallConnect call after failed unpark operation`);
            });
          }
        }
      }
    } finally {
      CallOp.end(this);
      this.checkRttConnected();
      ForceConnectSync.erase(fcs);
    }
  }

  async reject() {
    if (CallOp.inProgress(this)) {
      diag.warn('reject', `call ${CallOp.inProgress(this)} already in progress for <${this.webCallId}>`);
      return;
    }

    try {
      CallOp.start(this, CallOp.Reject);

      if (this.state !== CallState.Offered || !this.sipId) {
        diag.warn('reject', `sip call in state<${this.state}> is not availabe to reject.`);
      } else {
        const nodeId = this.webNode.nodeCfgEx.id;
        await this.webPhone
          .reject(this.sipId, nodeId)
          .then(async () => {
            diag.trace?.('reject', `${this.webLine?.lineType} line,call ${this.sipId} is rejected successfully`);
          })
          .catch(async (e: string) => {
            diag.warn('reject', `${e}`);
            throw e;
          });
        this.finishCall();
      }
    } finally {
      CallOp.end(this);
    }
  }

  async hold(options?: {
    confHold?: boolean;
    connectedLineType?: string;
    lastDialedRoute?: string;
    exclusive?: boolean;
  }) {
    if (CallOp.inProgress(this)) {
      diag.warn('hold', `call ${CallOp.inProgress(this)} already in progress for <${this.webCallId}>`);
      return;
    }

    /* PWR-11713/PWEB-1886: If asked to do exclusive hold, check if the call is in a conference, and if so, if there is at least one
       other position connected to the call.  If there is, refuse the exclusive hold attempt. */
    if (options?.exclusive) {
      if (this.webConf) {
        let nbPos: number = this.webConf.participantsMap.size;
        if (nbPos > 1) {
          diag.warn('hold', `Block exclusive hold since there are ${nbPos} participants inside the conference`);
          throw new ExtInterface.ExclusiveHoldUnholdFailure('Incapable');
        }
      }
    }

    try {
      CallOp.start(this, CallOp.Hold);

      if (!this.webLine) {
        throw new Error('Unable to hold call. Call not on a line');
      }
      if (this.state !== CallState.Connected || !this.sipId) {
        diag.warn('hold', `sip call in state<${this.state}> is not availabe to hold.`);
      } else if (!this.isTrunkCall() || this.isSIPCall()) {
        const { localChannel, remoteChannel } = this.callHeader;
        const nodeId = this.webNode.nodeCfgEx.id;
        await this.webPhone
          .hold(this.sipId, nodeId)
          .then(async () => {
            diag.trace?.('hold', `${this.webLine?.lineType} line, ${localChannel} held ${remoteChannel} successfully`);
            this.setCallState(CallState.IHold);
          })
          .catch(async (e: string) => {
            diag.warn('hold', `err: ${e}`);
            throw e;
          });
      } else {
        const { localChannel, remoteChannel } = this.callHeader;
        const { holdOp } = await this.webNode.callHold(remoteChannel, localChannel, options);

        diag.trace?.('hold', `(VCC) ${localChannel} holds ${remoteChannel} successfully`);

        /* this.sipId will be cleaned in processCallStatusUpdate ,
         *   which is the confirmation of call terminated from sip session.
         */

        switch (holdOp) {
          case 'Hold':
          case 'ForcedHold':
            this.setCallState(CallState.IHold);
            break;
          case 'Disconnect':
            if (this.webConf) {
              if (this.webNode.isMMHoldKeepAlive()) {
                /* flag Allow Hold State on Shared Call enabled */
                this.setCallState(CallState.IHold);
              } else {
                /* flag Allow Hold State on Shared Call disabled */
                if (this.getInitNHConfPosition() && this.isOutgoing()) {
                  this.setCallState(this.sipId !== '' ? CallState.IHold : CallState.Busy);
                } else {
                  this.setCallState(this.getInitNHConfPosition() ? CallState.IHold : CallState.Busy);
                }
              }
            } else {
              this.setCallState(CallState.Busy);
            }
            break;
          default:
            break;
        }
      }
    } finally {
      CallOp.end(this);
    }
  }

  async unhold() {
    if (CallOp.inProgress(this)) {
      diag.warn('unhold', `call ${CallOp.inProgress(this)} already in progress for <${this.webCallId}>`);
      throw new ExtInterface.Incapable(`call ${CallOp.inProgress(this)} already in progress for <${this.webCallId}`);
    }

    try {
      CallOp.start(this, CallOp.Unhold);

      if (!this.webLine) {
        throw new ExtInterface.Incapable('Unable to unhold call. Call not on a line');
      }
      const nodeId = this.webNode.nodeCfgEx.id;

      if (this.state === CallState.Hold || this.state === CallState.IHold) {
        /* Do holdCurrentConnected() first to hold existing connected call
         * Proceed to unHold the Hold call only if the holdCurrentConnected successful
         */
        await ActiveCalls.holdCurrentConnected();

        // Cancel any active Listen & Join session. Call control operartions take precedence
        await this.lineDev.ljMonitoring.cancel();

        if (!this.isTrunkCall() || this.isSIPCall()) {
          if (!this.sipId) {
            diag.trace?.('unhold', `sip call <${this.webCallId}> in state <${this.state}> is not available to un-hold`);
          } else {
            await this.webPhone
              .unhold(this.sipId, nodeId)
              .then(async () => {
                diag.trace?.(
                  'unhold',
                  `sip call <${this.webCallId}> lc <${this.callHeader.localChannel}> unhold rc <${this.callHeader.remoteChannel}> successfully`
                );
                this.setCallState(CallState.Connected);
              })
              .catch(async (e: string) => {
                diag.warn('unhold', `${e}`);
                throw new ExtInterface.Incapable(e);
              });
          }
        } else {
          let callTerminated = false;
          let unholdCallSipId = '';

          try {
            const { proxyAddress } = this.webNode.nodeCfgEx;
            const { sessionId, headers } = await this.webPhone.makeVccCall(
              `sip:CallConnect@${proxyAddress}:5060`,
              this.callType,
              nodeId,
              [`Call-Connect: op=unhold;call=${this.callHeader.remoteChannel}`],
              this.rttEnabled
            );

            // we have a new SIP session for this call. Update internal session state
            unholdCallSipId = sessionId;
            this.sipId = sessionId;

            this.webPhone.callTerminated(sessionId, nodeId).then(() => {
              callTerminated = true;
            });

            const xLocalChannel = headers['X-Localchannel'];
            if (xLocalChannel && xLocalChannel[0]) {
              this.callHeader.localChannel = (xLocalChannel[0] as { parsed?: any; raw: string }).raw;
            }

            // perform VCC unhold operation
            const { localChannel, remoteChannel } = this.callHeader;
            await this.webNode.callUnhold(remoteChannel, localChannel);

            diag.trace?.(
              'unhold',
              `sip call <${this.webCallId}> lc <${localChannel}> unhold rc <${remoteChannel}> successfully`
            );

            this.setCallState(CallState.Connected);
          } catch (e) {
            diag.warn('unhold', `failed to un-hold webCall <${this.webCallId}>. <${e}>`);
            // clean up the CallConnect SIP call
            // wait a bit first to give time for normal cleanup
            setTimeout(() => {
              if (!callTerminated && this.sipId && this.sipId === unholdCallSipId) {
                this.webPhone.hangupCall(this.sipId, nodeId).catch(() => {
                  diag.warn('unhold', `failed to hangup CallConnect call after failed unhold operation`);
                });
              }
            }, 250);

            throw e;
          }
        }
      } else {
        diag.trace?.('unhold', `sip call <${this.webCallId}> in state <${this.state}> is not available to un-hold`);

        throw new ExtInterface.Incapable(
          `sip call <${this.webCallId}> in state <${this.state}> is not available to un-hold`
        );
      }
    } catch (e) {
      diag.warn('unhold', `failed to un-hold, caught: ${e}`);
      if (e instanceof Error) throw e;
      else throw new ExtInterface.Incapable(`${JSON.stringify(e)}`);
    } finally {
      CallOp.end(this);
      this.checkRttConnected();
    }
  }

  async takeTextOwnership() {
    let trace: string;
    const uci = this.infoRec.uniqueCallId;
    const requester = this.lineDev.device;
    if (!uci || !requester) {
      trace = `Missing UCI on the webCall with id ${this.webNode}. Unable to start takeTextOwnership`;
      diag.warn('takeTextOwnership', trace);
      throw new Error(trace);
    } else {
      try {
        await this.webNode.takeMSRPTextOwnership(uci, requester);
        diag.trace?.('takeTextOwnership', `requested`);
      } catch (e) {
        diag.warn('takeTextOwnership', JSON.stringify(e));
        throw e;
      }
    }
  }

  async msrpSend(message: string) {
    if (CallOp.inProgress(this)) {
      diag.warn('msrpSend', `call ${CallOp.inProgress(this)} already in progress for <${this.webCallId}>`);
      return;
    }

    try {
      CallOp.start(this, CallOp.Msrp);
      if (!this.webLine) {
        throw new Error('Unable to send msrp. Call not on a line');
      }

      if (this.state !== CallState.Connected || !this.sipId) {
        diag.warn('msrpSend', `sip call in state<${this.state}}> cannot send MSRP message.`);
        /** PWEB-1056: enable ACD and Intercom line type for MSRP
         * Add support ACD and Intercom lines for MSRP text
         * This fix now use line type testing but using call type will be an option later. */
      } else if (
        this.webLine.lineType === LineType.LTSIP ||
        this.webLine.lineType === LineType.LTACD ||
        this.webLine.lineType === LineType.LTIntercom
      ) {
        const msrpIndex = this.webNode.nodeCfgEx.id;
        const msrp = this.webPhone.getMsrp(msrpIndex); // MSRP Clients array index starts at 0
        if (!msrp) {
          diag.warn('msrpSend', `sip call has no MSRP object defined.  Cannot send MSRP message`);
        }

        // @ts-ignore
        await (msrp as SipMsrp)
          .sendMessage(this.sipId, message)
          .then(async () => {
            diag.trace?.('msrpSend', `${this.webLine?.lineType} line, send MSRP message successfully`);
          })
          .catch(async (e: string) => {
            diag.warn('msrpSend', `err: ${e}`);
            throw e;
          });
      } else {
        const { localChannel, remoteChannel } = this.callHeader;
        diag.trace?.(
          'msrpSend',
          `${localChannel} msrp ${remoteChannel} Cannot send message on current line type ${this.webLine.lineType}`
        );
      }
    } finally {
      CallOp.end(this);
    }
  }

  async rttSend(message: string) {
    /*if (CallOp.inProgress(this)) {
      console.warn(
        `${this.constructor.name}.${this.rttSend.name}, call ${CallOp.inProgress(this)} already in progress for <${
          this.webCallId
        }>`
      );
      return;
    }*/

    try {
      /*CallOp.start(this, CallOp.Rtt);*/
      if (!this.webLine) {
        throw new Error('Unable to send rtt. Call not on a line');
      }

      if (this.rttMediaStatus !== ExtInterface.RttMediaStatus.RttMediaConnected || !this.sipId) {
        diag.warn('rttSend', `Sip call RTT media in state<${this.rttMediaStatus}> cannot send RTT message.`);
      } else {
        const rttIndex = this.webNode.nodeCfgEx.id;
        const rtt = this.webPhone.getRtt(rttIndex); // RTT Clients array index starts at 0
        if (!rtt) {
          diag.warn('rttSend', 'sip call has no RTT object defined.  Cannot send RTT message');
        }

        // @ts-ignore
        await (rtt as SipRtt)
          .sendMessage(this.sipId, message)
          .then(async () => {
            diag.trace?.('rttSend', `${this.webLine?.lineType} line, send RTT message successfully`);
          })
          .catch(async (e: string) => {
            diag.warn('rttSend', `err: ${e}`);
            throw e;
          });
      }
    } finally {
      /*CallOp.end(this);*/
    }
  }

  async uriTandemTransfer(addr: string, cancel: boolean = false) {
    return new Promise<void>(async (resolve, reject) => {
      // Use SIP refer.
      let referTo: string;
      let trace: string;
      const nodeId = this.webNode.nodeCfgEx.id;

      if (addr.startsWith('sip:')) {
        referTo = addr;
      } else {
        referTo = 'sip:' + addr;
      }

      if (cancel) {
        referTo += ';method=BYE';
      }

      await this.webPhone
        .tandemTransfer({
          id: this.sipId ? this.sipId : '',
          referTo,
          extraHeaders: ['Vcc-Refer: op=tandemtransfer;referto=uri'],
          nodeId,
        })
        .then((res) => {
          if (res) {
            trace = `call <${this.webCallId}> Tandem Transfer <${referTo}> on trunk <${this.infoRec.trunkAddress}>`;
            diag.out('uriTandemTransfer', trace);
            resolve();
          } else {
            trace = `call <${this.webCallId}> Tandem Transfer <${referTo}> on trunk <${this.infoRec.trunkAddress} failed`;
            diag.out('uriTandemTransfer', trace);
            reject();
          }
        })
        .catch((e: string) => {
          trace = `call <${this.webCallId}> Tandem Transfer exception failure <${e}>`;
          diag.warn('uriTandemTransfer', trace);
          reject(e);
        });
    });
  }

  async tandemTransfer(addr: string, prefix: ExtInterface.DialingPrefix | null) {
    diag.out(
      'tandemTransfer',
      `tandemTransfer on ${this.webCallId} with addr: ${addr} ${prefix ? ' and prefix: ' + JSON.stringify(prefix) : ''}`
    );
    return new Promise<void>(async (resolve, reject) => {
      if (addr.includes('.') || addr.includes('\\') || addr.includes('@')) {
        try {
          resolve(await this.uriTandemTransfer(addr));
        } catch (e) {
          reject(e);
        }
      } else {
        if (addr) {
          if (!addr.startsWith('H') && !addr.startsWith('h')) {
            if (addr.startsWith(',')) {
              addr = 'H' + addr;
            } else {
              addr = 'H,' + addr;
            }
          } else if (addr.startsWith('h')) {
            addr[0].toUpperCase();
          }

          try {
            resolve(await this.internalDial(addr, prefix, false));
          } catch (e) {
            reject(e);
          }
        }
      }
    });
  }

  async cancelTandemTransfer(addr?: string) {
    diag.out('cancelTandemTransfer', `on call ${this.webCallId}`);
    return new Promise<void>(async (resolve, reject) => {
      if (addr && (addr.includes('.') || addr.includes('\\') || addr.includes('@'))) {
        try {
          resolve(await this.uriTandemTransfer(addr, true));
        } catch (e) {
          reject(e);
        }
      } else {
        if (!addr || !this.callHeader.outsideBridge) addr = 'J';
        else if (!addr.startsWith('J') && !addr.startsWith('j')) {
          if (addr.startsWith(',')) {
            addr = 'J' + addr;
          } else {
            addr = 'J,' + addr;
          }
        } else if (addr.startsWith('j')) {
          addr[0].toUpperCase();
        }

        try {
          resolve(await this.internalDial(addr, null));
        } catch (e) {
          reject(e);
        }
      }
    });
  }

  async dial(
    dialingAddr: string,
    prefix: ExtInterface.DialingPrefix | null,
    subject: string,
    rttMediaEnable: boolean
  ): Promise<void> {
    diag.out(
      'dial',
      `dial on call <${this.webCallId}> with addr: ${dialingAddr} ${
        prefix ? ' and prefix: ' + JSON.stringify(prefix) : ''
      }`
    );
    return new Promise<void>(async (resolve, reject) => {
      try {
        resolve(await this.internalDial(dialingAddr, prefix, false, subject, rttMediaEnable));
      } catch (e) {
        reject(e);
      }
    });
  }

  async internalDial(
    dialingAddr: string,
    prefix: ExtInterface.DialingPrefix | null,
    useAlternatePrefix: boolean = false,
    subject: string = '',
    rttMediaEnable: boolean = false
  ): Promise<void> {
    return new Promise<void>(async (resolve, reject) => {
      if (CallOp.inProgress(this)) {
        let warnText: string = `call ${CallOp.inProgress(this)} already in progress for <${this.webCallId}>`;
        diag.warn('internalDial', `${warnText}`);
        reject(new DialError(false, warnText));
        return;
      }
      let useAlternate = false;
      CallOp.start(this, CallOp.Dial);
      if (this.firstDialEver && this.cfg.direction === ExtInterface.Direction.Outgoing) {
        useAlternate = useAlternatePrefix;
      } // else  don't use alternate mechanism if dialing on existing call, eg: hookflash

      try {
        await this.dialOnCall(dialingAddr, prefix, useAlternatePrefix, subject, rttMediaEnable);
        CallOp.end(this);
        if (this.toBeDropByDial) {
          this.drop();
        }
        resolve();
      } catch (e) {
        CallOp.end(this);
        reject(e);
      }
    });
  }

  private async dialOnCall(
    dialingAddr: string,
    prefix: ExtInterface.DialingPrefix | null,
    useAlternatePrefix: boolean,
    subject: string,
    rttMediaEnable: boolean
  ): Promise<void> {
    const processedAddress = this.processAddress(dialingAddr, prefix, this.webLine, useAlternatePrefix);
    const inbandDialing = this.checkForInbandDialing();
    let ringDownDialing: boolean = !dialingAddr && !!this.webLine?.addressv.startsWith('AIM');
    try {
      for (let index: number = 0; index < processedAddress.dialTokenList.length || ringDownDialing; index++) {
        const tokenToDial: string = processedAddress.dialTokenList[index];

        if (tokenToDial === 'R') {
          // Release call
          diag.trace?.('dialOnCall', `Release the call ${this.webCallId}`);
          this.toBeDropByDial = true;
          break;
        } else if (tokenToDial === 'H' || tokenToDial === 'J') {
          // Perform hookflash
          const addrFor =
            tokenToDial === 'H' ? `${processedAddress.mainNumber}` : `cancel ${processedAddress.mainNumber}`;
          diag.trace?.('dialOnCall', `Dial Hookflash on call<${this.webCallId}> addr<${addrFor}>`);
          let hookFlashWithTci: boolean = false;
          if (this.infoRec.trunkAddress.startsWith('911') && !this.callHeader.outsideBridge) {
            // eslint-disable-next-line no-await-in-loop
            hookFlashWithTci = await this.lineDev.hookFlashWithTci(this);
          }
          if (!hookFlashWithTci) {
            // Hookflash via SIP refer.
            let referTo;
            const proxySrvAddr = this.webNode.nodeCfgEx.proxyAddress;
            const nodeId = this.webNode.nodeCfgEx.id;
            index = processedAddress.dialTokenList.length; // one step
            processedAddress.dialTokenList[0] = 'F';
            if (tokenToDial === 'H') {
              referTo = `sip:${processedAddress.dialTokenList.join('')}@${proxySrvAddr}`;
            } else {
              referTo = `sip:${processedAddress.dialTokenList.join('')}@${proxySrvAddr};method=BYE`;
            }

            try {
              // eslint-disable-next-line no-await-in-loop
              const res = await this.webPhone.tandemTransfer({
                id: this.sipId ? this.sipId : '',
                referTo,
                // extraHeaders: ['X-Referred-By-Someone: Username'],
                nodeId,
              });

              diag.out(
                'dialOnCall',
                `call <${this.webCallId}> hookflash <${addrFor}> on trunk <${this.infoRec.trunkAddress}> ${
                  res ? 'success' : 'failed'
                }`
              );
            } catch (e) {
              diag.warn('dialOnCall', `call <${this.webCallId}> hookflash exception failure <${e}>`);
              throw e;
            }
          }
        } else if (tokenToDial === ',') {
          // Perform pause (1 second)
          diag.trace?.('dialOnCall', `call <${this.webCallId}> Pause dialing for 1 second`);
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => {
            setTimeout(r, 1000);
          });
        } else if (this.firstDialEver && this.cfg.direction === ExtInterface.Direction.Outgoing) {
          // Make outgoing call toward the right voip server
          diag.trace?.(
            this.dialOnCall.name,
            ringDownDialing
              ? `Make ringDown call to: ${this.webLine?.addressv}`
              : `Make outgoing call to: ${tokenToDial}`
          );
          this.cssId = this.getCSSID('');
          const proxySrvAddr = this.webNode.nodeCfgEx.proxyAddress;
          const nodeId = this.webNode.nodeCfgEx.id;
          if (this.state === CallState.Idle) {
            this.setCallState(CallState.Dialtone);
          }

          const listener = (event: CustomEvent) => {
            // A new outgoing call, just reaching out. This is a fastest way to have webCall.sipId updated.
            const { sessionId, webCallId } = event.detail;
            if (this.webCallId === webCallId) {
              // use the sip session Id for me
              this.sipId = sessionId;
              // keep listening until receive my own sipId
              this.getWebPhone().removeEventListener('newOutCall', listener as EventListener);
            }
          };
          this.getWebPhone().addEventListener('newOutCall', listener as EventListener);

          const callRingingPromise = this.callRingingWait();
          let sipCallingPromise;
          if (tokenToDial && tokenToDial.length > 0) {
            // regular dialing is done by dialing to the 'tokentodial' address
            // SIP URI dialing is done through linepool dialing with linepool access code specified in local prefix
            const uri = `sip:${processedAddress.isSipUri ? 'linepool' : tokenToDial}@${proxySrvAddr}:5060`;
            const extraHeaders: string[] = [`x-cssid: ${this.cssId}`];

            if (processedAddress.isSipUri) {
              extraHeaders.push(
                `Linepool: lpac=${encodeURIComponent(prefix?.localPrefix || '')};uri=${encodeURIComponent(tokenToDial)}`
              );
            }

            if (subject.length) this.callType = CallType.Text;
            sipCallingPromise = this.getWebPhone().makeCall(
              this.webCallId,
              uri,
              nodeId,
              extraHeaders,
              subject,
              false,
              rttMediaEnable
            );
          } else if (ringDownDialing) {
            sipCallingPromise = this.webPhone.makeCall(
              this.webCallId,
              `sip:RingDown@${proxySrvAddr}:5060`,
              nodeId,
              [`Call-On-Line: ${this.webLine?.addressv}`, `x-cssid: ${this.cssId}`],
              subject,
              false,
              rttMediaEnable
            );
            ringDownDialing = false;
          } else {
            callRingingPromise.cancelTimer(); // clear callRinging wait timer
            callRingingPromise.removeListener(); // remove CallRinging listener
            const trace = 'Not allow to do ringDown';
            diag.warn(this.dialOnCall.name, trace);
            throw new OutCallForbidden(trace);
          }
          /* Starting sending call */
          try {
            // eslint-disable-next-line no-await-in-loop
            const result = (await Promise.all([sipCallingPromise, callRingingPromise.promise])) as Array<string>;
            callRingingPromise.removeListener(); // remove CallRinging listener
            if (this.state === CallState.Dialtone) {
              if (result.some((r) => r === '180Ringing')) {
                this.ringbackOnProceeding.needed = true;
              } else if (result.some((r) => r === '183SessionProgress')) {
                this.ringbackOnProceeding.needed = false;
              }
              this.setCallState(CallState.Proceeding);
            }
            if (result.some((r) => r === 'CallAnswered') && this.state !== CallState.Connected) {
              this.setCallState(CallState.Connected);
            }
            diag.trace?.(
              'dialOnCall',
              `Outgoing call <${this.webCallId}> resolved ${result} and proceeded on Node ${this.webNode.getNodeId()}`
            );
            this.firstDialEver = false;
          } catch (e) {
            // In the case of promise reject from SIP makeCall, clearTimer.
            callRingingPromise.cancelTimer(); // clear callRinging wait timer
            callRingingPromise.removeListener(); // remove CallRinging listener
            diag.warn(
              'dialOnCall',
              `Outgoing call <${this.webCallId}> failed because of <${e}> on Node${this.webNode.getNodeId()}`
            );
            this.setCallState(CallState.Finished);
            /* To get back to try other nodes */
            throw new OutCallAttemptFailure('');
          }
        } else if (inbandDialing) {
          diag.trace?.('dialOnCall', `call <${this.webCallId}> Dial inband with ${tokenToDial}`);
          // eslint-disable-next-line no-await-in-loop
          await this.dialTokenInband(tokenToDial);
        } else {
          // Perform normal dialing in established call
          diag.trace?.('dialOnCall', `call <${this.webCallId}> Perform normal dialing with: ${tokenToDial}`);
          let dialedWithTci: boolean = false;
          if (this.infoRec.trunkAddress.startsWith('911') && !this.callHeader.outsideBridge) {
            // eslint-disable-next-line no-await-in-loop
            dialedWithTci = await this.lineDev.dialWithTci(this, tokenToDial);
          }
          if (!dialedWithTci) {
            // Dial with VCC api
            const dialing = {
              trunkCall: this.callHeader.remoteChannel,
              clientCall: this.callHeader.localChannel,
              addr: tokenToDial,
              outsideBridge: this.callHeader.outsideBridge,
              sipId: this.sipId || '',
            };
            try {
              // eslint-disable-next-line no-await-in-loop
              await this.webNode.dialToChannel(dialing);
            } catch (e) {
              const trace = `dialToChannel ${JSON.stringify(e)}`;
              diag.warn(this.dialOnCall.name, trace);
              throw new MidCallDialingFailure(trace);
            }
          }
        }
      }
    } catch (e) {
      throw new DialError(processedAddress.hasAlternatePrefix, `Dial failure:  ${JSON.stringify(e)}`);
    }
  }

  async dialTokenInband(tokenToDial: string) {
    // Dial DTMF through the Sonic or PSG3
    if (this.lineDev.webViperDriver) {
      this.lineDev.webViperDriver.autoDial(tokenToDial.toUpperCase());
    }
  }

  async setupConference(
    destAddr: string,
    prefix: ExtInterface.DialingPrefix | null,
    consultType: ConferenceConsultType
  ): Promise<{ conference: WebConference; toCall: WebCall }> {
    if (!CallState.connected(this.state) || !this.webLine) {
      throw new Error('Must be in connected state to setup conference');
    }

    if (destAddr === this.lineDev.device) {
      throw new Error('Conference to self not permitted');
    }

    // Normal conference is NOT allowed with MSRP call.  Switch to NHC instead.
    if (consultType === ConferenceConsultType.Normal && this.callType === CallType.Text) {
      diag.out(
        'setupConference',
        `Normal conference not allowed with initial MSRP call<${this.webCallId}>.  Will perform a NHC instead.`
      );
      consultType = ConferenceConsultType.NoHold;
    }

    return conferenceCreateConsult(this, destAddr, prefix, consultType);
  }

  async setupConferenceWithCall(otherCall: WebCall): Promise<{ conference: WebConference }> {
    if (!(CallState.connected(this.state) && this.webLine && otherCall.state === CallState.IHold)) {
      throw new Error('Call must be in Connected state and other call in IHold to setup conference');
    }

    return conferenceCreateCallPatch(this, otherCall);
  }

  private checkForInbandDialing(): boolean {
    let inbandDialing: boolean = false;

    // TODO Skip inband dialing to conference when it is most likely to be intended to the softswitch (IVR, VOICEMAIL)

    if (!inbandDialing) {
      // Check if line is configured for inband dialing. If this is the case, we will set inband dialing even if
      // the outside bridge is REFER. This is to support West ESINET that cannot do mid-call RTP.
      if (this.callHeader.outsideBridge.toUpperCase() === 'INFO') {
        diag.out(
          'checkForInbandDialing',
          `call <${this.webCallId}> OutsideBridge is INFO, will perform inband dialing`
        );
        inbandDialing = true;
      } else if (
        this.webLine?.getTrunkConfig(this.infoRec.trunkAddress)?.midCallDialing?.toUpperCase() === 'INBAND' &&
        this.callHeader.outsideBridge.toUpperCase().includes('REFER')
      ) {
        // REFER with inband set in line configuration, perform inband RTP
        diag.out(
          'checkForInbandDialing',
          `call <${this.webCallId}> OutsideBridge is REFER and line explicitely configured for inband, will perform inband dialing`
        );
        inbandDialing = true;
      }
    }
    return inbandDialing;
  }

  /* Used for either outbound dialing or a conference consultation call */
  callRingingWait() {
    let timeout = webCfg.systemConfig.outgoingRingbackTimeout;
    if (timeout < 0) timeout = 10;
    let callRingingEvtHandler: any;
    let timer: number;

    const promiseCallRingingWait = new Promise((resolve, reject) => {
      timer = window.setTimeout(reject, timeout * 1000, 'CallRingingWaitTIMEOUT');
      callRingingEvtHandler = (event: CallRinging) => {
        if (event.info.uci && event.info.uci !== this.callHeader.uCI) {
          /* intercom outgoing call goes through here */
          this.callHeader.uCI = event.info.uci;
          this.infoRec.uniqueCallId = event.info.uci;
        }
        if (event.info.status === CallRingingStatus.RingingOK) {
          window.clearTimeout(timer);
          resolve(event.info.status);
        } else if (event.info.status === CallRingingStatus.RingingProgress) {
          window.clearTimeout(timer);
          timer = window.setTimeout(reject, timeout * 1000, 'CallRingingProgress');
        } else if (event.info.status === CallRingingStatus.RingingFail) {
          window.clearTimeout(timer);
          reject(event.info.status);
        } else if (event.info.status === CallRingingStatus.RingingAbort) {
          window.clearTimeout(timer);
          reject(event.info.status);
        }
      };
      this.addEventListener('CallRinging', callRingingEvtHandler as EventListener);
    });

    return {
      promise: promiseCallRingingWait,
      cancelTimer: () => {
        window.clearTimeout(timer);
      },
      removeListener: () => {
        this.removeEventListener('CallRinging', callRingingEvtHandler);
      },
    };
  }

  onSipCallAnswered() {
    diag.trace?.('onSipCallAnswered', `call <${this.webCallId}> on node:${this.webNode.nodeCfgEx.proxyName}`);

    if (this.state === CallState.Dialtone) {
      /* This may come before callring event from VCC
       * So, give a chance to let GUI to display an outgoing Call Proceeding a bit instead of staight to Connected
       * Even the call is being answered directly.
       * So we do update Call State in the row.
       */
      this.setCallState(CallState.Proceeding);
    }

    if (this.state === CallState.Proceeding) {
      this.setCallState(CallState.Connected);
      this.checkRttConnected();
    }
  }

  onSipCallCancelled() {
    this.sipId = '';

    if (CallOp.inProgress(this)) {
      // SIP call cancelled while a call operation is in progress
      // TODO: will the call operation handle it, or do we need to add special case handling here?
    } else if (CallState.offered(this.state)) {
      if (
        this.webLine?.lineType === LineType.LTIntercom ||
        this.webLine?.lineType === LineType.LTSIP ||
        this.webLine?.lineType === LineType.LTACD
      ) {
        this.setCallState(CallState.Abandoned);
        this.finishCall();
      } else {
        // incoming call cancelled. Could be an abandoned call, but we will only know for sure by other events
        // Set a timer to clean things up if we fail to get an update
        CallOp.start(this, CallOp.Cancelled);
        this.waitForAbandon = true;
        window.setTimeout(() => {
          if (CallOp.inProgress(this) === CallOp.Cancelled) {
            try {
              if (CallState.offered(this.state)) {
                /* After a certain time, the call state stays on Offered.
                 * We need to remove this call from sip call terminatation
                 *   if it was not updated by other events (Caller-Disc or Abandoned) or an new incoming call on same trunkAddress
                 */
                this.setCallState(CallState.Abandoned);
                this.finishCall();
                this.waitForAbandon = false;
              }
            } finally {
              CallOp.end(this);
            }
          }
        }, CANCELLED_DELAY_TIMEOUT);
      }
    }
  }

  onSipCallTerminated() {
    this.sipId = '';
    this.callHeader.localChannel = '';
    if (CallState.offered(this.state)) {
      this.onSipCallCancelled();
    } else if (CallOp.inProgress(this)) {
      // SIP call terminated while a call operation is in progress
      diag.trace?.(
        'onSipCallTerminated',
        `Call <${CallOp.inProgress(this)}> operation in progress for call <${
          this.webCallId
        }>. Keep current call in state <${this.state}>`
      );
    } else if (
      !this.isTrunkCall() ||
      (!CallState.hold(this.state) &&
        !CallState.parked(this.state) &&
        !CallState.busy(this.state) &&
        this.state !== CallState.Finishing)
    ) {
      diag.trace?.('onSipCallTerminated', `Finish call <${this.webCallId}> in state <${this.state}>`);
      // A SIP Bye is received, finish the call anyway. Even though the call was in Disconnected state.
      // abandoneASA won't drop a Disconnected call but Sip bye or call release
      const skipStateCheck = true;
      this.finishCall(skipStateCheck);
    } else {
      diag.trace?.('onSipCallTerminated', `Keep current call <${this.webCallId}> in state <${this.state}>`);
    }
  }

  onAbandonedCallBSA() {
    diag.trace?.('onAbandonedCallBSA', `webCallId <${this.webCallId}>`);

    if (CallState.offered(this.state)) {
      this.setCallState(CallState.Abandoned);
    }
    if (this.state === CallState.Abandoned) {
      this.finishCall();
    }
  }

  setCallHeader(callHeader: CallHeader) {
    this.callHeader = callHeader;
  }

  setCallState(newState: CallState) {
    diag.out('setCallState', `set call <${this.webCallId}> <${this.sipId}> state => <${newState}>`);
    let computeAgentState: boolean = false;
    if (!CallState.connected(this.state) && CallState.connected(newState)) {
      // Transition to connected state
      this.lineDev.incrementConnectCount(this);

      // Restart auto-rebid mechanism if configured
      if (this.activeRebidRule !== undefined) {
        this.restartAutoRebid();
      }
    } else if (CallState.connected(this.state) && !CallState.connected(newState)) {
      // Transition from connected state
      this.lineDev.decrementConnectCount(this);

      // Stop or pause auto-rebid mechanism if active
      if (this.activeRebidRule && this.activeRebidRule.rebidTimer !== 0) {
        if (newState === CallState.Finished) {
          this.stopAutoRebid();
        } else {
          this.pauseAutoRebid();
        }
      }
    }

    if (CallState.connected(newState)) {
      if (newState === CallState.Connected && this.state !== newState) {
        this.lineDev.logAgentCallActivityToCDR(this, true);
        computeAgentState = true;
      }
    } else if (CallState.connected(this.state)) {
      this.lineDev.logAgentCallActivityToCDR(this, false);
      computeAgentState = true;
    }
    // update progress tone playback
    this.updateProgressTone(newState);

    // Report state transition
    if (this.state !== newState) {
      const oldState = this.state;
      this.state = newState;

      if (
        newState === CallState.Connected ||
        newState === CallState.Connecting ||
        newState === CallState.Disconnected ||
        newState === CallState.Proceeding ||
        newState === CallState.Dialtone
      ) {
        this.assignContextId();
      }

      /* for WebTeletest and SaaS p911 to see the call*/
      if (newState !== CallState.Dialtone) {
        let stateUpdate;
        if (newState === CallState.Proceeding) {
          /* Pending to send notification of Dialtone.
           * Now we can send Dialtone and Proceeding in a row.
           * This way make the call object in the event contain the needed call info and GUI would not miss a call state either
           */
          stateUpdate = new StateUpdate('StateUpdate', this.self, CallState.Dialtone);
          stateUpdate.oldState = CallState.Idle;
          this.lineDev.report(stateUpdate);
        }

        stateUpdate = new StateUpdate('StateUpdate', this.self, newState);
        stateUpdate.oldState = oldState;
        this.lineDev.report(stateUpdate);
      }

      // let the conference know this call state changed
      if (this.webConf) {
        this.webConf.callStateUpdate(this.self);
      }
      //Add  calls to park list
      if (newState === CallState.Park) {
        ActiveCalls.addParked(this);
      }
      //Remove  calls to park list
      if (oldState === CallState.Park) {
        ActiveCalls.removeParked(this);
      }
    }

    if (computeAgentState) {
      this.lineDev.computeAgentState();
    }
  }

  setRttMediaStatus(newState: ExtInterface.RttMediaStatus) {
    diag.out('setRttMediaStatus', `set call <${this.webCallId}> <${this.sipId}> RttMediaStatus => <${newState}>`);

    // Report state transition if it has changed
    if (this.rttMediaStatus !== newState) {
      this.rttMediaStatus = newState;
      let stateUpdate = new ExtInterface.RttMediaStatusEvent(this.self, this.rttMediaStatus);
      this.lineDev.report(stateUpdate);
    }
  }

  finishCall(skipStateCheck?: boolean) {
    if (
      !skipStateCheck &&
      (this.state === CallState.Finishing || (this.state === CallState.Disconnected && this.audibleAlertTimeout > 0))
    ) {
      return;
    }
    this.setCallState(CallState.Finished);
    if (this.webLine) {
      this.webLine.removeCall(this.self);
      this.webLine = null;
    } else {
      ActiveCalls.remove(this.self);
    }
  }

  changeLine(newLine: WebLine | null) {
    const oldLine = this.webLine;

    if (oldLine) {
      oldLine.removeCall(this.self);
    } else {
      ActiveCalls.remove(this.self);
    }

    this.webLine = newLine;

    if (newLine) {
      newLine.addCall(this.self);
    } else {
      ActiveCalls.add(this.self);
    }

    this.lineDev.report(new ExtInterface.LineChangeEvent(this.self, oldLine, newLine));
  }

  getPotsSrvToConnect(): string {
    return this.callHeader.potsSrvToConnect;
  }

  setAni(infoUpdate: InformationUpdate, ani: string): boolean {
    let updateRequired: boolean = false;
    if (ani.length > 0) {
      if (ani.match(GENERIC_DIAL_FILTER) !== null) {
        // Only set ALI request key with ANI if no ALI request key has been received yet.
        if (this.infoRec.aliRequestKey.length === 0) {
          this.infoRec.aliRequestKey = ani;
          infoUpdate.aliRequestKey = true;
          updateRequired = true;
        }

        if (this.infoRec.callingPartyId.length === 0 || ani !== this.infoRec.aliRequestKey) {
          if (this.infoRec.wireless) {
            // previous information indicated that the call was wireless
            if (ani === this.infoRec.aliRequestKey) {
              // this looks like new info since both ani and aliRequestKey are the same
              updateRequired = this.setCallAsWireless(infoUpdate, aliDecoder.isAniWireless(ani)) || updateRequired;
            } // else {
            // we keep the call as Wireless since the ani != aliRequestKey
            // which mean it is most likely an actual ani
            //}
          } else {
            updateRequired = this.setCallAsWireless(infoUpdate, aliDecoder.isAniWireless(ani)) || updateRequired;
          }
        }

        if (this.infoRec.wireless && ani === this.infoRec.aliRequestKey) {
          diagAni.trace?.('setAni', `ANI<${ani}> for wireless call is same as ALIRequestKey: ignore`);
        } else {
          if (ani.length === 0) {
            // Possible if ALI received from DataServer didn't contain the ANI.
            diagAni.trace?.(
              'setAni',
              `call ${this.webCallId} ANI is empty, set it to ALIRequestKey (${this.infoRec.aliRequestKey})`
            );
            ani = this.infoRec.aliRequestKey;
          }

          if (this.infoRec.connectedPartyId !== ani) {
            this.infoRec.connectedPartyId = ani;
            infoUpdate.connectedPartyId = true;
            updateRequired = true;
            diagAni.trace?.(
              'setAni',
              `call ${this.webCallId} connectedPartyId set to: ${this.infoRec.connectedPartyId}`
            );
          }

          if (this.infoRec.callingPartyId !== ani) {
            this.infoRec.callingPartyId = ani;
            infoUpdate.callingPartyId = true;
            updateRequired = true;
            diagAni.trace?.('setAni', `call ${this.webCallId} callingPartyId set to: ${this.infoRec.callingPartyId}`);
          }

          // We just set the ANI, check if we must report that it flashes.
          if (this.infoRec.aniFlash) {
            infoUpdate.aniFlash = true;
            updateRequired = true;
          }
        }
      } else {
        // Not Only [0123456789-#*]
        if (this.infoRec.callingPartyName !== ani) {
          this.infoRec.callingPartyName = ani;
          infoUpdate.callingPartyName = true;
          updateRequired = true;
          diagAni.trace?.('setAni', `call ${this.webCallId} callingPartyName set to: ${this.infoRec.callingPartyName}`);
        }

        if (this.infoRec.connectedPartyName !== ani) {
          this.infoRec.connectedPartyName = ani;
          infoUpdate.connectedPartyName = true;
          updateRequired = true;
          diagAni.trace?.(
            'setAni',
            `call ${this.webCallId} connectedPartyName set to: ${this.infoRec.connectedPartyName}`
          );
        }
      }
    }

    return updateRequired;
  }

  setAliRequestKey(infoUpdate: InformationUpdate, number: string): boolean {
    let updateRequired: boolean = false;
    if (number.length > 0) {
      if (number.match(GENERIC_DIAL_FILTER) !== null) {
        this.infoRec.aliRequestKey = number;
        infoUpdate.aliRequestKey = true;
        updateRequired = true;
        diagAni.trace?.(
          'setAliRequestKey',
          `call ${this.webCallId} aliRequestKey set to: ${this.infoRec.aliRequestKey}`
        );
      }
    }

    return updateRequired;
  }

  setCallAsWireless(infoUpdate: InformationUpdate, wireless: boolean): boolean {
    let updateRequired: boolean = false;
    if (this.infoRec.wireless !== wireless) {
      this.infoRec.wireless = wireless;

      if (infoUpdate) {
        infoUpdate.wireless = true;
        updateRequired = true;
        diagAli.trace?.(
          'setCallAsWireless',
          `call ${this.webCallId} Set call wireless status to ${this.infoRec.wireless ? 'true' : 'false'}`
        );
      }
    }
    return updateRequired;
  }

  setAli(infoUpdate: InformationUpdate, decAli: DecodedAli, aliTimeCount: number, canModifyAli: boolean): boolean {
    let updateRequired = false;
    if (infoUpdate) {
      if (decAli.ali !== undefined && decAli.ali !== '') {
        // Always report received ALI to WebClient
        infoUpdate.callingPartyData = true;
        updateRequired = true;

        if (
          canModifyAli &&
          this.infoRec.wireless && // we detected that this was a wireless call by other means than the ali
          this.infoRec.callingPartyId !== this.infoRec.aliRequestKey && // if they are equal, we don't know that we have a callback in callingpartyid
          this.infoRec.callingPartyId.length > 0
        ) {
          // we don't want to modify the ali if we don't have anything to put in it
          let aliType: string = decAli.ali.substr(0, 1);
          if (aliType === '1') {
            // we only try to substitute for valid ali
            decAli.ali = aliType + aliDecoder.setNormalCallback(decAli.ali.substr(1), this.infoRec.callingPartyId);
          }
        }

        if (decAli.format.type === AliDecoderType.WIRELESS) {
          this.infoRec.rtxDebounceDelay = decAli.format.rtxDebounceDelay;
          this.setCallAsWireless(infoUpdate, true);
        }

        if (decAli.ali !== this.infoRec.callingPartyData) {
          if (this.infoRec.callingPartyData !== '') {
            this.initialAli = false;
          }

          this.infoRec.callingPartyData = decAli.ali;

          if (decAli.format.wirelessPhase1 || this.geoprivMethod === 'Cell') {
            // Set flag to skip phase1 ALI except 1st one
            infoUpdate.cadSkipAliPhase1 = this.hasReceived1stPhase1Ali;
            if (!this.hasReceived1stPhase1Ali) {
              this.hasReceived1stPhase1Ali = true;
            }
          }
        }

        let convertedAliTimeCount: BigInt = BigInt(aliTimeCount);

        if (
          convertedAliTimeCount !== undefined &&
          convertedAliTimeCount !== 0n &&
          convertedAliTimeCount !== this.infoRec.aliTimeCount
        ) {
          this.infoRec.aliTimeCount = convertedAliTimeCount;
          infoUpdate.aliTimeCount = true;
        }

        if (decAli.pseudoAni === '' && this.infoRec.wireless) {
          // we use the AliRequestKey as a pseudo ani to be able to activate the autorequestinfo
          // based on the ani received for this call.  This is useful if the PseudoAni
          // cannot be extracted from the ali because it is not in there or because
          // the configuration does not specify where to find it

          decAli.pseudoAni = this.infoRec.aliRequestKey;
          diagAli.trace?.(
            'setAli',
            `call ${this.webCallId}  No Pseudo Ani. Using AliRequestKey instead of PseudoAni from Ani`
          );
        }

        this.enableAutoRebidOnAli(decAli);
      }
    }

    return updateRequired;
  }

  receiveCallInformation(
    ani: string,
    decAli: DecodedAli,
    aliTimeCount: number,
    aniDc: string,
    cidName: string,
    pidflo: string,
    additionalData: string,
    locationBy: string,
    lisErrorCode: string,
    lisErrorMessage: string,
    lisErrorData: string
  ): void {
    let infoUpdate: InformationUpdate = new InformationUpdate(this);
    let updateRequired: boolean = false;

    updateRequired = this.setAni(infoUpdate, ani);

    if (aniDc !== undefined && aniDc !== '') {
      let aniFlash: boolean = aniDc === 'ANI_DC_FLASHING';

      if (aniFlash !== this.infoRec.aniFlash) {
        this.infoRec.aniFlash = aniFlash;
        infoUpdate.aniFlash = true;
        updateRequired = true;
      }
    }

    if (cidName !== undefined && cidName !== '' && cidName !== this.infoRec.callingPartyName) {
      this.infoRec.callingPartyName = cidName;
      infoUpdate.callingPartyName = true;
      updateRequired = true;
    }

    if (pidflo !== undefined && pidflo !== '') {
      // Always report received PiDF-LO to WebCLient
      infoUpdate.pidflo = true;
      updateRequired = true;

      if (pidflo !== this.infoRec.pidflo) {
        this.getGeoprivMethod(pidflo);
        if (!this.infoRec.wireless) {
          this.setCallAsWireless(infoUpdate, this.checkIfWirelessFromPidflo());
        }
        this.infoRec.pidflo = pidflo;
      }
    }

    if (lisErrorCode !== undefined && lisErrorCode !== '') {
      this.infoRec.lisErrorCode = lisErrorCode;
      infoUpdate.lisError = true;
      updateRequired = true;
    }

    if (lisErrorMessage !== undefined && lisErrorMessage !== '') {
      this.infoRec.lisErrorMessage = lisErrorMessage;
      infoUpdate.lisError = true;
      updateRequired = true;
    }

    if (lisErrorData !== undefined && lisErrorData !== '') {
      this.infoRec.lisErrorData = lisErrorData;
      infoUpdate.lisError = true;
      updateRequired = true;
    }

    if (additionalData !== undefined && additionalData !== '' && additionalData !== this.infoRec.additionalData) {
      this.getServiceMobility(additionalData);
      if (!this.infoRec.wireless) {
        this.setCallAsWireless(infoUpdate, this.checkIfWirelessFromAdditionalData());
      }
      this.infoRec.additionalData = additionalData;
      infoUpdate.additionalData = true;
      updateRequired = true;
    }

    if (locationBy !== undefined && locationBy !== '' && locationBy !== this.infoRec.locationBy) {
      this.infoRec.locationBy = locationBy;
      infoUpdate.locationBy = true;
      updateRequired = true;
    }

    if (decAli.ani !== '') {
      this.setAni(infoUpdate, decAli.ani);
      this.infoRec.confirmedCallback = true;
      infoUpdate.confirmedCallback = true;
      updateRequired = true;
    }

    updateRequired =
      this.setAli(infoUpdate, decAli, aliTimeCount, pidflo === undefined || pidflo === '') || updateRequired;

    // For now we will always send infoUpdate even though the ALI did not changed.
    // This was the behavior of the 7.0 telephony. We will revisit, if we what to
    // improve the performance later.
    this.lineDev.report(infoUpdate);
  }

  receiveServiceList(
    counseling: string,
    counselingChildren: string,
    counselingMentalHealth: string,
    counselingSuicide: string,
    sos: string,
    sosAmbulance: string,
    sosAnimalControl: string,
    sosFire: string,
    sosGas: string,
    sosMarine: string,
    sosMountain: string,
    sosPhysician: string,
    sosPoison: string,
    sosPolice: string
  ) {
    let serviceUpdate: ServiceUpdate = new ServiceUpdate(this);
    let updateRequired: boolean = false;

    if (counseling !== undefined && counseling !== '' && counseling !== this.service.counseling) {
      this.service.counseling = counseling;
      serviceUpdate.counseling = true;
      updateRequired = updateRequired || true;
    }

    if (
      counselingChildren !== undefined &&
      counselingChildren !== '' &&
      counselingChildren !== this.service.counselingChildren
    ) {
      this.service.counselingChildren = counselingChildren;
      serviceUpdate.counselingChildren = true;
      updateRequired = updateRequired || true;
    }

    if (
      counselingMentalHealth !== undefined &&
      counselingMentalHealth !== '' &&
      counselingMentalHealth !== this.service.counselingMentalHealth
    ) {
      this.service.counselingMentalHealth = counselingMentalHealth;
      serviceUpdate.counselingMentalHealth = true;
      updateRequired = updateRequired || true;
    }

    if (
      counselingSuicide !== undefined &&
      counselingSuicide !== '' &&
      counselingSuicide !== this.service.counselingSuicide
    ) {
      this.service.counselingSuicide = counselingSuicide;
      serviceUpdate.counselingSuicide = true;
      updateRequired = updateRequired || true;
    }

    if (sos !== undefined && sos !== '' && sos !== this.service.sos) {
      this.service.sos = sos;
      serviceUpdate.sos = true;
      updateRequired = updateRequired || true;
    }

    if (sosAmbulance !== undefined && sosAmbulance !== '' && sosAmbulance !== this.service.sosAmbulance) {
      this.service.sosAmbulance = sosAmbulance;
      serviceUpdate.sosAmbulance = true;
      updateRequired = updateRequired || true;
    }

    if (
      sosAnimalControl !== undefined &&
      sosAnimalControl !== '' &&
      sosAnimalControl !== this.service.sosAnimalControl
    ) {
      this.service.sosAnimalControl = sosAnimalControl;
      serviceUpdate.sosAnimalControl = true;
      updateRequired = updateRequired || true;
    }

    if (sosFire !== undefined && sosFire !== '' && sosFire !== this.service.sosFire) {
      this.service.sosFire = sosFire;
      serviceUpdate.sosFire = true;
      updateRequired = updateRequired || true;
    }

    if (sosGas !== undefined && sosGas !== '' && sosGas !== this.service.sosGas) {
      this.service.sosGas = sosGas;
      serviceUpdate.sosGas = true;
      updateRequired = updateRequired || true;
    }

    if (sosMarine !== undefined && sosMarine !== '' && sosMarine !== this.service.sosMarine) {
      this.service.sosMarine = sosMarine;
      serviceUpdate.sosMarine = true;
      updateRequired = updateRequired || true;
    }

    if (sosMountain !== undefined && sosMountain !== '' && sosMountain !== this.service.sosMountain) {
      this.service.sosMountain = sosMountain;
      serviceUpdate.sosMountain = true;
      updateRequired = updateRequired || true;
    }

    if (sosPhysician !== undefined && sosPhysician !== '' && sosPhysician !== this.service.sosPhysician) {
      this.service.sosPhysician = sosPhysician;
      serviceUpdate.sosPhysician = true;
      updateRequired = updateRequired || true;
    }

    if (sosPoison !== undefined && sosPoison !== '' && sosPoison !== this.service.sosPoison) {
      this.service.sosPoison = sosPoison;
      serviceUpdate.sosPoison = true;
      updateRequired = updateRequired || true;
    }

    if (sosPolice !== undefined && sosPolice !== '' && sosPolice !== this.service.sosPolice) {
      this.service.sosPolice = sosPolice;
      serviceUpdate.sosPolice = true;
      updateRequired = updateRequired || true;
    }

    if (updateRequired) {
      this.lineDev.report(serviceUpdate);
    }
  }

  public async requestInfo() {
    return new Promise<void>(async (resolve, reject) => {
      await this.lineDev
        .requestInfo(this)
        .then(() => {
          resolve();
        })
        .catch((error) => {
          reject(error);
        });
    });
  }

  setCallerDisc(disconnected: boolean) {
    this.callerDisconnected = disconnected;

    if (disconnected) {
      if (this.state === CallState.Offered || this.state === CallState.ReOffered) {
        this.setCallState(CallState.Abandoned);
      } else if (this.state === CallState.Connected) {
        this.setCallState(CallState.Disconnected);
      }
    } else if (this.state === CallState.Abandoned) {
      this.setCallState(CallState.Offered);
    } else if (this.state === CallState.Disconnected) {
      this.setCallState(CallState.Connected);
    }
  }

  public async logTransferInformation(
    key: string,
    short_value: string,
    long_value: string,
    agency_id: string,
    agency_name: string,
    agency_type_id: string,
    agency_type_name: string,
    transfer_failure: boolean
  ) {
    this.lineDev.logTransferInformationToCDR(
      this,
      key,
      short_value,
      long_value,
      agency_id,
      agency_name,
      agency_type_id,
      agency_type_name,
      transfer_failure
    );
  }

  public async recallAbandonedCall(
    abandonedCallUcid: string,
    dir: ExtInterface.Direction = ExtInterface.Direction.Outgoing
  ) {
    this.lineDev.recallAbandonedCall(this, abandonedCallUcid, dir);
  }

  // TODO: P911 call this for automaticAliDump, maybe not a good func name
  public setCallInformation(rawAli: string): void {
    this.infoRec.callingPartyData = rawAli;

    const infoUpdate: InformationUpdate = new InformationUpdate(this);
    infoUpdate.callingPartyData = true;

    // Report InformationUpdate
    this.lineDev.dispatchEvent(infoUpdate);
  }

  // Put the dtmf digit info for silence call on callinfo box
  public setSilentCallDigit(digit: string): void {
    this.infoRec.dtmfInfo = digit;

    const infoUpdate: InformationUpdate = new InformationUpdate(this);
    infoUpdate.dtmfInfo = true;

    // Report InformationUpdate
    this.lineDev.dispatchEvent(infoUpdate);
  }

  private getGeoprivMethod(pidflo: string) {
    let method: string = '';

    const parser = new DOMParser();
    const xmlDoc = parser ? parser.parseFromString(pidflo, 'text/xml') : null;

    const presenceNode = xmlDoc ? xmlDoc.getElementsByTagName('presence')[0] : null;
    if (presenceNode) {
      const geoprivNode = presenceNode.getElementsByTagName('geopriv')[0];
      if (geoprivNode) {
        const methodNode = geoprivNode.getElementsByTagName('method')[0];
        // Skip; an invalid dialog.
        if (methodNode && methodNode.textContent !== null) {
          method = methodNode.textContent;
        }
      }
    }

    this.geoprivMethod = method;
  }

  private checkIfWirelessFromPidflo() {
    let wireless: boolean = false;
    if (this.geoprivMethod !== '' && this.geoprivMethod !== 'Manual' && this.geoprivMethod !== 'DHCP') {
      wireless = true;
    }

    diagAli.trace?.(
      'checkIfWirelessFromPidflo',
      `call ${this.webCallId} ${wireless ? 'Found a wireless call' : 'Did not find a wireless call'}`
    );

    return wireless;
  }

  private getServiceMobility(additionalData: string) {
    let serviceMobility: string = '';

    const parser = new DOMParser();
    const xmlDoc = parser ? parser.parseFromString(additionalData, 'text/xml') : null;

    const emergencyCallDataNode = xmlDoc ? xmlDoc.getElementsByTagName('emergencyCallData')[0] : null;
    if (emergencyCallDataNode) {
      let svc: string = 'urn:ietf:params:xml:ns:EmergencyCallData:ServiceInfo';
      const serviceInfoNode = emergencyCallDataNode.getElementsByTagNameNS(svc, 'EmergencyCallData.ServiceInfo')[0];
      if (serviceInfoNode) {
        const serviceMobilityNode = serviceInfoNode.getElementsByTagNameNS(svc, 'ServiceMobility')[0];
        if (serviceMobilityNode && serviceMobilityNode.textContent !== null) {
          serviceMobility = serviceMobilityNode.textContent;
        }
      }
    }

    this.serviceMobility = serviceMobility;
  }

  private checkIfWirelessFromAdditionalData() {
    let wireless: boolean = false;
    if (this.serviceMobility === 'Mobile') {
      wireless = true;
    }

    diagAli.trace?.(
      'checkIfWirelessFromAdditionalData',
      `call ${this.webCallId} ${wireless ? 'Found a wireless call' : 'Did not find a wireless call'}`
    );

    return wireless;
  }

  private enableAutoRebidOnAli(decodedAli: DecodedAli) {
    let newRule: AutoRebidRule | undefined = autoRebidRuleManager.submitForAutoRebid(
      decodedAli,
      this.infoRec.pidflo,
      this.infoRec.additionalData,
      this.infoRec.wireless,
      this.infoRec.locationBy
    );

    if (newRule !== undefined) {
      let newRuleEx: AutoRebidRuleEx = new AutoRebidRuleEx(newRule);
      newRuleEx.rebidOnPhase1 = autoRebidRuleManager.getRebidOnPhase1Wireless();
      newRuleEx.aliWirelessPhase1 =
        decodedAli.format.wirelessPhase1 || (newRuleEx.i3Pidflo && this.geoprivMethod === 'Cell');
      this.startAutoRebid(newRuleEx);
    } else {
      this.stopAutoRebid();
    }

    if (this.forceSingleRebid !== SingleRebidState.DISABLE) {
      this.forceSingleRebid = SingleRebidState.DISABLE;
    }
  }

  private startAutoRebid(rule: AutoRebidRuleEx) {
    if (this.activeRebidRule === undefined || !this.activeRebidRule.compare(rule)) {
      this.stopAutoRebid();
      this.activeRebidRule = rule;
      if (this.forceSingleRebid === SingleRebidState.DISABLE) {
        diagAli.trace?.(
          'startAutoRebid',
          `Start auto-rebid on call ${this.webCallId} with rule ${JSON.stringify(this.activeRebidRule)}`
        );

        this.resumeAutoRebid(false);
        this.reportAutoRequestUpdate();
      }
    }
  }

  private stopAutoRebid() {
    if (this.activeRebidRule && this.activeRebidRule.rebidTimer !== 0) {
      window.clearTimeout(this.activeRebidRule.rebidTimer);
      this.activeRebidRule.rebidTimer = 0;
      diagAli.trace?.(
        'stopAutoRebid',
        `Stop auto-rebid on call ${this.webCallId} for rule ${JSON.stringify(this.activeRebidRule)}`
      );
    }
    this.reportAutoRequestUpdate();
  }

  private pauseAutoRebid() {
    if (this.activeRebidRule && this.activeRebidRule.rebidTimer !== 0) {
      window.clearTimeout(this.activeRebidRule.rebidTimer);
      this.activeRebidRule.rebidTimer = 0;
      diagAli.trace?.('pauseAutoRebid', `Pause auto-rebid on call ${this.webCallId}`);
    }

    this.reportAutoRequestUpdate();
  }

  private restartAutoRebid() {
    this.resumeAutoRebid(false);
    this.reportAutoRequestUpdate();
  }

  private resumeAutoRebid(performRequest: boolean = true) {
    if (this.activeRebidRule !== undefined) {
      let rebidCount = this.activeRebidRule.rebidCount;
      let repetitions: number = this.activeRebidRule.repetitions;

      if (this.activeRebidRule.rebidOnPhase1 && this.activeRebidRule.aliWirelessPhase1) {
        // As long has we have Phase 1 ALI we perform a rebid using the initial Delay
        rebidCount = 0;
        repetitions = 0;
        diagAli.trace?.(
          'resumeAutoRebid',
          `RTX are to be performed on call ${this.webCallId} since auto-rebid on Phase 1 is active`
        );
        if (this.initialAli) {
          // Perform Request on Connect (i.e. when the first ALI is received)
          performRequest = true;
          diagAli.trace?.(
            'resumeAutoRebid',
            `Force RTX on connect of call ${this.webCallId} since auto-rebid on Phase 1 is active`
          );
        }
      }

      let delay: number | undefined = undefined;

      if (this.forceSingleRebid !== SingleRebidState.ON_ONGOING) {
        if (this.forceContinousRebid || repetitions === 0 || rebidCount < repetitions) {
          if (rebidCount === 0) {
            delay = this.activeRebidRule.initialDelay;
          } else {
            delay = this.activeRebidRule.subsequentDelay;
          }
        }
        if (this.forceSingleRebid === SingleRebidState.ON_RESTART) {
          this.forceSingleRebid = SingleRebidState.ON_ONGOING;
        }
      }

      this.activeRebidRule.rebidCount++;

      if (performRequest) {
        diagAli.trace?.('resumeAutoRebid', `Auto-rebid to perform RTX on call ${this.webCallId}`);
        this.requestInfo();
      }

      if (delay !== undefined) {
        this.activeRebidRule.rebidTimer = window.setTimeout(this.resumeAutoRebid, delay * 1000);
        diagAli.trace?.(
          'resumeAutoRebid',
          `Auto-rebid scheduled an RTX in ${delay} second on call ${
            this.webCallId
          } [${rebidCount.toString()},${repetitions.toString()}] for rule ${JSON.stringify(this.activeRebidRule)}`
        );
      } else {
        this.activeRebidRule.rebidTimer = 0;
        this.reportAutoRequestUpdate();
        diagAli.trace?.(
          'resumeAutoRebid',
          `Auto-rebid has completed all repetition [${repetitions.toString()}] on call ${
            this.webCallId
          } for rule ${JSON.stringify(this.activeRebidRule)}`
        );
      }
    } else {
      diagAli.trace?.(
        'resumeAutoRebid',
        `Cannot resume auto rebid on call  ${this.webCallId} since no rule are available`
      );
    }
  }

  public async audibleAlertProgress(timeout: number) {
    if (timeout <= 0) return Promise.reject('audibleAlertInactive');
    if (this.state !== CallState.Finishing && this.state !== CallState.Disconnected)
      return Promise.reject('NotAudibleAlertAllowState');
    let userDropHandler: any;
    let timer: number = 0;
    let result;
    const promiseAudibleAlertProgress = new Promise((resolve, reject) => {
      timer = window.setTimeout(resolve, timeout * 1000, 'AudibleAlertTimeout');
      userDropHandler = (event: FinishAudibleAlert) => {
        window.clearTimeout(timer);
        resolve('CallDropOp');
      };
      this.addEventListener('FinishAudibleAlert', userDropHandler as EventListener);
    });
    try {
      this.audibleAlertToneStarted = true;
      this.lineDev.addProgressTone(ExtInterface.ProgressTone.DialTone, this);
      result = await Promise.race([promiseAudibleAlertProgress]);
      diag.out('abandonedCallASA', `AudibleAlert completed due to ${result}`);
    } catch (e) {
      result = await Promise.race([promiseAudibleAlertProgress]);
      diag.warn('abandonedCallASA', `AudibleAlert stopped because ${JSON.stringify(e)}`);
    } finally {
      if (timer) window.clearTimeout(timer);
      this.removeEventListener('FinishAudibleAlert', userDropHandler);
      this.audibleAlertToneStarted = false;
      this.lineDev.stopToneInProgress(ExtInterface.ProgressTone.DialTone, this);
      let proceedFinish = false;
      if (this.state === CallState.Finishing || result === 'CallDropOp') proceedFinish = true;
      this.finishCall(proceedFinish);
      return result;
    }
  }

  private reportAutoRequestUpdate() {
    let autoRequestUpdate: AutoRequestUpdate = new AutoRequestUpdate(this);
    autoRequestUpdate.autoRequestActive = this.activeRebidRule !== undefined && this.activeRebidRule.rebidTimer !== 0;
    this.lineDev.report(autoRequestUpdate);
  }

  public activateAutoRequestInfo(repetitions: number) {
    if (this.activeRebidRule && this.activeRebidRule.initialDelay !== 0 && (repetitions === 0 || repetitions === 1)) {
      diagAli.trace?.(
        'activateAutoRequestInfo',
        `Activation of auto-rebid on call ${
          this.webCallId
        } requested by user with ${repetitions.toString()} repetitions`
      );

      if (repetitions === 0) {
        this.forceContinousRebid = true;
      } else if (repetitions === 1) {
        this.forceSingleRebid =
          this.activeRebidRule.rebidTimer === 0 ? SingleRebidState.ON_RESTART : SingleRebidState.ON_ONGOING;
      }

      if (this.activeRebidRule.rebidTimer === 0) {
        this.activeRebidRule.rebidCount = 0;
        this.restartAutoRebid();
      }
    } else {
      diagAli.trace?.(
        'activateAutoRequestInfo',
        `Activation of auto-rebid on call ${this.webCallId} requested by user, refuse since no valid rule exists`
      );
      throw new Error('Incapable');
    }
  }

  public cancelAutoRequestInfo() {
    diagAli.trace?.('cancelAutoRequestInfo', `Cancel ongoing auto-rebid on call ${this.webCallId} requested by user`);

    this.forceContinousRebid = false;
    this.forceSingleRebid = SingleRebidState.DISABLE;
    this.stopAutoRebid();
  }

  public getAutoRequestInfo(): boolean {
    return this.activeRebidRule !== undefined && this.activeRebidRule.rebidTimer !== 0;
  }

  public processAddress(
    address: string,
    prefix: ExtInterface.DialingPrefix | null,
    prefixLine: WebLine | null,
    alternate: boolean
  ): { dialTokenList: string[]; mainNumber: string; hasAlternatePrefix: boolean; isSipUri: boolean } {
    let mainNumber: string = '';
    const dialTokenList: Array<string> = [];
    let hasAlternatePrefix: boolean = false;
    const isSipUri = address.includes('sip:') || address.includes('sips:') || address.includes('tel:');

    // Filter out dot '.' in address
    const cleanAddress = isSipUri ? address : address.replace(/\./g, '');

    diag.trace?.(
      'processAddress',
      `Process address on call ${this.webCallId} with Original address = ${cleanAddress}${
        prefix ? ` prefix: ${JSON.stringify(prefix)}` : ''
      }${prefixLine ? ` line:${prefixLine.addressv}` : ''}${alternate ? ' preferred' : ' alternate'}`
    );

    if (isSipUri) {
      dialTokenList.push(address);
      mainNumber = address;
    } else {
      hasAlternatePrefix = this.tokenizeAddress(cleanAddress, prefix, prefixLine, dialTokenList, alternate);

      // Obtain the mainNumber from token list
      for (let i: number = 0; i < dialTokenList.length; i++) {
        if (dialTokenList[i] === ',') {
          // Skip pause
        } else if (mainNumber.length > 0 && dialTokenList[i].match(SPECIAL_DIAL_FILTER) !== null) {
          // If anything else appart a pause, main number is complete
          break;
        } else if (dialTokenList[i].match(GENERIC_DIAL_FILTER) !== null) {
          mainNumber += dialTokenList[i];
        }
      }

      // Concatenate tokens for display purposes
      let completeNumber: string = '';
      for (let i: number = 0; i < dialTokenList.length; i++) {
        completeNumber += dialTokenList[i];
      }

      // For outgoing calls, set calledPartyId and connectedPartyId based on this number if not set
      if (this.cfg.direction === ExtInterface.Direction.Outgoing && this.infoRec.calledPartyId === '') {
        diag.trace?.(
          'processAddress',
          `calledPartyID and connectedPartyId set to ${mainNumber} on call ${this.webCallId}`
        );
        this.infoRec.calledPartyId = mainNumber;
        this.infoRec.connectedPartyId = mainNumber;
      }

      diag.trace?.('processAddress', `Processed address = ${completeNumber} on call ${this.webCallId}`);
    }
    diag.trace?.('processAddress', `MainNumber = ${mainNumber} on call ${this.webCallId}`);

    return { dialTokenList, mainNumber, hasAlternatePrefix, isSipUri };
  }

  private tokenizeAddress(
    address: string,
    prefix: ExtInterface.DialingPrefix | null,
    prefixLine: WebLine | null,
    tokens: string[],
    alternate: boolean,
    firstPass: boolean = true
  ): boolean {
    let hasAlternatePrefix: boolean = false;
    while (address !== '') {
      while (address.length !== 0) {
        let token: string = '';
        let doNotStackToken: boolean = false;
        let char: string = address.charAt(0).toUpperCase();

        if (char.match(SPECIAL_DIAL_FILTER) !== null) {
          token = char;
          address = address.substr(1);
        } else if (char.match(GENERIC_DIAL_FILTER) !== null) {
          // Generic character: parse string until non-generic character is found
          let index: number = 0;
          for (; index < address.length; index++) {
            char = address.charAt(index).toUpperCase();
            if (char.match(GENERIC_DIAL_FILTER) !== null && char.match(SPECIAL_DIAL_FILTER) === null) {
              token = token + address[index];
            } else {
              break;
            }
          }

          if (index > 0) {
            address = address.substr(index);
          }

          if (firstPass === true) {
            const result = this.getCallDialableAddress(token, prefix, prefixLine, alternate, false);
            hasAlternatePrefix = hasAlternatePrefix || result.hasAlternate;

            // If the token has changed
            if (result.address !== token) {
              // Reprocess result since there can be additional tokens added by getDialableAddr
              hasAlternatePrefix =
                this.tokenizeAddress(result.address, prefix, prefixLine, tokens, alternate, false) ||
                hasAlternatePrefix;
              // Our call to TokenizeAddress will take care of adding the tokens so we don't want to stack this one
              doNotStackToken = true;
            }
          }
        }

        if (token === '') {
          diag.warn('processAddress', `Empty token: Could not process address on call ${this.webCallId}`);
          throw new Error('Incapable');
        }

        if (token === 'H') {
          this.hookFlashJustTokenized = true;
          this.firstDial = true;
        }

        if (!doNotStackToken) {
          diag.trace?.('processAddress', `New token added: ${token} on call ${this.webCallId}`);
          tokens.push(token);
        }
      }
    }

    return hasAlternatePrefix;
  }

  private getCallDialableAddress(
    address: string,
    prefix: ExtInterface.DialingPrefix | null,
    line: WebLine | null,
    alternate: boolean,
    forTandem: boolean
  ): { address: string; hasAlternate: boolean } {
    if (!line) {
      return { address: '', hasAlternate: false };
    }

    const result = line.getDialableAddress(address, prefix, this, alternate, forTandem);

    this.isLongDistance = result.isLongDistance;
    this.firstDial = result.isFirstDial;
    this.hookFlashJustTokenized = result.isHFTokenized;
    return { address: result.address, hasAlternate: result.hasAlternate };
  }

  public setOriginalOutgoingNumber(address: string) {
    // Remove dash '-' and comma ','
    this.originalOutgoingNumber = address.replace(/[-,]/g, '');
  }

  public connectData(owner: any, data: any): boolean {
    // adds or updates an element with a specified key
    this.dataTable.set(owner, data);
    return true;
  }

  public getDataOwner(owner: any): any | undefined {
    // Returns the value associated to the key, or undefined if there is none.
    return this.dataTable.get(owner);
  }

  public setZipToneFlag() {
    this.zipToneOnConnected = true;
  }

  public useZipToneFlag(): boolean {
    let old: boolean = this.zipToneOnConnected;
    this.zipToneOnConnected = false;
    return old;
  }

  public enableBeepInjection() {
    if (
      CallState.connected(this.state) &&
      this.webLine?.getTrunkConfig(this.infoRec.trunkAddress)?.isBeepInjection === true &&
      !this.beepInjectionEnabled
    ) {
      this.beepInjectionEnabled = true;
      this.lineDev.beepInjection(true);
    }
  }

  public disableBeepInjection() {
    if (this.beepInjectionEnabled) {
      this.beepInjectionEnabled = false;
      this.lineDev.beepInjection(false);
    }
  }

  public addMsrpMsg(message: string): string[] {
    this.msrpTranscript.push(message);
    return this.msrpTranscript;
  }

  public getMsrpTranscript(): string[] | [] {
    if (this.msrpTranscript) return this.msrpTranscript;
    else return [];
  }

  public clearMsrpTranscript(): void {
    if (this.msrpTranscript) this.msrpTranscript = [];
  }

  public setMsrpTextOwnersip(owner: string) {
    if (owner) this.msrpTextOwnership = owner;
    else this.msrpTextOwnership = '';
  }

  public getMsrpTextOwnersip(): string {
    return this.msrpTextOwnership;
  }

  public addRttMsg(message: string): string[] {
    this.rttTranscript.push(message);
    return this.rttTranscript;
  }

  public getRttTranscript(): string[] | [] {
    if (this.rttTranscript) return this.rttTranscript;
    else return [];
  }

  public assignContextId(ctxId: CtxId | null = null) {
    if (this.contextObjId === null) {
      if (ctxId === null) {
        // Create new Context Id object
        this.contextObjId = new CtxId();
        diag.trace?.(
          'assignContextId',
          `Create and assign CtxId: ${this.contextObjId.readCtxId()} on call ${this.webCallId}`
        );
      } else {
        this.contextObjId = ctxId;
        diag.trace?.('assignContextId', `Assign CtxId: ${this.contextObjId.readCtxId()} on call ${this.webCallId}`);
      }
    }
    if (ctxId != null && this.confContextObjId === null) {
      // Conf Context ID for call patch
      if (this.webConf) {
        this.confContextObjId = ctxId;
        diag.trace?.(
          'assignContextId',
          `Assign conf CtxId: ${this.confContextObjId.readCtxId()} on call ${this.webCallId}`
        );
      }
    }
  }

  public contextId(): number {
    if (this.contextObjId) {
      return this.contextObjId.readCtxId();
    } else {
      return 0;
    }
  }

  public confContextId(): number {
    if (this.confContextObjId) {
      return this.confContextObjId.readCtxId();
    } else {
      return 0;
    }
  }

  updateProgressTone(newState: CallState) {
    const oldState = this.state;
    let audibleAlertToneStopped = false;

    // check for stop tone first
    if (oldState === CallState.Dialtone && newState !== CallState.Dialtone) {
      this.lineDev.stopToneInProgress(ExtInterface.ProgressTone.DialTone, this);
    } else if (
      this.congestionState === CongestionState.CongestedClientTone &&
      oldState === CallState.Connected &&
      newState !== CallState.Connected
    ) {
      this.lineDev.stopToneInProgress(ExtInterface.ProgressTone.ReorderTone, this);
    } else if (
      this.ringbackOnProceeding.playing &&
      (newState !== CallState.Proceeding || (newState === CallState.Proceeding && !this.ringbackOnProceeding.needed))
    ) {
      this.lineDev.stopToneInProgress(ExtInterface.ProgressTone.RingbackTone, this);
      this.ringbackOnProceeding = { needed: false, playing: false };
    } else if (this.audibleAlertToneStarted && newState === CallState.Finished) {
      this.audibleAlertToneStarted = false;
      audibleAlertToneStopped = true;
      this.lineDev.stopToneInProgress(ExtInterface.ProgressTone.DialTone, this);
    }

    // now check for start tone
    if (oldState !== CallState.Dialtone && newState === CallState.Dialtone) {
      this.lineDev.addProgressTone(ExtInterface.ProgressTone.DialTone, this);
    } else if (
      this.congestionState === CongestionState.CongestedClientTone &&
      oldState !== CallState.Connected &&
      newState === CallState.Connected
    ) {
      this.lineDev.addProgressTone(ExtInterface.ProgressTone.ReorderTone, this);
    } else if (
      !this.ringbackOnProceeding.playing &&
      newState === CallState.Proceeding &&
      this.ringbackOnProceeding.needed
    ) {
      this.lineDev.addProgressTone(ExtInterface.ProgressTone.RingbackTone, this);
      this.ringbackOnProceeding = { needed: true, playing: true };
    } else if (audibleAlertToneStopped) {
      // swap the audible alert from DialTone (stopped above) to ReorderTone
      this.lineDev.addProgressTone(ExtInterface.ProgressTone.ReorderTone, this);
    }
  }

  updateSipTrunkPhoneNumber(newNumber: string) {
    this.callHeader.phoneNumber = newNumber;
    let stateUpdate = new StateUpdate('StateUpdate', this.self, this.state);
    stateUpdate.oldState = this.state;
    this.lineDev.report(stateUpdate);
  }

  isUnsupervisedTxfrBlocked() {
    return this.unsupervisedTransferBlocked;
  }
  setUnsupervisedTxfrBlocked() {
    this.unsupervisedTransferBlocked = true;
  }
  clearUnsupervisedTxfrBlocked() {
    this.unsupervisedTransferBlocked = false;
  }

  public async addToCallCDR(params: object) {
    if (params !== null && params !== undefined) {
      this.lineDev.addToCallCDR(this, params);
    } else {
      diag.warn('addToCallCDR', 'Null or undefined params');
    }
  }
}

export { WebCall as default };
