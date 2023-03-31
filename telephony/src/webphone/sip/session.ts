import { EventEmitter } from 'events';
import pTimeout from 'p-timeout';
import { Diag } from '../../common/diagClient';
const diag = new Diag('sip.session');

import {
  C as SIPConstants,
  Core,
  Grammar,
  IncomingResponse,
  NameAddrHeader,
  SessionDescriptionHandlerModifiers,
  TypeStrings as SIPTypeStrings,
  Utils,
} from 'sip-js';

import { Invitation } from 'sip-js/lib/api/invitation';
import { Inviter } from 'sip-js/lib/api/inviter';
import { InviterInviteOptions } from 'sip-js/lib/api/inviter-invite-options';
import { Referrer } from 'sip-js/lib/api/referrer';
import { Session as UserAgentSession } from 'sip-js/lib/api/session';
import { SessionState } from 'sip-js/lib/api/session-state';
import { UserAgent } from 'sip-js/lib/api/user-agent';
import { SessionStatus } from './enums';
import { createFrozenProxy } from './lib/freeze';
import { log } from './logger';
import { checkAudioConnected } from './session-health';
import { InternalSession, SessionMedia } from './session-media';
import { SessionStats } from './session-stats';
import * as Time from './time';
import { IMedia, IRemoteIdentity } from './types';
import { RTTSession as RttSession } from '../rtt/Session';
// @ts-ignore
import { Session as MsrpSession } from '../msrp/Session.js';
import { ReferrerOptions } from 'sip-js/lib/api/referrer-options';

export interface ISession {
  readonly id: string;
  readonly media: SessionMedia;
  readonly stats: SessionStats;
  readonly audioConnected: Promise<void>;
  readonly isIncoming: boolean;
  saidBye: boolean;
  holdState: boolean;
  status: SessionStatus;
  keepAppSessionAlive: boolean; // This flag is used when we have a WebRTCGw switch over and, we want to keep the WebCall application sessions alive until RE-Invite.
  msrpSession: MsrpSession | undefined;
  rttSession: RttSession | undefined;

  /**
   * The remote identity of this session.
   * @returns {IRemoteIdentity}
   */
  remoteIdentity: IRemoteIdentity;

  /**
   * The local stream of this session.
   * @returns {MediaStream}
   */
  localStream: MediaStream;

  /**
   * The remote stream of this session.
   * @returns {MediaStream}
   */
  remoteStream: MediaStream;

  /**
   * @returns {boolean} if auto answer is on for this session.
   */
  autoAnswer: boolean;

  /**
   * @returns {string |undefined} if auto answer is on for this session.
   */
  callInfo: string | undefined;

  /**
   * @returns {string} Phone number of the remote identity.
   */
  phoneNumber: string;

  /**
   * @returns {Date} Starting time of the call.
   */
  startTime: any;

  /**
   * @returns {Date} End time of the call.
   */
  endTime: any;

  accept(options: any): Promise<ISessionAccept | void>;
  reject(): Promise<void>;

  /**
   * Terminate the session.
   */
  terminate(delegates?: any, options?: any): Promise<Core.OutgoingByeRequest>;

  /**
   * Promise that resolves when the session is accepted or rejected.
   * @returns Promise<ISessionAccept>
   */
  accepted(): Promise<ISessionAccept>;

  /**
   * Promise that resolves when the session is terminated.
   */
  terminated(): Promise<string | void>;

  /**
   * Put the session on hold.
   */
  hold(): Promise<boolean>;

  /**
   * Take the session out of hold.
   */
  unhold(): Promise<boolean>;

  /**
   * Update the session 'holdState'.
   */
  upgHoldState(state: boolean): void;

  /**
   * Set flag to keep application session alive
   */
  setKeepAppSessionAlive(value: boolean): void;

  tandemTransfer(target: string, options?: ReferrerOptions): Promise<boolean>;

  /**
   * Blind transfer the current session to a target number.
   * @param {string} target - Number to transfer to.
   */
  blindTransfer(target: string): Promise<boolean>;
  bye(delegates?: any, options?: any): Promise<any>;
  cancel(): Promise<void>;
  sendInfo(options: any): Promise<any>;

  /**
   * Send one or more DTMF tones.
   * @param tones May only contain the characters `0-9A-D#*,`
   */
  dtmf(tones: string, options: any): boolean;

