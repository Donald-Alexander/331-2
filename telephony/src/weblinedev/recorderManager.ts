import WebLineDev from './weblinedev';
import WebCall from '../webcall/webcall';
import * as ExtInterface from '../telephonyexternalinterfacedef';
import { ItrrClient } from '../itrrclient/itrrclient';
import { Diag } from '../common/diagClient';
import { volumeController, VolumeControlFunction } from './volumeController';

const diag = new Diag('recordermanager.itrr');

class CallRecordAvailabilityStatus {
  ctxId: number;
  status: ExtInterface.RecordAvailabilityStatusType;
  continuousAvail: boolean;

  constructor(ctxId: number, status: ExtInterface.RecordAvailabilityStatusType, continuousAvail: boolean) {
    this.ctxId = ctxId;
    this.status = status;
    this.continuousAvail = continuousAvail;
  }

  find(ctxId: number): boolean {
    return this.ctxId === ctxId;
  }
}

class CallContextCount {
  ctxId: number;
  callsInContext: Array<number>;
  mainCallId: number;
  direction: ExtInterface.Direction;
  phoneNumber: string;

  constructor(ctxId: number, mainCallId: number, direction: ExtInterface.Direction, phoneNumber: string) {
    this.ctxId = ctxId;
    this.mainCallId = mainCallId;
    this.callsInContext = new Array<number>();
    this.direction = direction;
    this.phoneNumber = phoneNumber;
  }

  find(ctxId: number): boolean {
    return this.ctxId === ctxId;
  }
}

export class RecorderManager extends EventTarget {
  lineDev: WebLineDev;
  itrrClient: ItrrClient | null;
  itrrContRecFileIndex: number | null;
  records: Array<CallRecordAvailabilityStatus>;
  exportFiles: Array<string>;
  contexts: Array<CallContextCount>;

  constructor(lineDev: WebLineDev) {
    super();
    this.lineDev = lineDev;
    this.itrrClient = null;
    this.itrrContRecFileIndex = null;
    this.records = new Array<CallRecordAvailabilityStatus>();
    this.exportFiles = new Array<string>();
    this.contexts = new Array<CallContextCount>();

    // Bind ITRRClient callbacks
    this.processItrrSectionUpdate = this.processItrrSectionUpdate.bind(this);
    this.processItrrPlaybackUpdate = this.processItrrPlaybackUpdate.bind(this);
    this.processItrrStatusUpdate = this.processItrrStatusUpdate.bind(this);
    this.processStateUpdate = this.processStateUpdate.bind(this);
  }

  public async terminate() {
    this.unregisterListeners();
    if (this.itrrClient) {
      if (this.itrrContRecFileIndex) {
        await this.itrrClient.unadvise(this.itrrContRecFileIndex, ExtInterface.ItrrChannelType.Super);
        await this.itrrClient.unadvise(this.itrrContRecFileIndex, ExtInterface.ItrrChannelType.Telephony);
        await this.itrrClient.closeFile(this.itrrContRecFileIndex);
      }
      await this.itrrClient
        .terminate()
        .then(async () => {
          diag.out('terminate', 'ITRR Client terminated');
        })
        .catch(async (e: string) => {
          diag.warn('terminate', 'Failed to terminate ITRR Client ' + e);
        });
    }
    this.records.splice(0, this.records.length);
  }

  public async init(savedConvLifetime: number, convSubDir: string, exportSubDir: string) {
    this.itrrClient = new ItrrClient();
    this.registerListeners();
    // Ensure the directory ends with a backslash
    if (convSubDir !== '' && convSubDir.slice(-1) !== '\\') {
      convSubDir = convSubDir + '\\';
    }
    if (exportSubDir !== '' && exportSubDir.slice(-1) !== '\\') {
      exportSubDir = exportSubDir + '\\';
    }
    await this.itrrClient
      .initialize('ws://127.0.0.1:61912', savedConvLifetime, convSubDir, exportSubDir)
      .then(async () => {
        diag.out('init', 'ITRR Client started');
      });
  }

