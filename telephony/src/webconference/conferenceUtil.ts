import { CallState, CongestionState } from '../webcall/callState';
import { DialingPrefix, Direction, LineSharedType, LineType } from '../telephonyexternalinterfacedef';
import { DirectionCfg } from '../telephonyinternalinterfacedef';
import { WebCall } from '../webcall/webcall';
import { WebLineDev } from '../weblinedev/weblinedev';
import { VccError } from '../vcc/VccError';

import { Diag } from '../common/diagClient';

const moduleName = 'webconference';
const diag = new Diag(moduleName);

// used to generate unique Id for each new conference object
let confIdSeq: number = 0;

export function nextConfId(): number {
  confIdSeq += 1;
  return confIdSeq;
}

function splitAliIntoHeaders(ali: string): string[] {
  const headers: string[] = [];
  const MAX_CHAR_PER_HEADER_FIELD = 77;

  if (ali) {
    const encodedAli = ali.replaceAll('\r', '(CR)').replaceAll('\n', '(LF)');

    // Use delimiter '.' at the beginning and the end of each header string to preserve whitepace
    for (let offset = 0; offset < encodedAli.length; offset += MAX_CHAR_PER_HEADER_FIELD) {
      headers.push(`.${encodedAli.slice(offset, offset + MAX_CHAR_PER_HEADER_FIELD)}.`);
    }
  }

  return headers;
}

function buildInviteXHeaders(fromCall: WebCall) {
  const xHeaders = new Map<string, string>();

  xHeaders.set('x-ppss-callinfo-trunkaddress', fromCall.callHeader.trunkAddress);
  xHeaders.set('x-ppss-callinfo-pseudoani', fromCall.infoRec.aliRequestKey);
  xHeaders.set('x-ppss-callinfo-calleridnumber', fromCall.infoRec.callingPartyId);
  xHeaders.set('x-ppss-callinfo-calleridname', fromCall.infoRec.callingPartyName);

  // add ALI headers
  splitAliIntoHeaders(fromCall.infoRec.callingPartyData).forEach((val, indx) => {
    xHeaders.set(`x-ppss-callinfo-ali${indx + 1}`, val);
  });
  return xHeaders;
}

export async function makeConsultCall(
  lineDev: WebLineDev,
  fromCall: WebCall,
  dialAddrs: Array<{ longdistance: boolean; tokens: string[] }>
): Promise<WebCall> {
  const node = fromCall.webNode;
  const agentDevice = lineDev.device;
  const proxySrvAddr = node.nodeCfgEx.proxyAddress;
  const line = lineDev.getFreeIntercomLine();

  if (!line) {
    throw new Error('intercom lines unavailable');
  }

  const { sessionId, headers } = await node.lineDev.webPhone.makeVccCall(
    `sip:ConsultConf@${proxySrvAddr}:5060`,
    fromCall.callType,
    node.nodeCfgEx.id,
    [`Consult-Conf: dev=${agentDevice};cssid=${fromCall.cssId}`, `x-cssid: ${fromCall.cssId}`],
    fromCall.rttEnabled
  );
  let localChannel = '';

  const xLocalChannel = headers['X-Localchannel'];
  if (xLocalChannel && xLocalChannel[0]) {
    localChannel = (xLocalChannel[0] as { parsed?: any; raw: string }).raw;
  }

  try {
    const inviteParams = {
      trunkCall: fromCall.callHeader.remoteChannel,
      agentCall: localChannel,
      cssid: fromCall.cssId || '',
      uci: fromCall.infoRec.uniqueCallId,
      originalUci: fromCall.infoRec.originalUCI,
      satelliteSiteId: '', // TODO: fill in optional satelliteSiteId param
      dialAddrs,
      xHeaders: buildInviteXHeaders(fromCall),
    };

    const response = await node.consultConferenceInvite(inviteParams);

    const consultCall = new WebCall(line, node, {
      cfg: new DirectionCfg(Direction.Outgoing),
      initialState: CallState.Proceeding,
      sipId: sessionId,
      initContextObjId: fromCall.contextObjId || undefined,
    });

    consultCall.callHeader.localChannel = localChannel;
    consultCall.callHeader.remoteChannel = response.call;
    consultCall.cssId = fromCall.cssId;
    consultCall.ringbackOnProceeding.needed = response.progressTone !== 'Server';
    line.addCall(consultCall);
    consultCall.setCallState(CallState.Proceeding);

    return consultCall;
  } catch (e) {
    if (e instanceof VccError && e.err.startsWith('DialCongestion')) {
      const consultCall = new WebCall(line, node, {
        cfg: new DirectionCfg(Direction.Outgoing),
        initialState: CallState.Proceeding,
        sipId: sessionId,
        initContextObjId: fromCall.contextObjId || undefined,
      });
      consultCall.callHeader.localChannel = localChannel;
      consultCall.cssId = fromCall.cssId;
      consultCall.congestionState =
        e.err === 'DialCongestionWithRAN' ? CongestionState.CongestedServerTone : CongestionState.CongestedClientTone;
      line.addCall(consultCall);
      consultCall.setCallState(CallState.Connected);

      return consultCall;
    }

    node.lineDev.webPhone.hangupCall(sessionId, node.nodeCfgEx.id);
    throw e;
  }
}

