import * as ExtInterface from '../telephonyexternalinterfacedef';
import WebLineDev from './weblinedev';
import { WebCall } from '../webcall/webcall';
import { Diag } from '../common/diagClient';
const diag = new Diag('progressToneManager');

class ProgressToneManager {
  private static instance: ProgressToneManager;
  private progressTones: Map<number, ExtInterface.ProgressTone> = new Map(); // UCID => Tone to play
  private linedev: WebLineDev | null = null;

  constructor() {}

  init(lineDev: WebLineDev) {
    this.linedev = lineDev;
  }

  public static getInstance(): ProgressToneManager {
    return this.instance || (this.instance = new this());
  }

  public addToneToGenerate(tone: ExtInterface.ProgressTone, call: WebCall): void {
    if (this.linedev) {
      let newToneToPlay: ExtInterface.ProgressTone | null = null;

      if (call) {
        // The tone to be played is coming from a specific call.
        // This tone will be played right away only if no other
        // call is currently playing a more important tone.

        if (this.progressTones.has(call.webCallId)) {
          // Another tone was already assigned for that specific call
          // Remove the existing tone and replace with the new one
          this.progressTones.delete(call.webCallId);
          diag.trace?.(
            'addToneToGenerate',
            `Override tone: ${this.linedev.toneToText(tone)} for Call: ${call.webCallId}`
          );
        } else {
          diag.trace?.(
            'addToneToGenerate',
            `Add tone: ${this.linedev.toneToText(tone)} for Call: ${call.webCallId}`
          );
        }

        this.progressTones.set(call.webCallId, tone);
        newToneToPlay = this.getToneToBePlayed();
      }

      if (newToneToPlay) {
        diag.out('addToneToGenerate', `Start playing tone: ${this.linedev.toneToText(newToneToPlay)}`);
        this.linedev.generateProgressTone(newToneToPlay);
      }
    }
  }

  public stopToneGeneration(tone: ExtInterface.ProgressTone, call: WebCall): void {
    if (this.linedev) {
      if (call) {
        diag.trace?.(
          'stopToneGeneration',
          `Remove Tone: ${this.linedev.toneToText(tone)} for Call: ${call.webCallId}`
        );
        this.progressTones.delete(call.webCallId);
      }
      this.refreshToneGeneration();
    }
  }

  public refreshToneGeneration(): void {
    if (this.linedev) {
      let newToneToPlay = this.getToneToBePlayed();
      if (newToneToPlay) {
        diag.out(
          'refreshToneGeneration',
          `Restart playing tone: ${this.linedev.toneToText(newToneToPlay)}`
        );
        this.linedev.generateProgressTone(newToneToPlay);
      } else {
        diag.out('refreshToneGeneration', `Stop all progress tone`);
        this.linedev.stopProgressTone();
      }
    }
  }

  private getToneToBePlayed(): ExtInterface.ProgressTone | null {
    let toneToBePlayed: ExtInterface.ProgressTone | null = null;

    this.progressTones.forEach((tone, call) => {
      if (toneToBePlayed === null) {
        toneToBePlayed = tone;
      } else if (tone > toneToBePlayed) {
        toneToBePlayed = tone;
      }
    });

    return toneToBePlayed;
  }
}

// export singleton object
export const progressToneManager = ProgressToneManager.getInstance();