  private registerListeners() {
    if (this.itrrClient) {
      this.itrrClient.addEventListener('ItrrSectionUpdate', this.processItrrSectionUpdate as EventListener);
      this.itrrClient.addEventListener('ItrrPlaybackUpdate', this.processItrrPlaybackUpdate as EventListener);
      this.itrrClient.addEventListener('ItrrStatusUpdate', this.processItrrStatusUpdate as EventListener);
      this.lineDev.addEventListener(ExtInterface.CSSEventType.StateUpdate, this.processStateUpdate as EventListener);
    }
  }

  private unregisterListeners() {
    if (this.itrrClient) {
      this.itrrClient.removeEventListener('ItrrSectionUpdate', this.processItrrSectionUpdate as EventListener);
      this.itrrClient.removeEventListener('ItrrPlaybackUpdate', this.processItrrPlaybackUpdate as EventListener);
      this.itrrClient.removeEventListener('ItrrStatusUpdate', this.processItrrStatusUpdate as EventListener);
      this.lineDev.removeEventListener(ExtInterface.CSSEventType.StateUpdate, this.processStateUpdate as EventListener);
    }
  }

  private processStateUpdate(event: ExtInterface.StateUpdate) {
    let call: WebCall = event.webCall;
    let state: ExtInterface.CallState = event.newState;
    let oldState: ExtInterface.CallState = event.oldState;

    diag.trace?.(
      'processStateUpdate',
      `Received update for call ${call.webCallId} oldState: ${oldState} state: ${state}`
    );

    if (this.itrrClient && this.itrrContRecFileIndex) {
      if (
        state === ExtInterface.CallState.Connected ||
        state === ExtInterface.CallState.Dialtone ||
        state === ExtInterface.CallState.Proceeding
      ) {
        diag.trace?.('processStateUpdate', `Force stop playback`);
        this.itrrClient.playStop(this.itrrContRecFileIndex, ExtInterface.ItrrChannelType.Super);
      }

      let phoneNumber: string = call.infoRec.callingPartyId;
      if (call.cfg.direction === ExtInterface.Direction.Outgoing) {
        if (call.originalOutgoingNumber.length > 0) {
          phoneNumber = call.originalOutgoingNumber;
        } else {
          phoneNumber = call.infoRec.calledPartyId;
        }
      }

      if (
        (state === ExtInterface.CallState.Connected ||
          state === ExtInterface.CallState.Disconnected ||
          state === ExtInterface.CallState.Proceeding ||
          state === ExtInterface.CallState.Dialtone ||
          state === ExtInterface.CallState.Connecting) &&
        oldState !== ExtInterface.CallState.Connected &&
        oldState !== ExtInterface.CallState.Disconnected &&
        oldState !== ExtInterface.CallState.Proceeding &&
        oldState !== ExtInterface.CallState.Dialtone &&
        oldState !== ExtInterface.CallState.Connecting
      ) {
        let callContextIndex = -1;
        let activeCtxIndex = this.contexts.findIndex((context) => context.find(call.contextId()));
        if (activeCtxIndex !== -1) {
          callContextIndex = this.contexts[activeCtxIndex].callsInContext.indexOf(call.webCallId);
        }

        if (callContextIndex === -1) {
          diag.trace?.(
            'processStateUpdate',
            `First Recording for that call ${call.webCallId} on call ${call.webCallId}`
          );

          if (activeCtxIndex === -1) {
            diag.trace?.('processStateUpdate', `Start Conversation - Context: ${call.contextId()}`);
            this.contexts.push(new CallContextCount(call.contextId(), call.webCallId, call.cfg.direction, phoneNumber));
            activeCtxIndex = this.contexts.findIndex((context) => context.find(call.contextId()));
            let sectionInfo = new ExtInterface.ItrrSectionInfo(
              call.contextId(),
              call.webCallId,
              call.cfg.direction === ExtInterface.Direction.Incoming
                ? ExtInterface.ItrrDirection.Incoming
                : ExtInterface.ItrrDirection.Outgoing,
              phoneNumber
            );
            this.itrrClient.mark(
              this.itrrContRecFileIndex,
              ExtInterface.ItrrChannelType.Telephony,
              ExtInterface.ItrrMarkType.ConversationBegin,
              sectionInfo
            );
          } else {
            diag.trace?.(
              'processStateUpdate',
              ` Conversation not done - Context: ${call.contextId()} on call ${call.webCallId}`
            );
          }
          diag.trace?.('processStateUpdate', `Add call ${call.webCallId} ref to Context object ${call.contextId()}`);
          this.contexts[activeCtxIndex].callsInContext.push(call.webCallId);
        } else {
          diag.trace?.('processStateUpdate', `Not first recording on this call ${call.webCallId}`);
          if (activeCtxIndex === -1) {
            diag.trace?.(
              'processStateUpdate',
              `Start Conversation - Context: ${call.contextId()} on call ${call.webCallId}`
            );
            this.contexts.push(new CallContextCount(call.contextId(), call.webCallId, call.cfg.direction, phoneNumber));
            let sectionInfo = new ExtInterface.ItrrSectionInfo(
              call.contextId(),
              call.webCallId,
              call.cfg.direction === ExtInterface.Direction.Incoming
                ? ExtInterface.ItrrDirection.Incoming
                : ExtInterface.ItrrDirection.Outgoing,
              phoneNumber
            );
            this.itrrClient.mark(
              this.itrrContRecFileIndex,
              ExtInterface.ItrrChannelType.Telephony,
              ExtInterface.ItrrMarkType.ConversationBegin,
              sectionInfo
            );
          }
        }
      } else if (
        state === ExtInterface.CallState.Finished ||
        state === ExtInterface.CallState.Finishing ||
        state === ExtInterface.CallState.Busy ||
        state === ExtInterface.CallState.Park ||
        state === ExtInterface.CallState.Hold
      ) {
        if (call.contextId() !== 0) {
          let activeCtxIndex = this.contexts.findIndex((context) => context.find(call.contextId()));
          if (activeCtxIndex !== -1) {
            // Update if first call for this context id
            if (call.webCallId === this.contexts[activeCtxIndex].mainCallId) {
              if (this.contexts[activeCtxIndex].direction !== call.cfg.direction) {
                this.contexts[activeCtxIndex].direction = call.cfg.direction;
                diag.trace?.(
                  'processStateUpdate',
                  `Direction has changed to ${call.cfg.direction} for CtxId ${call.contextId()}`
                );
              }
              this.contexts[activeCtxIndex].phoneNumber = phoneNumber;
            }

            let callContextIndex = this.contexts[activeCtxIndex].callsInContext.findIndex(
              (callId) => callId === call.webCallId
            );

            if (callContextIndex !== -1) {
              diag.trace?.(
                'processStateUpdate',
                `Remove call ${call.webCallId} ref from Context object ${call.contextId()}`
              );
              this.contexts[activeCtxIndex].callsInContext.splice(callContextIndex, 1);
            }

            if (this.contexts[activeCtxIndex].callsInContext.length === 0) {
              let dir: ExtInterface.Direction;
              phoneNumber = this.contexts[activeCtxIndex].phoneNumber;
              dir = this.contexts[activeCtxIndex].direction;
              diag.trace?.('processStateUpdate', `Removing from recording context ${call.contextId()}`);
              this.contexts.splice(activeCtxIndex, 1);

              if (
                callContextIndex !== -1 &&
                (oldState === ExtInterface.CallState.Connected ||
                  oldState === ExtInterface.CallState.Disconnected ||
                  oldState === ExtInterface.CallState.Proceeding ||
                  oldState === ExtInterface.CallState.Dialtone ||
                  oldState === ExtInterface.CallState.Connecting ||
                  oldState === ExtInterface.CallState.IHold)
              ) {
                if (call.confContextId() !== 0) {
                  diag.trace?.(
                    'processStateUpdate',
                    `call confContextId not NULL => confContextId: ${call.confContextId()}`
                  );
                  if (call.confContextId() !== call.contextId()) {
                    diag.trace?.('processStateUpdate', `End Conversation - Context: ${call.contextId()}`);
                    let sectionInfo = new ExtInterface.ItrrSectionInfo(
                      call.contextId(),
                      call.webCallId,
                      dir === ExtInterface.Direction.Incoming
                        ? ExtInterface.ItrrDirection.Incoming
                        : ExtInterface.ItrrDirection.Outgoing,
                      phoneNumber
                    );
                    this.itrrClient.mark(
                      this.itrrContRecFileIndex,
                      ExtInterface.ItrrChannelType.Telephony,
                      ExtInterface.ItrrMarkType.ConversationEnd,
                      sectionInfo
                    );
                  } else {
                    diag.trace?.(
                      'processStateUpdate',
                      `End Conversation (Conference) - Context: ${call.confContextId()}`
                    );
                    let sectionInfo = new ExtInterface.ItrrSectionInfo(
                      call.confContextId(),
                      call.webCallId,
                      dir === ExtInterface.Direction.Incoming
                        ? ExtInterface.ItrrDirection.Incoming
                        : ExtInterface.ItrrDirection.Outgoing,
                      phoneNumber
                    );
                    this.itrrClient.mark(
                      this.itrrContRecFileIndex,
                      ExtInterface.ItrrChannelType.Telephony,
                      ExtInterface.ItrrMarkType.ConversationEnd,
                      sectionInfo
                    );
                  }
                } else if (call.contextId() !== 0) {
                  diag.trace?.('processStateUpdate', `End Conversation - Context: ${call.contextId()}`);
                  let sectionInfo = new ExtInterface.ItrrSectionInfo(
                    call.contextId(),
                    call.webCallId,
                    dir === ExtInterface.Direction.Incoming
                      ? ExtInterface.ItrrDirection.Incoming
                      : ExtInterface.ItrrDirection.Outgoing,
                    phoneNumber
                  );
                  this.itrrClient.mark(
                    this.itrrContRecFileIndex,
                    ExtInterface.ItrrChannelType.Telephony,
                    ExtInterface.ItrrMarkType.ConversationEnd,
                    sectionInfo
                  );
                }
              }
            }
          }
        } else {
          diag.trace?.('processStateUpdate', `Invalid context ID for call ${call.webCallId}`);
        }
      }
    }
  }

