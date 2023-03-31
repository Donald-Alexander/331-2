import { WebLineDev } from './weblinedev';
import { WebCall } from '../webcall/webcall';
import { webCfg } from '../config/webcfg';
import { HttpClient } from '../common/httpClient';
import { CallState, CSSEventType, StateUpdate, InformationUpdate } from '../telephonyexternalinterfacedef';
import { aliDecoder } from '../alidecoder/alidecoder';
import { Diag } from '../common/diagClient';
const diag = new Diag('httpCadout');

enum CadMessageType {
  CAD_CONNECT = 'CadConnect',
  CAD_DISCONNECT = 'CadDisconnect',
}

export interface CadConnect {
  CadTypeOfMsg: CadMessageType.CAD_CONNECT;
  AliType: string;
  CadAli: string;
  TrunkAddress: string;
  ViperPos: number;
  CadPos: number;
  UniqueCallId: string;
}

export interface CadDisconnect {
  CadTypeOfMsg: CadMessageType.CAD_DISCONNECT;
  TrunkAddress: string;
  ViperPos: number;
  CadPos: number;
  UniqueCallId: string;
}

enum CadMsgStatusRec {
  None,
  Connected,
  Disconnected,
}

interface CallCadAttribute {
  oldSate: CallState;
  currentState: CallState;
  cadMsgStatus: CadMsgStatusRec;
  aliSent: string;
  hadAnAli: boolean;
}

export class HttpCadOut extends HttpClient {
  private readonly linedev: WebLineDev;
  private lastCallwithCadOut: WebCall | null = null;
  private readonly goodAliTypeCode = '1'; // In Viper7 this is read from GOOD_ALI_TYPE_CODE

  constructor(linedev: WebLineDev) {
    super();

    this.linedev = linedev;

    this.processEvents = this.processEvents.bind(this);
    this.connectCall = this.connectCall.bind(this);
    this.disconnectCall = this.disconnectCall.bind(this);
    this.sendCadConnect = this.sendCadConnect.bind(this);
    this.sendCadDisconnect = this.sendCadDisconnect.bind(this);

    this.linedev.addEventListener(CSSEventType.StateUpdate, this.processEvents);
    this.linedev.addEventListener(CSSEventType.InformationUpdate, this.processEvents);
  }

  private connectCall(call: WebCall): boolean {
    const cadAttr: CallCadAttribute | undefined = call.getDataOwner(this);
    const uniqueCallId = call.infoRec.uniqueCallId;
    const trunk = call.infoRec.trunkAddress;
    let ali = call.infoRec.callingPartyData; // TODO: WideCharToMultiByte

    if (aliDecoder.getGoodAliTypes().has(parseInt('0x' + ali[0]))) {
      // Good Ali: Use configured good ALI type code. Some CADs are very picky concerning ALI types.
      ali = this.goodAliTypeCode + ali.substr(1);
    } else {
      ali = '9' + ali.substr(1);
    }

    let alreadyConnected = false;

    if (cadAttr && cadAttr.cadMsgStatus !== CadMsgStatusRec.Connected) {
      this.sendCadConnect(uniqueCallId, trunk, ali);
      cadAttr.aliSent = ali;
      cadAttr.cadMsgStatus = CadMsgStatusRec.Connected;

      alreadyConnected = true;
    }

    this.lastCallwithCadOut = call;
    return alreadyConnected;
  }

  private disconnectCall(call: WebCall) {
    const cadAttr: CallCadAttribute | undefined = call.getDataOwner(this);
    const uniqueCallId = call.infoRec.uniqueCallId;
    const trunk = call.infoRec.trunkAddress;

    if (cadAttr) {
      cadAttr.aliSent = '';

      if (cadAttr.cadMsgStatus !== CadMsgStatusRec.Disconnected) {
        this.sendCadDisconnect(uniqueCallId, trunk);
        cadAttr.cadMsgStatus = CadMsgStatusRec.Disconnected;
      }
    }
    this.lastCallwithCadOut = null;
  }

  public async sendCadConnect(uniqueCallId: string, trunk: string, ali: string): Promise<void> {
    const cadConnect: CadConnect = {
      CadTypeOfMsg: CadMessageType.CAD_CONNECT,
      AliType: ali.substring(0, 1),
      CadAli: ali.substring(1),
      UniqueCallId: uniqueCallId,
      TrunkAddress: trunk,
      ViperPos: webCfg.positionCfg.id,
      CadPos: webCfg.positionCfg.cadPosId || webCfg.positionCfg.id,
    };

    const promises = [] as Promise<any>[];
    webCfg.psapConfig.cadrouters.forEach((server) => {
      promises.push(this.post(server.address, server.port, cadConnect));

      diag.trace?.('sendCadConnect', 'POST UCID=' + uniqueCallId + ', trunk=' + trunk + ', ali=' + ali);
    });

    await Promise.all(promises);
  }

  public async sendCadDisconnect(uniqueCallId: string, trunk: string): Promise<void> {
    const cadConnect: CadDisconnect = {
      CadTypeOfMsg: CadMessageType.CAD_DISCONNECT,
      UniqueCallId: uniqueCallId,
      TrunkAddress: trunk,
      ViperPos: webCfg.positionCfg.id,
      CadPos: webCfg.positionCfg.cadPosId || webCfg.positionCfg.id,
    };

    const promises = [] as Promise<any>[];

    webCfg.psapConfig.cadrouters.forEach((server) => {
      promises.push(this.post(server.address, server.port, cadConnect));

      diag.trace?.('sendCadDisconnect', 'POST UCID=' + uniqueCallId + ', trunk=' + trunk);
    });

    await Promise.all(promises);
  }