export async function hangupConsultCall(consultCall: WebCall): Promise<void> {
  if (consultCall.sipId) {
    await consultCall.getWebPhone().hangupCall(consultCall.sipId, consultCall.webNode.nodeCfgEx.id);
  }
}

export async function makeNoHoldCall(fromCall: WebCall, dialAddrs: { longdistance: boolean; tokens: string[] }[]) {
  const node = fromCall.webNode;
  const inviteParams = {
    trunkCall: fromCall.callHeader.remoteChannel,
    agentCall: fromCall.callHeader.localChannel,
    cssid: fromCall.cssId || '',
    uci: fromCall.infoRec.uniqueCallId,
    originalUci: fromCall.infoRec.originalUCI,
    satelliteSiteId: '',
    dialAddrs,
    xHeaders: buildInviteXHeaders(fromCall),
  };

  const response = await node.conferenceInvite(inviteParams);

  const toCall = new WebCall(fromCall.webLine, node, {
    cfg: new DirectionCfg(Direction.Outgoing),
    initialState: CallState.Proceeding,
    initContextObjId: fromCall.contextObjId || undefined,
  });
  toCall.callHeader.localChannel = fromCall.callHeader.localChannel;
  toCall.callHeader.remoteChannel = response.call;
  toCall.cssId = fromCall.cssId;
  toCall.ringbackOnProceeding.needed = response.progressTone !== 'Server';

  return toCall;
}

export function canJoinConference(call: WebCall): boolean {
  if (call.isInternodeCall()) {
    diag.trace?.('canJoinConference', `Cannot conference internode call <${call.webCallId}>`);
    return false;
  }

  if (call.isPendingConsultationCall()) {
    diag.trace?.('canJoinConference', `Cannot conference pending consultation call <${call.webCallId}>`);
    return false;
  }

  if (call.isHootNHollerCall()) {
    diag.trace?.('canJoinConference', `Cannot conference hoot-n-holler call <${call.webCallId}>`);
    return false;
  }

  return true;
}

export function callsAreCompatible(firstCall: WebCall, secondCall: WebCall): boolean {
  const firstText = firstCall.isTextCall();
  const secondText = secondCall.isTextCall();
  const first911 = firstCall.is911Call();
  const second911 = secondCall.is911Call();
  const firstInternal = !firstCall.isTrunkCall();
  const secondInternal = !secondCall.isTrunkCall();

  if (firstText && secondText) {
    diag.trace?.(
      'callsAreCompatible',
      `Cannot conference two Text calls <${firstCall.webCallId}, ${secondCall.webCallId}>`
    );
    return false;
  }

  if ((firstText && (second911 || secondInternal)) || (secondText && (first911 || firstInternal))) {
    diag.trace?.(
      'callsAreCompatible',
      `Cannot conference Text call with 911 or Internal call <${firstCall.webCallId}, ${secondCall.webCallId}>`
    );
    return false;
  }

  return true;
}

