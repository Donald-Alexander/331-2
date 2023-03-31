import { WebLineDev } from './weblinedev';
import { apiClient } from 'client-web-api/src/api/ApiClient';
import { VolumeControlFunction, volumeController } from './volumeController';
import { getUuid } from '../common/utils';
import { GreetingStarted, GreetingEnded, RecGreetingStarted, RecGreetingEnded } from '../telephonyexternalinterfacedef';
import { RingerMode } from './ringer';
import ActiveCalls from '../webcall/activecalls';
import CallState from '../webcall/callState';
import { MediaRecorder, register, IBlobEvent } from 'extendable-media-recorder';
import { connect } from 'extendable-media-recorder-wav-encoder';
import { Diag } from '../common/diagClient';

const diag = new Diag('wavManager');
const RingerFileNames = [
  'Ringers/HighPriority_10_10.wav',
  'Ringers/Ring1_1_1.wav',
  'Ringers/Ring2_2_2.wav',
  'Ringers/Ring3_3_3.wav',
  'Ringers/Ring4_4_4.wav',
  'Ringers/Ring5_5_5.wav',
  'Ringers/Ring6_6_6.wav',
  'Ringers/Ring7_7_7.wav',
  'Ringers/Ring8_8_8.wav',
  'Ringers/Ring9_9_9.wav',
];

class WavManager {
  private static instance: WavManager;
  private linedev: WebLineDev | undefined;
  private ringers: HTMLAudioElement[] = [];
  private currentRingerPriority: number = -1;

  private greetings: Map<string, HTMLAudioElement> = new Map();

  private mediaRecorder: any = undefined; // no type defined in extendable-media-recorder
  private mediaDataChunks: Blob[] = [];
  private mediaId: string = '';

  // private readonly audioContext = new window.AudioContext();
  constructor() {}

  public async init(lineDev: WebLineDev) {
    this.linedev = lineDev;

    // create audo element for ringer and load
    RingerFileNames.forEach((filename) => {
      const src = apiClient.getConfigurationFileUrl(filename);
      const audio = new Audio(src);
      audio.loop = true;
      audio.preload = 'auto';

      // const deviceId = deviceManager.getDeviceId(deviceManager.IntradoAudioDeviceType.SpeakerWave2);
      // (audio as any).setSinkId(deviceId);

      this.ringers.push(audio);
    });

    // setup mediaRecorder for wav files
    await register(await connect());
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/wav' });

    this.mediaRecorder.ondataavailable = (evt: IBlobEvent) => {
      this.mediaDataChunks.push(evt.data);
    };

    this.mediaRecorder.onstop = async () => {
      diag.trace?.('onstop', 'MeidaRecorder stopped, forwarding captured data chunks to service ...');

      if (this.linedev) {
        const evt = new RecGreetingEnded(this.mediaId, this.mediaDataChunks[0]);
        this.linedev.dispatchEvent(evt);
      }
    };
  }

  public setRingerFile(pr: number, filename: string): void {
    if (this.isValidPriority(pr)) {
      this.ringers[pr].src = apiClient.getConfigurationFileUrl(filename);
      diag.trace?.('setRingerFile', 'set ringer for pr=' + pr + ': ' + this.ringers[pr].src);
    }
  }

  public async play(pr: number): Promise<void> {
    if (this.isValidPriority(pr)) {
      diag.trace?.('play', 'play... pr=' + pr + '(' + this.ringers[pr].src + '), now=' + Date.now());

      volumeController.applyVolume(VolumeControlFunction.Ringer, true);

      await this.ringers[pr]
        .play()
        .then(() => {
          // console.log(ModuleName, 'play', 'playing...' + this.ringers[pr].src + ', now=' + Date.now());
          this.currentRingerPriority = pr;
        })
        .catch((e: Error) => {
          diag.warn( 'play', 'Error:' + e.message);
        });
    } else {
      diag.warn( 'play', 'Invalid priority: pr=' + pr);
    }
  }

  public stop(): void {
    if (this.isValidPriority(this.currentRingerPriority)) {
      diag.trace?.('stop', 'pause... pr=' + this.currentRingerPriority + ', now=' + Date.now());

      volumeController.applyVolume(VolumeControlFunction.Ringer, false);

      this.ringers[this.currentRingerPriority].pause();
    }
  }

