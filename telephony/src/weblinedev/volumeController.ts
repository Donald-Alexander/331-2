import { webCfg } from '../config/webcfg';
import { RingerDestination } from '../config/positionConfig';
import { WebLineDev } from './weblinedev';
import { CtiHardwareType } from '../telephonyexternalinterfacedef';
import { VolumeDestType } from '../webviperdriver/webviperdriver-def';
import { Diag } from '../common/diagClient';
const diag = new Diag('volumeController');

export enum VolumeControlDestination {
  Handset = 0,
  Speaker,
  HandsetSpeaker,
  Invalid,
}

export enum VolumeControlFunction {
  Conversation = 0,
  Playback,
  Ringer,
  ObserveAgent, // not used
  ExternalPlayback, // not used
  Idle, // not used
  InvalidFunction,
}

class FunctionVolumes {
  handset: number = -1;
  speaker: number = -1;
  enabled: boolean = false;
  activeDest: VolumeControlDestination = VolumeControlDestination.HandsetSpeaker;
}

class VolumeController {
  private static instance: VolumeController;

  private linedev: WebLineDev | undefined;
  private readonly defaultVolumes: Array<FunctionVolumes> = [];
  private currentVolumes: Array<FunctionVolumes> = [];
  // Current volume function being activated
  private currentFunction = VolumeControlFunction.InvalidFunction;
  private defaultRingerDestType = VolumeControlDestination.HandsetSpeaker;
  private defaultPlaybackDestType = VolumeControlDestination.HandsetSpeaker;

  constructor() {
    // this.linedev = lineDev;
    for (let i = 0; i < 6; i++) {
      this.defaultVolumes.push(new FunctionVolumes());
      this.currentVolumes.push(new FunctionVolumes());
    }
  }

  //   void cImpCSSPhone::GetDefaultVolumes()
  public init(linedev: WebLineDev): void {
    const idleVolume = -1;

    /* Idle is a special case, if it's not specifically defined in the ini file, we
    use the conversation volume instead (Idle must be set to -1 for this to happen)
    this key can be used to specify the idle volume for both the speaker and handset
    the new keys Idlehandset and Idlespeaker supercede IdleVolume */
    this.defaultVolumes[VolumeControlFunction.Idle].handset = idleVolume;
    this.defaultVolumes[VolumeControlFunction.Idle].speaker = idleVolume;

    /* PMG is unable to generate the proper keys to set the default volumes,
    instead it generates two keys:
    Defaulthandset which is used to set the handset volume for conversation, playback, observeragent, externalplayback and idle
    DefaultRingerVolume which is used to set the handset/speaker volume for ringer */
    this.defaultVolumes[VolumeControlFunction.Conversation].handset = webCfg.positionCfg.defaultConversationVolume;
    this.defaultVolumes[VolumeControlFunction.Playback].handset =
      this.defaultVolumes[VolumeControlFunction.Conversation].handset;
    this.defaultVolumes[VolumeControlFunction.ObserveAgent].handset =
      this.defaultVolumes[VolumeControlFunction.Conversation].handset;
    this.defaultVolumes[VolumeControlFunction.ExternalPlayback].handset =
      this.defaultVolumes[VolumeControlFunction.Conversation].handset;

    // PWEB-1150: set default ringer-handset value to defaultConversationVolume
    this.defaultVolumes[VolumeControlFunction.Ringer].handset = webCfg.positionCfg.defaultConversationVolume;
    this.defaultVolumes[VolumeControlFunction.Ringer].speaker = webCfg.positionCfg.defaultRingerVolume;

    if (webCfg.positionCfg.ringerDestination === RingerDestination.Handset) {
      this.defaultRingerDestType = VolumeControlDestination.Handset;
      this.defaultVolumes[VolumeControlFunction.Ringer].activeDest = VolumeControlDestination.Handset;
    } else if (webCfg.positionCfg.ringerDestination === RingerDestination.Speaker) {
      this.defaultRingerDestType = VolumeControlDestination.Speaker;
      this.defaultVolumes[VolumeControlFunction.Ringer].activeDest = VolumeControlDestination.Speaker;
    }

    // set current volumes to the default
    // this.currentVolumes = [...this.defaultVolumes]; // not work!!!
    for (let i = 0; i < this.defaultVolumes.length; i++) {
      this.currentVolumes[i] = { ...this.defaultVolumes[i] };
    }

    if (!this.linedev) {
      this.linedev = linedev;

      this.currentFunction = VolumeControlFunction.Idle;
      this.setEffectiveVolumes(VolumeControlFunction.Idle);
    }
  }