  private processItrrSectionUpdate(event: ExtInterface.ItrrSectionUpdate) {
    if (event.fileIndex === this.itrrContRecFileIndex) {
      if (event.channelId === ExtInterface.ItrrChannelType.Telephony) {
        let recordsStatus = new Array<ExtInterface.RecordStatus>();

        event.sections.forEach((section: ExtInterface.ItrrSection) => {
          if (section.sectionType === ExtInterface.ItrrSectionType.Conversation) {
            if (section.updateStatus === ExtInterface.ItrrSectionUpdateType.SectionDeleted) {
              let ctxId = section.sectionInfo.ctxId;
              let recordIndex = this.records.findIndex((record) => record.find(ctxId));
              if (recordIndex !== -1) {
                if (this.records[recordIndex].status === ExtInterface.RecordAvailabilityStatusType.eRecordSaved) {
                  this.records[recordIndex].continuousAvail = false;
                } else {
                  this.records.splice(recordIndex, 1);
                  recordsStatus.push(
                    new ExtInterface.RecordStatus(ctxId, ExtInterface.RecordAvailabilityStatusType.eRecordNotAvailable)
                  );
                }
              }
            } else {
              //  ExtInterface.ItrrSectionUpdateType.SectionCreated || ExtInterface.ItrrSectionUpdateType.SectionUpdated
              let ctxId = section.sectionInfo.ctxId;
              let recordIndex = this.records.findIndex((record) => record.find(ctxId));
              if (recordIndex === -1) {
                this.records.push(
                  new CallRecordAvailabilityStatus(
                    ctxId,
                    ExtInterface.RecordAvailabilityStatusType.eRecordAvailable,
                    true
                  )
                );
                recordsStatus.push(
                  new ExtInterface.RecordStatus(ctxId, ExtInterface.RecordAvailabilityStatusType.eRecordAvailable)
                );
              } else if (
                !this.records[recordIndex].continuousAvail &&
                this.records[recordIndex].status === ExtInterface.RecordAvailabilityStatusType.eRecordSaved
              ) {
                this.records[recordIndex].continuousAvail = true;
              }
            }
          }
        });

        if (recordsStatus.length > 0) {
          // Report event to Application
          this.lineDev.report(new ExtInterface.RecordStatusChange(recordsStatus));
        }
      }
    } else {
      // Forward event to Application
      this.lineDev.report(new ExtInterface.ItrrSectionUpdate(event.fileIndex, event.channelId, event.sections));
    }
  }

