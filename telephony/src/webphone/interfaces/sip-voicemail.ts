import { WebPhone } from './webphone';
import { Diag } from '../../common/diagClient';
import { SubscriberOptions } from 'sip-js/lib/api/subscriber-options';
import { jitter } from '../sip/lib/utils';

const diag = new Diag('sip-voicemail');
const SIP_PRESENCE_EXPIRE = 7200; //2h

export async function vmSubscribe(this: WebPhone, primaryUri: string) {
  let success;
  let count = 0;
  let userId = this.webPhoneCfg.userId;

  const options: SubscriberOptions = {
    // Introducing a jitter here, to avoid thundering herds.
    expires: SIP_PRESENCE_EXPIRE + jitter(SIP_PRESENCE_EXPIRE, 5),
  };

  for (let client of this.clients) {
    count += 1;

    try {
      await client
        .subscribe(`sip:${userId}@${primaryUri}`, 'message-summary', options)
        .then(async () => {
          diag.out('vmSubscribe', `[Client ${count}] Success`);
          success = true;
        })
        .catch(async (e: any) => {
          diag.err('vmSubscribe', `[Client ${count}] Failed Error = ${e}`);
        });
    } catch (e) {
      success = false;
      diag.err('vmSubscribe', `Failed on client  <${count}> ( ${e} )`);
    }
  }
  if (success) return Promise.resolve();
  else return Promise.reject();
}

export async function vmUnsubscribe(this: WebPhone, primaryUri: string) {
  let success;
  let count = 0;
  let userId = this.webPhoneCfg.userId;

  const options: SubscriberOptions = {
    expires: 0,
  };

  return new Promise<string>(async (resolve, reject) => {
    for (let client of this.clients) {
      count += 1;

      try {
        await client

          .unsubscribe(`sip:${userId}@${primaryUri}`, 'message-summary', options)
          .then(async (msg: any) => {
            diag.out('vmUnsubscribe', `[Client ${count}] Success`);
            success = true;
            return resolve(msg);
          })
          .catch(async (e: any) => {
            diag.err('vmUnsubscribe', `[Client ${count}] Failed Error = ${e}`);
            return reject(e);
          });
      } catch (e) {
        success = false;
        diag.err('vmUnsubscribe', `Failed on client  <${count}> ( ${e} )`);
        return reject(e);
      }
    }
  });
}

export async function vmSendDigit(this: WebPhone, dtmfDigit: string, sipcallId: string, nodeId: number) {
  const requestOptions = {
    body: {
      contentDisposition: 'render',
      contentType: 'application/dtmf-relay',
      content: `Signal=${dtmfDigit}\r\nDuration=1000`,
    },
  };

  try {
    await this.sendInfo(sipcallId, requestOptions, nodeId);
    // this.reportUpdate(mode);
    diag.trace?.('vmSendDigit', `Voicemail digit ${dtmfDigit} sent`);
    //return `Successfull switched from from <${strPrevMode}> --> <${strNewMode}> mode`;
  } catch (e) {
    diag.warn('vmSendDigit', `Voicemail Failed sending digit ${dtmfDigit} with error': ${e}`);
    throw new Error(`Voicemail Failed sending digit ${dtmfDigit} with error': ${e}`);
  }
}