  public setVolume(fn: VolumeControlFunction, dest: VolumeControlDestination, vol: number): void {
    let volume = vol;
    if (volume < 0) {
      diag.trace?.('setVolume', `Invalid volume value: ${volume}, rounded up to 0`);
      volume = 0;
    } else if (volume > 99) {
      diag.trace?.('setVolume', `Invalid volume value: ${volume}, rounded up to 99`);
      volume = 99;
    }

    switch (fn) {
      case VolumeControlFunction.Conversation:
      case VolumeControlFunction.Ringer:
      case VolumeControlFunction.Playback:
      case VolumeControlFunction.Idle:
        if (dest === VolumeControlDestination.Handset) {
          this.currentVolumes[fn].handset = volume;

          // If volume to set is conversation, we set ObserveAgent also
          if (fn === VolumeControlFunction.Conversation) {
            this.currentVolumes[VolumeControlFunction.ObserveAgent].handset = volume;
          }
          // If volume is Playback, we set ExternalPlayback also
          else if (fn === VolumeControlFunction.Playback) {
            this.currentVolumes[VolumeControlFunction.ExternalPlayback].handset = volume;
          }
        } else if (dest === VolumeControlDestination.Speaker) {
          this.currentVolumes[fn].speaker = volume;

          // If volume to set is conversation, we set ObserveAgent also
          if (fn === VolumeControlFunction.Conversation) {
            this.currentVolumes[VolumeControlFunction.ObserveAgent].handset = volume;
          }
          // If volume is Playback, we set ExternalPlayback also
          else if (fn === VolumeControlFunction.Playback) {
            this.currentVolumes[VolumeControlFunction.ExternalPlayback].handset = volume;
          }
        } else {
          throw new Error('Invalid VolumeControlDestination');
        }
        break;
      default:
        throw new Error('Invalid VolumeControlFunction');
    }

    let ost = `Volume for ${VolumeControlFunction[fn]} on ${VolumeControlDestination[dest]} is set to ${volume}`;

    // Check if volume needs to be applied now
    if (
      this.currentVolumes[fn].enabled || // Volume being modified is enabled
      fn === VolumeControlFunction.Idle || // Volume being modified is IDLE
      (fn === VolumeControlFunction.Conversation &&
        (this.currentFunction == VolumeControlFunction.Idle || // Volume being modified is conversation and we are in idle mode
          this.currentVolumes[VolumeControlFunction.ExternalPlayback].enabled || // Volume being modified is conversation and we are doing extenal playback
          this.currentVolumes[VolumeControlFunction.ObserveAgent].enabled)) // Volume being modified is conversation and we are doing Observe
    ) {
      if (
        // this.linedev?.isAudioSwitchOverActive() &&
        fn === VolumeControlFunction.Ringer ||
        fn === VolumeControlFunction.Playback
      ) {
        ost += ' (effective delayed)';
      }
      // Apply immediately
      else {
        this.setEffectiveVolumes(fn);
        ost += ' (effective immediately)';
      }
    }

    diag.trace?.('setVolume', ost);
  }

  public getDefaultVolume(fn: VolumeControlFunction, dest: VolumeControlDestination): number {
    if (fn >= VolumeControlFunction.InvalidFunction) {
      throw new Error('Invalid VolumeControlFunction');
    }

    switch (dest) {
      case VolumeControlDestination.Handset:
        return this.defaultVolumes[fn].handset;
      case VolumeControlDestination.Speaker:
        return this.defaultVolumes[fn].speaker;
      default:
        throw new Error('Invalid VolumeControlDestination');
    }
  }

