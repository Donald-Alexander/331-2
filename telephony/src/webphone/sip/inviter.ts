import { Core } from 'sip-js';
import { Inviter as SIPInviter } from 'sip-js/lib/api/inviter';
import { Info } from 'sip-js/lib/api/info';

import { SessionStatus } from './enums';
import { ISessionAccept, SessionImpl } from './session';
import { Diag } from '../../common/diagClient';
const diag = new Diag('sip.inviter');

export class Inviter extends SessionImpl {
  protected session: SIPInviter;
  private progressedPromise: Promise<void> | undefined;
  private triedPromise: Promise<void>;

  constructor(options: any) {
    super(options);

    // PIT: Create MSRP session and, add INVITE MSRP SDP modifier callback
    if (options.msrp) {
      this.msrpSession = options.msrp.createSession(this);
      options.session.sessionDescriptionHandlerModifiers.push(this.msrpSdpChangeCb);
    }
    // create RTT session and add INVITE RTT SDP modifier callback
    if (options.rtt) {
      this.rttSession = options.rtt.createSession(this);
      options.session.sessionDescriptionHandlerModifiers.push(this.rttSdpChangeCb);
    }
    this.session = options.session;

    this.session.delegate = {
      onInfo: async (info: Info) => {
        await info.accept();
        var body = info.request.body;
        diag.trace?.('inviter', `[INVITER] Incoming SIP INFO for callID[${this.id}] with\n${body}`);
        this.emit('incomingInfo', { id: this.id, body: body });
      },
    };

    this.triedPromise = new Promise((tryingResolve) => {
      this.progressedPromise = new Promise((progressResolve) => {
        this.acceptedPromise = new Promise((acceptedResolve, acceptedReject) => {
          this.inviteOptions = this.makeInviteOptions({
            onAccept: acceptedResolve,
            onReject: acceptedResolve,
            onRejectThrow: acceptedReject,
            onProgress: progressResolve,
            onTrying: tryingResolve,
          });
        });
      });
    });
  }

  public progressed(): Promise<void> | undefined {
    return this.progressedPromise;
  }

  public tried(): Promise<void> {
    return this.triedPromise;
  }

  public accepted(): Promise<ISessionAccept> {
    return this.acceptedPromise;
  }

  public invite(): Promise<Core.OutgoingInviteRequest> {
    return this.session.invite(this.inviteOptions).then((request: Core.OutgoingInviteRequest) => {
      return request;
    });
  }

  public async accept() {
    throw new Error('Cannot accept an outgoing call.');
  }

  public async reject() {
    throw new Error('Cannot reject an outgoing call.');
  }

  public cancel(): Promise<void> {
    return this.session.cancel();
  }
}
