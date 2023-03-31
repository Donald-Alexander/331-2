import { Invitation as SIPInvitation } from 'sip-js/lib/api/invitation';
import { Info } from 'sip-js/lib/api/info';
import { SessionStatus } from './enums';
import { ISessionAccept, SessionImpl } from './session';
// @ts-ignore
import { Session as MSRPSession } from '../msrp/Session.js';
import { Diag } from '../../common/diagClient';
const diag = new Diag('sip.invitation');

export class Invitation extends SessionImpl {
  protected session: SIPInvitation;
  private acceptedRef: any;

  constructor(options: any) {
    super(options);

    this.acceptedPromise = new Promise((resolve) => {
      this.acceptedRef = resolve;
    });

    this.session = options.session;
    this.headers = options.session.request.headers;
    this.sdpBody = options.session.body;
    this.cancelled = options.cancelled;
    // this.msrpSession = undefined;
    this.status = SessionStatus.RINGING;
    this.emit('statusUpdate', { id: this.id, status: this.status });
  }

  public async accept(options: any): Promise<void> {
    return (this.session as SIPInvitation).accept(options).then(() => {
      this.status = SessionStatus.ACTIVE;
      this.emit('statusUpdate', { id: this.id, status: this.status });
      this.acceptedRef({ accepted: true });

      this.session.delegate = {
        onInvite: (request) => {
          this._remoteIdentity = this.extractRemoteIdentity();
          this.emit('remoteIdentityUpdate', this, this.remoteIdentity);
        },
        onInfo: async (info: Info) => {
          await info.accept();
          var body = info.request.body;
          diag.trace?.('accept', `[INVITATION] Incoming SIP INFO for callID[${this.id}] with\n${body}`);
          this.emit('incomingInfo', { id: this.id, body: body });
        },
        onBye: (request) => {
          diag.trace?.('accept', `[INVITATION] Incoming SIP BYE for callID[${this.id}]`);
          var headers = request.headers;
          this.emit('incomingBye', { id: this.id, headers: headers });
        },
      };
    });
  }

  public accepted(): Promise<ISessionAccept> {
    return this.acceptedPromise;
  }

  public reject(): Promise<void> {
    return this.session.reject().then(() => this.acceptedRef({ accepted: false }));
  }

  public async tried() {
    throw new Error('Not applicable for incoming calls.');
  }

  public async cancel() {
    throw new Error('Cannot cancel an incoming call.');
  }
}
