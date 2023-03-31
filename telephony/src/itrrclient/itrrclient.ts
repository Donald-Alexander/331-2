import { ItrrClientWS } from './itrrclient-ws';
import * as ExtInterface from '../telephonyexternalinterfacedef';
import { Diag } from '../common/diagClient';
const diag = new Diag('itrrclient.itrrclient');
const diagHb = new Diag('itrrclient.hb');

export class ItrrClient extends EventTarget {
  private ws: ItrrClientWS | null = null;
  private wsLinkStatus: boolean;
  private heartbeatStatus: boolean;
  private heartbeatCounter: number;
  private itrrStatus: ExtInterface.ItrrStatus;
  private sequenceId: number;
  private convLifetime: number;
  private convSubDir: string;
  private exportSubDir: string;

  constructor() {
    super();
    this.wsLinkStatus = false;
    this.heartbeatStatus = false;
    this.heartbeatCounter = 0;
    this.sequenceId = 0;
    this.convLifetime = 365;
    this.convSubDir = '';
    this.exportSubDir = '';
    this.heartbeat = this.heartbeat.bind(this);
    this.wsReadyState = this.wsReadyState.bind(this);
    this.initItrr = this.initItrr.bind(this);
    this.itrrStatus = ExtInterface.ItrrStatus.NotAvailable;
  }

  async terminate(): Promise<boolean> {
    if (this.ws != null) {
      this.ws.close();
    }

    return true;
  }

  public async initialize(
    ws_server_url: string,
    convLifetime: number,
    convSubDir: string,
    exportSubDir: string
  ): Promise<boolean> {
    this.convLifetime = convLifetime;
    this.convSubDir = convSubDir;
    this.exportSubDir = exportSubDir;

    this.ws = new ItrrClientWS(ws_server_url);
    this.ws.registerForMesssage(this.onMessage);
    this.ws.registerForHeartbeat(this.heartbeat);
    this.ws.registerForReadyState(this.wsReadyState);
    this.ws.registerForInit(this.initItrr);
    if (await this.ws.open(false)) {
      diag.out('initialize', `ItrrClientWS connected`);
      return true;
    } else {
      this.ws.reconnect();
    }

    // Generate an initial status event
    this.updateStatus();

    return false;
  }

  private async initItrr(): Promise<boolean> {
    try {
      let message: any = {
        command: 'Init',
        msgId: this.generateId(),
        convSubDir: this.convSubDir,
        exportSubDir: this.exportSubDir,
        convLifeTime: this.convLifetime,
      };

      if (this.ws != null) {
        let res = await this.ws.sendAndWaitForResponse(message);
        if (res) {
          let data = JSON.parse(res);
          let errCode: number = data.errCode;
          if (errCode === 0) {
            diag.trace?.('initItrr', `Itrr initialization performed`);
            return true;
          } else {
            diag.warn('initItrr', `Unable to perform initialization`);
            return false;
          }
        }
      }
    } catch (e) {
      diag.warn('initItrr', `Cannot send a message due to ${e.message}`);
      return false;
    }
    return false;
  }

  private async heartbeat(): Promise<boolean> {
    if (this.heartbeatCounter > 5) {
      // No response has been provided for the last five heartbeats declare the heartbeat status as failed
      this.heartbeatStatus = false;
      diagHb.warn('heartbeat', `No response to Heartbeat`);
      this.updateStatus();
    }

    try {
      let message: any = {
        command: 'Heartbeat',
        msgId: this.generateId(),
      };
      if (this.ws != null) {
        this.ws.send(JSON.stringify(message));
        this.heartbeatCounter++;
        return true;
      }
    } catch (e) {
      diagHb.warn('heartbeat', `Cannot send a message due to: ${e.message}`);
      return false;
    }
    return false;
  }

