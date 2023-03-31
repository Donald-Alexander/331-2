import { WebPhone } from './webphone';
import { Diag } from '../../common/diagClient';
const diag = new Diag('sip-rejectcall');
export async function reject(this: WebPhone, id: string, nodeId: number) {
  try {
    const voiceClient = this.voiceClients.find((client) => client.nodeId === nodeId);
    if (!voiceClient) throw 'Can not find voiceclient';
    const session = voiceClient.client.getSession(id);
    if (session) {
      const rejectResult = await session.reject();
    } else {
      diag.err('reject', `Undefined session. Failed call reject for callId ${id}`);
    }
  } catch (e) {
    diag.err('reject', `Failed call reject for callId ${id} (${e})`);
  }
}
