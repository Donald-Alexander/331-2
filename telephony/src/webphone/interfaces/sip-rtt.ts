import { WebPhone } from './webphone';
import { SessionImpl } from '../sip/session';
import { RttCfg } from '../rtt/config';
import { WebSocketHandler } from '../rtt/WebSocketHandler';
import { SessionController } from '../rtt/SessionController';
import { RTTSession as RttSession } from '../rtt/Session';
import { RttMediaStatus } from '../../telephonyexternalinterfacedef';
import { Diag } from '../../common/diagClient';

const diag = new Diag('sip-rtt');
export class SipRtt {
  // private members
  rttConfig: RttCfg;
  webPhone: WebPhone;
  webSocketHandler: WebSocketHandler;
  sessionController: SessionController;

  constructor(rttConfig: RttCfg, webPhone: WebPhone) {
    this.rttConfig = rttConfig;
    this.webPhone = webPhone;
    this.sessionController = new SessionController(this, this.incRttMsgCb);

    // Connect WebSocket
    const uri = 'wss://' + rttConfig.ProxyServer + '/';
    this.webSocketHandler = new WebSocketHandler(this);
    this.webSocketHandler.connect(uri);
  }

  createSession(sipSession: SessionImpl | undefined): RttSession | undefined {
    if (!sipSession) {
      diag.err('createSession', 'Undefined sip session.  Failed creating new RTT session');
      return undefined;
    }

    // Create RTT session from an incoming call
    var rttSession = this.sessionController.createSession(sipSession.id);
    rttSession.setWebSocketHandler(this.webSocketHandler);
    // !+ea - TO
    if (sipSession.isIncoming) {
      diag.out('createSession', `session ID is INCOMING ${sipSession.id}`);
      // set sender info
      rttSession.setSenderInfo(sipSession.headers.From[0].parsed.uri.normal.user);
      // Process INVITE SDP
      rttSession.setDescription(sipSession.getSdpBody());

      // Create local SDP for 200OK response
      rttSession.createLocalDescription();
    } else {
      diag.out('createSession', `session ID is OUTGOING ${sipSession.id}`);
      //rttSession.setSenderInfo(sipSession.headers.To[0].parsed.uri.normal.user);
      // Psap Initiated Text.  Create local SDP for PIT INVITE
      rttSession.createLocalDescription();
    }

    return rttSession;
  }

  terminateSession(rttSession: RttSession) {
    diag.out('terminateSession', `Terminating session ID ${rttSession.sid} for CallID rttSession.sipCallID)`);
    this.sessionController.removeSession(rttSession);
  }

  async sendMessage(sipCallID: string, payload: string): Promise<boolean> {
    // Find session by SIP Call-ID
    let rttSession = this.sessionController.getSessionByCallID(sipCallID);
    if (typeof rttSession !== 'undefined') {
      await rttSession.sendMessage(payload, 'text/plain', function () {
        diag.trace?.('sendMessage', 'Message sent!');
        return true;
      });
    }
    return false;
  }

  /* function: incRttMsgCb
     Note: use arrow function to AutoBind "SipRtt"
  */
  incRttMsgCb = async (session: RttSession, msg: any) => {
    diag.trace?.('incRttMsgCb', 'Incoming call message CALLBACK: Tasks Successfull !');

    // Send EventTarget to telephony
    const event = new CustomEvent('incRttMsg', {
      detail: {
        sipCallID: session.sipCallID,
        msg: msg.body,
        senderInfo: session.rttSenderInfo,
        sequenceNumber: session.rttSequenceNumber,
      },
    });
    this.webPhone.dispatchEvent(event);
  };

  outRttMsgCb = async (session: RttSession, msg: any) => {
    diag.trace?.('outRttMsgCb', 'Outgoing call message CALLBACK: Tasks Successfull !');

    // Send EventTarget to telephony
    const event = new CustomEvent('outRttMsg', {
      detail: {
        sipCallID: session.sipCallID,
        msg: msg.body,
        senderInfo: 'ME',
        sequenceNumber: session.rttSequenceNumber,
      },
    });
    this.webPhone.dispatchEvent(event);
  };

  // - this function is really meant to check whether RTT media is connected, and if so generate event
  // - the case to check for generating RttMediaNotConnected is handled elsewhere when terminating the RTT media
  async checkMediaStatus(sipCallID: string) {
    diag.trace?.('checkMediaStatus', 'Called');

    // Find session by SIP Call-ID
    let rttSession = this.sessionController.getSessionByCallID(sipCallID);
    if (typeof rttSession !== 'undefined') {
      if (rttSession.rttID > 0) {
        // Send EventTarget to telephony
        const event = new CustomEvent('rttMediaStatusUpdate', {
          detail: { sipCallID: sipCallID, state: RttMediaStatus.RttMediaConnected },
        });
        this.webPhone.dispatchEvent(event);
      }
    }
  }
}

export function isSdpRtt(sdp: string): boolean {
  if (sdp.length && sdp.includes('m=text') === true) return true;
  else return false;
}
