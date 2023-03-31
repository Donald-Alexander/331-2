///////////////////////////////////////////////////////////
// Definitions for WebViperDriver service interface
///////////////////////////////////////////////////////////

// __CMD__ available
export const commandSetLatestPkgInfo= 'SetLatestPkgInfo';
export const commandSetConfiguration = 'SetConfiguration';
export const commandSendMessage = 'SendMsg';
export const commandViperVoltmeterStart = 'ViperVoltmeterStart';
export const commandViperVoltmeterStop = 'ViperVoltmeterStop';
export const commandViperVoltmeterRead = 'ViperVoltmeterRead';
export const commandViperRtrvIOControl = 'ViperRtrvIOControl';
export const commandViperGetSystemInfo = 'ViperGetSystemInfo2';
export const commandViperStartApplication = 'ViperStartApplication';
export const commandViperSetVolume = 'ViperSetVolume';
export const commandIntradoBeep = 'IntradoBeep';

// __MSG__ available
export const msgCfgVol = 0;
export const msgCardAudioInit = 1; // NOT SUPPORTED
export const msgAudioBufferCtrl = 2; // NOT SUPPORTED
export const msgLnControl = 3; // NOT SUPPORTED
export const msgNSBLedActivation = 4; // NOT SUPPORTED
export const msgIOActivation = 5;
export const msgPwrCtrlSlotMIO = 6; // NOT SUPPORTED
export const msgRtrvSoftVersion = 7; // NOT SUPPORTED
export const msgRtrvCallerID = 8; // NOT SUPPORTED
export const msgCfgDriverVersion = 9; // NOT SUPPORTED
export const msgRtrvProgressTone = 10; // NOT SUPPORTED
export const msgRtrvVolLvl = 11; // NOT SUPPORTED
export const msgRtrvHeartBeat = 12;
export const msgRtrvPresetCtrl = 13; // NOT SUPPORTED
export const msgRtrvControl = 14; // NOT SUPPORTED
export const msgRtrvModel = 15; // NOT SUPPORTED
export const msgTelOnOffHook = 16;
export const msgTelDial = 17;
export const msgTelAudioPlay = 18;
export const msgTelTDDSendData = 19;
export const msgTelHdCtrl = 20;
export const msgTelToneInjection = 21;
export const msgTelCtrlVolume = 22;
export const msgTelDSPAudioState = 23; // As EVENT
export const msgTelRdCtrlMsg = 24;
export const msgTelDSPCtrl = 25;
export const msgRequestConfigCard = 26; // NOT SUPPORTED
export const msgRequestStatusCard = 27; // NOT SUPPORTED
export const msgRequestAlarmCard = 28; // NOT SUPPORTED
export const msgForcedStatusCardOff = 29; // NOT SUPPORTED
export const msgForcedStatusCardOn = 30; // NOT SUPPORTED
export const msgStatTel = 31; // As EVENT
export const msgStatCtrlVolume = 32; // NOT SUPPORTED
export const msgStatCallerID = 33; // NOT SUPPORTED
export const msgStatIapPc = 34; // NOT SUPPORTED
export const msgStatRadio = 35; // NOT SUPPORTED
export const msgTelAudioTelemetry = 36; // NOT SUPPORTED
export const msgStatTDDState = 37; // NOT SUPPORTED
export const msgStatHandsetStatus = 38; // NOT SUPPORTED