  public getCurrentVolume(fn: VolumeControlFunction, dest: VolumeControlDestination): number {
    switch (fn) {
      case VolumeControlFunction.Conversation:
      case VolumeControlFunction.Ringer:
      case VolumeControlFunction.Playback:
      case VolumeControlFunction.ExternalPlayback:
      case VolumeControlFunction.ObserveAgent:
        switch (dest) {
          case VolumeControlDestination.Handset:
            return this.currentVolumes[fn].handset;
          case VolumeControlDestination.Speaker:
            return this.currentVolumes[fn].speaker;
          default:
            throw new Error('Invalid VolumeControlDestination');
        }

      default:
        throw new Error('Invalid VolumeControlFunction');
    }
  }

  public applyVolume(fn: VolumeControlFunction, isActive: boolean): void {
    // Set the function status
    if (
      fn === VolumeControlFunction.Conversation ||
      fn === VolumeControlFunction.Ringer ||
      fn === VolumeControlFunction.Playback ||
      fn === VolumeControlFunction.ExternalPlayback ||
      fn === VolumeControlFunction.ObserveAgent
    ) {
      this.currentVolumes[fn].enabled = isActive;
    } else {
      throw new Error('Invalid VolumeControlFunction');
    }

    if (isActive) {
      diag.trace?.('applyVolume', `Volume for ${VolumeControlFunction[fn]} applied`);
    } else {
      diag.trace?.('applyVolume', `Volume for ${VolumeControlFunction[fn]} removed`);
    }

    // The order of these ifs defines the order of precendece for each function
    const previousFunction = this.currentFunction;
    if (this.currentVolumes[VolumeControlFunction.Conversation].enabled === true) {
      this.currentFunction = VolumeControlFunction.Conversation;
    } else if (this.currentVolumes[VolumeControlFunction.ObserveAgent].enabled === true) {
      this.currentFunction = VolumeControlFunction.ObserveAgent;
    } else if (this.currentVolumes[VolumeControlFunction.Playback].enabled === true) {
      this.currentFunction = VolumeControlFunction.Playback;
    } else if (this.currentVolumes[VolumeControlFunction.Ringer].enabled === true) {
      this.currentFunction = VolumeControlFunction.Ringer;
    } else if (this.currentVolumes[VolumeControlFunction.ExternalPlayback].enabled === true) {
      this.currentFunction = VolumeControlFunction.ExternalPlayback;
    } // no current fn
    else {
      this.currentFunction = VolumeControlFunction.Idle;
    }

    // If function has been changed
    if (previousFunction === this.currentFunction && this.currentFunction !== VolumeControlFunction.Playback) {
      diag.trace?.(
        'applyVolume',
        `${VolumeControlFunction[this.currentFunction]} is still the effective fucntion. Volumes unchanged`
      );
    } else {
      // Set effective volume with new function
      this.setEffectiveVolumes(this.currentFunction);
      diag.trace?.(
        'applyVolume',
        `${VolumeControlFunction[this.currentFunction]} is now the effective fucntion. Volumes changed`
      );
    }
  }