  /* tslint:disable:unified-signatures */
  on(event: 'terminated', listener: (id: string) => void): this;
  on(event: 'statusUpdate', listener: (session: { id: string; status: string; cause?: string }) => void): this;
  once(event: 'statusUpdate', listener: (session: { id: string; status: string; cause?: string }) => void): this;
  on(event: 'callQualityUpdate', listener: (id: string, stats: SessionStats) => void): this;
  on(event: 'remoteIdentityUpdate', listener: (id: string, remoteIdentity: IRemoteIdentity) => void): this;
  /* tslint:enable:unified-signatures */
}

/**
 * SIP already returns a reasonPhrase but for backwards compatibility purposes
 * we use this mapping to return an additional reasonCause.
 */
let CAUSE_MAPPING = (code: number) => {
  switch (code) {
    case 480:
      return 'temporarily_unavailable';
    case 484:
      return 'address_incomplete';
    case 486:
      return 'busy';
    case 487:
      return 'request_terminated';
    default:
      return 'Unknown';
  }
};

export interface ISessionAccept {
  accepted: boolean;
  headers: { [name: string]: Array<{ parsed?: any; raw: string }> };
  sdp: string;
  rejectCode?: number;
  rejectCause?: string;
  rejectPhrase?: string;
}

export interface ISessionCancelled {
  reason?: string;
}

/**
 * @hidden
 */
export class SessionImpl extends EventEmitter implements ISession {
  public readonly id: string;
  public readonly media: SessionMedia;
  public readonly stats: SessionStats;
  public readonly audioConnected: Promise<void>;
  public readonly isIncoming: boolean;
  public saidBye: boolean;
  public holdState: boolean;
  public status: SessionStatus = SessionStatus.TRYING;
  public keepAppSessionAlive: boolean; // This flag is used when we have a WebRTCGw switch over and, we want to keep the WebCall application sessions alive until RE-Invite.

  public headers: { [name: string]: Array<{ parsed?: any; raw: string }> };
  public msrpSession: MsrpSession | undefined;
  public rttSession: RttSession | undefined;

  protected acceptedPromise!: Promise<ISessionAccept>;
  protected inviteOptions!: InviterInviteOptions;
  protected session: Inviter | Invitation;
  protected terminatedReason?: string;
  protected cancelled?: ISessionCancelled;
  protected _remoteIdentity: IRemoteIdentity;
  protected sdpBody: string;

  private acceptedSession: any;

  // private acceptPromise: Promise<void>;
  // private rejectPromise: Promise<void>;
  private terminatedPromise: Promise<string | void>;
  private reinvitePromise!: Promise<boolean>;

  private onTerminated: (sessionId: string) => void;
  sessionDescriptionHandler: any;

  protected constructor({
    session,
    media,
    onTerminated,
    isIncoming,
  }: {
    session: Inviter | Invitation;
    media: IMedia;
    onTerminated: (sessionId: string) => void;
    isIncoming: boolean;
  }) {
    super();
    this.session = session;
    this.id = session.request.callId;
    this.media = new SessionMedia(this, media);
    this.media.on('mediaFailure', () => {
      this.session.bye();
    });
    this.onTerminated = onTerminated;
    this.isIncoming = isIncoming;

    // Session stats will calculate a MOS value of the inbound channel every 5
    // seconds.
    // TODO: make this setting configurable.
    this.stats = new SessionStats(this.session, {
      statsInterval: 5 * Time.second,
    });

    // Bind MSRP SDP change
    this.msrpSdpChangeCb = this.msrpSdpChangeCb.bind(this);

    // Bind RTT SDP change
    this.rttSdpChangeCb = this.rttSdpChangeCb.bind(this);

    // Terminated promise will resolve when the session is terminated. It will
    // be rejected when there is some fault is detected with the session after it
    // has been accepted.
    this.terminatedPromise = new Promise((resolve) => {
      this.session.stateChange.on((newState: SessionState) => {
        if (newState === SessionState.Establishing) {
          diag.trace?.('on', `[SESSION] Session state changed --> Establishing`);
        }
        // N.B.: "Established" state: - Incoming call: Unfortunatly set before we get the 'ACK'
        //                            - Outgoing call: Set after we send the 'ACK'
        else if (newState === SessionState.Established) {
          diag.trace?.('on', `[SESSION] Session state changed --> Established`);
          const rttSession = this.getRttSession();
          //if (rttSession) {
          //  this.emit('RttMediaStatusUpdate', {})
          //}
        } else if (newState === SessionState.Terminated) {
          diag.trace?.('on', `[SESSION] Session state changed --> Terminated`);
          this.onTerminated(this.id);
          this.emit('terminated', { id: this.id });
          if (this.keepAppSessionAlive) this.status = SessionStatus.TERMINATED_STACKONLY;
          else this.status = SessionStatus.TERMINATED;
          this.emit('statusUpdate', { id: this.id, status: this.status });

          // Make sure the stats timer stops periodically quering the peer
          // connections statistics.
          this.stats.clearStatsTimer();

          // The cancelled object is currently only used by an Invitation.
          // For instance when an incoming call is cancelled by the other
          // party or system (i.e. call completed elsewhere).
          resolve(this.cancelled ? this.cancelled.reason : undefined);
        }
      });
    });

    this._remoteIdentity = this.extractRemoteIdentity();

    // Track if the other side said bye before terminating.
    this.saidBye = false;
    this.session.once('bye', () => {
      this.saidBye = true;
    });

    this.keepAppSessionAlive = false;
    this.headers = {};
    this.sdpBody = '';
    this.msrpSession = undefined;
    this.rttSession = undefined;
    this.holdState = false;

    this.stats.on('statsUpdated', () => {
      this.emit('callQualityUpdate', { id: this.id }, this.stats);
    });

    // Promise that will resolve when the session's audio is connected.
    // TODO: make these settings configurable.
    this.audioConnected = checkAudioConnected(this.session, {
      checkInterval: 0.5 * Time.second,
      noAudioTimeout: 10 * Time.second,
    });
  }