// errCode available
export const errCodeSuccessFull = { id: 0, text: 'SUCCESS_FULL' };
export const errToBeExecute = { id: 1, text: 'TO_BE_EXECUTE' };
export const errNotInstalled = { id: 255, text: 'NOT_INSTALLED' };
export const errParameterError = { id: 254, text: 'PARAMETER_ERROR' };
export const errDisable = { id: 253, text: 'DISABLE' };
export const errNoRscAvailable = { id: 252, text: 'NO_RSC_AVAILABLE' };
export const errLostRsc = { id: 251, text: 'LOST_RSC' };
export const errBadOwner = { id: 250, text: 'BAD_OWNER' };
export const errNotReserve = { id: 249, text: 'RSC_NOT_RESERVE' };
export const errNotAllowed = { id: 248, text: 'RSC_NOT_ALLOWED' };
export const errProcessFailure = { id: 247, text: 'PROCESS_FAILURE' };
export const errNoAnswer = { id: 246, text: 'NO_ANSWER' };
export const errInvalidRequestFormat = { id: 245, text: 'INVALID_REQUEST_FORMAT' };
export const errInvalidRequestSize = { id: 244, text: 'INVALID_REQUEST_SIZE' };
export const errFlashProgOutOfSeq = { id: 243, text: 'FLASHPROG_OUT_OF_SEQ' };
export const errFlashProgError = { id: 242, text: 'FLASHPROG_ERROR' };
export const errNackResp = { id: 241, text: 'NACK_RESP' };
export const errXoffMode = { id: 240, text: 'XOFF_MODE' };
export const errTimeout = { id: 239, text: 'TIMEOUT' };
export const errNucleusError = { id: 238, text: 'NUCLEUS_ERROR' };
export const errTaskFailure = { id: 237, text: 'TASK_FAILURE' };
export const errBusy = { id: 236, text: 'BUSY' };
export const errNoMsgRsp = { id: 235, text: 'NO_MSG_RSP' };
export const errTxError = { id: 234, text: 'TX_ERROR' };
export const errRxError = { id: 233, text: 'RX_ERROR' };
export const errQueueFull = { id: 232, text: 'QUEUE_FULL' };
export const errInvalidAudioRequestFormat = { id: 231, text: 'INVALID_AUDIO_REQUEST_FORMAT' };
export const errInvalidAudioRequestSize = { id: 230, text: 'INVALID_AUDIO_REQUEST_SIZE' };
export const errSendAudio = { id: 229, text: 'ERROR_SEND_AUDIO' };
export const errOutOfRange = { id: 228, text: 'ERROR_OUT_OF_RANGE' };
export const errErrorInMute = { id: 227, text: 'ERROR_IN_MUTE' };
export const errInvalidAudioRequestBlockNum = { id: 226, text: 'INVALID_AUDIO_REQUEST_BLOCK_NUM' };
export const errDspModeNotSupported = { id: 225, text: 'DSP_MODE_NOT_SUPPORTED' };
export const errProtocolError = { id: 224, text: 'PROTOCOL_ERROR' };
export const errInternalIdError = { id: 223, text: 'INTERNAL_ID_ERROR' };
export const errMioNobodyRegistered = { id: 222, text: 'MIO_NOBODY_REGISTERED' };
export const errTddWaitingRxChar = { id: 221, text: 'TDD_WAITING_RX_CHARS' };
export const errReset = { id: 220, text: 'RESET' };
export const errErrorPlaybackUnderrun = { id: 219, text: 'ERROR_PLAYBACK_UNDERRUN' };
export const errInvalidRequest = { id: 218, text: 'INVALID_REQUEST' };
export const errComPortDown = { id: 217, text: 'COMPORTDOWN' };

// Driver Pkg Update status
export enum PkgUpdateStatusType {
  eDriverPkgUpdateStatusDownloadSuccessful = 0,
  eDriverPkgUpdateStatusAlreadyDownloaded = 1,
  eDriverPkgUpdateStatusInstalledSuccessfully = 2,
  eDriverPkgUpdateStatusFailedToDownload = -1,
  eDriverPkgUpdateStatusMismatchVersion = -2,
  eDriverPkgUpdateStatusMismatchCard = -3,
  eDriverPkgUpdateStatusFailedAutoUpdateNotSupported = -4,
  eDriverPkgUpdateStatusUnknown = -5,
}

// Hook Type
export enum TelHookType {
  eTelHookOn = 1,
  eTelHookOff = 2,
  eTelHookFlash = 3,
  eTelHookvOn = 4,
  eTelHookvOff = 5,
}

// Hd Type
export enum HdType {
  eHdTypeAgent = 'A',
  eHdTypeTrainer = 'T',
  eHdTypeBoth = 'B',
  eHdTypeEar = 'E',
  eHdNone = 'N',
}

// Hd Control Type
export enum TelHdCtrlType {
  eTelHdCtrlDrive = 'D',
  eTelHdCtrlMute = 'M',
  eTelHdCtrlPtt = 'P',
  eTelHdCtrlAttn = 'A',
}

// Hd Contact Type
export enum HdContactType {
  eHdPTTalk = 'T',
  eHdPTMute = 'M',
}

// Enable/Disable type
export enum EnableDisableType {
  eEna = 'e',
  eDis = 'd',
  eAbo = 'a',
  ePrep = 'p',
  eCfg = 'c',
}