  private processItrrPlaybackUpdate(event: ExtInterface.ItrrPlaybackUpdate) {
    if (event.fileIndex === this.itrrContRecFileIndex) {
    } else {
      if (
        event.state === ExtInterface.ItrrPlaybackState.Playing ||
        event.state === ExtInterface.ItrrPlaybackState.PlaybackStarting
      ) {
        volumeController.applyVolume(VolumeControlFunction.Playback, true);
        this.lineDev.setPlaybackDestination();
      } else if (
        event.state === ExtInterface.ItrrPlaybackState.Paused ||
        event.state === ExtInterface.ItrrPlaybackState.Stopped
      ) {
        if (event.state === ExtInterface.ItrrPlaybackState.Paused) {
          this.lineDev.reportPlaybackPaused();
        }
        volumeController.applyVolume(VolumeControlFunction.Playback, false);
      }

      // Forward event to Application
      this.lineDev.report(new ExtInterface.ItrrPlaybackUpdate(event.fileIndex, event.time, event.state));
    }
  }

  private processItrrStatusUpdate(event: ExtInterface.ItrrStatusUpdate) {
    if (event.status === ExtInterface.ItrrStatus.Down) {
      diag.trace?.('processItrrClientStatus', `ITRR Client Status is DOWN`);
      this.itrrContRecFileIndex = null;
      this.records.splice(0, this.records.length);
    } else if (event.status === ExtInterface.ItrrStatus.Up) {
      diag.trace?.('processItrrClientStatus', `ITRR Client is UP`);
      if (this.itrrContRecFileIndex === null) {
        this.openContRec();
      }
    }
    // Forward event to Application
    this.lineDev.report(new ExtInterface.ItrrStatusUpdate(event.status));
  }

