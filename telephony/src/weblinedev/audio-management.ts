import { WebLineDev } from './weblinedev';
import * as media from '../webphone/interfaces/sip-media';
import { ClientImpl, IClient } from '../webphone/sip/client';

import { Diag } from '../common/diagClient';
const diag = new Diag('weblinedev.audio-management');

export function changeInputVolume(this: WebLineDev, value: number) {
  const vol = value / 10;
  /* As per discussion, revise later
  this.webPhone
    .getClient()
    .getSessions()
    .forEach((session: { media: { input: { volume: number } } }) => {
      session.media.input.volume = vol;
    });
  */
  this.webPhone.clients.forEach((client: IClient) => {
    (client as any).defaultMedia.input.volume = vol;
    diag.trace?.('changeInputVolume', `Input volume changed to ${value}`);
  });
}

export function changeInputMuted(this: WebLineDev, checked: boolean) {
  /* As per discussion, revise later
  this.webPhone
    .getClient()
    .getSessions()
    .forEach((session: { media: { input: { muted: boolean } } }) => {
      session.media.input.muted = checked;
    });
  */
  this.webPhone.clients.forEach((client: IClient) => {
    (client as any).defaultMedia.input.muted = checked;
    const state = checked ? 'Muted' : 'UnMuted';
    diag.trace?.('changeInputMuted', `Input volume is now ${state}`);
  });
}

export function changeOutputVolume(this: WebLineDev, value: number) {
  const vol = value / 10;
  /* As per discussion, revise later
  this.webPhone
    .getClient()
    .getSessions()
    .forEach((session: { media: { output: { volume: number } } }) => {
      session.media.output.volume = vol;
    });
  */
  this.webPhone.clients.forEach((client: IClient) => {
    (client as any).defaultMedia.output.volume = vol;
    diag.trace?.('changeOutputVolume', `Output volume changed to ${value}`);
  });
}

export function changeOutputMuted(this: WebLineDev, checked: boolean) {
  /* As per discussion, revise later
  this.webPhone
    .getClient()
    .getSessions()
    .forEach((session: { media: { output: { muted: boolean } } }) => {
      session.media.output.muted = checked;
    });
  */
  this.webPhone.clients.forEach((client: IClient) => {
    (client as any).defaultMedia.output.muted = checked;
    const state = checked ? 'Muted' : 'UnMuted';
    diag.trace?.('changeOutputMuted', `Output volume is now ${state}`);
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function until(fn: { (): any; (): any; (): any }) {
  while (!fn()) {
    await sleep(0);
  }
}

export async function changeInputDevSelection(this: WebLineDev, device: { value: any; label: string }) {
  if (device) {
    await until(() => this.startState && this.webPhone);
    /* As per discussion, revise later
    this.webPhone
      .getClient()
      .getSessions()
      .forEach((session: { media: { input: { id: any } } }) => {
        session.media.input.id = device.value;
      });
    */
    this.webPhone.clients.forEach((client: IClient) => {
      (client as any).defaultMedia.input.id = device.value;
      diag.trace?.('changeInputDevSelection', `Selected a New INPUT audio device called : ${device.label} `);
    });
  } else diag.trace?.('changeInputDevSelection', `No change in INPUT audio device selection`);
}

export async function changeOutputDevSelection(this: WebLineDev, device: { value: any; label: string }) {
  if (device) {
    await until(() => this.startState && this.webPhone);
    /* As per discussion, revise later
    this.webPhone
      .getClient()
      .getSessions()
      .forEach((session: { media: { output: { id: any } } }) => {
        session.media.output.id = device.value;
      });
    */
    this.webPhone.clients.forEach((client: IClient) => {
      (client as any).defaultMedia.output.id = device.value;
      diag.trace?.('changeOutputDevSelection', `Selected a New OUTPUT audio device called : ${device.label}`);
    });
  } else diag.trace?.('changeOutputDevSelection', `No change in OUTPUT audio device selection`);
}

export function registerInputDevicesCb(callback: Function) {
  media.registerInputDevicesCb(callback);
  diag.trace?.('registerInputDevicesCb', `called`);
}

export function registerOutputDevicesCb(callback: Function) {
  media.registerOutputDevicesCb(callback);
  diag.trace?.('registerOutputDevicesCb', 'called');
}

export function playTestTone(device: { selection: ''; volume: number }) {
  media.playTestTone(device);
}
