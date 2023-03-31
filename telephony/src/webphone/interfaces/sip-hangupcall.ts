import { WebPhone } from './webphone';
import { Diag } from '../../common/diagClient';
const diag = new Diag('sip-hangupcall');
export async function hangupCall(this: WebPhone, callId: string, nodeId: number) {
  try {
    const voiceClient = this.voiceClients.find((client) => client.nodeId === nodeId);
    if (!voiceClient) throw new Error('Can not find voice client');
    const session = voiceClient.client.getSession(callId);

    if (session) {
      await session.bye();
    } else {
      diag.err('hangupCall', `Undefined session. Failed call hangup for callId ${callId}`);
    }
  } catch (e) {
    diag.err('hangupCall', `Failed call hangup for callId ${callId} (${e})`);
  }
}