  get remoteIdentity(): IRemoteIdentity {
    return this._remoteIdentity;
  }

  get autoAnswer(): boolean {
    const callInfo = this.session.request.headers['Call-Info'];
    if (callInfo && callInfo[0]) {
      // ugly, not sure how to check if object with TS agreeing on my methods
      return (callInfo[0] as { parsed?: any; raw: string }).raw.includes('answer-after=0');
    }

    return false;
  }

  get callInfo(): string | undefined {
    const callInfo = this.session.request.headers['Call-Info'];
    if (callInfo && callInfo[0]) {
      // ugly, not sure how to check if object with TS agreeing on my methods
      return (callInfo[0] as { parsed?: any; raw: string }).raw;
    } else {
      return '';
    }
  }

  get phoneNumber(): string {
    if (this.isIncoming) {
      return this.remoteIdentity.phoneNumber;
    } else if (this.session.request.to.uri.user) {
      return this.session.request.to.uri.user;
    } else return '';
  }

  get startTime(): Date {
    return this.session.startTime!;
  }

  get endTime(): Date {
    return this.session.endTime!;
  }

  public accept(options: any): Promise<void> {
    throw new Error('Should be implemented in superclass');
  }

  public reject(): Promise<void> {
    throw new Error('Should be implemented in superclass');
  }

  public accepted(): Promise<ISessionAccept> {
    throw new Error('Should be implemented in superclass');
  }

  public terminate(delegates?: any, options?: any): Promise<Core.OutgoingByeRequest> {
    return this.bye(delegates, options);
  }

  public terminated(): Promise<string | void> {
    return this.terminatedPromise;
  }

  // Not used for now
  public async sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // prettier-ignore
  private inProgress(): Promise<string> {
    return new Promise((resolve) => {
      this.once('callIsRinging', (s: ISession) => {
        diag.trace?.('inProgress', `SIP outgoing call received a 180 Ringing`);
        resolve('180Ringing');
      });
      this.once('callInSessionProgress', (s: ISession) => {
        diag.trace?.('inProgress', `SIP outgoing call received a 183 Session Progress`);
        resolve('183SessionProgress');
      });
    });
  }

  public async isCallInProgress(): Promise<string> {
    return new Promise((resolve, reject) => {
      let promiseInProgress = this.inProgress.bind(this)();
      promiseInProgress
        .then((res) => {
          resolve(res);
        })
        .catch((e) => {
          diag.warn('isCallInProgress', `SIP outgoing call fails to get provisioning with error=${e}`);
          reject(e);
        });
    });
  }

