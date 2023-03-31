import WebLineDev from '../weblinedev';
import WebCall from '../../webcall/webcall';
import ActiveCalls from '../../webcall/activecalls';
import CallState from '../../webcall/callState';
import { Diag } from '../../common/diagClient';
const diag = new Diag('forceconnect');

export function initiateForceConnect(this: WebLineDev, call: WebCall): boolean {
  let callOpProgress = false;
  let res = true;
  let trace: string;
  if (this.currentForceConnectSync.length > 0) {
    callOpProgress = true;
  }
  if (callOpProgress) {
    res = false;
    this.currentForceConnectSync.find((fSync) => {
      trace = `cannot initiate force connect for call<${call.webCallId}> because of (op ${fSync.callOpName})`;
      diag.trace?.('initiateForceConnect', trace);
    });
  } else {
    let states: Array<CallState> = [];
    states.push(CallState.Dialtone);
    states.push(CallState.Proceeding);
    states.push(CallState.Connected);
    states.push(CallState.Disconnected);
    states.push(CallState.IHold);

    const calls = ActiveCalls.callsInStatesOf(states);
    if (calls.length > 0) {
      res = false;
      trace = `cannot initiate force connect for call<${call.webCallId}> because of the following calls`;
      diag.trace?.('initiateForceConnect', trace);

      for (const c of calls) {
        trace = `calls: call<${c.webCallId}> - state<${c.state}>`;
        diag.trace?.(this.initiateForceConnect.name, trace);
      }
    }
  }
  if (res) {
    this.forceConnectInProgress = call;
    trace = `Initiate force call => ${call.webCallId}`;
    diag.trace?.('initiateForceConnect', trace);
  }

  return res;
}
