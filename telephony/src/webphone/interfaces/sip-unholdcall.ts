import { WebPhone } from './webphone';
import { Diag } from '../../common/diagClient';
const diag = new Diag('sip-unholdcall');

export async function unhold(this: WebPhone, id: string, nodeId: number) {
  const voiceClient = this.voiceClients.find((client) => client.nodeId === nodeId);
  if (!voiceClient) throw 'Can not find voice client';
  await voiceClient.client
    .unhold(id)
    .then(async () => {
      diag.trace?.('unhold', 'SIP call unhold!');
    })
    .catch(async (e: string) => {
      diag.err('unhold', `${e}(unhold)for the call with id <${id}>`);
      throw e;
    });
}