  public async openFile(fileName: string, exportFile: boolean): Promise<number | null> {
    try {
      let message: any = {
        command: 'OpenFile',
        msgId: this.generateId(),
        fileName: fileName,
        fileType: exportFile ? 'ExportFile' : 'SavedConv',
      };

      if (this.ws != null) {
        let res = await this.ws.sendAndWaitForResponse(message);
        if (res) {
          let data = JSON.parse(res);
          let errCode: number = data.errCode;
          let itrrFileIndex: number = data.fileIndex;
          if (errCode === 0) {
            diag.trace?.('openFile', `Received Itrr File index: ${itrrFileIndex}`);
            return itrrFileIndex;
          } else {
            diag.warn('openFile', `No Itrr File index returned`);
            return null;
          }
        }
      }
    } catch (e) {
      diag.warn('openFile', `Cannot send a message due to ${e.message}`);
      return null;
    }
    return null;
  }

  public async closeFile(fileIndex: number): Promise<boolean> {
    try {
      let message: any = {
        command: 'CloseFile',
        msgId: this.generateId(),
        fileIndex: fileIndex,
      };

      if (this.ws != null) {
        let res = await this.ws.sendAndWaitForResponse(message);
        if (res) {
          let data = JSON.parse(res);
          let errCode: number = data.errCode;
          if (errCode === 0) {
            diag.trace?.('closeFile', `Closed Itrr File: ${fileIndex}`);
            return true;
          } else {
            diag.warn('closeFile', `Could not close Itrr File: ${fileIndex}`);
            return false;
          }
        }
      }
    } catch (e) {
      diag.warn('closeFile', `Cannot send a message due to ${e.message}`);
      return false;
    }
    return false;
  }

  public async advise(fileIndex: number, channel: ExtInterface.ItrrChannelType, sinkFlags: number) {
    try {
      let message: any = {
        command: 'Advise',
        msgId: this.generateId(),
        fileIndex: fileIndex,
        channel: channel,
        sinkFlags: sinkFlags,
      };

      if (this.ws != null) {
        let res = await this.ws.sendAndWaitForResponse(message);
        if (res) {
          let data = JSON.parse(res);
          let errCode: number = data.errCode;
          if (errCode === 0) {
            diag.trace?.('advise', `Advise on Itrr File: ${fileIndex} for ${sinkFlags}`);
            return true;
          } else {
            diag.warn('advise', `Could not Advise on Itrr File: ${fileIndex} for ${sinkFlags}`);
            return false;
          }
        }
      }
    } catch (e) {
      diag.warn('advise', `Cannot send a message due to ${e.message}`);
      return false;
    }
    return false;
  }

  public async unadvise(fileIndex: number, channel: ExtInterface.ItrrChannelType) {
    try {
      let message: any = {
        command: 'Unadvise',
        msgId: this.generateId(),
        fileIndex: fileIndex,
        channel: channel,
      };

      if (this.ws != null) {
        let res = await this.ws.sendAndWaitForResponse(message);
        if (res) {
          let data = JSON.parse(res);
          let errCode: number = data.errCode;
          if (errCode === 0) {
            diag.trace?.('unadvise', `Unadvise on Itrr File: ${fileIndex}`);
            return true;
          } else {
            diag.warn('unadvise', `Could not Unadvise on Itrr File: ${fileIndex}`);
            return false;
          }
        }
      }
    } catch (e) {
      diag.warn('unadvise', `Cannot send a message due to ${e.message}`);
      return false;
    }
    return false;
  }

  public async play(fileIndex: number, channel: ExtInterface.ItrrChannelType, playTime: Date): Promise<boolean> {
    try {
      let message: any = {
        command: 'Play',
        msgId: this.generateId(),
        fileIndex: fileIndex,
        channel: channel,
        playTime: playTime.getTime(),
      };

      if (this.ws != null) {
        let res = await this.ws.sendAndWaitForResponse(message);
        if (res) {
          let data = JSON.parse(res);
          let errCode: number = data.errCode;
          if (errCode === 0) {
            diag.trace?.('play', `Playing file with index ${fileIndex} and channel ${channel} at ${playTime}`);
            return true;
          } else {
            diag.warn('play', `Could not play file with index ${fileIndex} and channel ${channel} at ${playTime}`);
            return false;
          }
        }
      }
    } catch (e) {
      diag.warn('play', `Cannot send a message due to ${e.message}`);
      return false;
    }
    return false;
  }

