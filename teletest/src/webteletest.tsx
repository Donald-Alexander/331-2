import React from 'react';
import './App.css';
import * as guitestCallList from './callstore';
import { ConfStore } from './confstore';
import { TelephonyToggleButton } from './components/TelephonyToggleButton';
import { AudioManagementBox } from './components/AudioManagementBox';
import { MsrpManagementBox } from './components/MsrpManagementBox';
import { RttManagementBox } from './components/RttManagementBox';
import { PsapInitiatedTextButton } from './components/PsapInitiatedTextButton';
import { ListenJoinManagementBox } from './components/ListenJoinManagementBox';
import { GuiTest } from './guitest-core';
import { WebCall } from 'telephony/src/webcall/webcall';
import { WebConference } from 'telephony/src/webconference/conferenceTypes';
import { TddManagementBox } from './components/TddManagementBox';
import { CtiHardwareBox } from './components/CtiHardwareBox';
import { VolumeControllerBox } from './components/VolumeControllerBox';
import { VolumeControlFunction, VolumeControlDestination } from 'telephony/src/weblinedev/volumeController';
import { ItrrManagementBox } from './components/ItrrManagementBox';
import { NenaStateManagementBox } from './components/NenaStateManagementBox';
import { ReferNotifySipfragDisplay } from './components/ReferNotifySipfragDisplay';
import * as ExtInterface from 'telephony/src/telephonyexternalinterfacedef';

interface IMyComponentProps {
  //guiTest: GuiTest;
}

interface IMyComponentState {
  agentLogonName: string;
  positionName: string;
  authenticationStatus: string;
  agentLoginStatus: string;
  telephonyStartStatus: string;
  ctiHwStatus: string;
  appSvrGwStatus: string;
  rgLoginStatus: string;
  acdLoginStatus: string;
  acdReadyStatus: string;

  response: string;
  dialing: string;
  param1: string;
  param2: string;
  param3: string;
  param4: string;
  callInfo: string;
  serviceInfo: string;
  autoRequest: string;
  receivedEventCount: number;
  receivedEventName: string;
  lisError: string;

  tddConnection: boolean;
  tddDetection: boolean;
  tddLink: boolean;
  tddTxConversation: string;
  tddRxConversation: string;
  hco: boolean;
  vco: boolean;
  handsetsAvailable: boolean;
  handsetsPresent: boolean;
  handset1MuteTx: boolean;
  handset2MuteTx: boolean;
  radioAvailable: boolean;
  radioPttRx: boolean;
  radioPttTx: boolean;
  radioModeSplit: boolean;
  agcTxAvailable: boolean;
  agcTxStatus: boolean;
  agcRxAvailable: boolean;
  agcRxStatus: boolean;
  nrRxAvailable: boolean;
  nrRxStatus: boolean;
  chkDialTone: boolean;
  chkRingTone: boolean;
  chkReorderTone: boolean;
  chkBusyTone: boolean;
  autoStart: boolean;
  volumeConversation: number;
  volumeRingerHandset: number;
  volumeRingerSpeaker: number;
  volumePlaybackHandset: number;
  volumePlaybackSpeaker: number;
  chkRingerHandset: boolean;
  chkRingerSpeaker: boolean;
  chkPlaybackHandset: boolean;
  chkPlaybackSpeaker: boolean;
  msrpGuiCntUpd: number;
  itrrStatus: string;
  itrrOpenFile: string;
  itrrOpenFileIndex: number;
  itrrSavedFile: Array<string>;
  itrrFileConversation: Array<ExtInterface.ItrrSection>;
  itrrPlaybackType: string;
  itrrPlaybackTime: Date;
  itrrSpeed: string;
  itrrTelephonyVolume: number;
  itrrRadioVolume: number;
  itrrExportFile: Array<string>;
  itrrHostname: string;
  itrrSelSection: ExtInterface.ItrrSection | null;
  playbackToCaller: boolean;
  nenaStateData: string;
  sipfragDisplayResetCnt: number;
  rttGuiCntUpd: number;
}

