import { Diag } from '../../common/diagClient';
import { WebPhone } from './webphone';

const diag = new Diag('sip-tandemtransfer');

export async function tandemTransfer(
  this: WebPhone,
  target: { id: string; referTo: string; extraHeaders?: Array<string>; nodeId: number }
): Promise<boolean> {
  try {
    const referrerOptions = { extraHeaders: target.extraHeaders };
    const voiceClient = this.voiceClients.find((client) => client.nodeId === target.nodeId);
    if (!voiceClient) throw 'Can not find voice client';
    const session = voiceClient.client.getSession(target.id);
    if (session) {
      return session.tandemTransfer(target.referTo, referrerOptions).then((res) => {
        diag.out('tandemTransfer', `Refer-To <${target.referTo}>, with options<${JSON.stringify(referrerOptions)}>`);
        return Promise.resolve(res);
      });
    } else {
      return Promise.reject(new Error('Can not find session'));
    }
  } catch (e) {
    diag.warn('tandemTransfer', `${JSON.stringify(e)}`);
    throw new Error('tandemTransfer failed');
  }
}