  public async playStop(fileIndex: number, channel: ExtInterface.ItrrChannelType): Promise<boolean> {
    try {
      let message: any = {
        command: 'PlayStop',
        msgId: this.generateId(),
        fileIndex: fileIndex,
        channel: channel,
      };

      if (this.ws != null) {
        let res = await this.ws.sendAndWaitForResponse(message);
        if (res) {
          let data = JSON.parse(res);
          let errCode: number = data.errCode;
          if (errCode === 0) {
            diag.trace?.('playStop', `Stop playing file with index ${fileIndex} and channel ${channel}`);
            return true;
          } else {
            diag.warn('playStop', `Could not stop playing file with index ${fileIndex} and channel ${channel}`);
            return false;
          }
        }
      }
    } catch (e) {
      diag.warn('playStop', `Cannot send a message due to ${e.message}`);
      return false;
    }
    return false;
  }

  public async playPause(fileIndex: number, channel: ExtInterface.ItrrChannelType): Promise<boolean> {
    try {
      let message: any = {
        command: 'PlayPause',
        msgId: this.generateId(),
        fileIndex: fileIndex,
        channel: channel,
      };

      if (this.ws != null) {
        let res = await this.ws.sendAndWaitForResponse(message);
        if (res) {
          let data = JSON.parse(res);
          let errCode: number = data.errCode;
          if (errCode === 0) {
            diag.trace?.('playPause', `Pause playing file with index ${fileIndex} and channel ${channel}`);
            return true;
          } else {
            diag.warn('playPause', `Could not pause playing file with index ${fileIndex} and channel ${channel}`);
            return false;
          }
        }
      }
    } catch (e) {
      diag.warn('playPause', `Cannot send a message due to ${e.message}`);
      return false;
    }
    return false;
  }

  public async playResume(fileIndex: number, channel: ExtInterface.ItrrChannelType): Promise<boolean> {
    try {
      let message: any = {
        command: 'PlayResume',
        msgId: this.generateId(),
        fileIndex: fileIndex,
        channel: channel,
      };

      if (this.ws != null) {
        let res = await this.ws.sendAndWaitForResponse(message);
        if (res) {
          let data = JSON.parse(res);
          let errCode: number = data.errCode;
          if (errCode === 0) {
            diag.trace?.('playResume', `Resume playing file with index ${fileIndex} and channel ${channel}`);
            return true;
          } else {
            diag.warn('playResume', `Could not resume playing file with index ${fileIndex} and channel ${channel}`);
            return false;
          }
        }
      }
    } catch (e) {
      diag.warn('playPause', `Cannot send a message due to ${e.message}`);
      return false;
    }
    return false;
  }

  public async seek(fileIndex: number, channel: ExtInterface.ItrrChannelType, seekTime: Date): Promise<boolean> {
    try {
      let message: any = {
        command: 'Seek',
        msgId: this.generateId(),
        fileIndex: fileIndex,
        channel: channel,
        seekTime: seekTime.getTime(),
      };

      if (this.ws != null) {
        let res = await this.ws.sendAndWaitForResponse(message);
        if (res) {
          let data = JSON.parse(res);
          let errCode: number = data.errCode;
          if (errCode === 0) {
            diag.trace?.('seek', `Seek file with index ${fileIndex} and channel ${channel} at ${seekTime}`);
            return true;
          } else {
            diag.warn('seek', `Could not Seek file with index ${fileIndex} and channel ${channel} at ${seekTime}`);
            return false;
          }
        }
      }
    } catch (e) {
      diag.warn('seek', `Cannot send a message due to ${e.message}`);
      return false;
    }
    return false;
  }

