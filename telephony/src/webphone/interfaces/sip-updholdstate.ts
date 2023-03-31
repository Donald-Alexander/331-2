import { WebPhone } from './webphone';
import { Diag } from '../../common/diagClient';

const diag = new Diag('sip-updholdstate');

export async function updHoldState(this: WebPhone, id: string, nodeId: number, state: boolean) {
  const voiceClient = this.voiceClients.find((client) => client.nodeId === nodeId);
  if (!voiceClient) return Promise.reject('Can not find voice client');
  await voiceClient.client
    .updSessionHoldState(id, state)
    .then(async () => {
      diag.trace?.('updHoldState', `SIP session "holdstate" is now = ${state ? 'TRUE' : 'FALSE'}`);
    })
    .catch(async (e: string) => {
      diag.err(
        'updHoldState',
        `${e} failed setting the session "holdstate" with id <${id}> and state <${state ? 'TRUE' : 'FALSE'}>`
      );
      throw e;
    });
}
