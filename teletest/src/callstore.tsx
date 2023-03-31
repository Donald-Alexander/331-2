import WebCall from 'telephony/src/webcall/webcall';

const callMap: Map<number, WebCall> = new Map();
let callIdNum = 0;
let activeCallIdNum = 0;

export function setActiveCallIdNum(num: number) {
  activeCallIdNum = num;
}

export function getActiveCallIdNum() {
  return activeCallIdNum;
}

export function getCurrentCall(): WebCall | undefined {
  return callMap.get(activeCallIdNum);
}

export function getCallList(): [number, WebCall][] {
  return Array.from(callMap);
}

export function addCall(call: WebCall) {
  callMap.set(++callIdNum, call);

  if (callMap.size === 1) {
    activeCallIdNum = callIdNum;
  }
}

export function removeCall(callId: number) {
  for (let [idx, call] of callMap) {
    if (call.webCallId === callId) {
      callMap.delete(idx);
      break;
    }
  }

  if (callMap.size === 1) {
    activeCallIdNum = callIdNum;
  } else if (callMap.size === 0) {
    activeCallIdNum = 0;
  }
}

export function findCall(callId: number) {
  for (let [idx, call] of callMap) {
    if (call.webCallId === callId) {
      return call;
    }
  }
}