  public async reinvite(modifiers: SessionDescriptionHandlerModifiers = []): Promise<void> {
    await new Promise((resolve, reject) => {
      this.session.invite(
        this.makeInviteOptions({
          onAccept: resolve,
          onReject: reject,
          onRejectThrow: reject,
          onProgress: resolve,
          onTrying: resolve,
          sessionDescriptionHandlerModifiers: modifiers,
        })
      );
    });
  }

  public hold(): Promise<boolean> {
    return this.setHoldState(true);
  }

  public unhold(): Promise<boolean> {
    return this.setHoldState(false);
  }

  public upgHoldState(state: boolean) {
    this.holdState = state;
  }

  public setKeepAppSessionAlive(value: boolean) {
    this.keepAppSessionAlive = value;
  }

  public async tandemTransfer(target: string, options?: ReferrerOptions): Promise<boolean> {
    const uri = UserAgent.makeURI(target);
    if (!uri) {
      return Promise.resolve(false);
    } else {
      return this.transfer(uri, options)
        .then((success) => {
          return Promise.resolve(success);
        })
        .catch((e) => {
          return Promise.resolve(false);
        });
    }
  }

  public async blindTransfer(target: string): Promise<boolean> {
    return this.transfer(UserAgent.makeURI(target)!).then((success) => {
      if (success) {
        this.bye();
      }

      return Promise.resolve(success);
    });
  }

  public async attendedTransfer(target: SessionImpl): Promise<boolean> {
    return this.transfer(target.session).then((success) => {
      if (success) {
        this.bye();
      }

      return Promise.resolve(success);
    });
  }

  /**
   * Reconfigure the WebRTC peerconnection.
   */
  public rebuildSessionDescriptionHandler() {
    (this.session as any)._sessionDescriptionHandler = undefined;
    (this.session as any).setupSessionDescriptionHandler();
  }

  public bye(delegates?: any, options?: any) {
    return this.session.bye(delegates, options);
  }

  public cancel() {
    return (this.session as Inviter).cancel();
  }

  public sendInfo(options: {}) {
    return this.session.info(undefined, options);
  }

  /**
   * Returns true if the DTMF was successful.
   */
  public dtmf(tones: string, options?: any): boolean {
    // Unfortunately there is no easy way to give feedback about the DTMF
    // tones. SIP.js uses one of two methods for sending the DTMF:
    //
    // 1. RTP (via the SDH)
    // Internally returns a `boolean` for the whole string.
    //
    // 2. INFO (websocket)
    //
    // Sends one tone after the other where the timeout is determined by the kind
    // of tone send. If one tone fails, the entire sequence is cleared. There is
    // no feedback about the failure.
    //
    // For now only use the RTP method using the session description handler.
    return this.session.sessionDescriptionHandler!.sendDtmf(tones, options);
  }

  public get localStream() {
    return (this.session as any).__streams.localStream;
  }

  public get remoteStream() {
    return (this.session as any).__streams.remoteStream;
  }

  public getSdpBody(): string {
    return this.sdpBody;
  }

  public setRttSession(rtt: RttSession | undefined) {
    this.rttSession = rtt;
  }

  public getRttSession(): RttSession | undefined {
    return this.rttSession ? this.rttSession : undefined;
  }

  // This is the modifier function called back by sip.js in order to modify the SDP prior to be added to the 200 OK.
  public rttSdpChangeCb(description: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    diag.trace?.('rttSdpChangeCb', `RTT: Got description.type = ${description.type}\r\n`);
    if (
      (!this.isIncoming && description.type === 'offer') || // PIT INVITE SDP & Re-Invite
      (this.isIncoming && description.type === 'answer') || // Incoming 200OK SDP
      (this.isIncoming &&
        description.type === 'offer' &&
        (this.status == SessionStatus.ACTIVE || this.status == SessionStatus.ON_HOLD))
    ) {
      // This is a Re-Invite from an original Incoming call.  Ex.: Kamailio restarted ! */
      // Add a new local RTT SDP to the existing 200OK SDP
      const rttSession = this.getRttSession();
      if (rttSession) {
        const localRttSdp = rttSession.getLocalDescription();

        // Need to find the last SDP mid index.  Becarefull...  it is maybe from the BAD existing RTT SDP
        var midIndex = 0;
        const posLastMid = description.sdp?.lastIndexOf('a=mid');
        if (posLastMid) {
          const midIndexFound = description.sdp?.substr(posLastMid + 6, 1);
          if (midIndexFound) midIndex = parseInt(midIndexFound, 10);
        }

        // It is now time to modify the SDP to add the RTT part
        const posBadSdpRtt = description.sdp?.indexOf('m=text 0 TCP/RTT 0');
        if (posBadSdpRtt !== -1 && description.sdp)
          description.sdp = description.sdp?.slice(0, posBadSdpRtt) + localRttSdp + 'a=mid:' + midIndex + '\r\n';
        else if (description.sdp && localRttSdp)
          description.sdp = description.sdp?.concat(localRttSdp) + 'a=mid:' + (midIndex + 1) + '\r\n';
      } else {
        diag.err(`SIP CallID(%s) failed getting RTT session to add its SDP`, this.id);
      }
    }
    return Promise.resolve(description);
  }

