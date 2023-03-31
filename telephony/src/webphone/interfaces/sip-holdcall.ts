import { WebPhone } from './webphone';
import { Diag } from '../../common/diagClient';

const diag = new Diag('sip-holdcall');

export async function hold(this: WebPhone, id: string, nodeId: number) {
  const voiceClient = this.voiceClients.find((client) => client.nodeId === nodeId);
  if (!voiceClient) return Promise.reject('Can not find voice client');
  await voiceClient.client
    .hold(id)
    .then(async () => {
      diag.trace?.('hold', 'SIP call held!');
    })
    .catch(async (e: boolean) => {
      diag.err('hold', `call with id <${id}> caught: ${e}`);
      throw e;
    });
}
