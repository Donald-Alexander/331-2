import { WebPhone } from './webphone';
import { Diag } from '../../common/diagClient';
const diag = new Diag('sip-sendInfo');

/*  Here is an example about what the sendInfo INPUT requestOptions argument should looks like:
    -------------------------------------------------------------------------------------------
    const requestOptions = {
      body: {
        contentDisposition: "render",
        contentType: "application/dtmf-relay",
        content: "Signal=1\r\nDuration=1000"
      }
    }
*/

export async function sendInfo(this: WebPhone, id: string, requestOptions: {}, nodeId: number) {
  try {
    const voiceClient = this.voiceClients.find((client) => client.nodeId === nodeId);
    if (!voiceClient) throw 'Can not find voiceclient';
    const session = voiceClient.client.getSession(id);
    if (session) {
      const infoResult = await session.sendInfo(requestOptions);
      diag.trace?.('sendInfo', `Sent SIP INFO method successfully for callId ${id}`);
    } else {
      diag.err('sendInfo', `Undefined session. Failed sending SIP INFO method for callId ${id}`);
    }
  } catch (e) {
    diag.err('sendInfo', `Failed sending SIP INFO method for callId ${id} (${e})`);
  }
}