  public async setSpeed(fileIndex: number, channel: ExtInterface.ItrrChannelType, speed: number): Promise<boolean> {
    try {
      let message: any = {
        command: 'SetSpeed',
        msgId: this.generateId(),
        fileIndex: fileIndex,
        channel: channel,
        speed: speed,
      };

      if (this.ws != null) {
        let res = await this.ws.sendAndWaitForResponse(message);
        if (res) {
          let data = JSON.parse(res);
          let errCode: number = data.errCode;
          if (errCode === 0) {
            diag.trace?.('setSpeed', `Set speed for file with index ${fileIndex} and channel ${channel} to ${speed}`);
            return true;
          } else {
            diag.warn(
              'setSpeed',
              `Could not set speed file with index ${fileIndex} and channel ${channel} to ${speed}`
            );
            return false;
          }
        }
      }
    } catch (e) {
      diag.warn('setSpeed', `Cannot send a message due to ${e.message}`);
      return false;
    }
    return false;
  }

  public async getSpeed(fileIndex: number, channel: ExtInterface.ItrrChannelType): Promise<number | null> {
    try {
      let message: any = {
        command: 'GetSpeed',
        msgId: this.generateId(),
        fileIndex: fileIndex,
        channel: channel,
      };

      if (this.ws != null) {
        let res = await this.ws.sendAndWaitForResponse(message);
        if (res) {
          let data = JSON.parse(res);
          let errCode: number = data.errCode;
          let speed: number = data.speed;
          if (errCode === 0 && speed) {
            diag.trace?.('getSpeed', `Get speed for file with index ${fileIndex} and channel ${channel}: ${speed}`);
            return speed;
          } else {
            diag.warn('getSpeed', `Could not get speed file with index ${fileIndex} and channel ${channel}`);
            return null;
          }
        }
      }
    } catch (e) {
      diag.warn('getSpeed', `Cannot send a message due to ${e.message}`);
      return null;
    }
    return null;
  }

  public async setVolume(fileIndex: number, channel: ExtInterface.ItrrChannelType, volume: number): Promise<boolean> {
    try {
      let message: any = {
        command: 'SetVolume',
        msgId: this.generateId(),
        fileIndex: fileIndex,
        channel: channel,
        volume: volume,
      };

      if (this.ws != null) {
        let res = await this.ws.sendAndWaitForResponse(message);
        if (res) {
          let data = JSON.parse(res);
          let errCode: number = data.errCode;
          if (errCode === 0) {
            diag.trace?.(
              'setVolume',
              `Set volume for file with index ${fileIndex} and channel ${channel} to ${volume}`
            );
            return true;
          } else {
            diag.warn(
              'setVolume',
              `Could not set volume file with index ${fileIndex} and channel ${channel} to ${volume}`
            );
            return false;
          }
        }
      }
    } catch (e) {
      diag.warn('setVolume', `Cannot send a message due to ${e.message}`);
      return false;
    }
    return false;
  }

  public async getVolume(fileIndex: number, channel: ExtInterface.ItrrChannelType): Promise<number | null> {
    try {
      let message: any = {
        command: 'GetVolume',
        msgId: this.generateId(),
        fileIndex: fileIndex,
        channel: channel,
      };

      if (this.ws != null) {
        let res = await this.ws.sendAndWaitForResponse(message);
        if (res) {
          let data = JSON.parse(res);
          let errCode: number = data.errCode;
          let volume: number = data.volume;
          if (errCode === 0) {
            diag.trace?.('getVolume', `Get volume for file with index ${fileIndex} and channel ${channel}: ${volume}`);
            return volume;
          } else {
            diag.warn('getVolume', `Could not get volume file with index ${fileIndex} and channel ${channel}`);
            return null;
          }
        }
      }
    } catch (e) {
      diag.warn('getSpeed', `Cannot send a message due to ${e.message}`);
      return null;
    }
    return null;
  }