  public setMsrpSession(msrp: MsrpSession | undefined) {
    this.msrpSession = msrp;
  }

  public getMsrpSession(): MsrpSession | undefined {
    return this.msrpSession ? this.msrpSession : undefined;
  }

  // This is the modifier function called back by sip.js in order to modify the SDP prior to be added to the 200 OK.
  public msrpSdpChangeCb(description: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    if (
      (!this.isIncoming && description.type === 'offer') || // PIT INVITE SDP & Re-Invite
      (this.isIncoming && description.type === 'answer') || // Incoming 200OK SDP
      (this.isIncoming && description.type === 'offer' && this.status == SessionStatus.ACTIVE)
    ) {
      // This is a Re-Invite from an original Incoming call.  Ex.: Kamailio restarted ! */
      // Add a new local MSRP SDP to the existing 200OK SDP
      const msrpSession = this.getMsrpSession();
      if (msrpSession) {
        const localMsrpSdp = msrpSession.getLocalDescription();

        // Need to find the last SDP mid index.  Becarefull...  it is maybe from the BAD existing MSRP SDP
        var midIndex = 0;
        const posLastMid = description.sdp?.lastIndexOf('a=mid');
        if (posLastMid) {
          const midIndexFound = description.sdp?.substr(posLastMid + 6, 1);
          if (midIndexFound) midIndex = parseInt(midIndexFound, 10);
        }

        // It is now time to modify the SDP to add the MSRP part
        const posBadSdpMsrp = description.sdp?.indexOf('m=message 0 TCP/MSRP 0');
        if (posBadSdpMsrp !== -1)
          description.sdp = description.sdp?.slice(0, posBadSdpMsrp) + localMsrpSdp + 'a=mid:' + midIndex + '\r\n';
        else description.sdp = description.sdp?.concat(localMsrpSdp) + 'a=mid:' + (midIndex + 1) + '\r\n';
      } else {
        diag.err('rttSdpChangeCb', `SIP CallID(${this.id}) failed getting MSRP session to add its SDP`);
      }
    }
    return Promise.resolve(description);
  }

  public freeze(): ISession {
    return createFrozenProxy({}, this, [
      'audioConnected',
      'autoAnswer',
      'callInfo',
      'endTime',
      'holdState',
      'upgHoldState',
      'id',
      'isCallInProgress',
      'isIncoming',
      'media',
      'phoneNumber',
      'remoteIdentity',
      'saidBye',
      'keepAppSessionAlive',
      'setKeepAppSessionAlive',
      'headers',
      'sdpBody',
      'getSdpBody',
      'rttSession',
      'setRttSession',
      'getRttSession',
      'rttSdpChangeCb',
      'msrpSession',
      'setMsrpSession',
      'getMsrpSession',
      'msrpSdpChangeCb',
      'startTime',
      'stats',
      'status',
      'accept',
      'accepted',
      'tandemTransfer',
      'attendedTransfer',
      'blindTransfer',
      'bye',
      'dtmf',
      'freeze',
      'hold',
      'reinvite',
      'reject',
      'sendInfo',
      'terminate',
      'terminated',
      'unhold',
      'on',
      'once',
      'removeAllListeners',
      'removeListener',
      'cancel',
      'tried',
      'localStream',
      'remoteStream',
    ]);
  }