// I/O Control type
export enum IOControlType {
  eIOGen1 = 1,
  eIOGen2,
  eIOHdAgent,
  eIOHdTrainer,
  eIOTri_Loop1,
  eIOTro_Loop1,
  eIOGen3,
  eIOHdsetDetection,
  eIOOnOff_Hook,
  eIOPtt_LS_O,
  eIOLogRecAn,
  eIOLogRedDg,
  eIOHdDrive,
  eIORingerMute,
  eIOTri_Loop2,
  eIOTro_Loop2,
  eIOPlayer,
  eIORdHdDetection = 41,
  eIORdTxActivity,
  eIORdToSpeaker,
  eIORdToHandset,
  eIOSplitCombine,
  eIORdXFRequest,
  eIORingerDetection,
  eIOAudioSwOVer,
  eIOHCO,
  eIOVCO,
  eIOAGC,
}

export enum IOOnOff {
  ON = 1,
  OFF,
}

// DSP Control type
export enum DspCtrlIdType {
  eTelDSPCtrlVolmeter = 1,
  eTelDSPCtrlTDDRxTx,
  eTelDSPCtrlToneGen,
  eTelDSPCtrlReserved,
  eTelDSPCtrlUPI,
  eTelDSPCtrlCPT,
  eTelDSPCtrlModem,
  eTelDSPCtrlInfiniteDTMF,
  eTelDSPCtrlDTMF = eTelDSPCtrlInfiniteDTMF,
  eTelDsPCtrlToneGenConnection,
  eTelDSPCtrlCPTConnection,
  eTelDSPCtrlAGCActivation,
  eTelDSPCtrlDeviceAGC,
  eTelDSPCtrlDeviceNoiseReduction,
  eTelDSPCtrlConfig,
  eTelDSPCtrlDeviceAGCTest,
}

export enum TelCh {
  eTelCh1 = 1,
  eTelCh2,
}

export enum TelToneInjectionEnaDis {
  eToneBeepEna = 'e',
  eToneBeepDis = 'd',
  eToneZip = 'z',
  eToneZipCtrl = 'Z',
}

export enum DspCtrlActionType {
  eTelDSPCtrlActionEna = 'e',
  eTelDSPCtrlActionDis = 'd',
  eTelDSPCtrlActionRead = 'r',
  eTelDSPCtrlActionWrite = 'w',
  eTelDSPCtrlActionAbort = 'a',
}

export enum DspDeviceID {
  eTelDSPDeviceHandset1_2 = 1,
  eTelDSPDeviceVoipIn,
  eTelDSPDeviceRadio,
}

export enum DspMsgID {
  eDspAgc = 1,
  eDspNoiseReduction,
}

export enum DspStatus {
  eDspFeatureOn = 1,
  eDspFeatureOff,
}

export enum DspTddMode {
  eTelTddAuto = 1,
  eTelTddTypeA_1400_1800,
  eTelTddTypeB_DTMF,
  eTelTddTypeC_EDT,
  eTelTddTypeD_BELL103,
  eTelTddTypeE_V23,
  eTelTddTypeF_V21,
}

export enum DspTddInitiation {
  eTelTddAnswering = 1,
  eTelTddOriginating,
}

export enum DspTddSpeed {
  eTelTdd110Bps = 1,
  eTelTdd300Bps = 2,
  eTelTdd45Bps = 4,
  eTelTdd50Bps = 8,
}

export enum TelCtrlVol {
  eCtrlVolMute = 1,
  eCtrlVolAttn,
  eCtrlVolPreSet,
  eCtrlVolNSB,
}

export enum TelTypeSetCtrl {
  eCtrlNoPreset = 0,
  eSetMin = 1,
  eSetMax = 100,
  eCtrlTDDPreSet = 101,
  eCtrlDialPreSet = 102,
}

export enum TelDirection {
  eReceive = 1,
  eTransmission,
  eOther,
}

export enum TelAudio {
  eAudioHandset = 1,
  eAudioRadio,
  eAudioLine,
  eAudioRecorder,
  eAudioSpeaker,
}

export enum CallProgression {
  eTelDSPCtrlCallProgDialTone = 1,
  eTelDSPCtrlCallProgAudibleRing,
  eTelDSPCtrlCallProgReorder,
  eTelDSPCtrlCallProgBusy,
}

export enum VolumeDestType {
  e_VolReceiveHandset = 0,
  e_VolAgentTransmitHandset = 1,
  e_VolTrainerTransmitHandset = 2,
  e_VolRadioReceive = 3,
  e_VolRadioTransmit = 4,
  e_VolRecorder = 5,
  e_VolSpeaker = 6,
}

export enum TypeOnOff {
  eTelCtrlOn = 1,
  eTelCtrlOff,
}

