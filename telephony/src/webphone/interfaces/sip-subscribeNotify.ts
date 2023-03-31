import { INotifyInfos } from '../sip/client';
import { SubscriberOptions } from 'sip-js/lib/api/subscriber-options';
import { WebPhone } from './webphone';

export interface ISubsEventMsg {
  event: string;
  destUri: string;
  sipCallID: string;
  errorCode: number | undefined;
  errorReason: string | undefined;
}

export async function subscribe(
  this: WebPhone,
  uri: string,
  event: string,
  nodeId: number,
  options: SubscriberOptions
) {
  return new Promise<void>((resolve, reject) => {
    const voiceClient = this.voiceClients.find((client) => client.nodeId === nodeId);
    if (!voiceClient) return reject('Cannot find voiceclient');

    voiceClient.client
      .subscribe(uri, event, options)
      .then(async () => {
        return resolve();
      })
      .catch(async (e: string) => {
        return reject(`Subscribe failed with error(${e})`);
      });
  });
}

export async function unsubscribe(
  this: WebPhone,
  uri: string,
  event: string,
  nodeId: number,
  options: SubscriberOptions
) {
  return new Promise<string>((resolve, reject) => {
    const voiceClient = this.voiceClients.find((client) => client.nodeId === nodeId);
    if (!voiceClient) return reject('Cannot find voiceclient');

    voiceClient.client
      .unsubscribe(uri, event, options)
      .then(async () => {
        return resolve('Successfull');
      })
      .catch(async (e: string) => {
        return reject(`Un-Subscribe failed with error(${e})`);
      });
  });
}

export async function incomingNotify(this: WebPhone, infos: INotifyInfos) {
  // Report incoming subscribe notify message
  const newSubsNotifyEvent = new CustomEvent('incSubsNotifyMsg', { detail: infos });
  this.dispatchEvent(newSubsNotifyEvent);
}

export async function subscribeAccepted(this: WebPhone, eventMsg: ISubsEventMsg) {
  // Report subscribe accepted message
  const subsAcceptedEvent = new CustomEvent('subsAcceptedMsg', { detail: eventMsg });
  this.dispatchEvent(subsAcceptedEvent);
}

export async function subscribeFailure(this: WebPhone, eventMsg: ISubsEventMsg) {
  // Report subscribe failure message
  const subsFailureEvent = new CustomEvent('subsFailureMsg', { detail: eventMsg });
  this.dispatchEvent(subsFailureEvent);
}