function chooseIfMostPermissiveShareType(leftCall: WebCall, rightCall: WebCall): WebCall | null {
  const left = leftCall.webLine?.lineCfgEx.shareType || LineSharedType.LSTUnknown;
  const right = rightCall.webLine?.lineCfgEx.shareType || LineSharedType.LSTUnknown;

  if (left === right) {
    return null;
  }

  switch (left) {
    case LineSharedType.LSTUnknown:
      return rightCall;
    case LineSharedType.LSTPrivate:
      return right === LineSharedType.LSTUnknown ? leftCall : rightCall;
    case LineSharedType.LSTAutoPrivacy:
      return right === LineSharedType.LSTUnknown || right === LineSharedType.LSTPrivate ? leftCall : rightCall;
    case LineSharedType.LSTShared:
      return right === LineSharedType.LSTUnknown ||
        right === LineSharedType.LSTPrivate ||
        right === LineSharedType.LSTAutoPrivacy
        ? leftCall
        : rightCall;
    case LineSharedType.LSTPublic:
    default:
      return leftCall;
  }
}

function chooseIfOldest(firstCall: WebCall, secondCall: WebCall): WebCall | null {
  if (firstCall.contextObjId && secondCall.contextObjId) {
    if (firstCall.contextObjId.readCtxId() < secondCall.contextObjId.readCtxId()) {
      return firstCall;
    }
    return secondCall;
  }
  return firstCall;
}

function chooseIfTextCall(firstCall: WebCall, secondCall: WebCall): WebCall | null {
  const firstText = firstCall.isTextCall();
  const secondText = secondCall.isTextCall();
  if (firstText && secondText) {
    diag.trace?.(
      'chooseTextCall',
      'Both call are text calls, which should not happen in call patch! Choosing firstCall'
    );
    return firstCall;
  }
  if (firstText) {
    diag.trace?.('chooseTextCall', 'Choosing firstCall: text call');
    return firstCall;
  }
  if (secondText) {
    diag.trace?.('chooseTextCall', 'Choosing secondCall: text call');
    return secondCall;
  }
  return null;
}

function chooseIf911Call(firstCall: WebCall, secondCall: WebCall): WebCall | null {
  const first911 = firstCall.is911Call();
  const second911 = secondCall.is911Call();
  if (first911 && second911) {
    // both are 911 calls, anchor is the one with the most permissive sharing type, or oldest call if equal
    const anchorCall =
      chooseIfMostPermissiveShareType(firstCall, secondCall) || chooseIfOldest(firstCall, secondCall) || firstCall;
    diag.trace?.(
      'choose911Call',
      `Both call are 911 calls. Choosing ${
        anchorCall === firstCall ? 'firstCall' : 'secondCall'
      } based on privacy and call age`
    );
    return anchorCall;
  }
  if (first911) {
    diag.trace?.('choose911Call', 'Choosing firstCall: 911 call');
    return firstCall;
  }
  if (second911) {
    diag.trace?.('choose911Call', 'Choosing secondCall: 911 call');
    return secondCall;
  }
  return null;
}