export enum StatTddState {
  eTelTddCharacterSent = 1,
  eTelTddCharacterReceived,
  eTelTddConnection,
  eTelTddDisconnection,
  eTelTddCarrierNotDetected,
  eTelTddCarrierLost,
}

export enum InputCtrl {
  eInputSigGen1 = 1,
  eInputSigGen2,
  eInputSigGen3,
  eInputSigAgentPtt,
  eInputSigTrainerPtt,
  eInputSigILoop,
  eInputSigHandsetDetected,
  eInputSigILoop2,
  eInputSigAgentHdDetected,
  eInputSigTrainerHdDetected,
  eInputSigNSB,
}

export enum TypeInputOnOff {
  eTelInputCtrlOn = 1,
  eTelInputCtrlOff,
}

export enum RadioCtrl {
  eRdCtrlOn = 1,
  eRdCtrlOff,
}

export enum RadioMessage {
  eRadioTXStat = 1,
  eRadioRXStat,
  eRadioLog,
  eRadioMode,
  eRadioTransfer,
}

export enum RadioCtrlFunction {
  eTelRdCtrlHd = 1,
  eTelRdCtrlSpk,
  eTelRdCtrlSplit,
  eTelRdCtrlReceive,
  eTelRdCtrlTransmit,
  eTelRdCtrlAudio,
}

export enum StatTelCtrl {
  eTelStatOfInputCtrl = 1,
  eTelStatOfRecdStat,
  eTelStatOfRecdData,
  eTelStatOfDTMFDetect,
  eTelStatOfProgressToneDetect,
  eTelStatOfDialer,
  eTelStatOfHookFlash,
  eTelStatUPIDetect,
  eTelStatOfRingDetect,
  eTelStatAudioSwOver,
  eTelStatOfOutputCtrl,
}

export enum AudioPlayDevice {
  ePlaybackDevice = 0,
  eITRRDevice,
  eRingerAnnouncementDevice,
  eGreetingDevice,
}

export enum AudioPlay {
  eTelAudioPlayBack = 1,
  eTelAudioGreetingAnnouncement,
  eTelAudioVoiceMailIntercom,
  eTelAudioMessage,
  eTelAudioRecording,
  eTelAudioIncommingCallAnnouncement,
  eTelAudiorecordingAnalog,
  eTelAudioPlayBackType2,
  eTelAudioPlayBackType3,
  eTelAudioPlayBackType4,
  eTelAudioGreetingAnnouncement2,
}

export enum beepType {
  INTRADO_BEEP_TYPE_ALARM,
  INTRADO_BEEP_TYPE_ABANDON,
  INTRADO_BEEP_TYPE_NEWTEXT,
  INTRADO_BEEP_TYPE_INCIDENT,
  INTRADO_BEEP_TYPE_BROADCAST,
  INTRADO_BEEP_TYPE_TTY_VALIDATE_BAUDOT,
}