  public setEffectiveVolumes(fn: VolumeControlFunction): void {
    let fnHandset = fn;
    let fnSpeaker = fn;
    let ost = `apply volume for ${VolumeControlFunction[fn]}`;

    // If no volume explicitely defined, substitude with conversation volume
    if (this.currentVolumes[fn].handset === -1) {
      fnHandset = VolumeControlFunction.Conversation;
      ost += ' [Handset (from Conversation):';
    } else {
      ost += ' [Handset :';
    }
    ost += this.currentVolumes[fnHandset].handset;

    // If no volume explicitely defined, substitude with conversation volume
    if (this.currentVolumes[fn].speaker === -1) {
      fnSpeaker = VolumeControlFunction.Conversation;
      ost += ' - Speaker (from Conversation): ';
    } else {
      ost += ' - Speaker: ';
    }
    ost += `${this.currentVolumes[fnSpeaker].speaker}]`;

    diag.trace?.('SetEffectiveVolumes', ost);

    if (
      webCfg.positionCfg.ctiHardwareType === CtiHardwareType.PowerStationG3 ||
      webCfg.positionCfg.ctiHardwareType === CtiHardwareType.Sonic ||
      webCfg.positionCfg.ctiHardwareType === CtiHardwareType.SonicG3
    ) {
      // Set ringer destination
      let dest = this.getDestinationTypeFromVolume(fn);
      this.linedev?.webViperDriver?.setRingerDestination(dest);

      // If handset destination is Active, set volume
      if (
        this.currentVolumes[fnHandset].activeDest === VolumeControlDestination.Handset ||
        this.currentVolumes[fnHandset].activeDest === VolumeControlDestination.HandsetSpeaker
      ) {
        if (
          (fn === VolumeControlFunction.Ringer ||
            fn === VolumeControlFunction.Playback ||
            fn === VolumeControlFunction.ExternalPlayback) &&
          this.currentFunction === VolumeControlFunction.Conversation
        ) {
          diag.warn(
            'setEffectiveVolumes',
            'Volume being changed is playback or ringer, but current function is Conversation. Do not set handset volume.'
          );
        }
        // If the target volume value is not set, do not modify current volume
        else if (this.currentVolumes[fnHandset].handset !== -1) {
          const dest = VolumeDestType.e_VolReceiveHandset;
          this.linedev?.webViperDriver?.setVolume(dest, this.currentVolumes[fnHandset].handset);
        } else {
          diag.trace?.('SetEffectiveVolumes', 'Handset volume value is not set, do not modify current volume');
        }
      } else {
        diag.trace?.(
          'SetEffectiveVolumes',
          'Handset volume not set because the destination is not used for this function'
        );
      }

      // If speaker destination is Active, set volume
      if (
        this.currentVolumes[fnSpeaker].activeDest === VolumeControlDestination.Speaker ||
        this.currentVolumes[fnSpeaker].activeDest === VolumeControlDestination.HandsetSpeaker
      ) {
        // If the target volume value is not set, do not modify current volume
        if (this.currentVolumes[fnSpeaker].speaker !== -1) {
          const dest = VolumeDestType.e_VolSpeaker;
          this.linedev?.webViperDriver?.setVolume(dest, this.currentVolumes[fnSpeaker].speaker);
        } else {
          diag.trace?.('SetEffectiveVolumes', 'Speaker volume value is not set, do not modify current volume');
        }
      } else {
        diag.trace?.(
          'SetEffectiveVolumes',
          'Speaker volume not set because the destination is not used for this function'
        );
      }
    }
    // Not Sonic, not PSG3
    else {
      // if (device instanceof HTMLAudioElement) {
      //   if (
      //     this.currentVolumes[fn].activeDest === VolumeControlDestination.Handset ||
      //     this.currentVolumes[fn].activeDest === VolumeControlDestination.HandsetSpeaker
      //   ) {
      //     const v = this.currentVolumes[fn].handset;
      //     if (v >= 0 && v <= 100) {
      //       device.volume = v / 100;
      //     }
      //   }
      // }
    }
  }

  // If speaker or handset is muted (vol=0), remove it from destination to avoid race condition
  private getDestinationTypeFromVolume(fn: VolumeControlFunction): VolumeControlDestination {
    // both handset & speaker are unmuted
    if (this.currentVolumes[fn].handset > 0 && this.currentVolumes[fn].speaker > 0) {
      return this.currentVolumes[fn].activeDest;
    }
    // only handset is unmuted
    else if (this.currentVolumes[fn].handset > 0) {
      return VolumeControlDestination.Handset;
    }
    // only speaker is unmuted
    else if (this.currentVolumes[fn].speaker > 0) {
      return VolumeControlDestination.Speaker;
    }

    return VolumeControlDestination.Invalid;
  }

  public static getInstance(): VolumeController {
    return this.instance || (this.instance = new this());
  }
}

// export singleton object
export const volumeController = VolumeController.getInstance();