  public async setSelection(
    fileIndex: number,
    channel: ExtInterface.ItrrChannelType,
    startTime: Date,
    endTime: Date,
    mode: ExtInterface.ItrrSelectionMode
  ): Promise<boolean> {
    try {
      let message: any = {
        command: 'SetSelection',
        msgId: this.generateId(),
        fileIndex: fileIndex,
        channel: channel,
        startTime: startTime.getTime(),
        endTime: endTime.getTime(),
        selectionMode: mode,
      };

      if (this.ws != null) {
        let res = await this.ws.sendAndWaitForResponse(message);
        if (res) {
          let data = JSON.parse(res);
          let errCode: number = data.errCode;
          if (errCode === 0) {
            diag.trace?.(
              'setSelection',
              `Perform selection for file with index ${fileIndex} and channel ${channel} [${startTime}-${endTime}] with mode ${mode}`
            );
            return true;
          } else {
            diag.warn(
              'setSelection',
              `Could not perform selection for file with index ${fileIndex} and channel ${channel} [${startTime}-${endTime}] with mode ${mode}`
            );
            return false;
          }
        }
      }
    } catch (e) {
      diag.warn('setSelection', `Cannot send a message due to ${e.message}`);
      return false;
    }
    return false;
  }

  public async export(
    fileIndex: number,
    channel: ExtInterface.ItrrChannelType,
    fileName: string,
    startTime: Date,
    endTime: Date
  ): Promise<boolean> {
    try {
      let message: any = {
        command: 'Export',
        msgId: this.generateId(),
        fileIndex: fileIndex,
        channel: channel,
        fileName: fileName,
        startTime: startTime.getTime(),
        endTime: endTime.getTime(),
      };

      if (this.ws != null) {
        let res = await this.ws.sendAndWaitForResponse(message);
        if (res) {
          let data = JSON.parse(res);
          let errCode: number = data.errCode;
          if (errCode === 0) {
            diag.trace?.(
              'export',
              `Performed export for file with index ${fileIndex} and channel ${channel} [${startTime}-${endTime}] as ${fileName}`
            );
            return true;
          } else {
            diag.warn(
              'export',
              `Could not perform export for file with index ${fileIndex} and channel ${channel} [${startTime}-${endTime}] as ${fileName}`
            );
            return false;
          }
        }
      }
    } catch (e) {
      diag.warn('export', `Cannot send a message due to ${e.message}`);
      return false;
    }
    return false;
  }

  public async delete(fileName: string): Promise<boolean> {
    try {
      let message: any = {
        command: 'Delete',
        msgId: this.generateId(),
        fileName: fileName,
      };

      if (this.ws != null) {
        let res = await this.ws.sendAndWaitForResponse(message);
        if (res) {
          let data = JSON.parse(res);
          let errCode: number = data.errCode;
          if (errCode === 0) {
            diag.trace?.('delete', `Deleted file ${fileName}`);
            return true;
          } else {
            diag.warn('delete', `Could not perform delete of file ${fileName}`);
            return false;
          }
        }
      }
    } catch (e) {
      diag.warn('delete', `Cannot send a message due to ${e.message}`);
      return false;
    }
    return false;
  }

  public async exportConversation(
    fileIndex: number,
    channel: ExtInterface.ItrrChannelType,
    ctxId: number
  ): Promise<boolean> {
    try {
      let message: any = {
        command: 'ExportConv',
        msgId: this.generateId(),
        fileIndex: fileIndex,
        channel: channel,
        ctxId: ctxId,
      };

      if (this.ws != null) {
        let res = await this.ws.sendAndWaitForResponse(message);
        if (res) {
          let data = JSON.parse(res);
          let errCode: number = data.errCode;
          if (errCode === 0) {
            diag.trace?.(
              'exportConversation',
              `Performed export conversation for file with index ${fileIndex} and channel ${channel} for conversation ${ctxId}`
            );
            return true;
          } else {
            diag.warn(
              'exportConversation',
              `Could not perform  export conversation for file with index ${fileIndex} and channel ${channel} for conversation ${ctxId}`
            );
            return false;
          }
        }
      }
    } catch (e) {
      diag.warn('exportConversation', `Cannot send a message due to ${e.message}`);
      return false;
    }
    return false;
  }

