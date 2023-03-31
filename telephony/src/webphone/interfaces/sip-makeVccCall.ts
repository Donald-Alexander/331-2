import { WebPhone } from './webphone';
import { runSession } from './sip-session';
import { ISession, SessionImpl } from '../sip/session';
import { CallType, RttMediaStatus } from '../../telephonyexternalinterfacedef';
import { Diag } from '../../common/diagClient';
const diag = new Diag('sip-makeVccCall');

export async function makeVccCall(
  this: WebPhone,
  uri: string,
  callType: CallType,
  nodeId: number,
  extraHeaders: string[],
  rttMediaEnable: boolean
): Promise<{ sessionId: string; headers: { [name: string]: { parsed?: any; raw: string }[] } }> {
  let session: ISession;
  if (rttMediaEnable) {
    const rttClient = this.rttClients.find((client) => client.nodeId === nodeId);
    if (!rttClient) throw 'Can not find rtt client';
    session = await rttClient.client.invite(uri, { extraHeaders }, undefined, rttClient.rtt);
  } else if (callType == CallType.Text) {
    const msrpClient = this.msrpClients.find((client) => client.nodeId === nodeId);
    if (!msrpClient) throw 'Can not find msrp client';
    session = await msrpClient.client.invite(uri, { extraHeaders }, msrpClient.msrp, undefined);
  } else {
    const voiceClient = this.voiceClients.find((client) => client.nodeId === nodeId);
    if (!voiceClient) throw 'Can not find voiceclient';
    session = await voiceClient.client.invite(uri, { extraHeaders }, undefined, undefined);
  }
  diag.trace?.('makeVccCall', `created outgoing call[${session.id}]`);

  // Call status update event is called each time the session change state
  session.on('statusUpdate', (s: any) => {
    diag.trace?.('makeVccCall', `** SIP Session[${s.id}] status updated: <${s.status}> **`);
    // Remove MSRP or RTT session
    if (s.status === 'terminated' || s.status === 'terminatedStackOnly') {
      //if (msrp) {
      //  let msrpSession = msrp.sessionController.getSessionByCallID(s.id);
      //  if (msrpSession) msrpSession.end();
      //}
      let rttSession = (session as SessionImpl).getRttSession();
      if (rttSession) {
        rttSession.end();
        // Report RTT disconnection if not already
        const eventRttDisconnected = new CustomEvent('rttMediaStatusUpdate', {
          detail: { sipCallID: s.id, state: RttMediaStatus.RttMediaNotConnected },
        });
        this.dispatchEvent(eventRttDisconnected);
      }
    }
    const event = new CustomEvent('updCallStatus', { detail: s });
    this.dispatchEvent(event);
  });

  const { accepted, headers, sdp, rejectCause } = await session.accepted();
  if (!accepted) {
    diag.trace?.('makeVccCall', `Outgoing call was rejected : ${rejectCause}`);
    throw new Error(`Outgoing call not answered: ${rejectCause}`);
  }

  diag.trace?.('makeVccCall', `'Outgoing call[${session.id}] answered`);

  let msrpSession = (session as SessionImpl).getMsrpSession();
  if (msrpSession) {
    // Process 200OK SDP
    msrpSession.setDescription(sdp);

    // We must send an initial message as heartbeat to trigger the pure TCP connection between Kamailio and VoIP
    msrpSession.sendMessage(' ', 'text/x-msrp-heartbeat', () => {});
  }

  let rttSession = (session as SessionImpl).getRttSession();
  if (rttSession) {
    // Process 200OK SDP
    rttSession.setDescription(sdp);
  }

  // run the rest of the call asyncronously
  runSession(this, session);

  return { sessionId: session.id, headers };
}