function chooseIfSharedlineCall(firstCall: WebCall, secondCall: WebCall): WebCall | null {
  const firstSharedline = firstCall.isSharedlineCall();
  const secondSharedline = secondCall.isSharedlineCall();
  if (firstSharedline && secondSharedline) {
    // both are sharedline calls, anchor is the one with the most permissive sharing type, or oldest call if equal
    const anchorCall =
      chooseIfMostPermissiveShareType(firstCall, secondCall) || chooseIfOldest(firstCall, secondCall) || firstCall;
    diag.trace?.(
      'chooseSharedlineCall',
      `Both call are sharedline calls. Choosing ${
        anchorCall === firstCall ? 'firstCall' : 'secondCall'
      } based on privacy and call age`
    );
    return anchorCall;
  }
  if (firstSharedline) {
    diag.trace?.('chooseSharedlineCall', 'Choosing firstCall: sharedline call');
    return firstCall;
  }
  if (secondSharedline) {
    diag.trace?.('chooseSharedlineCall', 'Choosing secondCall: sharedline call');
    return secondCall;
  }
  return null;
}

function chooseIfSIPCall(firstCall: WebCall, secondCall: WebCall): WebCall | null {
  const firstSIP = firstCall.isSIPCall();
  const secondSIP = secondCall.isSIPCall();
  if (firstSIP && secondSIP) {
    // both are SIP calls, so no sharing type to consider. anchor is the oldest call
    const anchorCall = chooseIfOldest(firstCall, secondCall) || firstCall;
    diag.trace?.(
      'chooseSIPCall',
      `Both call are SIP calls. Choosing ${anchorCall === firstCall ? 'firstCall' : 'secondCall'} based on call age`
    );
    return anchorCall;
  }
  if (firstSIP) {
    diag.trace?.('chooseSIPCall', 'Choosing firstCall: SIP call');
    return firstCall;
  }
  if (secondSIP) {
    diag.trace?.('chooseSIPCall', 'Choosing secondCall: SIP call');
    return secondCall;
  }
  return null;
}

function chooseDefaultCall(firstCall: WebCall): WebCall {
  // Default call is firstCall
  diag.trace?.('chooseDefaultCall', 'Choosing firstCall: default call');
  return firstCall;
}

export function chooseCallPatchAnchor(firstCall: WebCall, secondCall: WebCall): WebCall {
  // order of preference:
  // 1. text call (should already be on a SIP meetme, can't have 2 text calls)
  // 2. p911 call
  // 3. AIM or ADM call (non-911 sharedline call)
  // 4. SIP call
  // 5. default -> connected call, which is the firstCall
  //
  // When 2 calls are at the same level, e.g. both 911 calls, we the prefer:
  // a. call with the most permissive sharetype
  // b. oldest call
  //
  diag.trace?.('chooseCallPatchAnchor', 'Choosing patch conference anchor call');
  return (
    chooseIfTextCall(firstCall, secondCall) ||
    chooseIf911Call(firstCall, secondCall) ||
    chooseIfSharedlineCall(firstCall, secondCall) ||
    chooseIfSIPCall(firstCall, secondCall) ||
    chooseDefaultCall(firstCall)
  );
}

export function prepareDialAddrs(fromCall: WebCall, destAddr: string, prefix: DialingPrefix | null) {
  const dialAddrs: Array<{ longdistance: boolean; tokens: string[] }> = [];

  if (fromCall.webLine) {
    const { lineDev } = fromCall.webLine;
    let hasAlternate = false;
    let isFirstAddr = true;

    const prefixLine = lineDev.webLines.find((line) => line.lineType === LineType.LTIntercom) || fromCall.webLine;

    // eslint-disable-next-line no-param-reassign
    fromCall.firstDial = true; // reset the firstDial flag so processAddress() starts clean

    while (isFirstAddr || hasAlternate) {
      const useAlternate = !isFirstAddr;
      const addr = fromCall.processAddress(destAddr, prefix, prefixLine, useAlternate);

      dialAddrs.push({ longdistance: fromCall.isLongDistance, tokens: Array.from(addr.dialTokenList) });
      hasAlternate = addr.hasAlternatePrefix;
      isFirstAddr = false;
    }
  }

  return dialAddrs;
}