  public async deleteConversation(
    fileIndex: number,
    channel: ExtInterface.ItrrChannelType,
    ctxId: number
  ): Promise<boolean> {
    try {
      let message: any = {
        command: 'DeleteConv',
        msgId: this.generateId(),
        fileIndex: fileIndex,
        channel: channel,
        ctxId: ctxId,
      };

      if (this.ws != null) {
        let res = await this.ws.sendAndWaitForResponse(message);
        if (res) {
          let data = JSON.parse(res);
          let errCode: number = data.errCode;
          if (errCode === 0) {
            diag.trace?.(
              'deleteConversation',
              `Deleted conversation for file with index ${fileIndex} and channel ${channel} for conversation ${ctxId}`
            );
            return true;
          } else {
            diag.warn(
              'deleteConversation',
              `Could not perform delete conversation for file with index ${fileIndex} and channel ${channel} for conversation ${ctxId}`
            );
            return false;
          }
        }
      }
    } catch (e) {
      diag.warn('deleteConversation', `Cannot send a message due to ${e.message}`);
      return false;
    }
    return false;
  }

  public async mark(
    fileIndex: number,
    channel: ExtInterface.ItrrChannelType,
    markType: ExtInterface.ItrrMarkType,
    sectionInfo: ExtInterface.ItrrSectionInfo
  ): Promise<boolean> {
    try {
      let message: any = {
        command: 'AddMark',
        msgId: this.generateId(),
        fileIndex: fileIndex,
        channel: channel,
        markType: markType,
        ctxId: sectionInfo.ctxId,
        callId: sectionInfo.callId,
        phoneNumber: sectionInfo.phoneNumber,
        direction: sectionInfo.direction,
      };

      if (this.ws != null) {
        let res = await this.ws.sendAndWaitForResponse(message);
        if (res) {
          let data = JSON.parse(res);
          let errCode: number = data.errCode;
          if (errCode === 0) {
            diag.trace?.(
              'mark',
              `Performed mark for file with index ${fileIndex} and channel ${channel} with ctxId: ${sectionInfo.ctxId}, callId: ${sectionInfo.callId}, phoneNumber: ${sectionInfo.phoneNumber}, direction: ${sectionInfo.direction}`
            );
            return true;
          } else {
            diag.warn(
              'mark',
              `Could not perform mark for file with index ${fileIndex} and channel ${channel} with ctxId: ${sectionInfo.ctxId}, callId: ${sectionInfo.callId}, phoneNumber: ${sectionInfo.phoneNumber}, direction: ${sectionInfo.direction}`
            );
            return false;
          }
        }
      }
    } catch (e) {
      diag.warn('mark', `Cannot send a message due to ${e.message}`);
      return false;
    }
    return false;
  }

  public async importRecording(
    fileIndex: number,
    channel: ExtInterface.ItrrChannelType,
    ctxId: number
  ): Promise<null | Blob> {
    try {
      let message: any = {
        command: 'ImportRecording',
        msgId: this.generateId(),
        fileIndex: fileIndex,
        channel: channel,
        ctxId: ctxId,
      };

      if (this.ws != null) {
        let res = await this.ws.sendAndWaitForResponse(message);
        if (res) {
          let data = JSON.parse(res);
          let errCode: number = data.errCode;
          if (errCode === 0) {
            diag.trace?.(
              'importRecording',
              `Performed import recording for file with index ${fileIndex} and channel ${channel} for conversation ${ctxId}`
            );
            let blob = new Blob([data.wavBase64], { type: 'audio/wav;base64' });
            return blob;
          } else {
            diag.warn(
              'importRecording',
              `Could not perform import recording for file with index ${fileIndex} and channel ${channel} for conversation ${ctxId}`
            );
            return null;
          }
        }
      }
    } catch (e) {
      diag.warn('importRecording', `Cannot send a message due to ${e.message}`);
      return null;
    }
    return null;
  }

