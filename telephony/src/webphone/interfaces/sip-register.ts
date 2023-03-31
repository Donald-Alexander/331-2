import { ClientImpl } from '../sip/client';
import { WebPhone } from './webphone';
import { Diag } from '../../common/diagClient';
const diag = new Diag('sip-register');
export async function register(this: WebPhone) {
  let success = false;
  let count = 0;
  for (let client of this.clients) {
    count += 1;
    try {
      await (client as ClientImpl).connect();
      diag.trace?.('regiser', `SIP Register Successful on client <${count}>`);
      success = true;
    } catch (e) {
      success = false;
      diag.warn('register', `SIP Register failed on client <${count}>`);
    }
  }
  if (success) return Promise.resolve();
  else return Promise.reject(new Error(`SIP Register failed on client <${count}>`));
}