  private isValidPriority(pr: number): boolean {
    return pr >= 0 && pr < this.ringers.length;
  }

  // the file may located on remote server or in-memory
  public async playGreeting(filename: string, local: boolean): Promise<string> {
    const src = local ? filename : apiClient.getConfigurationFileUrl(filename);
    const audio = new Audio(src);
    audio.loop = false;
    audio.preload = 'auto';

    const id = getUuid();
    this.greetings.set(id, audio);

    audio.onended = () => {
      this.greetings.delete(id);
      diag.trace?.('playGreeting', 'playing greeting ended, id=' + id);

      if (this.linedev) {
        const evt = new GreetingEnded(id, src);
        this.linedev.dispatchEvent(evt);
      }
    };

    await audio
      .play()
      .then(() => {
        if (this.linedev) {
          const evt = new GreetingStarted(id, src);
          this.linedev.dispatchEvent(evt);
        }
        diag.trace?.('playGreeting', 'playing greeting ... id=' + id + ', src=' + audio.src);
      })
      .catch((e: Error) => {
        diag.warn('playGreeting', 'Error:' + e.message);
      });

    return id;
  }

  public stopGreeting(id: string) {
    if (id) {
      const audio = this.greetings.get(id);
      if (audio) {
        audio.onpause = () => {
          this.greetings.delete(id);
          diag.trace?.('stopGreeting', 'playing greeting ended, id=' + id);
          if (this.linedev) {
            const evt = new GreetingEnded(id, audio.src);
            this.linedev.dispatchEvent(evt);
          }
        };

        audio.pause();
        diag.trace?.('stopGreeting', 'id=' + id);
      } else {
        diag.warn('stopGreeting', 'the greeting has already stopped: id=' + id);
      }
    } else {
      diag.warn('stopGreeting', 'empty greeting ID');
    }
  }

  public startRecGreeting() {
    try {
      if (this.mediaRecorder.state !== 'recording') {
        this.mediaDataChunks = [];
        this.mediaId = getUuid();
        
        this.mediaRecorder.start();

        if (this.linedev) {
          const evt = new RecGreetingStarted(this.mediaId);
          this.linedev.dispatchEvent(evt);
        } 
      } else {
        diag.trace?.('startRecGreeting', 'MeidaRecorder is busy, state: ' + this.mediaRecorder.state);
      }
    } catch (e) {
      diag.warn( 'startRecGreeting', 'Exception: ' + e);
    }
  }

  public stopRecGreeting() {
    try {
      this.mediaRecorder.stop();
    } catch (e) {
      diag.warn( 'stopRecGreeting', 'Exception: ' + e);
    }
  }

  public async setGreetingRecordingMode(enable: boolean): Promise<boolean> {
    if (!this.linedev) {
      diag.warn(
        'setGreetingRecordingMode',
        'Cannot enter Greeting Recording mode: Linedev is not ready'
      );
      return false;
    }

    if (enable) {
      // start recording

      // First we try to prevent any call from being connected (AutoConnect)

      try {
        await this.linedev.acdLogout(); // logout ACD queues
      } catch (e) {
        diag.warn('setGreetingRecordingMode', `exception in linedev.acdLogout()`);
      }

      // Next we validate that there are no active calls
      const connectedStates: CallState[] = [
        CallState.Connected,
        CallState.Disconnected,
        CallState.Proceeding,
        CallState.Ringback,
        CallState.Dialtone,
        CallState.Connecting,
        CallState.IHold,
      ];
      if (ActiveCalls.callsInStatesOf(connectedStates).length > 0) {
        // there are connected calls, can't enter greeting recording mode
        diag.warn('setGreetingRecordingMode', 'Cannot enter Greeting Recording mode: there are active calls');
        return false;
      }

      // Now we verify that there is no call check playback active

      // Finally we disable the ringer
      this.linedev.ringer.mode = RingerMode.Off;
    } else {
      // we're done recording greeting messages
      this.linedev.ringer.mode = RingerMode.On;
    }

    return true;
  }

  public static getInstance(): WavManager {
    return this.instance || (this.instance = new this());
  }
}

// export singleton object
export const wavManager = WavManager.getInstance();