export class WebTeleTest extends React.Component<IMyComponentProps, IMyComponentState> {
  private guiTest: GuiTest;
  constructor(props: IMyComponentProps) {
    super(props);
    this.guiTest = new GuiTest(this);

    this.state = {
      agentLogonName: this.guiTest.defaultAgentLogonName,
      positionName: this.guiTest.defaultPositionName,
      authenticationStatus: 'Not Authenticated',
      agentLoginStatus: 'Not LoggedIn',
      telephonyStartStatus: 'Stopped',
      ctiHwStatus: 'NotAvailable',
      appSvrGwStatus: 'Down',
      rgLoginStatus: 'LoginUnknown',
      acdLoginStatus: 'LoginUnknown',
      acdReadyStatus: 'NotReady',
      response: '',
      dialing: '',
      param1: '',
      param2: '',
      param3: '',
      param4: '',
      callInfo: '',
      serviceInfo: '',
      autoRequest: 'Off',
      receivedEventCount: 0,
      receivedEventName: '',
      lisError: '',
      tddConnection: false,
      tddDetection: false,
      tddLink: false,
      tddTxConversation: '',
      tddRxConversation: '',
      hco: false,
      vco: false,
      handsetsAvailable: false,
      handsetsPresent: false,
      handset1MuteTx: false,
      handset2MuteTx: false,
      radioAvailable: false,
      radioPttRx: false,
      radioPttTx: false,
      radioModeSplit: true,
      agcTxAvailable: false,
      agcTxStatus: false,
      agcRxAvailable: false,
      agcRxStatus: false,
      nrRxAvailable: false,
      nrRxStatus: false,
      chkDialTone: false,
      chkRingTone: false,
      chkReorderTone: false,
      chkBusyTone: false,
      autoStart: false,
      volumeConversation: this.guiTest.getDefaultVolume(
        VolumeControlFunction.Conversation,
        VolumeControlDestination.Handset
      ),
      volumeRingerHandset: this.guiTest.getDefaultVolume(
        VolumeControlFunction.Ringer,
        VolumeControlDestination.Handset
      ),
      volumeRingerSpeaker: this.guiTest.getDefaultVolume(
        VolumeControlFunction.Ringer,
        VolumeControlDestination.Speaker
      ),
      volumePlaybackHandset: this.guiTest.getDefaultVolume(
        VolumeControlFunction.Playback,
        VolumeControlDestination.Handset
      ),
      volumePlaybackSpeaker: this.guiTest.getDefaultVolume(
        VolumeControlFunction.Playback,
        VolumeControlDestination.Speaker
      ),
      chkRingerHandset: false,
      chkRingerSpeaker: false,
      chkPlaybackHandset: false,
      chkPlaybackSpeaker: false,
      msrpGuiCntUpd: 0,
      itrrStatus: 'NotAvailable',
      itrrOpenFile: '',
      itrrOpenFileIndex: 0,
      itrrSavedFile: [],
      itrrFileConversation: [],
      itrrPlaybackType: '',
      itrrPlaybackTime: new Date(0),
      itrrSpeed: '1x',
      itrrTelephonyVolume: 0,
      itrrRadioVolume: 0,
      itrrExportFile: [],
      itrrHostname: '',
      itrrSelSection: null,
      playbackToCaller: false,
      nenaStateData: '',
      sipfragDisplayResetCnt: 0,
      rttGuiCntUpd: 0
    };

    this.agentLogin = this.agentLogin.bind(this);
    this.requestAli = this.requestAli.bind(this);
    this.dbrReason = this.dbrReason.bind(this);
    this.clearCallInfo = this.clearCallInfo.bind(this);
    this.broadcastMsg = this.broadcastMsg.bind(this);
    this.logTransfer = this.logTransfer.bind(this);
    this.aliError = this.aliError.bind(this);
    this.recallAbandoned = this.recallAbandoned.bind(this);
    this.abandonedCallDisposition = this.abandonedCallDisposition.bind(this);
    this.tandemTransfer = this.tandemTransfer.bind(this);
    this.cancelTandemTransfer = this.cancelTandemTransfer.bind(this);
    this.autoRequestInfo = this.autoRequestInfo.bind(this);
    this.authenticate = this.authenticate.bind(this);
    this.checkConfig = this.checkConfig.bind(this);
    this.enableRinger = this.enableRinger.bind(this);
    this.makeCall = this.makeCall.bind(this);
    this.makeCallRtt = this.makeCallRtt.bind(this);
    this.ringDown = this.ringDown.bind(this);
    this.noHoldConference = this.noHoldConference.bind(this);
    this.normalConference = this.normalConference.bind(this);
    this.callPatchConference = this.callPatchConference.bind(this);
    this.blindTransfer = this.blindTransfer.bind(this);
    this.manualAliDump = this.manualAliDump.bind(this);
    this.automaticAliDump = this.automaticAliDump.bind(this);
    this.ptt = this.ptt.bind(this);
    this.agcTx = this.agcTx.bind(this);
    this.agcRx = this.agcRx.bind(this);
    this.nrRx = this.nrRx.bind(this);
    this.getDefaultVolumes = this.getDefaultVolumes.bind(this);
    this.getCurrentVolume = this.getCurrentVolume.bind(this);
    this.setVolume = this.setVolume.bind(this);
    this.playGreeting = this.playGreeting.bind(this);
    this.stopGreeting = this.stopGreeting.bind(this);
    this.startRecGreeting = this.startRecGreeting.bind(this);
    this.stopRecGreeting = this.stopRecGreeting.bind(this);
    this.queueAcdLogOn = this.queueAcdLogOn.bind(this);
    this.queueAcdLogOff = this.queueAcdLogOff.bind(this);
    this.acdConnectRequest = this.acdConnectRequest.bind(this);
    this.acdNotReady = this.acdNotReady.bind(this);
    this.hold = this.hold.bind(this);
    this.exclusiveHold = this.exclusiveHold.bind(this);
    this.removeFromConference = this.removeFromConference.bind(this);
    this.removeAllFromConference = this.removeAllFromConference.bind(this);
    this.deafenParticipant = this.deafenParticipant.bind(this);
    this.unDeafenParticipant = this.unDeafenParticipant.bind(this);
    this.muteParticipant = this.muteParticipant.bind(this);
    this.unMuteParticipant = this.unMuteParticipant.bind(this);
    this.rttDetect = this.rttDetect.bind(this);
    this.rttTranscript = this.rttTranscript.bind(this);
    this.addToCallCDR = this.addToCallCDR.bind(this);
    this.addToAgentCDR = this.addToAgentCDR.bind(this);
    this.lvfRequest = this.lvfRequest.bind(this);
    this.lvfCancel = this.lvfCancel.bind(this);
  }