  private async openContRec() {
    if (this.itrrClient) {
      this.itrrContRecFileIndex = await this.itrrClient.openFile('', false);
      if (this.itrrContRecFileIndex) {
        await this.itrrClient.advise(
          this.itrrContRecFileIndex,
          ExtInterface.ItrrChannelType.Super,
          ExtInterface.ItrrSinkFlagConstants.PlaybackUpdateEvents |
            ExtInterface.ItrrSinkFlagConstants.SectionUpdateEvents
        );
        await this.itrrClient.advise(
          this.itrrContRecFileIndex,
          ExtInterface.ItrrChannelType.Telephony,
          ExtInterface.ItrrSinkFlagConstants.PlaybackUpdateEvents |
            ExtInterface.ItrrSinkFlagConstants.SectionUpdateEvents
        );
      }

      let recordsStatus = new Array<ExtInterface.RecordStatus>();
      let savedRecordings: Array<number> = await this.itrrClient.getSavedRecordings();
      savedRecordings.forEach((ctxID) => {
        let recordIndex = this.records.findIndex((record) => record.find(ctxID));
        if (
          recordIndex != -1 &&
          this.records[recordIndex].status !== ExtInterface.RecordAvailabilityStatusType.eRecordSaved
        ) {
          this.records[recordIndex].status = ExtInterface.RecordAvailabilityStatusType.eRecordSaved;
        } else {
          this.records.push(
            new CallRecordAvailabilityStatus(ctxID, ExtInterface.RecordAvailabilityStatusType.eRecordSaved, false)
          );
        }
        recordsStatus.push(
          new ExtInterface.RecordStatus(ctxID, ExtInterface.RecordAvailabilityStatusType.eRecordSaved)
        );
      });

      if (recordsStatus.length > 0) {
        // Report event to Application
        this.lineDev.report(new ExtInterface.RecordStatusChange(recordsStatus));
      }

      // Retrieve exported file
      let exportItrrFiles = new Array<ExtInterface.ExportItrrFile>();
      let files: Array<string> = await this.itrrClient.getExportFiles();
      files.forEach((fileName) => {
        let fileIndex = this.exportFiles.findIndex((file) => file === fileName);
        if (fileIndex === -1) {
          this.exportFiles.push(fileName);
        }
        exportItrrFiles.push(new ExtInterface.ExportItrrFile(fileName, true));
      });

      if (exportItrrFiles.length > 0) {
        // Report event to Application
        this.lineDev.report(new ExtInterface.ExportItrrFileChange(exportItrrFiles));
      }
    }
  }