  public async saveRecording(recording: Blob, fileName: string): Promise<boolean> {
    try {
      let fileData: string = await recording.text();

      let message: any = {
        command: 'SaveRecording',
        msgId: this.generateId(),
        fileName: fileName,
        wavBase64: fileData,
      };

      if (this.ws != null) {
        let res = await this.ws.sendAndWaitForResponse(message);
        if (res) {
          let data = JSON.parse(res);
          let errCode: number = data.errCode;
          if (errCode === 0) {
            diag.trace?.('saveRecording', `Saved file ${fileName}`);
            return true;
          } else {
            diag.warn('saveRecording', `Could not perform saving of file ${fileName}`);
            return false;
          }
        }
      }
    } catch (e) {
      diag.warn('saveRecording', `Cannot send a message due to ${e.message}`);
      return false;
    }
    return false;
  }

  public async getSavedRecordings(): Promise<Array<number>> {
    let savedContextIds: Array<number> = new Array<number>();
    try {
      let message: any = {
        command: 'GetSavedRecordings',
        msgId: this.generateId(),
      };

      if (this.ws != null) {
        let res = await this.ws.sendAndWaitForResponse(message);
        if (res) {
          let data = JSON.parse(res);
          let errCode: number = data.errCode;
          if (errCode === 0) {
            diag.trace?.('getSavedRecordings', `Performed GetSavedRecordings`);
            if (data.ctxIds) {
              for (let i = 0; i < data.ctxIds.length; i++) {
                let ctxId = data.ctxIds[i].ctxId;
                savedContextIds.push(ctxId);
              }
            }

            return savedContextIds;
          } else {
            diag.warn('getSavedRecordings', `Could not perform GetSavedRecordings`);
            return savedContextIds;
          }
        }
      }
    } catch (e) {
      diag.warn('getSavedRecordings', `Cannot send a message due to ${e.message}`);
      return savedContextIds;
    }
    return savedContextIds;
  }

  public async getExportFiles(): Promise<Array<string>> {
    let exportFiles: Array<string> = new Array<string>();
    try {
      let message: any = {
        command: 'GetExportFiles',
        msgId: this.generateId(),
      };

      if (this.ws != null) {
        let res = await this.ws.sendAndWaitForResponse(message);
        if (res) {
          let data = JSON.parse(res);
          let errCode: number = data.errCode;
          if (errCode === 0) {
            diag.trace?.('getExportFiles', `Performed GetExportFiles`);
            if (data.fileNames) {
              for (let i = 0; i < data.fileNames.length; i++) {
                let fileName = data.fileNames[i].fileName;
                exportFiles.push(fileName);
              }
            }

            return exportFiles;
          } else {
            diag.warn('getExportFiles', `Could not perform GetExportFiles`);
            return exportFiles;
          }
        }
      }
    } catch (e) {
      diag.warn('getExportFiles', `Cannot send a message due to ${e.message}`);
      return exportFiles;
    }
    return exportFiles;
  }

  async getHostname(): Promise<string> {
    let hostname: string = '';
    try {
      let message: any = {
        command: 'GetHostname',
        msgId: this.generateId(),
      };

      if (this.ws != null) {
        let res = await this.ws.sendAndWaitForResponse(message);
        if (res) {
          let data = JSON.parse(res);
          let errCode: number = data.errCode;
          if (errCode === 0) {
            diag.trace?.('getHostname', `Performed GetHostname`);
            if (data.hostname) {
              hostname = data.hostname;
            }
          } else {
            diag.warn('getHostname', `Could not perform GetHostname`);
          }
        }
      }
    } catch (e) {
      diag.warn('getHostname', `Cannot send a message due to ${e.message}`);
    }

    return hostname;
  }

  private onMessage = (parsedData: any) => {
    let message: string = parsedData.message;
    diag.trace?.('onMessage', `Message Received:: ${JSON.stringify(parsedData)}`);

    if (message === 'event') {
      let type: string = parsedData.type;
      switch (type) {
        case 'SectionUpdate':
          this.onSectionUpdate(parsedData);
          break;
        case 'PlaybackUpdate':
          this.onPlaybackUpdate(parsedData);
          break;
        default:
          break;
      }
    } else if (message === 'response') {
      let errCode: number = parsedData.errCode;
      let fromCmd: string = parsedData.fromCmd;
      switch (fromCmd) {
        case 'Heartbeat':
          this.onHeartbeatEvent(errCode);
          break;
        default:
          break;
      }
    }
  };