  setAgentLogonName = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ agentLogonName: event.target.value });
  };

  setPositionName = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ positionName: event.target.value });
  };

  dialingAddr = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ dialing: event.target.value });
  };

  setParam1 = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ param1: event.target.value });
  };
  setParam2 = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ param2: event.target.value });
  };
  setParam3 = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ param3: event.target.value });
  };
  setParam4 = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ param4: event.target.value });
  };

  setAutoStart = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ autoStart: event.target.checked });
  };

  setPlaybackToCaller = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ playbackToCaller: event.target.checked });
    this.guiTest.setPlaybackToCaller(event.target.checked);
  };

  private displayCall(call: WebCall | undefined): string {
    let display: string = '';
    if (call) {
      display = `State: ${call.state}, ID: ${call.webCallId}, CtxId: ${call.contextId()}, number: ${
        call.callHeader.phoneNumber
      }, Line: ${call.webLine?.addressv || ''}`;
    }
    return display;
  }

  public displayCallInformation(call: WebCall | undefined) {
    let display = '';
    if (call) {
      if (call.infoRec.callingPartyId) {
        display += ' - CallingPartyId: ';
        display += call.infoRec.callingPartyId;
      }
      if (call.infoRec.callingPartyExt) {
        display += ' - CallingPartyExt: ';
        display += call.infoRec.callingPartyExt;
      }
      if (call.infoRec.calledPartyId) {
        display += ' - CalledPartyId: ';
        display += call.infoRec.calledPartyId;
      }
      if (call.infoRec.connectedPartyId) {
        display += ' - ConnectedPartyId: ';
        display += call.infoRec.connectedPartyId;
      }
      if (call.infoRec.callingPartyName) {
        display += ' - CallingPartyName: ';
        display += call.infoRec.callingPartyName;
      }
      if (call.infoRec.confirmedCallback) {
        display += ' - ConfirmedCallback ';
      }
      if (call.infoRec.wireless) {
        display += ' - Wireless ';
      }
      if (call.infoRec.route) {
        display += '- Route: ';
        display += call.infoRec.route;
      }
      if (call.infoRec.initRoute) {
        display += ' - Initial Route: ';
        display += call.infoRec.initRoute;
      }
      if (call.infoRec.dnis) {
        display += ' - dnis: ';
        display += call.infoRec.dnis;
      }
      if (call.infoRec.callingPartyData) {
        display += ' - ALI: ';
        display += call.infoRec.callingPartyData;
      }
      if (call.infoRec.pidflo) {
        display += ' - PIDF-LO: ';
        display += call.infoRec.pidflo;
      }
      if (call.infoRec.additionalData) {
        display += ' - ADR: ';
        display += call.infoRec.additionalData;
      }
    }
    this.setState({ callInfo: display });
  }

  public displayLisError(call: WebCall | undefined) {
    let display = '';
    if (call) {
      if (call.infoRec.lisErrorCode) {
        display += ' - ErrorCode: ';
        display += call.infoRec.lisErrorCode;
      }
      if (call.infoRec.lisErrorMessage) {
        display += ' - ErrorMessage: ';
        display += call.infoRec.lisErrorMessage;
      }
      if (call.infoRec.lisErrorData) {
        display += ' - ErrorData: ';
        display += call.infoRec.lisErrorData;
      }
    }
    this.setState({ lisError: display });
  }

  public displayServiceInformation(call: WebCall | undefined) {
    let display = '';
    if (call) {
      if (call.service.counseling) {
        display += 'counseling:' + call.service.counseling;
      }
      if (call.service.counselingChildren) {
        display += 'counselingChildren:' + call.service.counselingChildren;
      }
      if (call.service.counselingMentalHealth) {
        display += 'counselingMentalHealth:' + call.service.counselingMentalHealth;
      }
      if (call.service.counselingSuicide) {
        display += 'counselingSuicide:' + call.service.counselingSuicide;
      }
      if (call.service.sos) {
        display += 'sos:' + call.service.sos;
      }
      if (call.service.sosAmbulance) {
        display += 'sosAmbulance:' + call.service.sosAmbulance;
      }
      if (call.service.sosAnimalControl) {
        display += 'sosAnimalControl:' + call.service.sosAnimalControl;
      }
      if (call.service.sosFire) {
        display += 'sosFire:' + call.service.sosFire;
      }
      if (call.service.sosGas) {
        display += 'sosGas:' + call.service.sosGas;
      }
      if (call.service.sosMarine) {
        display += 'sosMarine:' + call.service.sosMarine;
      }
      if (call.service.sosPhysician) {
        display += 'sosPhysician:' + call.service.sosPhysician;
      }
      if (call.service.sosPoison) {
        display += 'sosPoison:' + call.service.sosPoison;
      }
      if (call.service.sosPolice) {
        display += 'sosPolice:' + call.service.sosPolice;
      }
    }
    this.setState({ serviceInfo: display });
  }

  private displayConf(conf: WebConference | undefined): string {
    let display: string = '';
    if (conf) {
      display = `id: ${conf.confId}, state: ${conf.state}, calls: ${conf.members.length}, participants: ${conf.participantsMap.size}`;
    }
    return display;
  }

  public displayAutoRequest(call: WebCall | undefined, autoRequestActive: boolean) {
    let display = '';
    if (call) {
      let activeCall = guitestCallList.getCurrentCall();
      if (activeCall && activeCall === call) {
        display = autoRequestActive ? 'On' : 'Off';
        this.setState({ autoRequest: display });
      }
    }
  }

  private clearCallInfo() {
    this.setState({ callInfo: '', serviceInfo: '', lisError: '' });
    let newCnt = this.state.sipfragDisplayResetCnt + 1;
    this.setState({ sipfragDisplayResetCnt: newCnt });
  }

  private requestAli() {
    if (!this.state.param1) {
      alert(
        'You need to provide following parameters: \nparam1: ani\nparam2: reason(optional)\nparam3: db_number(optional)'
      );
    } else {
      let ani = this.state.param1;
      let reason = this.state.param2;
      let db_number = +this.state.param3;
      this.guiTest.requestAli(ani, reason, db_number);
    }
  }

  private dbrReason() {
    if (!this.state.param1 || !this.state.param2 || !this.state.param3) {
      alert('You need to provide following parameters: \nparam1: requestId\nparam2: ani\nparam3: dbrReason');
    } else {
      let requestId = this.state.param1;
      let ani = this.state.param2;
      let reason = this.state.param3;
      this.guiTest.dbrReason(requestId, ani, reason);
    }
  }

  private broadcastMsg() {
    if (!this.state.param1 || !this.state.param2 || !this.state.param3 || !this.state.param4) {
      alert(
        'You need to provide following parameters: \nparam1: destination\nparam2: message\nparam3: priority\nparam4: incidentKey'
      );
    } else {
      let destination = this.state.param1;
      let message = this.state.param2;
      let priority = this.state.param3;
      let incidentKey = this.state.param4;
      this.guiTest.broadcastMsg(destination, message, priority, incidentKey);
    }
  }

  private logTransfer() {
    if (!this.state.param1 || !this.state.param2 || !this.state.param3 || !this.state.param4) {
      alert(
        'You need to provide following parameters: \nparam1: key\nparam2: agencyName\nparam3: agencyType\nparam4: transferFailure (true or false)'
      );
    } else {
      let key = this.state.param1;
      let agency_name = this.state.param2;
      let agency_type_name = this.state.param3;
      let transfer_failure = this.state.param4 === 'true';
      this.guiTest.logTransfer(key, agency_name, agency_type_name, transfer_failure);
    }
  }

  private aliError() {
    if (!this.state.param1) {
      alert('You need to provide following parameters: \nparam1: error(true or false)\nparam2: ucid (optional)');
    } else {
      let error = this.state.param1 === 'true';
      let ucid = this.state.param2;
      this.guiTest.aliError(error, ucid);
    }
  }

  private recallAbandoned() {
    if (!this.state.param1 || !this.state.param2) {
      alert(
        'You need to provide following parameters: \nparam1: abandoned ucid\nparam2: direction of recall (incoming or outgoing)'
      );
    } else {
      let ucid = this.state.param1;
      let dir = this.state.param2;
      this.guiTest.recallAbandoned(ucid, dir);
    }
  }

  private abandonedCallDisposition() {
    if (!this.state.param1) {
      alert('You need to provide following parameters: \nparam1: abandoned ucid\nparam2: reason');
    } else {
      let ucid = this.state.param1;
      let reason = this.state.param2;
      this.guiTest.abandonedCallDisposition(ucid, reason);
    }
  }

  private tandemTransfer() {
    this.guiTest.tandemTransfer();
  }

  private cancelTandemTransfer() {
    this.guiTest.cancelTandemTransfer();
  }

  private autoRequestInfo() {
    if (!this.state.param1) {
      alert(
        'You need to provide following parameters: \nparam1: auto-rebid activation ("on" or "off")\nparam2: repetitions(optional)'
      );
    } else {
      let activation = this.state.param1 === 'on';
      let repetitions = parseInt(this.state.param2) || 0;
      this.guiTest.autoRequestInfo(activation, repetitions);
    }
  }

  private authenticate() {
    if (!this.state.agentLogonName || !this.state.positionName) {
      alert(
        'You need to provide following parameters: \nagentLogonName: agentLogonName from PMG\npositionName: webClient position name from PMG'
      );
    } else {
      this.guiTest.authenticate(this.state.agentLogonName, this.state.positionName);
    }
  }

  private enableRinger() {
    const button = document.getElementById('btnRinger');
    if (button) {
      if (button.innerText === 'EnableRinger') {
        this.guiTest.enableRinger();
        button.innerText = 'DisableRinger';
      } else {
        this.guiTest.disableRinger();
        button.innerText = 'EnableRinger';
      }
    }
  }

  private checkConfig() {
    if (!this.state.param1) {
      alert(
        'Please provide following parameters: \nParam1: agent|position|line|node|route|gateway|npd2npa|system|psap'
      );
    } else {
      this.guiTest.checkConfig(this.state.param1);
    }
  }

  private agentLogin() {
    this.guiTest.agentLogin();
  }

  private ringDown() {
    if (!this.state.param1) {
      alert('Please provide Line number Param1 e.g. AIM003');
    } else {
      this.guiTest.ringDown(this.state.param1);
    }
  }

  private acdConnectRequest() {
    if (!this.state.param1) {
      alert('Please provide UCI in Param1 E.g. 911151-00021-20210323214917');
    } else {
      this.guiTest.acdConnectRequest(this.state.param1, '');
    }
  }

  private queueAcdLogOn() {
    if (!this.state.param1) {
      alert(
        'Please provide dynamic QueueId to logOn on Param1 e.g. 6001. Please provide agent in param2 if loggingon/off another agent e.g. 10003'
      );
    } else if (this.state.param2) {
      this.guiTest.queueAcdLogOn(this.state.param1, this.state.param2);
    } else {
      this.guiTest.queueAcdLogOn(this.state.param1);
    }
  }

  private queueAcdLogOff() {
    if (!this.state.param1) {
      alert(
        'Please provide dynamic QueueId to logOff on Param1 e.g. 6001. Please provide agent in param2 if logOff another agent e.g. 10003'
      );
    } else if (this.state.param2) {
      this.guiTest.queueAcdLogOff(this.state.param1, this.state.param2);
    } else {
      this.guiTest.queueAcdLogOff(this.state.param1);
    }
  }

  private acdNotReady() {
    if (!this.state.param1 && !this.state.param2) {
      alert('Please provide reasoncode in Param1 E.g 105 and reasoncodDesc in Param2 E.g. Lunch break');
    } else {
      this.guiTest.acdNotReady(parseInt(this.state.param1), this.state.param2);
    }
  }

  private removeFromConference() {
    if (!this.state.param1) {
      alert('Please provide participantId to remove on Param1 e.g. SIP/2021-000d');
    } else {
      this.guiTest.removeFromConference(this.state.param1);
    }
  }

  private removeAllFromConference() {
    this.guiTest.removeAllFromConference();
  }

  private deafenParticipant() {
    if (!this.state.param1) {
      alert('Please provide participantId to deafen on Param1 e.g. Local/*8962001@default-001c');
    } else {
      this.guiTest.deafenParticipant(this.state.param1, true);
    }
  }

  private unDeafenParticipant() {
    if (!this.state.param1) {
      alert('Please provide participantId to undeafen on Param1 e.g. Local/*8962001@default-001c');
    } else {
      this.guiTest.deafenParticipant(this.state.param1, false);
    }
  }

  private muteParticipant() {
    if (!this.state.param1) {
      alert('Please provide participantId to mute on Param1 e.g. Local/*8962001@default-001c');
    } else {
      this.guiTest.muteParticipant(this.state.param1, true);
    }
  }

  private unMuteParticipant() {
    if (!this.state.param1) {
      alert('Please provide participantId to unmute on Param1 e.g. Local/*8962001@default-001c');
    } else {
      this.guiTest.muteParticipant(this.state.param1, false);
    }
  }

  private rttDetect() {
      this.guiTest.rttDetect();
  }

  private rttTranscript() {
    if (!this.state.param1) {
      alert('Please provide transcript text on Param1');
    } else {
      this.guiTest.rttTranscript(this.state.param1);
    }
  }

  private addToCallCDR() {
    if (!this.state.param1) {
      alert('Please provide JSON params on Param1');
    } else {
      try {
        const obj = JSON.parse(this.state.param1);
        this.guiTest.addToCallCDR(obj);
      } catch(e) {
        alert('Error in JSON parameters');
      }
    }
  }

  private addToAgentCDR() {
    if (!this.state.param1) {
      alert('Please provide JSON params on Param1');
    } else {
      try {
        const obj = JSON.parse(this.state.param1);
        this.guiTest.addToAgentCDR(obj);
      } catch(e) {
        alert('Error in JSON parameters');
      }
    }
  }

  private lvfRequest() {
    if (!this.state.param1 || !this.state.param2 || !this.state.param3) {
      alert('Please provide request id on Param1, civic address on Param2 and service URI on Param3');
    } else {
      this.guiTest.lvfRequest(this.state.param1, this.state.param2, this.state.param3);
    }
  }

  private lvfCancel() {
    if (!this.state.param1) {
      alert('Please provide request id on Param1');
    } else {
      this.guiTest.lvfCancel(this.state.param1);
    }
  }

  private makeCall() {
    let localPrefix: string = this.state.param1;
    let lDistPrefix: string = this.state.param2;
    let npaNxx: string = this.state.param3;
    let forceNpa: string = this.state.param4;
    this.guiTest.makeCall(localPrefix, lDistPrefix, npaNxx, forceNpa, false);
  }

  private makeCallRtt() {
    let localPrefix: string = this.state.param1;
    let lDistPrefix: string = this.state.param2;
    let npaNxx: string = this.state.param3;
    let forceNpa: string = this.state.param4;
    this.guiTest.makeCall(localPrefix, lDistPrefix, npaNxx, forceNpa, true);
  }

  private hold() {
    this.guiTest.hold(false);
  }

  private exclusiveHold() {
    this.guiTest.hold(true);
  }

  private noHoldConference() {
    let localPrefix: string = this.state.param1.trim();
    let lDistPrefix: string = this.state.param2.trim();
    let npaNxx: string = this.state.param3.trim();
    let forceNpa: string = this.state.param4.trim();
    this.guiTest.noHoldConference(localPrefix, lDistPrefix, npaNxx, forceNpa);
  }

  private normalConference() {
    let localPrefix: string = this.state.param1.trim();
    let lDistPrefix: string = this.state.param2.trim();
    let npaNxx: string = this.state.param3.trim();
    let forceNpa: string = this.state.param4.trim();
    this.guiTest.normalConference(localPrefix, lDistPrefix, npaNxx, forceNpa);
  }

  private callPatchConference() {
    this.guiTest.callPatchConference();
  }

  private blindTransfer() {
    let localPrefix: string = this.state.param1.trim();
    let lDistPrefix: string = this.state.param2.trim();
    let npaNxx: string = this.state.param3.trim();
    let forceNpa: string = this.state.param4.trim();
    this.guiTest.blindTransfer(localPrefix, lDistPrefix, npaNxx, forceNpa);
  }

  public msrpSend(message: string) {
    this.guiTest.msrpSend(message);
  }

  public rttSend(message: string) {
    this.guiTest.rttSend(message);
  }

  public tddSend(message: string) {
    this.guiTest.tddSend(message);
  }

  public tddSendTranscript() {
    let transcript =
      '<TDD><Conversation Direction="Rx" >' +
      this.state.tddRxConversation +
      '<Conversation Direction="Tx">' +
      this.state.tddTxConversation +
      '</Conversation></TDD>' +
      String.fromCharCode(10);
    this.guiTest.tddSendTranscript(transcript);
  }

  public abortTx() {
    this.guiTest.abortTx();
  }

  public tddConnect() {
    this.guiTest.tddConnect();
  }

  public tddDisconnect() {
    this.guiTest.tddDisconnect();
  }

  public hco() {
    if (this.state.hco) {
      this.guiTest.hcoDisable();
    } else {
      this.guiTest.hcoEnable();
    }
  }

  public vco() {
    if (this.state.vco) {
      this.guiTest.vcoDisable();
    } else {
      this.guiTest.vcoEnable();
    }
  }

  public manualAliDump() {
    if (!this.state.param1) {
      alert('Please provide fake ALI in Param1');
    } else {
      this.guiTest.manualAliDump(this.state.param1);
    }
  }

  public automaticAliDump() {
    if (!this.state.param1) {
      alert('Please provide fake ALI in Param1 for outgoing call');
    } else {
      this.guiTest.automaticAliDump(this.state.param1);
    }
  }

  public playGreeting() {
    if (!this.state.param1) {
      alert('Please provide greeting filename in Param1\nie. GeneralGreetings/g1.wav');
    } else {
      this.guiTest.playGreeting(this.state.param1);
    }
  }

  public stopGreeting() {
    this.guiTest.stopGreeting();
  }

  public startRecGreeting() {
    this.guiTest.startRecGreeting();
  }

  public stopRecGreeting() {
    this.guiTest.stopRecGreeting();
  }

  public handset1Mute() {
    if (this.state.handset1MuteTx) {
      this.guiTest.handset1MuteOff();
    } else {
      this.guiTest.handset1MuteOn();
    }
  }

  public handset2Mute() {
    if (this.state.handset2MuteTx) {
      this.guiTest.handset2MuteOff();
    } else {
      this.guiTest.handset2MuteOn();
    }
  }

  public ptt() {
    if (this.state.radioPttTx) {
      this.guiTest.pttOff();
    } else {
      this.guiTest.pttOn();
    }
  }

  public splitCombine() {
    if (this.state.radioModeSplit) {
      this.guiTest.radioCombine();
    } else {
      this.guiTest.radioSplit();
    }
  }

  public onDialEnter() {
    this.guiTest.dial();
  }

  public agcTx() {
    if (this.state.agcTxStatus) {
      this.guiTest.agcTxOff();
    } else {
      this.guiTest.agcTxOn();
    }
  }

  public agcRx() {
    if (this.state.agcRxStatus) {
      this.guiTest.agcRxOff();
    } else {
      this.guiTest.agcRxOn();
    }
  }

  public nrRx() {
    if (this.state.nrRxStatus) {
      this.guiTest.nrRxOff();
    } else {
      this.guiTest.nrRxOn();
    }
  }

  public dialTone(checked: boolean) {
    this.guiTest.dialTone(checked);
  }

  public ringTone(checked: boolean) {
    this.guiTest.ringTone(checked);
  }

  public reorderTone(checked: boolean) {
    this.guiTest.reorderTone(checked);
  }

  public busyTone(checked: boolean) {
    this.guiTest.busyTone(checked);
  }

  public getDefaultVolumes(): void {
    const v1 = this.guiTest.getDefaultVolume(VolumeControlFunction.Conversation, VolumeControlDestination.Handset);
    const v2 = this.guiTest.getDefaultVolume(VolumeControlFunction.Ringer, VolumeControlDestination.Handset);
    const v3 = this.guiTest.getDefaultVolume(VolumeControlFunction.Ringer, VolumeControlDestination.Speaker);
    const v4 = this.guiTest.getDefaultVolume(VolumeControlFunction.Playback, VolumeControlDestination.Handset);
    const v5 = this.guiTest.getDefaultVolume(VolumeControlFunction.Playback, VolumeControlDestination.Speaker);
    this.setState({
      volumeConversation: v1,
      volumeRingerHandset: v2,
      volumeRingerSpeaker: v3,
      volumePlaybackHandset: v4,
      volumePlaybackSpeaker: v5,

      chkRingerHandset: true,
      chkRingerSpeaker: true,
      chkPlaybackHandset: true,
      chkPlaybackSpeaker: true,
    });

    this.setVolume(VolumeControlFunction.Conversation, VolumeControlDestination.Handset, v1);
    this.setVolume(VolumeControlFunction.Ringer, VolumeControlDestination.Handset, v2);
    this.setVolume(VolumeControlFunction.Ringer, VolumeControlDestination.Speaker, v3);
    this.setVolume(VolumeControlFunction.Playback, VolumeControlDestination.Handset, v4);
    this.setVolume(VolumeControlFunction.Playback, VolumeControlDestination.Speaker, v5);
  }

  public getCurrentVolume(fn: VolumeControlFunction, dest: VolumeControlDestination): number {
    const v = this.guiTest.getCurrentVolume(fn, dest);
    if (fn === VolumeControlFunction.Conversation && dest === VolumeControlDestination.Handset) {
      this.setState({ volumeConversation: v });
    } else if (fn === VolumeControlFunction.Ringer && dest === VolumeControlDestination.Handset) {
      this.setState({ volumeRingerHandset: v });
    } else if (fn === VolumeControlFunction.Ringer && dest === VolumeControlDestination.Speaker) {
      this.setState({ volumeRingerSpeaker: v });
    } else if (fn === VolumeControlFunction.Playback && dest === VolumeControlDestination.Handset) {
      this.setState({ volumePlaybackHandset: v });
    } else if (fn === VolumeControlFunction.Playback && dest === VolumeControlDestination.Speaker) {
      this.setState({ volumePlaybackSpeaker: v });
    }
    return v;
  }

  public setVolume(fn: VolumeControlFunction, dest: VolumeControlDestination, v: number) {
    this.guiTest.setVolume(fn, dest, v);
    if (fn === VolumeControlFunction.Conversation && dest === VolumeControlDestination.Handset) {
      this.setState({ volumeConversation: v });
    } else if (fn === VolumeControlFunction.Ringer && dest === VolumeControlDestination.Handset) {
      this.setState({ volumeRingerHandset: v });
    } else if (fn === VolumeControlFunction.Ringer && dest === VolumeControlDestination.Speaker) {
      this.setState({ volumeRingerSpeaker: v });
    } else if (fn === VolumeControlFunction.Playback && dest === VolumeControlDestination.Handset) {
      this.setState({ volumePlaybackHandset: v });
    } else if (fn === VolumeControlFunction.Playback && dest === VolumeControlDestination.Speaker) {
      this.setState({ volumePlaybackSpeaker: v });
    }
  }

  public updMsrpGuiDisplay() {
    let newCnt = this.state.msrpGuiCntUpd + 1;
    this.setState({ msrpGuiCntUpd: newCnt });
  }

  public updRttGuiDisplay() {
    let newCnt = this.state.rttGuiCntUpd + 1;
    this.setState({ rttGuiCntUpd: newCnt });
  }

  public beep(beepType: string) {
    this.guiTest.beep(beepType);
  }

  public itrrOpen(filename: string, fromExport: boolean = false) {
    this.guiTest.itrrOpen(filename, fromExport);
  }

  public itrrClose() {
    this.guiTest.itrrClose();
  }

  public itrrPlay() {
    this.guiTest.itrrPlay();
  }

  public itrrStop() {
    this.guiTest.itrrStop();
  }

  public itrrPause() {
    this.guiTest.itrrPause();
  }

  public itrrResume() {
    this.guiTest.itrrResume();
  }

  public itrrSeek(plus: boolean) {
    this.guiTest.itrrSeek(plus);
  }

  public async itrrSetSpeed(speed: number) {
    this.guiTest.itrrSetSpeed(speed);
  }

  public async itrrGetSpeed() {
    this.guiTest.itrrGetSpeed();
  }

  public async itrrSetVolume(telephony: boolean, range: number) {
    this.guiTest.itrrSetVolume(
      telephony ? ExtInterface.ItrrChannelType.Telephony : ExtInterface.ItrrChannelType.Radio,
      range
    );
  }

  public async itrrGetVolume(channel: number) {
    this.guiTest.itrrGetVolume(channel);
  }

  public async itrrSetSelection(ctxId: string) {
    if (ctxId === '') {
      alert('Select a conversation');
    } else {
      this.guiTest.itrrSetSelection(parseInt(ctxId));
    }
  }

  public async itrrExport(start: Date, end: Date, filename: string) {
    this.guiTest.itrrExport(start, end, filename);
  }

  public async itrrDelete(filename: string) {
    this.guiTest.itrrDelete(filename);
  }

  public async itrrSave(ctxId: string) {
    if (ctxId === '') {
      alert('Select a conversation');
    } else {
      this.guiTest.itrrSave(parseInt(ctxId));
    }
  }

  public async itrrUnsave(ctxId: string) {
    if (ctxId === 'ContRec') {
      alert('Cannot Unsave ContRec');
    } else {
      this.guiTest.itrrUnsave(parseInt(ctxId));
    }
  }

  public async itrrExportConv(ctxId: string) {
    if (ctxId === '') {
      alert('Select a conversation');
    } else {
      this.guiTest.itrrExportConv(parseInt(ctxId));
    }
  }

  public nenaQueueStateGet(identifier: string) {
    this.guiTest.nenaQueueStateGet(identifier);
  }

  public nenaQueueStateGetAll() {
    this.guiTest.nenaQueueStateGetAll();
  }

  public nenaQueueStateSetOverride(identifier: string, overrideState: string, overrideReason: string) {
    this.guiTest.nenaQueueStateSetOverride(identifier, overrideState, overrideReason);
  }

  public nenaQueueStateClearOverride(identifier: string) {
    this.guiTest.nenaQueueStateClearOverride(identifier);
  }

  public nenaServiceStateGet(identifier: string) {
    this.guiTest.nenaServiceStateGet(identifier);
  }

  public nenaServiceStateGetAll() {
    this.guiTest.nenaServiceStateGetAll();
  }

  public nenaServiceStateSetOverride(identifier: string, overrideState: string, overrideReason: string) {
    this.guiTest.nenaServiceStateSetOverride(identifier, overrideState, overrideReason);
  }

  public nenaServiceStateClearOverride(identifier: string) {
    this.guiTest.nenaServiceStateClearOverride(identifier);
  }

  public render() {
    return (
      <div className="MainPage">
        <div>
          <div>
            <TelephonyToggleButton guiTest={this.guiTest} defaultName="Stopped" activeName="Running" />
          </div>
          <p>
            Agent:
            <input type="text" value={this.state.agentLogonName} onChange={this.setAgentLogonName} disabled={false} />
            Position:
            <input type="text" value={this.state.positionName} onChange={this.setPositionName} disabled={false} />
            <button className="Button" onClick={this.authenticate}>
              Authentication
            </button>
            <input type="checkbox" id="chkAutoStart" onChange={this.setAutoStart} checked={this.state.autoStart} />
            AutoStart
          </p>
          <p>
            Agent/Device:<span className="Highlight">{this.state.authenticationStatus}</span>
            AgentLoginInfo:<span className="Highlight">{this.state.agentLoginStatus}</span>
          </p>
          <p>
            TelephonyStartState:<span className="Highlight">{this.state.telephonyStartStatus}</span>
            CTIHwStatus:<span className="Highlight">{this.state.ctiHwStatus}</span>
          </p>
          <p>
            AppSvrGw:<span className="Highlight">{this.state.appSvrGwStatus}</span>
          </p>
          <p>
            RGLogin:<span className="Highlight">{this.state.rgLoginStatus}</span>
            ACDLogin:<span className="Highlight">{this.state.acdLoginStatus}</span>
            ACDReady:<span className="Highlight">{this.state.acdReadyStatus}</span>
          </p>
        </div>
        <div className="CallList">
          Call List:
          <ul>
            {guitestCallList.getCallList().map(([idx, call]) => {
              return (
                <li
                  className={idx === guitestCallList.getActiveCallIdNum() ? 'selected' : ''}
                  key={idx}
                  onClick={() => {
                    guitestCallList.setActiveCallIdNum(idx);
                    this.displayCallInformation(guitestCallList.getCurrentCall());
                    this.displayServiceInformation(guitestCallList.getCurrentCall());
                    this.updMsrpGuiDisplay();
                    this.updRttGuiDisplay();
                  }}
                >
                  {this.displayCall(call)}
                </li>
              );
            })}
          </ul>
        </div>
        <div>
          CurrentCall: <span className="Highlight">{this.displayCall(guitestCallList.getCurrentCall())}</span>
          <br />
          <button className="Button2" onClick={this.guiTest.reject}>
            Reject
          </button>
          <button
            className="Button2"
            onClick={() => {
              this.guiTest.connect();
              this.updMsrpGuiDisplay();
              this.updRttGuiDisplay();
            }}
          >
            Connect
          </button>
          <div className="dropdown">
            <button className="dropbtn">Hold</button>
            <div className="dropdown-content">
              <a onClick={this.hold}>normal</a>
              <a onClick={this.exclusiveHold}>exclusive</a>
            </div>
          </div>
          <button className="Button2" onClick={this.guiTest.unhold}>
            Unhold
          </button>
          <button className="Button2" onClick={this.guiTest.park}>
            Park
          </button>
          <button
            className="Button2"
            onClick={() => {
              this.guiTest.unpark();
              this.updMsrpGuiDisplay();
              this.updRttGuiDisplay();
            }}
          >
            Unpark
          </button>
          <button className="Button2" onClick={this.guiTest.release}>
            Release
          </button>
          <div>
            <p>
              <div>
                Dial:{' '}
                <input
                  type="text"
                  id="Dial"
                  onChange={this.dialingAddr}
                  onKeyPress={(event) => {
                    if (event.key === 'Enter') {
                      this.onDialEnter();
                    }
                  }}
                />
                <button className="Button2" onClick={this.makeCall}>
                  MakeCall
                </button>
                <button className="Button2" onClick={this.makeCallRtt}>
                  MakeCallRtt
                </button>
                <PsapInitiatedTextButton webTeletest={this} />
              </div>
              <button className="Button2" onClick={this.tandemTransfer}>
                TandemTXFR
              </button>
              <button className="Button2" onClick={this.cancelTandemTransfer}>
                CancelTandem
              </button>
              <button className="Button2" onClick={this.noHoldConference}>
                NoHoldConf
              </button>
              <button className="Button2" onClick={this.normalConference}>
                NormalConf
              </button>
              <button className="Button2" onClick={this.callPatchConference}>
                PatchConf
              </button>
              <button className="Button2" onClick={this.blindTransfer}>
                BlindTxfer
              </button>
              <button className="Button2" onClick={this.automaticAliDump}>
                AutoAliDump
              </button>
              <button className="Button2" onClick={this.ringDown}>
                RingDown
              </button>
              <button className="Button2" onClick={this.acdConnectRequest}>
                ACDConnectReq
              </button>
            </p>
          </div>
        </div>
        <div className="CurrentCallInfo">
          <div>callInfo: {this.state.callInfo}</div>
          <div>serviceInfo: {this.state.serviceInfo}</div>
          <div>lisError: {this.state.lisError}</div>
          <div>
            <ReferNotifySipfragDisplay webTeletest={this} />
          </div>
        </div>
        <button className="Button" onClick={this.clearCallInfo}>
          ClearCallInfo
        </button>

        <p className="ParamPanel">
          Param1: <input type="text" onChange={this.setParam1} />
          Param2: <input type="text" onChange={this.setParam2} />
        </p>
        <p>
          Param3: <input type="text" onChange={this.setParam3} />
          Param4: <input type="text" onChange={this.setParam4} />
          {'     '}
          <input
            type="checkbox"
            id="chkPlaybackToCaller"
            onChange={this.setPlaybackToCaller}
            checked={this.state.playbackToCaller}
          />
          Playback To Caller
        </p>

        <div className="ButtonPanel">
          <button className="Button" onClick={this.guiTest.getInitialStatus}>
            InitialStatus
          </button>
          <button className="Button" onClick={this.agentLogin}>
            AgentLogin
          </button>
          <button className="Button" onClick={this.guiTest.agentLogout}>
            AgentLogout
          </button>
          <button className="Button" onClick={this.guiTest.acdLogin}>
            ACDLogin
          </button>
          <button className="Button" onClick={this.guiTest.acdLogout}>
            ACDLogout
          </button>
          <button className="Button" onClick={this.guiTest.acdReady}>
            ACDReady
          </button>
          <button className="Button" onClick={this.acdNotReady}>
            ACDNotReady
          </button>
          <button className="Button" onClick={this.guiTest.rgLogin}>
            RingGroupLogin
          </button>
          <button className="Button" onClick={this.guiTest.rgLogout}>
            RingGroupLogout
          </button>
          <button className="Button" onClick={this.guiTest.register}>
            Register
          </button>
          <button className="Button" onClick={this.guiTest.unRegister}>
            UnRegister
          </button>
          <button className="Button" onClick={this.guiTest.requestInfo}>
            RTX
          </button>
          <button className="Button" onClick={this.autoRequestInfo}>
            Auto RTX {this.state.autoRequest}
          </button>
          <button className="Button" onClick={this.requestAli}>
            DBR
          </button>
          <button className="Button" onClick={this.guiTest.cancelAliRequest}>
            CancelDBR
          </button>
          <button className="Button" onClick={this.dbrReason}>
            DBR Reason
          </button>
          <button className="Button" onClick={this.broadcastMsg}>
            Broadcast
          </button>
          <button className="Button" onClick={this.logTransfer}>
            Log Transfer
          </button>
          <button className="Button" onClick={this.aliError}>
            ALI Error
          </button>
          <button className="Button" onClick={this.recallAbandoned}>
            Recall Abdn
          </button>
          <button className="Button" onClick={this.abandonedCallDisposition}>
            Abdn Disp
          </button>
          <button className="Button" id="btnRinger" onClick={this.enableRinger}>
            EnableRinger
          </button>
          <button className="Button" onClick={this.checkConfig}>
            CheckConfig
          </button>
          <button className="Button" onClick={this.manualAliDump}>
            Dump ALI
          </button>
          <button className="Button" onClick={this.playGreeting}>
            PlayGreeting
          </button>
          <button className="Button" onClick={this.stopGreeting}>
            StopGreeting
          </button>
          <button className="Button" onClick={this.startRecGreeting}>
            StartRecGreeting
          </button>
          <button className="Button" onClick={this.stopRecGreeting}>
            StopRecGreeting
          </button>
          <button className="Button" onClick={this.queueAcdLogOn}>
            Dyn Queue LogOn
          </button>
          <button className="Button" onClick={this.queueAcdLogOff}>
            Dyn Queue LogOff
          </button>
          <button className="Button" onClick={this.removeFromConference}>
            Remove Participant
          </button>
          <button className="Button" onClick={this.removeAllFromConference}>
            Remove All Participants
          </button>
          <button className="Button" onClick={this.deafenParticipant}>
            Deafen Participant
          </button>
          <button className="Button" onClick={this.unDeafenParticipant}>
            Undeafen Participant
          </button>
          <button className="Button" onClick={this.muteParticipant}>
            Mute Participant
          </button>
          <button className="Button" onClick={this.unMuteParticipant}>
            Unmute Participant
          </button>
          <button className="Button" onClick={this.guiTest.nextACDCall}>
            Next ACD Call
          </button>
          <button className="Button" onClick={this.guiTest.subscribeDynamicACDStatus}>
            Dynamic Subscribe
          </button>
          <button className="Button" onClick={this.guiTest.unSubscribeDynamicACDStatus}>
            Dynamic Unsubscribe
          </button>
          <button className="Button" onClick={this.rttDetect}>
            RTT Detect
          </button>
          <button className="Button" onClick={this.rttTranscript}>
            RTT Transcript
          </button>
          <button className="Button" onClick={this.addToCallCDR}>
            Add to Call CDR
          </button>
          <button className="Button" onClick={this.addToAgentCDR}>
            Add to Agent CDR
          </button>
          <button className="Button" onClick={this.lvfRequest}>
            LVF request
          </button>
          <button className="Button" onClick={this.lvfCancel}>
           Cancel LVF
          </button>
        </div>
        <div className="ConfList">
          Conference List:
          <ul>
            {ConfStore.getConfList().map(([idx, conf]) => {
              return (
                <li
                  className={idx === ConfStore.getActiveConf() ? 'selected' : ''}
                  key={idx}
                  onClick={() => {
                    ConfStore.setActiveConf(idx);
                  }}
                >
                  {this.displayConf(conf)}
                </li>
              );
            })}
          </ul>
        </div>
        <div>
          CurrentConf: <span className="Highlight">{this.displayConf(ConfStore.getCurrent())}</span>
          <br />
          <button className="Button2" onClick={this.guiTest.cancelConf}>
            Cancel
          </button>
          <button className="Button2" onClick={this.guiTest.connectConf}>
            Connect
          </button>
          <button className="Button2" onClick={this.guiTest.transferConf}>
            Transfer
          </button>
          <button className="Button2" onClick={this.guiTest.releaseConf}>
            Release
          </button>
          <button className="Button2" onClick={this.guiTest.holdConf}>
            Hold
          </button>
          <button className="Button2" onClick={this.guiTest.unholdConf}>
            Unhold
          </button>
        </div>
        <div className="ResponseLog">
          <div>{this.state.response}</div>
          <div>
            Received Event [{this.state.receivedEventCount}]: {this.state.receivedEventName}
          </div>
        </div>
        <div className="row">
          <MsrpManagementBox webTeletest={this} />
          <AudioManagementBox webTeletest={this} />
        </div>
        <div className="row">
          <RttManagementBox webTeletest={this} />
        </div>
        <div className="row">
          <TddManagementBox webTeletest={this} />
          <CtiHardwareBox webTeletest={this} />
        </div>
        <div className="row">
          <ListenJoinManagementBox webTeletest={this} />
        </div>
        <div className="row">
          <div className="column">
            <VolumeControllerBox webTeletest={this} />
            <NenaStateManagementBox webTeletest={this} />
          </div>
          <div className="column">
            <ItrrManagementBox webTeletest={this} />
          </div>
        </div>
      </div>
    );
  }
}