  public async save(contextId: number): Promise<boolean> {
    if (this.itrrClient && this.itrrContRecFileIndex) {
      let result: boolean = false;
      let recordIndex = this.records.findIndex((record) => record.find(contextId));
      if (
        recordIndex !== -1 &&
        this.records[recordIndex].status === ExtInterface.RecordAvailabilityStatusType.eRecordAvailable
      ) {
        result = await this.itrrClient.exportConversation(
          this.itrrContRecFileIndex,
          ExtInterface.ItrrChannelType.Super,
          contextId
        );
        if (result) {
          // Change status of record
          let recordIdx = this.records.findIndex((record) => record.find(contextId));
          if (recordIdx !== -1) {
            this.records[recordIdx].status = ExtInterface.RecordAvailabilityStatusType.eRecordSaved;

            // Report event to Application
            let recordsStatus = new Array<ExtInterface.RecordStatus>();
            recordsStatus.push(
              new ExtInterface.RecordStatus(contextId, ExtInterface.RecordAvailabilityStatusType.eRecordSaved)
            );
            this.lineDev.report(new ExtInterface.RecordStatusChange(recordsStatus));
          }
        }
      }
      return result;
    } else {
      return false;
    }
  }

  public async unsave(contextId: number): Promise<boolean> {
    if (this.itrrClient && this.itrrContRecFileIndex) {
      let result: boolean = false;
      let recordIndex = this.records.findIndex((record) => record.find(contextId));
      if (
        recordIndex !== -1 &&
        this.records[recordIndex].status === ExtInterface.RecordAvailabilityStatusType.eRecordSaved
      ) {
        result = await this.itrrClient.deleteConversation(
          this.itrrContRecFileIndex,
          ExtInterface.ItrrChannelType.Super,
          contextId
        );
        if (result) {
          let recordsStatus = new Array<ExtInterface.RecordStatus>();
          let recordIdx = this.records.findIndex((record) => record.find(contextId));
          if (recordIdx !== -1 && this.records[recordIdx].continuousAvail) {
            // Change status of record
            this.records[recordIdx].status = ExtInterface.RecordAvailabilityStatusType.eRecordAvailable;
            recordsStatus.push(
              new ExtInterface.RecordStatus(contextId, ExtInterface.RecordAvailabilityStatusType.eRecordAvailable)
            );
          } else {
            this.records.splice(recordIdx, 1);
            recordsStatus.push(
              new ExtInterface.RecordStatus(contextId, ExtInterface.RecordAvailabilityStatusType.eRecordNotAvailable)
            );
          }
          // Report event to Application
          this.lineDev.report(new ExtInterface.RecordStatusChange(recordsStatus));
        }
      }
      return result;
    } else {
      return false;
    }
  }

