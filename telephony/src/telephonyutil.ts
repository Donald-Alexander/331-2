import { CallType } from './telephonyexternalinterfacedef';

export class CallHeader {
  phoneNumber: string;
  callerName: string;
  id: string;
  voipAddress: string;
  cSSID: string;
  localChannel: string;
  remoteChannel: string;
  cRV: string;
  callPriority: string;
  referedBy: string; // from incoming INVITE 'X-Referedby'
  route: string;
  initialRoute: string;
  routingMode: string;
  baseTrunkChannel: string;
  trunkAddress: string;
  callInfo: string;
  parkTimeout: string;
  uCI: string;
  m911CallOrigin: string;
  outsideBridge: string;
  locationKey: string;
  pseudoANI: string;
  aLI: Array<string>;
  potsSrvToConnect: string;
  uiTrunkAddress: string; // from x-ppss-ui-trunkaddress
  uiUCI: string; // from x-ppss-ui-UCI
  uiPotsSrv: string; // from x-ppss-ui-potssrv
  uiOutsideBridge: string; // from x-ppss-ui-outsidebridge
  uiPsapName: string; // from x-ppss-ui-psapname
  trunkUniqueID: string; // from Trunk-UniqueCall_Id header, only used to track a call across SIP messages.
  originalUCI: string; // from x-OriginalUniqueCall-ID, used to track a call across network
  incomingTransferMMDN: string; // from x-IncomingTransferMMDN
  subject: string; // from x-subject, used for MSRP Hint
  presence: string; // PIDF-LO(Presence Information Data Format Location Object) from Invite Body
  callType: CallType; // call type:string Voice or Text
  rttEnabled: boolean; // call containing RTT media 
  callByACDConnectRequest: string; // form x-ACDConnectRequest
  originalCallDirection: string; // "out" represents original call is an outgoing call
  consultConf: string; // VCC Consult-Conf header
  referredBy: string; // If the original (caller) incoming INVITE contained "Referred-By" header
  reInvite: string; // from X-Reinvite.  The flag is set to 'true' when call is Re-Invited by the node following a WebRTCGw switchover
  constructor() {
    this.phoneNumber = '';
    this.callerName = '';
    this.voipAddress = '';
    this.id = '';
    this.cSSID = '';
    this.localChannel = '';
    this.remoteChannel = '';
    this.cRV = '';
    this.callPriority = '';
    this.referedBy = ''; // from incoming INVITE 'X-Referedby'
    this.route = '';
    this.initialRoute = ''; // from x-initialroute
    this.routingMode = ''; // from x-ppss-routingmode
    this.baseTrunkChannel = '';
    this.trunkAddress = '';
    this.callInfo = '';
    this.parkTimeout = '';
    this.uCI = '';
    this.m911CallOrigin = '';
    this.outsideBridge = '';
    this.locationKey = '';
    this.pseudoANI = '';
    this.aLI = [];
    this.potsSrvToConnect = '';
    this.uiTrunkAddress = ''; // from x-ppss-ui-trunkaddress
    this.uiUCI = ''; // from x-ppss-ui-UCI
    this.uiPotsSrv = ''; // from x-ppss-ui-potssrv
    this.uiOutsideBridge = ''; // from x-ppss-ui-outsidebridge
    this.uiPsapName = ''; // from x-ppss-ui-psapname
    this.trunkUniqueID = ''; // from Trunk-UniqueCall_Id header, only used to track a call across SIP messages.
    this.originalUCI = ''; // from x-OriginalUniqueCall-ID, used to track a call across network
    this.incomingTransferMMDN = ''; // from x-IncomingTransferMMDN
    this.subject = ''; // from x-subject, used for MSRP Hint
    this.presence = ''; // PIDF-LO(Presence Information Data Format Location Object) from Invite Body
    this.callType = CallType.Voice; // call type: Voice or Text
    this.rttEnabled = false; // default is not RTT
    this.callByACDConnectRequest = ''; // form x-ACDConnectRequest
    this.originalCallDirection = ''; // "out" represents original call is an outgoing call
    this.consultConf = ''; // VCC consultation conf header
    this.referredBy = ''; // If the original (caller) incoming INVITE contained "Referred-By" header
    this.reInvite = ''; // from X-Reinvite.  The flag is set to 'true' when call is Re-Invited by the node following a WebRTCGw switchover.
  }
}

export function pad(num: number, length: number): string {
  var len = length - ('' + num).length;
  return (len > 0 ? new Array(++len).join('0') : '') + num;
}

/**
 *  A~Z to 1~26
 */
export function letterToNumber(char: string): number | undefined {
  'use strict';
  const regex = /[A-Z]/g;
  const found = char.match(regex);
  if (!found) return undefined;
  var out = 0,
    len = char.length,
    pos = len;
  while ((pos -= 1) > -1) {
    out += (char.charCodeAt(pos) - 64) * Math.pow(26, len - 1 - pos);
  }
  if (out != 0) return out;
  else return undefined;
}

/**
 *  1~26 to A~Z
 */
export function toUpperCaseLetter(num: number): string | undefined {
  'use strict';
  if (num <= 0 || num > 26) return undefined;
  var mod = num % 26;
  var pow = (num / 26) | 0;
  var out = mod ? String.fromCharCode(64 + mod) : (pow--, 'Z');
  return pow ? toUpperCaseLetter(pow) + out : out;
}