  // Process LineDev events
  private processEvents(event: Event) {
    // Ignore the events if CadOut not enabled
    if (!webCfg.positionCfg.isCadEnabled) {
      diag.trace?.('processEvents', 'Ignore event ' + event.type + ' because CadOut not enabled');
      return;
    }

    // InformationUpdate
    if (event instanceof InformationUpdate) {
      let tmpCallCadAttr = event.call.getDataOwner(this) as CallCadAttribute;
      if (!tmpCallCadAttr) {
        tmpCallCadAttr = {
          oldSate: CallState.Unknown,
          currentState: CallState.Unknown,
          cadMsgStatus: CadMsgStatusRec.None,
          aliSent: '',
          hadAnAli: false,
        };
        event.call.connectData(this, tmpCallCadAttr);
      }

      const hadAnAli: boolean = event.callingPartyData;
      // const hadTrunkAddress: boolean = event.trunkAddress;
      const skipALIPhase1: boolean = event.cadSkipAliPhase1;
      const theUcid: string = event.call.infoRec.uniqueCallId;
      const theTrunkAddress: string = event.call.infoRec.trunkAddress;
      const theALI: string = event.call.infoRec.callingPartyData;
      let hadAliAndUcid = false;

      if (
        tmpCallCadAttr.currentState === CallState.Connected ||
        tmpCallCadAttr.currentState === CallState.Disconnected
      ) {
        if (webCfg.positionCfg.isCadRefreshOnNewALI || this.lastCallwithCadOut !== event.call) {
          // ALI is set now, UCID was set earlier
          if (hadAnAli && theUcid) {
            hadAliAndUcid = true;
          }
          // ALI is set now, UCID not set
          else if (hadAnAli) {
            tmpCallCadAttr.hadAnAli = true;
          }
          // UCID is set now, ALI was probably set eariler
          else if (theUcid) {
            hadAliAndUcid = tmpCallCadAttr.hadAnAli;
          }

          if (hadAliAndUcid && tmpCallCadAttr.aliSent !== theALI) {
            if (!webCfg.positionCfg.isCadRefreshOnNewALI && this.lastCallwithCadOut) {
              this.disconnectCall(event.call);
            }

            if (!this.connectCall(event.call)) {
              // If we were already connected, report the ALI change if in refresh position mode (for RTX)
              if (webCfg.positionCfg.isCadRefreshOnNewALI && !skipALIPhase1) {
                this.sendCadConnect(theUcid, theTrunkAddress, theALI);
                tmpCallCadAttr.aliSent = theALI;
              }
            }
          }
        }
      }
    }
    // StateUpdate
    else if (event instanceof StateUpdate) {
      let tmpCallCadAttr = event.webCall.getDataOwner(this) as CallCadAttribute;
      if (!tmpCallCadAttr) {
        tmpCallCadAttr = {
          oldSate: CallState.Unknown,
          currentState: CallState.Unknown,
          cadMsgStatus: CadMsgStatusRec.None,
          aliSent: '',
          hadAnAli: false,
        };
        event.webCall.connectData(this, tmpCallCadAttr);
      }

      const theUcid: string = event.webCall.infoRec.uniqueCallId;
      // const theTrunkAddress: string = event.webCall.infoRec.trunkAddress;
      const hadAnAli: boolean = event.webCall.infoRec.callingPartyData.length > 0;
      // const hadTrunkAddress: boolean = theTrunkAddress.length > 0;

      const state = event.newState;
      const oldState = tmpCallCadAttr.oldSate;

      // If new state is a connected state and old state is not a connected state
      if (
        (state === CallState.Connected || state === CallState.Disconnected) &&
        // oldState !== CallState.Connected &&
        oldState !== CallState.Disconnected
      ) {
        if (webCfg.positionCfg.isCadRefreshOnHold || this.lastCallwithCadOut !== event.webCall) {
          if (hadAnAli && tmpCallCadAttr.cadMsgStatus !== CadMsgStatusRec.Connected && theUcid.length > 0) {
            if (!webCfg.positionCfg.isCadRefreshOnHold && this.lastCallwithCadOut) {
              this.disconnectCall(event.webCall);
            }

            this.connectCall(event.webCall);
          }
        }
      }
      // Not a connected state
      else if (
        (state === CallState.IHold ||
          state === CallState.Park ||
          state === CallState.Finished ||
          state === CallState.Finishing ||
          state === CallState.Busy) &&
        (oldState === CallState.Connected ||
          oldState === CallState.Disconnected ||
          (oldState === CallState.IHold && state !== CallState.IHold))
      ) {
        // Do not disconnect on hold states if refresh position is not enabled
        if (webCfg.positionCfg.isCadRefreshOnHold || state !== CallState.IHold) {
          if (hadAnAli && tmpCallCadAttr.cadMsgStatus === CadMsgStatusRec.Connected) {
            this.disconnectCall(event.webCall);
          }
        }
      }

      tmpCallCadAttr.oldSate = state;
      tmpCallCadAttr.currentState = state;
    } // end StateUpdate
  }

  static counter: number = 0;
  public async manualAliDump(rawAli: string): Promise<void> {
    if (HttpCadOut.counter++ > 99999) {
      HttpCadOut.counter = 1;
    }

    const now = new Date();
    // yyyy-mm-dd
    const date: string = now.toLocaleDateString('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' });
    // British English uses 24-hour time without AM/PM: 03:00:00
    const time: string = now.toLocaleTimeString('en-GB');

    // Construct fake UCID, eg: CAD001-00032-20201108153021
    const uniqueCallId =
      'CAD001-' +
      HttpCadOut.counter.toString().padStart(5, '0') +
      '-' +
      date.replace(/-/g, '') +
      time.replace(/:/g, '');

    // ALI should contain ALITYPE (ie. '1') as its first character
    return this.sendCadConnect(uniqueCallId, '', rawAli);
  }
}