// Get Text from error code
export function getErrorText(id: number): string {
  let errorText = 'UNKNOWN_ERROR';

  switch (id) {
    case errCodeSuccessFull.id:
      errorText = errCodeSuccessFull.text;
      break;
    case errToBeExecute.id:
      errorText = errToBeExecute.text;
      break;
    case errNotInstalled.id:
      errorText = errNotInstalled.text;
      break;
    case errParameterError.id:
      errorText = errParameterError.text;
      break;
    case errDisable.id:
      errorText = errDisable.text;
      break;
    case errNoRscAvailable.id:
      errorText = errNoRscAvailable.text;
      break;
    case errLostRsc.id:
      errorText = errLostRsc.text;
      break;
    case errBadOwner.id:
      errorText = errBadOwner.text;
      break;
    case errNotReserve.id:
      errorText = errNotReserve.text;
      break;
    case errNotAllowed.id:
      errorText = errNotAllowed.text;
      break;
    case errProcessFailure.id:
      errorText = errProcessFailure.text;
      break;
    case errNoAnswer.id:
      errorText = errNoAnswer.text;
      break;
    case errInvalidRequestFormat.id:
      errorText = errInvalidRequestFormat.text;
      break;
    case errInvalidRequestSize.id:
      errorText = errInvalidRequestSize.text;
      break;
    case errFlashProgOutOfSeq.id:
      errorText = errFlashProgOutOfSeq.text;
      break;
    case errFlashProgError.id:
      errorText = errFlashProgError.text;
      break;
    case errNackResp.id:
      errorText = errNackResp.text;
      break;
    case errXoffMode.id:
      errorText = errXoffMode.text;
      break;
    case errTimeout.id:
      errorText = errTimeout.text;
      break;
    case errNucleusError.id:
      errorText = errNucleusError.text;
      break;
    case errTaskFailure.id:
      errorText = errTaskFailure.text;
      break;
    case errBusy.id:
      errorText = errBusy.text;
      break;
    case errNoMsgRsp.id:
      errorText = errNoMsgRsp.text;
      break;
    case errTxError.id:
      errorText = errTxError.text;
      break;
    case errRxError.id:
      errorText = errRxError.text;
      break;
    case errQueueFull.id:
      errorText = errQueueFull.text;
      break;
    case errInvalidAudioRequestFormat.id:
      errorText = errInvalidAudioRequestFormat.text;
      break;
    case errInvalidAudioRequestSize.id:
      errorText = errInvalidAudioRequestSize.text;
      break;
    case errSendAudio.id:
      errorText = errSendAudio.text;
      break;
    case errOutOfRange.id:
      errorText = errOutOfRange.text;
      break;
    case errErrorInMute.id:
      errorText = errErrorInMute.text;
      break;
    case errInvalidAudioRequestBlockNum.id:
      errorText = errInvalidAudioRequestBlockNum.text;
      break;
    case errDspModeNotSupported.id:
      errorText = errDspModeNotSupported.text;
      break;
    case errProtocolError.id:
      errorText = errProtocolError.text;
      break;
    case errInternalIdError.id:
      errorText = errInternalIdError.text;
      break;
    case errMioNobodyRegistered.id:
      errorText = errMioNobodyRegistered.text;
      break;
    case errTddWaitingRxChar.id:
      errorText = errTddWaitingRxChar.text;
      break;
    case errReset.id:
      errorText = errReset.text;
      break;
    case errErrorPlaybackUnderrun.id:
      errorText = errErrorPlaybackUnderrun.text;
      break;
    case errInvalidRequest.id:
      errorText = errInvalidRequest.text;
      break;
    case errComPortDown.id:
      errorText = errComPortDown.text;
      break;
  }

  return errorText;
}

// Get Text from I/O Control
export function getIOControlTypeText(control: IOControlType): string {
  switch (control) {
    case IOControlType.eIOGen1:
      return 'IOGen1';
      break;
    case IOControlType.eIOGen2:
      return 'IOGen1';
      break;
    case IOControlType.eIOHdAgent:
      return 'IOGen1';
      break;
    case IOControlType.eIOHdTrainer:
      return 'IOGen1';
      break;
    case IOControlType.eIOTri_Loop1:
      return 'IOGen1';
      break;
    case IOControlType.eIOTro_Loop1:
      return 'IOGen1';
      break;
    case IOControlType.eIOGen3:
      return 'IOGen1';
      break;
    case IOControlType.eIOHdsetDetection:
      return 'IOGen1';
      break;
    case IOControlType.eIOOnOff_Hook:
      return 'IOGen1';
      break;
    case IOControlType.eIOPtt_LS_O:
      return 'IOGen1';
      break;
    case IOControlType.eIOLogRecAn:
      return 'IOGen1';
      break;
    case IOControlType.eIOLogRedDg:
      return 'IOGen1';
      break;
    case IOControlType.eIOHdDrive:
      return 'IOGen1';
      break;
    case IOControlType.eIORingerMute:
      return 'IOGen1';
      break;
    case IOControlType.eIOTri_Loop2:
      return 'IOGen1';
      break;
    case IOControlType.eIOTro_Loop2:
      return 'IOGen1';
      break;
    case IOControlType.eIOPlayer:
      return 'IOGen1';
      break;
    case IOControlType.eIORdHdDetection:
      return 'IOGen1';
      break;
    case IOControlType.eIORdTxActivity:
      return 'IOGen1';
      break;
    case IOControlType.eIORdToSpeaker:
      return 'IOGen1';
      break;
    case IOControlType.eIORdToHandset:
      return 'IOGen1';
      break;
    case IOControlType.eIOSplitCombine:
      return 'IOGen1';
      break;
    case IOControlType.eIORdXFRequest:
      return 'IOGen1';
      break;
    case IOControlType.eIORingerDetection:
      return 'IOGen1';
      break;
    case IOControlType.eIOAudioSwOVer:
      return 'IOGen1';
      break;
    case IOControlType.eIOHCO:
      return 'IOGen1';
      break;
    case IOControlType.eIOVCO:
      return 'IOGen1';
      break;
    case IOControlType.eIOAGC:
      return 'IOGen1';
      break;
    default:
      return 'unknown';
      break;
  }
}
