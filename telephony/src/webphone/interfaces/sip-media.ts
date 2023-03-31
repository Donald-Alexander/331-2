import { Media, IAudioDevice } from '../sip/media';
import { Sound } from '../sip/sound';
import { Diag } from '../../common/diagClient';
// using 'require' compile for now but, will not work.  We must use: import testAudioFile from '../audio/Bell.mp3' instead;
const testAudioFile = require('../audio/Bell.mp3');

var inputDevicesCb = new Object({});
var outputDevicesCb = new Object({});

const diag = new Diag('sip-media');
// media config
export const mediacfg = {
  input: {
    id: '',
    audioProcessing: false,
    volume: 1.0,
    muted: false,
  },
  output: {
    id: '',
    volume: 1.0,
    muted: false,
  },
};

const sound = new Sound(testAudioFile, { volume: 1.0, overlap: true });

Media.requestPermission();

Media.on('permissionGranted', () => {
  diag.trace?.('on', 'Permission granted');
});
Media.on('permissionRevoked', () => diag.trace?.('on', 'Permission revoked'));
Media.on('devicesChanged', () => {
  diag.trace?.('on', 'Devices changed');
  if (typeof inputDevicesCb === 'function') {
    inputDevicesCb(Media.inputs);
  }

  if (typeof outputDevicesCb === 'function') {
    outputDevicesCb(Media.outputs);
  }
});
Media.init();

export function playTestTone(device: { selection: ''; volume: number }) {
  const volume = device.volume / 10;
  if (!device.selection) {
    sound.sinkId = 'default';
    diag.trace?.('playTestTone', `playTestTone: No output device Id. Use default one`);
  } else {
    sound.sinkId = device.selection;
  }
  sound.volume = volume;
  sound.play();
}

export function registerInputDevicesCb(callback: Function) {
  inputDevicesCb = callback;
}

export function registerOutputDevicesCb(callback: Function) {
  outputDevicesCb = callback;
}
