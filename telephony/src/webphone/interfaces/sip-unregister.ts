import { WebPhone } from './webphone';
import { Diag } from '../../common/diagClient';
const diag = new Diag('sip-unregister');
export async function unregister(this: WebPhone) {
  let success;
  let count = 0;
  for (let client of this.clients) {
    count += 1;
    try {
      await client.disconnect();
      diag.trace?.('unregister', `SIP UnRegister Successful on client <${count}>`);
      success = true;
    } catch (e) {
      success = false;
      diag.warn('unregister', `SIP UnRegister failed on client  <${count}>`);
    }
  }
  if (success) return Promise.resolve();
  else return Promise.reject(new Error(`SIP UnRegister failed on client  <${count}>`));
}
