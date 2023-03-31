import { WebPhone } from './webphone';
import { Diag } from '../../common/diagClient';

const diag = new Diag('sip-cancel');

export async function cancel(this: WebPhone, id: string, nodeId: number) {
  const voiceClient = this.voiceClients.find((client) => client.nodeId === nodeId);
  if (!voiceClient) {
    return Promise.reject('Can not find voice client');
  }

  try {
    const session = voiceClient.client.getSession(id);
    if (session) {
      await session.cancel();
      await session.terminated();
    } else {
      diag.err('cancel', `Undefined session. Failed call CANCEL for callId ${id}`);
    }
  } catch (e) {
    //Sip.js may terminate the call leg properly in terms of sip call state
    const session = voiceClient.client.getSession(id);
    if (session) {
      try {
        diag.warn(
          'cancel',
          `Additinal attempt to termiate the session because failed call CANCEL for callId ${id}. Caught: (${e})`
        );
        await session.bye();
        diag.trace?.(
          'cancel',
          `Additinal atempt teminated sip session for callId ${id} by calling bye() successfully)`
        );
      } catch (err) {
        diag.err('cancel', `Additinal attempt failed to terminate the sip session for callId ${id} (Caught: ${err})`);
      }
    } else {
      diag.trace?.('cancel', `No session found, sip session for callId ${id} may already be terminated. Caught:(${e})`);
    }
  }
}
