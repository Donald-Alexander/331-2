import { WebCall } from './webcall';
import { CallState } from './callState';
import { WebLine } from '../webline/webline';
import { HoldCurrConnectedFailure } from '../telephonyinternalinterfacedef';
import { LineType } from '../telephonyexternalinterfacedef';
import { Diag } from '../common/diagClient';
import { WebPhone } from '../webphone/interfaces/webphone';
import { ConferenceMemberType, ConferenceState, WebConference } from '../webconference/conferenceTypes';

const moduleName = 'activecalls';
const diag = new Diag(moduleName);

/* a global object in Telelphony */
const activeCalls: Array<WebCall> = [];
const parkedCalls: Array<WebCall> = [];
export class ActiveCalls {}
export declare namespace ActiveCalls {
  export function get(): Array<WebCall>;
  export function find(webCallId: number): WebCall | undefined;
  export function findBySipId(sipId: string): WebCall | undefined;
  export function findByUCI(uci: string): WebCall | undefined;
  export function findByTurnkUCI(trunkUci: string): WebCall | undefined;
  export function findByLocalChannel(channel: string): WebCall | undefined;
  export function findByRemoteChannel(channel: string): WebCall | undefined;
  export function findByCSSID(cssId: string): WebCall | undefined;
  export function findByCallUCI(uci: string): WebCall | undefined;
  export function getCallsByUCI(uci: string): Array<WebCall>;
  export function getCallsByUCICallHeader(uci: string): Array<WebCall>;
  export function add(call: WebCall): boolean;
  export function remove(call: WebCall): boolean;
  export function replace(call: WebCall): boolean;
  export function callsInStateOf(state: CallState): Array<WebCall>;
  export function callsInStatesOf(states: Array<CallState>): Array<WebCall>;
  export function activeCallsOnWebLine(line: WebLine): Array<WebCall>;
  export function activeCallsOnLineAddr(lineAddr: string): Array<WebCall>;
  export function holdCurrentConnected(): Promise<boolean>;
  export function updateActiveCallsWithWebphone(webPhone: WebPhone): boolean;
  export function addParked(call: WebCall): boolean;
  export function removeParked(call: WebCall): boolean;
  export function findByParkDN(uci: string): WebCall | undefined;
}

ActiveCalls.find = function find(webCallId: number): WebCall | undefined {
  return activeCalls.find((c) => c.webCallId === webCallId);
};

ActiveCalls.findBySipId = function findBySipId(SipId: string): WebCall | undefined {
  return activeCalls.find((c) => c.sipId === SipId);
};

ActiveCalls.findByUCI = function findByUCI(uci: string): WebCall | undefined {
  return activeCalls.find((c) => c.callHeader.uCI === uci);
};

ActiveCalls.findByTurnkUCI = function findByTurnkUCI(trunkUci: string): WebCall | undefined {
  return activeCalls.find((c) => c.callHeader.trunkUniqueID === trunkUci);
};

ActiveCalls.findByLocalChannel = function findByLocalChannel(channel: string): WebCall | undefined {
  return activeCalls.find((c) => c.callHeader.localChannel === channel);
};

ActiveCalls.findByRemoteChannel = function findByRemoteChannel(channel: string): WebCall | undefined {
  return activeCalls.find((c) => c.callHeader.remoteChannel === channel);
};

ActiveCalls.findByCSSID = function findByCSSID(cssId: string): WebCall | undefined {
  return activeCalls.find((c) => c.cssId && c.cssId === cssId);
};

ActiveCalls.findByCallUCI = function findByCallUCI(uci: string): WebCall | undefined {
  return activeCalls.find((c) => c.infoRec.uniqueCallId && c.infoRec.uniqueCallId === uci);
};

ActiveCalls.getCallsByUCI = function getCallsByUCI(uci: string): Array<WebCall> {
  return activeCalls.filter((c) => c.infoRec.uniqueCallId === uci);
};

ActiveCalls.getCallsByUCICallHeader = function getCallsByUCICallHeader(uci: string): Array<WebCall> {
  return activeCalls.filter((c) => c.callHeader.uCI === uci);
};

ActiveCalls.get = function get() {
  return activeCalls;
};

ActiveCalls.add = function add(call: WebCall): boolean {
  if (activeCalls.includes(call) || activeCalls.find((c) => c.webCallId === call.webCallId)) {
    diag.warn(
      'add',
      `webcall with webCallId <${call.webCallId}> alread existed in activeCallList. Failed to add new webCall to the list`
    );
    return false;
  }

  diag.out('add', `add new webcall id <${call.webCallId}> sipId [${call.sipId ? call.sipId : ''}] to activeCallList`);
  activeCalls.push(call);
  return true;
};