  private onHeartbeatEvent(errCode: number) {
    this.heartbeatCounter = 0;
    if (errCode === 0) {
      diagHb.trace?.('onHeartbeatEvent', `Heartbeat status is successfull`);
      this.heartbeatStatus = true;
      this.updateStatus();
    } else {
      diagHb.warn('onHeartbeatEvent', `Heartbeat status failure`);
      this.heartbeatStatus = false;
      this.updateStatus();
    }
  }

  private onSectionUpdate(parsedData: any) {
    let fileIndex: number = parsedData.fileIndex;
    let channel: ExtInterface.ItrrChannelType = parsedData.channel;
    let sections: Array<ExtInterface.ItrrSection> = new Array<ExtInterface.ItrrSection>();

    for (let i = 0; i < parsedData.sections.length; i++) {
      let sect = parsedData.sections[i].section;
      let info: ExtInterface.ItrrSectionInfo = new ExtInterface.ItrrSectionInfo(
        sect.ctxId,
        sect.callId,
        sect.direction,
        sect.phoneNumber
      );
      let section: ExtInterface.ItrrSection = new ExtInterface.ItrrSection(
        sect.sectionId,
        sect.sectionType,
        new Date(sect.startTime),
        new Date(sect.endTime),
        sect.updateStatus,
        info
      );
      sections.push(section);
    }

    let sectionUpdate: ExtInterface.ItrrSectionUpdate = new ExtInterface.ItrrSectionUpdate(
      fileIndex,
      channel,
      sections
    );
    this.dispatchEvent(sectionUpdate);
  }

  private onPlaybackUpdate(parsedData: any) {
    let fileIndex: number = parsedData.fileIndex;
    let time: number = parsedData.time;
    let date: Date = new Date(time);
    let state: ExtInterface.ItrrPlaybackState = parsedData.playbackState;
    let playbackUpdate: ExtInterface.ItrrPlaybackUpdate = new ExtInterface.ItrrPlaybackUpdate(fileIndex, date, state);
    this.dispatchEvent(playbackUpdate);
  }

  private wsReadyState(readyState: number) {
    if (this.ws && readyState === this.ws.OPEN) {
      this.wsLinkStatus = true;
    } else if (this.ws && this.ws.CLOSED) {
      this.wsLinkStatus = false;
      this.heartbeatStatus = false;
    } else {
      this.wsLinkStatus = false;
    }

    this.updateStatus();
  }

  private async updateStatus() {
    let prevStatus = this.itrrStatus;

    if (this.wsLinkStatus && this.heartbeatStatus) {
      this.itrrStatus = ExtInterface.ItrrStatus.Up;
    } else {
      this.itrrStatus = ExtInterface.ItrrStatus.Down;
    }

    if (prevStatus !== this.itrrStatus) {
      diag.out(
        'updateStatus',
        `ItrrStatus updated to ${this.itrrStatus === ExtInterface.ItrrStatus.Up ? 'Up' : 'Down'}`
      );
      let statusEvent: ExtInterface.ItrrStatusUpdate = new ExtInterface.ItrrStatusUpdate(this.itrrStatus);
      this.dispatchEvent(statusEvent);
    }
  }

  get status(): ExtInterface.ItrrStatus {
    return this.itrrStatus;
  }

  private generateId(): string {
    if (this.sequenceId++ >= 100000) {
      this.sequenceId = 0;
    }
    let now = new Date();

    let date = now.toLocaleDateString('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' });
    let time = now.toLocaleTimeString('en-GB');

    let id =
      'P911WEB_' +
      date.replace(/-/g, '') +
      '_' +
      time.slice(0, 8).replace(/:/g, '') +
      '_' +
      this.sequenceId.toString().padStart(5, '0');
    return id;
  }
}
