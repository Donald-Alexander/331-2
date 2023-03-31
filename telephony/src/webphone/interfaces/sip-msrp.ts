import { WebPhone } from './webphone';
import { SessionImpl } from '../sip/session';
import { MsrpCfg } from '../msrp/config';
// @ts-ignore: Unreachable file error
import { WebSocketHandler } from '../msrp/WebSocketHandler.js';
// @ts-ignore: Unreachable file error
import { SessionController } from '../msrp/SessionController.js';
// @ts-ignore: Unreachable file error
import { Session as MsrpSession } from '../msrp/Session.js';
import { Diag } from '../../common/diagClient';
const diag = new Diag('msrp.SipMsrp');

export class SipMsrp {
  // private members
  msrpConfig: MsrpCfg;
  webPhone: WebPhone;
  webSocketHandler: WebSocketHandler;
  sessionController: SessionController;

  constructor(msrpConfig: MsrpCfg, webPhone: WebPhone) {
    this.msrpConfig = msrpConfig;
    this.webPhone = webPhone;
    this.sessionController = new SessionController(this, this.incMsrpMsgCb);

    // Connect WebSocket
    const uri = 'wss://' + msrpConfig.ProxyServer + '/';
    this.webSocketHandler = new WebSocketHandler(this);
    this.webSocketHandler.connect(uri);
  }

  createSession(sipSession: SessionImpl | undefined): MsrpSession | undefined {
    if (!sipSession) {
      diag.err('createSession', 'Undefined sip session.  Failed creating new MSRP session');
      return undefined;
    }

    // Create MSRP session from an incoming call
    var msrpSession = this.sessionController.createSession(sipSession.id);
    msrpSession.setWebSocketHandler(this.webSocketHandler);
    if (sipSession.isIncoming) {
      // Process INVITE SDP
      msrpSession.setDescription(sipSession.getSdpBody());

      // Create local SDP for 200OK response
      msrpSession.createLocalDescription();
    } else {
      // Psap Initiated Text.  Create local SDP for PIT INVITE
      msrpSession.createLocalDescription();
    }
    return msrpSession;
  }

  terminateSession(msrpSession: MsrpSession) {
    this.sessionController.removeSession(msrpSession);
  }

  async sendMessage(sipCallID: string, payload: string): Promise<boolean> {
    // Find session by SIP Call-ID
    let msrpSession = this.sessionController.getSessionByCallID(sipCallID);
    if (typeof msrpSession !== 'undefined') {
      await msrpSession.sendMessage(payload, 'text/plain', function () {
        diag.trace?.('sendMessage', 'Message sent!');
        return true;
      });
    }
    return false;
  }

  /* function: incMsrpMsgCb
     Note: use arrow function to AutoBind "SipMsrp"
  */
  incMsrpMsgCb = async (session: MsrpSession, msg: any) => {
    diag.trace?.('sendMessage', 'Incoming call message CALLBACK Tasks Successfull!');

    // Send EventTarget to telephony
    const event = new CustomEvent('incMsrpMsg', { detail: { sipCallID: session.sipCallID, taggedMsg: msg.body } });
    this.webPhone.dispatchEvent(event);
  };
}

export function isSdpMsrp(sdp: string): boolean {
  if (sdp.length && sdp.includes('m=message') === true) return true;
  else return false;
}
