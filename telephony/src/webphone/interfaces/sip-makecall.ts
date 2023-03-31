import { WebPhone } from './webphone';
import { runSession } from './sip-session';
import { ISession, SessionImpl } from '../sip/session';
import { Diag } from '../../common/diagClient';
import { RttMediaStatus } from '../../telephonyexternalinterfacedef';

const diag = new Diag('sip-makecall');

async function runCall(this: WebPhone, session: ISession): Promise<string> {
  const { accepted, headers, sdp, rejectCause } = await session.accepted();
  if (accepted) {
    diag.out('runCall', `Outgoing call [${session.id}] answered`);

    let msrpSession = (session as SessionImpl).getMsrpSession();
    if (msrpSession) {
      // Process 200OK SDP
      msrpSession.setDescription(sdp);

      // We must send an initial message as heartbeat to trigger the pure TCP connection between Kamailio and VoIP
      msrpSession.sendMessage(' ', 'text/x-msrp-heartbeat', () => {});

      // Now send the "SUBJECT" we got from the GUI Makecall
      await msrpSession.sendMessage(msrpSession.subject, 'text/plain', function () {
        diag.trace?.('runCall', 'Sent MSRP first message(subject)');
      });
    }

    let rttSession = (session as SessionImpl).getRttSession();
    if (rttSession) {
      // Process 200OK SDP
      rttSession.setDescription(sdp);
    }

    // Get a specific header from 200OK
    const trunkUniquecallId = headers['Trunk-Uniquecall-Id'];
    const cssId = headers['X-Cssid'];
    const connectedPots = headers['X-Potssrv'];

    // Send 'OutCallAnswered' EventTarget event
    const event = new CustomEvent('outCallAnswered', {
      detail: { id: session.id, cssId: cssId, trunkUci: trunkUniquecallId, connectedPotsSrv: connectedPots },
    });
    this.dispatchEvent(event);
    // Basically, listen for call termination. Don't do await, it blocks return otherwise.
    runSession(this, session);
    return Promise.resolve('CallAnswered');
  } else {
    /* Note. RejectCause is returned in acceptedPromise.
     * You will see this if call rejected E.G 486 Busy Here
     */
    await session.terminated(); //no suspension here
    diag.out('runCall', `Outgoing call <${session.id}> rejected cause: ${rejectCause}`);
    let cause = rejectCause || 'Sip error Response';
    return Promise.reject(new Error(`${cause}`));
  }
}

export async function makeCall(
  this: WebPhone,
  webCallId: number,
  uri: string,
  nodeId: number,
  extraHeaders: string[],
  subject: string,
  listenjoin: boolean = false,
  rttMediaEnable: boolean = false
) {
  try {
    const inviterOptions = { extraHeaders, earlyMedia: true };
    let session: ISession;
    if (rttMediaEnable) {
      diag.out('MakeCall', 'RTT - outgoing media is enabled.');
      const rttClient = this.rttClients.find((client) => client.nodeId === nodeId);
      if (!rttClient) throw 'Can not find rtt client';
      diag.out('MakeCall', 'RTT - calling INVITE.');
      session = await rttClient.client.invite(uri, inviterOptions, undefined, rttClient.rtt);
    } else if (subject) {
      const msrpClient = this.msrpClients.find((client) => client.nodeId === nodeId);
      if (!msrpClient) throw 'Can not find msrp client';

      session = await msrpClient.client.invite(uri, inviterOptions, msrpClient.msrp, undefined);
      if (session && session.msrpSession) {
        // Save subject to be played back once the TCP connection is established
        session.msrpSession.subject = subject;
      }
    } else {
      const voiceClient = this.voiceClients.find((client) => client.nodeId === nodeId);
      if (!voiceClient) throw 'Can not find voice client';
      session = await voiceClient.client.invite(uri, inviterOptions, undefined, undefined);
    }

    if (session) {
      if (listenjoin) {
        diag.out('makeCall', `Created L&J outgoing call [${session.id}] --> ${uri}`);
        // Send 'LJOutoingCallEvent' EventTarget event with session id and the nodeId
        const event = new CustomEvent('LJOutoingCallEvent', { detail: { sessionId: session.id, nodeId } });
        this.dispatchEvent(event);
      } else {
        diag.out('makeCall', `created outgoing call [${session.id}] --> ${uri}`);
        // Send 'newOutCall' EventTarget event with session id and its orignal webCallId
        const event = new CustomEvent('newOutCall', { detail: { sessionId: session.id, webCallId } });
        this.dispatchEvent(event);
      }

      // Call status update event is called each time the session change state
      session.on('statusUpdate', (s: any) => {
        diag.out('makeCall', `** SIP Session[${s.id}] status updated: <${s.status}> **`);

        // Remove MSRP or RTT session
        if (s.status === 'terminated' || s.status === 'terminatedStackOnly') {
          let msrpSession = (session as SessionImpl).getMsrpSession();
          if (msrpSession) {
            msrpSession.end();
          }

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

      (session as SessionImpl).on('incomingInfo', (infos: { id: string; body: string }) => {
        diag.trace?.('makeCall', `[SESSION] Incoming SIP INFO for callID[${infos.id}] with${infos.body}`);
      });

      /*
       *  -- promiseRunCall
       *     @ resolve when receiving 200ok immediately
       *     @ reject when receiving SIP 4xx or 5xx response
       *
       *  -- promiseCallInProgres
       *     @ resolve when receiving 180Ringing or 183SessionProgress
       *
       *  ---promiseTimeout (Note, timer could be moved into runCall to simplify the code. But, keep here for now as reminder of the situation)
       *     @ ALways resolve in 1 second: return to webCall.makeCall and
       *     @ Since we don't know the status when we are here. it could be,
       *         === Ringback received
       *         === INVITE Still in retransmission on network
       *         === Received 100 trying. 180 is not coming yetyet. E.g. call particually to some ISDN line
       *         *** Overall, reserve one second before resolve for one of reason above in case of promisRunCall resolved (immediately answer) or reject(got SIP error response)
       */
      let promiseTimeout = new Promise((resolve, reject) =>
        setTimeout(resolve, 1500, 'NoIncomingSipProvisioningReceivedYet')
      );
      let promiseRunCall = runCall.bind(this)(session);
      let promiseCallInProgres = (session as SessionImpl).isCallInProgress();
      const promises = [promiseTimeout, promiseCallInProgres, promiseRunCall];
      return new Promise((resolve, reject) => {
        Promise.race(promises)
          .then((res) => {
            resolve(res);
            diag.out('makeCall', `Got new outgoing call SIP stack response <${res}> for uri=${uri}`);
          })
          .catch((e) => {
            diag.out('makeCall', `create new outgoing call (Promise reject) got error (${e}) for uri=${uri}`);
            reject(e);
          });
      });
    } else {
      diag.err('makeCall', `Undefined session.  Failed creating new outgoing call`);
      throw new Error('session create failure!');
    }
  } catch (e) {
    diag.err('makeCall', `Failed to create new outgoing call. Error:${e}`);
    throw new Error(`${e}`);
  }
}
