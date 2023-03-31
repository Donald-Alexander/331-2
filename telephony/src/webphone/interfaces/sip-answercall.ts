import { SessionImpl } from '../sip/session';
import { WebPhone } from './webphone';
import { Diag } from '../../common/diagClient';
const diag = new Diag('sip-answercall');
export async function answer(this: WebPhone, id: string, nodeId: number) {
  try {
    const voiceClient = this.voiceClients.find((client) => client.nodeId === nodeId);
    if (!voiceClient) throw 'Can not find voice client';
    const session = voiceClient.client.getSession(id);
    if (session) {
      diag.trace?.('answer', `Call(${session.id}) requesting connection`);
      let modifiers = [];

      // options: Add SIP session MSRP SDP modifier callback
      const msrpSession = (session as SessionImpl).getMsrpSession();
      if (msrpSession) {
        modifiers.push((session as SessionImpl).msrpSdpChangeCb);
      }

      // options: Add SIP session RTT SDP modifier callback
      const rttSession = (session as SessionImpl).getRttSession();
      if (rttSession) {
        modifiers.push((session as SessionImpl).rttSdpChangeCb);
      }

      let options = { sessionDescriptionHandlerModifiers: modifiers };
      await session.accept(options);
    } else {
      diag.err('answer', `Undefined session.  Failed answer incoming call`);
      throw new Error('failure');
    }
  } catch (e) {
    diag.err('answer', `Failed to answer incoming call (${e})`);
    throw new Error(`Failed to answer incoming call`);
  }
}