  protected makeInviteOptions({
    onAccept,
    onReject,
    onRejectThrow,
    onProgress,
    onTrying,
    sessionDescriptionHandlerModifiers = [],
  }: any) {
    return {
      requestDelegate: {
        onAccept: ({ message }: Core.IncomingResponse) => {
          this.status = SessionStatus.ACTIVE;
          this.emit('statusUpdate', { id: this.id, status: this.status });
          this._remoteIdentity = this.extractRemoteIdentity();
          this.emit('remoteIdentityUpdate', this, this.remoteIdentity);

          onAccept({ accepted: true, headers: message.headers, sdp: message.body });
        },
        onReject: ({ message }: Core.IncomingResponse) => {
          log.info('Session is rejected.', this.constructor.name);
          log.debug(message.reasonPhrase ? message.reasonPhrase : '', this.constructor.name);

          onReject({
            accepted: false,
            rejectCode: message.statusCode,
            rejectCause: CAUSE_MAPPING(message.statusCode!),
            rejectPhrase: message.reasonPhrase,
          });
        },
        onProgress: ({ message }: Core.IncomingResponse) => {
          if (message.statusCode === 183) {
            this.status = SessionStatus.SESSIONPROGRESS;
            this.emit('callInSessionProgress', { s: this });
            log.debug('Session call in SessionProgress', this.constructor.name);
          } else {
            this.status = SessionStatus.RINGING;
            this.emit('callIsRinging', { s: this });
            log.debug('Session call is Ringing', this.constructor.name);
          }
          this.emit('statusUpdate', { id: this.id, status: this.status });
          onProgress();
        },
        onTrying: () => {
          log.debug('Trying to setup the session', this.constructor.name);
          onTrying();
        },
      },
      sessionDescriptionHandlerOptions: {
        constraints: {
          audio: true,
          video: false,
        },
      },
      sessionDescriptionHandlerModifiers: sessionDescriptionHandlerModifiers,
    };
  }

  protected extractRemoteIdentity() {
    let phoneNumber: string = this.session.remoteIdentity.uri.user!;
    let displayName: string = '';
    if (this.session.assertedIdentity) {
      phoneNumber = this.session.assertedIdentity.uri.user!;
      displayName = this.session.assertedIdentity.displayName;
    }

    return { phoneNumber, displayName };
  }

  private async setHoldState(flag: boolean) {
    if (this.holdState === flag) {
      return this.reinvitePromise;
    }

    const modifiers = [];
    if (flag) {
      log.debug('Hold requested', this.constructor.name);
      modifiers.push(this.session.sessionDescriptionHandler!.holdModifier);
    } else {
      log.debug('Unhold requested', this.constructor.name);
    }

    const rttSession = this.getRttSession();
    if (rttSession) modifiers.push(this.rttSdpChangeCb);

    await this.reinvite(modifiers);

    this.holdState = flag;

    this.status = flag ? SessionStatus.ON_HOLD : SessionStatus.ACTIVE;
    this.emit('statusUpdate', { id: this.id, status: this.status });

    return this.reinvitePromise;
  }

  /**
   * Generic transfer function that either does a blind or attended
   * transfer. Which kind of transfer is done is dependent on the type of
   * `target` passed.
   *
   * In the case of a BLIND transfer, a string can be passed along with a
   * number.
   *
   * In the case of an ATTENDED transfer, a NEW call should be made. This NEW
   * session (a.k.a. InviteClientContext/InviteServerContext depending on
   * whether it is outbound or inbound) should then be passed to this function.
   *
   * @param {UserAgentSession | string} target - Target to transfer this session to.
   * @returns {Promise<boolean>} Promise that resolves when the transfer is made.
   */
  private async transfer(target: Core.URI | UserAgentSession, options?: ReferrerOptions): Promise<boolean> {
    return pTimeout(this.isTransferredPromise(target, options), 20000, () => {
      log.error('Could not transfer the call', this.constructor.name);
      return Promise.resolve(false);
    });
  }

  private async isTransferredPromise(target: Core.URI | UserAgentSession, options?: ReferrerOptions) {
    return new Promise<boolean>((resolve) => {
      const referrer = new Referrer(this.session, target, options);

      referrer.refer({
        requestDelegate: {
          onAccept: () => {
            log.info('Transferred session is accepted!', this.constructor.name);
            resolve(true);
          },
          // Refer can be rejected with the following responses:
          // - 503: Service Unavailable (i.e. server can't handle one-legged transfers)
          // - 603: Declined
          onReject: () => {
            log.info('Transferred session is rejected!', this.constructor.name);
            resolve(false);
          },
          onNotify: () => ({}), // To make sure the requestDelegate type is complete.
        },
        requestOptions: options,
      });
    });
  }
}