ActiveCalls.remove = function remove(call: WebCall): boolean {
  const n = activeCalls.findIndex((c) => c.webCallId === call.webCallId);
  if (n !== -1) {
    diag.out(
      'remove',
      `remove webcall id <${call.webCallId}> sipId [${call.sipId ? call.sipId : ''}] from activeCallList`
    );
    activeCalls.splice(n, 1);
    return true;
  }

  return false;
};

ActiveCalls.replace = function replace(webCall: WebCall): boolean {
  const n = activeCalls.findIndex((call) => call.webCallId === webCall.webCallId);
  if (n !== -1) {
    activeCalls.splice(n, 1, webCall);
    return true;
  }

  return false;
};

ActiveCalls.callsInStateOf = function callsInStateOf(state: CallState): Array<WebCall> {
  return activeCalls.filter((c) => c.state === state);
};

ActiveCalls.callsInStatesOf = function callsInStatesOf(states: Array<CallState>): Array<WebCall> {
  return activeCalls.filter((c) => {
    return c.state && states.includes(c.state);
  });
};

ActiveCalls.activeCallsOnWebLine = function activeCallOnWebLine(line: WebLine): Array<WebCall> {
  return activeCalls.filter(
    (call) => call.webLine && call.webLine.addressv === line.addressv && call.webLine.lineType === line.lineType
  );
};

ActiveCalls.activeCallsOnLineAddr = function activeCallsOnLineAddr(lineAddr: string): Array<WebCall> {
  return activeCalls.filter((call) => call.webLine && call.webLine.addressv === lineAddr);
};

ActiveCalls.holdCurrentConnected = async function holdCurrentConnected(): Promise<boolean> {
  try {
    // put connected conference on hold
    const connectedConfs = Array.from(
      activeCalls.reduce((s, call) => {
        if (call.webConf?.state === ConferenceState.Connected) {
          s.add(call.webConf);
        }
        return s;
      }, new Set<WebConference>())
    );

    if (connectedConfs.length > 1) {
      diag.warn('holdCurrentConnected', `More than one connected conference!`);
    }

    await connectedConfs.reduce((p, conf) => p.then(() => conf.hold()), Promise.resolve());

    // put connected call on hold
    const connectedCalls = activeCalls.filter((c) => [CallState.Connected, CallState.Disconnected].includes(c.state));

    if (connectedCalls.length > 1) {
      diag.warn('holdCurrentConnected', `More than one connected call!`);
    }

    await connectedCalls.reduce((p, call) => p.then(() => call.hold()), Promise.resolve());

    const proceedingCalls = activeCalls.filter(
      (c) => [CallState.Dialtone, CallState.Proceeding].includes(c.state) && c.webLine?.lineType === LineType.LTIntercom
    );
    await proceedingCalls.reduce(
      (p, c) =>
        p.then(() => {
          if (
            !(
              c.webConf &&
              c.webConf.members.find(
                (mem) => mem.call.webCallId === c.webCallId && mem.memberType === ConferenceMemberType.ConsultCall
              )
            )
          ) {
            // Drop proceeding outgoing call on Intercom since it has not been connected yet
            c.drop();
          } else if (c.sipId) {
            // Since The proceeding NHCConsultCall call on Intercom has not been connected yet,
            // Terminate it if it has sipId. (E.G. Initial trunk released. The call with audio was moved to the ConsultCall)
            c.getWebPhone().hangupCall(c.sipId, c.webNode.nodeCfgEx.id);
          }
        }),
      Promise.resolve()
    );
  } catch (e) {
    throw new HoldCurrConnectedFailure('');
  }
  return Promise.resolve(true);
};

ActiveCalls.updateActiveCallsWithWebphone = function updateActiveCallsWithWebphone(webPhone: WebPhone) {
  for (let call of activeCalls) {
    call.setWebPhone(webPhone);
  }
  return true;
};

ActiveCalls.addParked = function addParked(call: WebCall): boolean {
  if (parkedCalls.includes(call) || parkedCalls.find((c) => c.webCallId === call.webCallId)) {
    diag.warn(
      'addParked',
      `webcall with webCallId <${call.webCallId}> alread existed in parkedCallList. Failed to add new webCall to parkedCallList`
    );
    return false;
  }

  diag.out(
    'addParked',
    `add new webcall id <${call.webCallId}> sipId [${call.sipId ? call.sipId : ''}] to parkedCallList`
  );
  parkedCalls.push(call);
  return true;
};

ActiveCalls.removeParked = function removeParked(call: WebCall): boolean {
  const n = parkedCalls.findIndex((c) => c.webCallId === call.webCallId);
  if (n !== -1) {
    diag.out(
      'removeParked',
      `remove webcall id <${call.webCallId}> sipId [${call.sipId ? call.sipId : ''}] from parkedCallList`
    );
    parkedCalls.splice(n, 1);
    return true;
  }

  return false;
};

ActiveCalls.findByParkDN = function findByParkDN(parkDN: string): WebCall | undefined {
  return parkedCalls.find((c) => c.parkDN === parkDN);
};

export default ActiveCalls;
