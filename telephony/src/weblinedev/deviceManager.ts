import { Diag } from '../common/diagClient';
const diag = new Diag('DeviceManager');

export enum IntradoAudioDeviceType {
  SpeakerWave1 = 'Speaker Wave 1',
  SpeakerWave2 = 'Speaker Wave 2',
  MicrophoneWave1 = 'Microphone Wave 1',
  MicrophoneWave3 = 'Microphone Wave 3',
}

const mediaDevices: MediaDeviceInfo[] = [];

export async function enumerateDevices() {
  // empty old array
  mediaDevices.length = 0;

  await navigator.mediaDevices
    .enumerateDevices()
    .then((devices: MediaDeviceInfo[]) => {
      devices.forEach((device: MediaDeviceInfo) => {
        mediaDevices.push(device);
        // console.log('device: ' + JSON.stringify(device.toJSON(), null, 4));
      });
    })
    .catch((err: Error) => {
      diag.err('enumerateDevices', `${err.name}: ${err.message}`);
    });
}

// return empty string if not found one of IntradoAudioDevice
export function getDeviceId(type: IntradoAudioDeviceType): string {
  let deviceId = '';

  for (let i = 0; i < mediaDevices.length; i++) {
    if (mediaDevices[i].label && mediaDevices[i].label.search(type) !== -1) {
      deviceId = mediaDevices[i].deviceId;
      break;
    }
  }

  diag.trace?.('getDeviceId', `deviceId=${deviceId}`);
  return deviceId;
}