  public conversationAvailable(contextId: number): { conversationAvailable: boolean; withinContRec: boolean } {
    let recordIdx = this.records.findIndex((record) => record.find(contextId));
    if (recordIdx !== -1 && this.records[recordIdx].continuousAvail) {
      return { conversationAvailable: true, withinContRec: true };
    } else if (
      recordIdx !== -1 &&
      this.records[recordIdx].status === ExtInterface.RecordAvailabilityStatusType.eRecordSaved
    ) {
      return { conversationAvailable: true, withinContRec: false };
    }

    return { conversationAvailable: false, withinContRec: false };
  }

  public exportFileAvailable(fileName: string): boolean {
    let exportIdx = this.exportFiles.findIndex((file) => file === fileName);
    if (exportIdx !== -1) {
      return true;
    }
    return false;
  }

  public async export(
    fileIndex: number,
    channel: ExtInterface.ItrrChannelType,
    filename: string,
    startTime: Date,
    endTime: Date
  ): Promise<boolean> {
    let result: boolean = false;
    if (this.itrrClient) {
      result = await this.itrrClient.export(fileIndex, channel, filename, startTime, endTime);
      if (result) {
        let fileIndex = this.exportFiles.findIndex((file) => file === filename);
        if (fileIndex === -1) {
          this.exportFiles.push(filename);
          let exportItrrFiles = new Array<ExtInterface.ExportItrrFile>();
          exportItrrFiles.push(new ExtInterface.ExportItrrFile(filename, true));
          this.lineDev.report(new ExtInterface.ExportItrrFileChange(exportItrrFiles));
        }
      }
    }
    return result;
  }

  public async delete(filename: string): Promise<boolean> {
    let result: boolean = false;
    if (this.itrrClient) {
      result = await this.itrrClient.delete(filename);
      if (result) {
        let fileIndex = this.exportFiles.findIndex((file) => file === filename);
        if (fileIndex !== -1) {
          this.exportFiles.splice(fileIndex, 1);
          let exportItrrFiles = new Array<ExtInterface.ExportItrrFile>();
          exportItrrFiles.push(new ExtInterface.ExportItrrFile(filename, false));
          this.lineDev.report(new ExtInterface.ExportItrrFileChange(exportItrrFiles));
        }
      }
    }
    return result;
  }

  public async itrrOpenSavedConv(ctxId: number): Promise<number | null> {
    if (this.itrrClient) {
      let result = this.conversationAvailable(ctxId);
      if (result.conversationAvailable && !result.withinContRec) {
        return await this.itrrClient.openFile('Itrr' + ctxId.toString() + '.wav.', false);
      } else {
        return null;
      }
    } else {
      return null;
    }
  }

  public async itrrOpenExportFile(fileName: string): Promise<number | null> {
    if (this.itrrClient) {
      if (this.exportFileAvailable(fileName)) {
        return await this.itrrClient.openFile(fileName, true);
      } else {
        return null;
      }
    } else {
      return null;
    }
  }

  public async importRecording(contextId: number): Promise<Blob | null> {
    if (this.itrrClient && this.itrrContRecFileIndex) {
      let result = this.conversationAvailable(contextId);
      if (result.conversationAvailable) {
        return await this.itrrClient.importRecording(
          this.itrrContRecFileIndex,
          ExtInterface.ItrrChannelType.Super,
          contextId
        );
      }
    }
    return null;
  }

  public async saveRecording(recording: Blob, filename: string): Promise<boolean> {
    let result: boolean = false;
    if (this.itrrClient) {
      result = await this.itrrClient.saveRecording(recording, filename);
      if (result) {
        let fileIndex = this.exportFiles.findIndex((file) => file === filename);
        if (fileIndex === -1) {
          this.exportFiles.push(filename);
          let exportItrrFiles = new Array<ExtInterface.ExportItrrFile>();
          exportItrrFiles.push(new ExtInterface.ExportItrrFile(filename, true));
          this.lineDev.report(new ExtInterface.ExportItrrFileChange(exportItrrFiles));
        }
      }
    }
    return result;
  }
}
