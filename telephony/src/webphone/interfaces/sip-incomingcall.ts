import { CallType, RttMediaStatus } from '../../telephonyexternalinterfacedef';
import { webCfg } from '../../config/webcfg';
import { WebPhone } from './webphone';
import { runSession } from './sip-session';
import { CallHeader } from '../../telephonyutil';
import { isSdpMsrp, SipMsrp } from './sip-msrp';
import { isSdpRtt, SipRtt } from './sip-rtt';
import { SessionImpl } from '../sip/session';
import { AudibleAlertASASipNotification, DigitRecivedNotification } from '../../telephonyinternalinterfacedef';
import { Diag } from '../../common/diagClient';
const diag = new Diag('sip-incomingcall');

function getHeader(value: string, headers: { [name: string]: Array<{ raw: string }> }) {
  if (value in headers) {
    return headers[value][0].raw;
  }

  return '';
}

export async function incomingCall(this: WebPhone, session: SessionImpl) {
  try {
    /* build callheaderinfo here for now.
     * no need to present session to upper telephony */
    const callHeaderInfo = new CallHeader();
    callHeaderInfo.id = session.id || '';
    callHeaderInfo.phoneNumber = session.phoneNumber || '';
    callHeaderInfo.localChannel = getHeader('X-Localchannel', session.headers);
    callHeaderInfo.remoteChannel = getHeader('X-Remotechannel', session.headers);
    callHeaderInfo.uCI = getHeader('X-Uniquecall-Id', session.headers);
    callHeaderInfo.potsSrvToConnect = getHeader('X-Potssrv', session.headers);
    callHeaderInfo.route = getHeader('X-Route', session.headers);
    callHeaderInfo.initialRoute = getHeader('X-Initialroute', session.headers);
    callHeaderInfo.voipAddress = (session as any).media.session.incomingInviteRequest.message.from.uri.host || '';
    callHeaderInfo.callInfo = session.callInfo || '';
    callHeaderInfo.trunkAddress = getHeader('X-Ppss-Callinfo-Trunkaddress', session.headers);
    callHeaderInfo.parkTimeout = getHeader('X-Parktimeout', session.headers);
    callHeaderInfo.m911CallOrigin = getHeader('X-911callorigin', session.headers);
    callHeaderInfo.outsideBridge = getHeader('X-Outsidebridge', session.headers);
    callHeaderInfo.baseTrunkChannel = getHeader('X-Ppss-Basetrunkchannel', session.headers);
    callHeaderInfo.uiTrunkAddress = getHeader('X-Ppss-Ui-Trunkaddress', session.headers);
    callHeaderInfo.subject = getHeader('X-Subject', session.headers);
    callHeaderInfo.cSSID = getHeader('X-Cssid', session.headers);
    callHeaderInfo.routingMode = getHeader('X-Ppss-Routingmode', session.headers);
    callHeaderInfo.consultConf = getHeader('Consult-Conf', session.headers);
    callHeaderInfo.referredBy = getHeader('Referred-By', session.headers);
    callHeaderInfo.referedBy = getHeader('X-Referedby', session.headers);
    callHeaderInfo.callPriority = getHeader('X-Priority', session.headers);
    callHeaderInfo.reInvite = getHeader('X-Reinvite', session.headers);

    // Process From: to extract callerName from display
    let from: string = getHeader('From', session.headers);
    let firstQuote: number = from.indexOf('"');
    let secondQuote: number = -1;
    if (firstQuote != -1) {
      secondQuote = from.substr(firstQuote + 1).indexOf('"');
    }
    if (firstQuote > -1 && secondQuote > -1) {
      callHeaderInfo.callerName = from.substr(firstQuote + 1, secondQuote - firstQuote);
    }

    // Clear caller name if same or first part is same as phoneNumber
    if (callHeaderInfo.phoneNumber == callHeaderInfo.callerName) {
      callHeaderInfo.callerName = '';
    } else {
      let pos1: number = callHeaderInfo.callerName.indexOf('*');
      let pos2: number = callHeaderInfo.phoneNumber.indexOf('*');
      if (
        pos1 == pos2 &&
        pos1 != -1 &&
        callHeaderInfo.callerName.substr(0, pos1) == callHeaderInfo.phoneNumber.substr(0, pos2)
      ) {
        callHeaderInfo.callerName = '';
      }
    }

    // Create MSRP session if required
    let msrp: SipMsrp;
    if (this.msrpClients.length && isSdpMsrp(session.getSdpBody())) {
      const node = webCfg.nodeCfgMap.find((cfg) => cfg.proxyAddress === callHeaderInfo.voipAddress);
      if (node && node.id) {
        const msrpClient = this.msrpClients.find((client) => client.nodeId === node.id);
        if (msrpClient) {
          msrp = msrpClient.msrp;
          const msrpSession = msrpClient.msrp.createSession(session);
          (session as SessionImpl).setMsrpSession(msrpSession);
          callHeaderInfo.callType = CallType.Text;
        } else {
          diag.err('incomingCall', `cannot find msrp client with nodeId:${node.id}`);
        }
      }
    }

    // Create RTT session if required
    let rtt: SipRtt;
    if (this.rttClients.length && isSdpRtt(session.getSdpBody())) {
      const node = webCfg.nodeCfgMap.find((cfg) => cfg.proxyAddress === callHeaderInfo.voipAddress);
      if (node && node.id) {
        const rttClient = this.rttClients.find((client) => client.nodeId === node.id);
        if (rttClient) {
          rtt = rttClient.rtt;
          const rttSession = rttClient.rtt.createSession(session);
          (session as SessionImpl).setRttSession(rttSession);
          //callHeaderInfo.callType = CallType.Voice; /* to change !+ea */
          callHeaderInfo.rttEnabled = true;
        } else {
          diag.err('incomingCall', `cannot find rtt client with nodeId:${node.id}`);
        }
      }
    }

    // Report incoming call
    const eventNewCall = new CustomEvent('newIncCall', { detail: callHeaderInfo });
    this.dispatchEvent(eventNewCall);

    // Call status update event is called each time the session change state
    session.on('statusUpdate', (s: any) => {
      diag.trace?.('incomingCall', `** SIP Session[${s.id}] status updated: <${s.status}> **`);

      // Remove MSRP or RTT session
      if (s.status === 'terminated' || s.status === 'terminatedStackOnly') {
        if (msrp) {
          let msrpSession = msrp.sessionController.getSessionByCallID(s.id);
          if (msrpSession) msrpSession.end();
        }
        if (rtt) {
          let rttSession = rtt.sessionController.getSessionByCallID(s.id);
          if (rttSession) rttSession.end();
          // Report RTT disconnection if not already
          const eventRttDisconnected = new CustomEvent('rttMediaStatusUpdate', {
            detail: { sipCallID: s.id, state: RttMediaStatus.RttMediaNotConnected },
          });
          this.dispatchEvent(eventRttDisconnected);
        }
      }

      // Send EventTarget to telephony
      const event = new CustomEvent('updCallStatus', { detail: s });
      this.dispatchEvent(event);
    });

    session.on('incomingInfo', (infos: { id: string; body: string }) => {
      diag.trace?.('incomingCall', `[SESSION] Incoming SIP INFO for callID[${infos.id}]. body: ${infos.body}`);

      if (infos.body.includes('Signal=')) {
        const digit: string = infos.body.slice(7, 8);
        this.dispatchEvent(new DigitRecivedNotification(digit, infos.id));
      }
    });

    session.on('incomingBye', (message: { id: string; headers: {} }) => {
      const xHangupCause = getHeader('X-Hangup-Cause', message.headers);
      diag.trace?.(
        'incomingCall',
        `[SESSION] Incoming SIP BYE for callID[${message.id}] with HangupCause = '${xHangupCause}'`
      );
      if (xHangupCause === 'ASA') {
        this.dispatchEvent(new AudibleAlertASASipNotification(message.id));
      }
    });

    session.terminated().then((reason: string | void) => {
      diag.trace?.('incomingCall', `Session is terminated ${session.id}, reason: ${reason}`);
    });

    const { accepted, rejectCause } = await session.accepted();
    if (accepted) {
      diag.trace?.('incomingCall', `Call(${session.id}) is now connected/accepted`);

      session.on('remoteIdentityUpdate', () => {
        diag.trace?.(
          'incomingCall-on',
          `New identity is: ${session.remoteIdentity.displayName} - ${session.phoneNumber}`
        );
      });

      await runSession(this, session);

      // It could happen that the session was broken somehow
      if (session.saidBye) {
        diag.trace?.('incomingCall', 'The session was polite to you.');
      }
    } else {
      diag.trace?.('incomingCall', `session was rejected. cause: ${rejectCause}`);
      await session.terminated();
    }
  } catch (e) {
    diag.err('incomingCall', `session<${session.id}> failed, caught:${e}`);
  } finally {
    diag.trace?.('incomingCall', `Incoming call session <${session.id}> terminated`);
  }
}

export default incomingCall;
