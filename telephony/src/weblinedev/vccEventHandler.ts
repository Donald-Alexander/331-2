import { WebLineDev } from './weblinedev';
import { WebNode, VccNenaQueueState, nenaQueueStateFullFromVcc, nenaServiceStateFullFromVcc } from './webnode';
import { VccMsg } from '../vcc/VccMsg';
import { CallState, CongestionState } from '../webcall/callState';
import { WebCall } from '../webcall/webcall';
import { ActiveCalls } from '../webcall/activecalls';
import {
  InformationUpdate,
  LineType,
  ParkReofferDevice,
  ParkReofferRoute,
  ParkTimeoutReached,
  ParkTimeoutWarning,
  TextOwnerChange,
  CallType,
  CallRingingStatus,
  CallRingingProgress,
  ViperNodeState,
  ViperNodeStateChange,
  ViperNodeStatus,
  ViperNodesStates,
  NenaQueueStateFull,
  NenaQueueState,
  CallReferNotifySipfragEvent,
  ConfigUpdateEvent,
  Direction,
} from '../telephonyexternalinterfacedef';
import { CallRinging, DirectionCfg } from '../telephonyinternalinterfacedef';
import { AcdLoginStatus, consolidateAcdLoginState } from './loginState/acdLoginState';
import { Diag } from '../common/diagClient';
import { consolidateRgLoginState, RgLoginStatus } from './loginState/rgLoginState';
import { ConfInfo, ConfInfoParam } from '../webconference/confinfo';
import { CallHeader } from '../telephonyutil';
import { AgentMembershipUpdate, processAgentMembershipModifyByNode } from './dynamicACDBySupervisor/dynamicACDStatus';

const diag = new Diag('weblinedev.vcceventhandler');

const parkWaiters: Map<number, () => void> = new Map();

/** Returns true if the sharedline event has a device exclusion for this device  or if we released for Park */
function excludeSharedlineEvt(lineDev: WebLineDev, msg: VccMsg): boolean {
  if (msg.evt?.body?.exDev) {
    const exDevs = (msg.evt?.body?.exDev as string).split('&');
    if (exDevs.find((dev) => dev === lineDev.device)) {
      return true;
    }
  }
  return false;
}

/** Returns existing call matching this sharedline message */
function getSharedlineCall(lineDev: WebLineDev, msg: VccMsg): WebCall | undefined {
  if (msg.evt?.body?.uci) {
    return ActiveCalls.get().find((c) => c.callHeader.uCI === msg.evt?.body?.uci && c.isSharedlineCall());
  }
  return undefined;
}

function getConsultCall(lineDev: WebLineDev, msg: VccMsg): WebCall | undefined {
  const localChannel = msg.evt?.body?.localCall;
  const initChannel = msg.evt?.body.initCall;
  const consultConfId = msg.evt?.body.consultConfId;

  const consultCall =
    (localChannel || consultConfId) && initChannel
      ? ActiveCalls.get().find(
          (c) =>
            (c.callHeader.localChannel === localChannel ||
              (c.callHeader.cSSID && c.callHeader.cSSID === consultConfId)) &&
            (c.callHeader.baseTrunkChannel === initChannel ||
              (msg.evt?.body.connectedBy && msg.evt?.body.connectedBy !== lineDev.device))
        )
      : undefined;

  return consultCall;
}

/** Adds a new call for this sharedline message */
function addSharedlineCall(lineDev: WebLineDev, msg: VccMsg, initialState: CallState): WebCall | null {
  const node = msg.node && lineDev.getWebNodeById(msg.node);
  const body = msg.evt?.body;

  if (!node) {
    // don't know where this message came from
    return null;
  }

  if (!body || !body.uci || !body.initCall || !body.initTrunkAddress) {
    // bad message format
    return null;
  }

  let line = null;

  if (initialState !== CallState.Park) {
    // parked calls have no line assigned to them, but other calls MUST have the assigned line
    const lineType = lineDev.getWantedLineType(body.initTrunkAddress, false);
    line = lineDev.getFreeLine(lineType, body.initTrunkAddress, false, false);
    if (!line) {
      // no line for this call, can't do anything with it
      diag.trace?.('addSharedlineCall', `no line for this call, can't do anything with it`);

      return null;
    }
  }

  const callHeader = new CallHeader();

  callHeader.remoteChannel = body.initCall;
  callHeader.trunkAddress = body.initTrunkAddress;
  callHeader.uCI = body.uci;
  callHeader.trunkUniqueID = body.trunkUci || '';
  callHeader.initialRoute = body.initRoute || '';

  const call = new WebCall(line, node, {
    callHeader,
    cfg: new DirectionCfg(body.initRoute ? Direction.Incoming : Direction.Outgoing),
    initialState,
    uniqueCallId: body.uci,
  });

  call.parkDN = body.parkDN || '';

  if (line) {
    line.addCall(call);
  } else {
    ActiveCalls.add(call);
  }
  call.setCallState(initialState);

  return call;
}

function updateSharedlineState(lineDev: WebLineDev, msg: VccMsg, newState: CallState) {
  let call = getSharedlineCall(lineDev, msg) || null;

  if (!call && newState !== CallState.Finished) {
    // Add sharedline call, unless it is on ACD
    const route = msg.evt?.body?.route as string;

    if (!(route && route.startsWith('Q') && /&ACD/.test(route))) {
      call = addSharedlineCall(lineDev, msg, newState);
    }
  }

  if (call && call.state !== CallState.Finished && call.state !== newState) {
    if (newState === CallState.Finished) {
      call.finishCall();
    } else {
      call.setCallState(newState);
    }
  }
}

function sharedlineConnect(lineDev: WebLineDev, msg: VccMsg) {
  diag.trace?.('sharedlineConnect', 'handling Vcc sharedlineConnect');

  if (!excludeSharedlineEvt(lineDev, msg)) {
    // for sharedline connect, we want to see if we know about the initial call of the meetme, so we look up the call by remoteChannel
    const call = ActiveCalls.findByRemoteChannel(msg.evt?.body?.initCall);
    const consultCall = getConsultCall(lineDev, msg);

    // TODO: BP - this code should not rely on channel name like 'SIP/'.
    // Instead, the VCC API should be providing data in a format that doesn't require this level of parsing or knowledge of VOIP internals
    // At the very least, we should provide a utility function to "unpack" the encoded posList,
    // like we do for queue list. see function unpackAcdQlist() for example
    const iHoldState: boolean = msg.evt?.body?.posList.includes(`HSIP/${lineDev.device}`);

    if (call) {
      if (call.state === CallState.Park) {
        call.parkDN = '';

        // we need to find a line for this call before we can set it to BUSY
        // TODO: replace the UCI split with sharedline message trunk address field. UCI should be an opaque string
        const lineAddress = msg.evt?.body?.uci.split('-', 1)[0];
        const line = lineDev.getLineByAddress(lineAddress);
        if (line) {
          call.setCallState(CallState.Busy);
          call.changeLine(line);
        } else {
          call.finishCall();
        }
      } else if (call.state !== CallState.Finished && call.state !== CallState.Connected) {
        if (consultCall && consultCall !== call && !call.callHeader.localChannel) {
          // we have a consultation call that has just joined the conference,
          if (
            consultCall.callHeader.consultConf.split(';').includes('type=Normal') &&
            !CallState.connected(consultCall.state)
          ) {
            // unanswered consultation call joined the conference. Wait until answered to merge with sharedline call
            consultCall.callHeader.cSSID = '';
          } else {
            // replace the sharedline appearance call with the connected consultation call
            const newLine = call.webLine;
            const { localChannel } = consultCall.callHeader;
            consultCall.callHeader = { ...call.callHeader, localChannel };
            consultCall.cfg = { ...call.cfg };
            consultCall.infoRec = { ...call.infoRec };
            call.finishCall();
            consultCall.changeLine(newLine);
          }
        } else {
          call.setCallState(iHoldState ? CallState.IHold : CallState.Busy);
        }
      }
    } else if (consultCall) {
      // we have a consultation call that connected the conference,
      // update the remote channel and trunk address
      consultCall.callHeader.remoteChannel = consultCall.callHeader.baseTrunkChannel || msg.evt?.body?.initCall;
      consultCall.infoRec.trunkAddress =
        consultCall.callHeader.trunkAddress || consultCall.callHeader.uiTrunkAddress || msg.evt?.body?.initTrunkAddress;
    } else {
      // Add sharedline call, unless it is on ACD
      const route = msg.evt?.body?.route as string;

      if (!(route && route.startsWith('Q') && /&ACD/.test(route))) {
        addSharedlineCall(lineDev, msg, CallState.Busy);
      }
    }
  }
}

function sharedlineDisconnect(lineDev: WebLineDev, msg: VccMsg) {
  diag.trace?.('sharedlineDisconnect', 'handling Vcc sharedlineDisconnect');

  if (excludeSharedlineEvt(lineDev, msg)) {
    diag.trace?.('sharedlineDisconnect', 'ignoring device excluded sharedlineDisconnect');
    return;
  }
  if (!msg.evt?.body?.call) {
    diag.trace?.('sharedlineDisconnect', 'ignoring sharedlineDisconnect with no call in body');
    return;
  }

  const remotecall = ActiveCalls.findByRemoteChannel(msg.evt?.body?.initCall as string);
  const mmOnHold = msg.evt?.body?.meetmeOnHold;
  if (remotecall) {
    if (
      !excludeSharedlineEvt(lineDev, msg) &&
      !remotecall.webConf &&
      remotecall.webNode.isMMHoldKeepAlive() &&
      remotecall.state !== CallState.IHold &&
      remotecall.state !== CallState.Connected &&
      mmOnHold
    ) {
      remotecall.setCallState(CallState.Hold);
    }
  }
  const body: { call?: string; newTrunkCall?: { call?: string; trunkAddress?: string; uci?: string } } = msg.evt?.body;

  if (body?.newTrunkCall?.trunkAddress) {
    // the disconnected call was the trunk call and another leg on the call was promoted to the primary leg
    const call = ActiveCalls.findByRemoteChannel(msg.evt.body.call as string);

    // TODO: In SCE code there seems to be special/different handling when the call state is Busy

    if (call) {
      const lineType = call.webLine?.lineType;
      const { newTrunkCall } = body;

      if (newTrunkCall.trunkAddress === 'intercom') {
        if (lineType === LineType.LTIntercom || lineType === LineType.LTACD) {
          // keep calls on the current intercom or ACD line
        } else {
          // move all calls on the trunk line to an intercom line
          const newLine = lineDev.getFreeIntercomLine();

          if (newLine) {
            diag.trace?.('sharedlineDisconnect', 'moving calls to intercom line');
            ActiveCalls.get()
              .filter((c) => c.webLine === call.webLine)
              .forEach((c) => {
                /* !!!! Attention !!!!:
                 * DO NOT clean-up c.callHeader.uCI. It will be used in some special case like audible alert.
                 * DO NOT clean-up c.callHeader.remoteChannel. It will be used in some special case like audible alert.
                 */

                /* eslint-disable no-param-reassign */
                c.infoRec.uniqueCallId = '';
                c.infoRec.trunkAddress = '';
                c.callHeader.uiUCI = '';
                c.callHeader.uiTrunkAddress = '';
                c.callHeader.baseTrunkChannel = '';
                /* eslint-enable no-param-reassign */

                const infoUpdate = new InformationUpdate(c);
                infoUpdate.uniqueCallId = true;
                infoUpdate.trunkAddress = true;
                lineDev.report(infoUpdate);

                c.changeLine(newLine);
              });
          }
        }

        if (call.webConf) {
          if (call.audibleAlertTimeout < 1) {
            call.finishCall();
          }
        }
      } else if (lineType === LineType.LTACD) {
        // keep calls on the current ACD line
        // TODO: are there any properties we need to 'clone' to this ACD line from the new trunk line?
      } else {
        // move calls to the new primary call trunk line, if that line is configured
      }
    }
  } else if (body.call) {
    const call = ActiveCalls.findByRemoteChannel(body.call);

    if (call) {
      // call was disconnected by some external change
      call.finishCall();
    }
  }
}

function sharedlineForcedHold(lineDev: WebLineDev, msg: VccMsg) {
  diag.trace?.('sharedlineForcedHold', 'handling Vcc sharedlineForcedHold');

  if (!excludeSharedlineEvt(lineDev, msg)) {
    updateSharedlineState(lineDev, msg, CallState.Hold);
  }
}

function sharedlineHold(lineDev: WebLineDev, msg: VccMsg) {
  diag.trace?.('sharedlineHold', 'handling Vcc sharedlineHold');

  if (!excludeSharedlineEvt(lineDev, msg)) {
    const call = getSharedlineCall(lineDev, msg);
    if (call?.state !== CallState.IHold) {
      updateSharedlineState(lineDev, msg, CallState.Hold);
    }
  }
}

function sharedlineRelease(lineDev: WebLineDev, msg: VccMsg) {
  diag.trace?.('sharedlineRelease', 'handling Vcc sharedlineRelease');

  if (excludeSharedlineEvt(lineDev, msg)) {
    return;
  }

  const call = getSharedlineCall(lineDev, msg);

  if (call) {
    if (msg.evt?.body?.releasedFor === 'Park') {
      // we are expecting a Park event to follow. If we don't get it, then finish the call
      const timeoutId = setTimeout(() => {
        parkWaiters.delete(call.webCallId);
        call.finishCall();
      }, 2000);

      parkWaiters.get(call.webCallId)?.(); // clear any previous timer
      parkWaiters.set(call.webCallId, () => clearTimeout(timeoutId));
    } else {
      call.finishCall();
    }
  }
}

function getAbandonedWebCall(lineDev: WebLineDev, msg: VccMsg): WebCall | undefined {
  /* if there is an existing call matching this abandonedCall event */
  const call =
    (msg.evt?.body?.uci && ActiveCalls.findByUCI(msg.evt.body.uci)) ||
    (msg.evt?.body?.initCall && ActiveCalls.findByRemoteChannel(msg.evt.body.initCall));
  if (!call) {
    diag.trace?.(
      'getAbandonedWebCall',
      `no existing call matching the abandonedCall message for trunk <${msg.evt?.body.initCall}> with uci <${msg.evt?.body.uci}>. Skip!!!`
    );
  }

  return call;
}

function abandonedCallBSA(lineDev: WebLineDev, msg: VccMsg) {
  diag.trace?.(
    'abandonedCallASA',
    `caller disconnect received trunk <${msg.evt?.body.initCall}> with uci <${msg.evt?.body.uci}>`
  );

  const call = getAbandonedWebCall(lineDev, msg);
  if (call) {
    call.onAbandonedCallBSA();
  }
}

async function abandonedCallASA(lineDev: WebLineDev, msg: VccMsg) {
  diag.out(
    'abandonedCallASA',
    `caller disconnect received for trunk <${msg.evt?.body.initCall}> with uci <${msg.evt?.body.uci}>`
  );
  const uci = msg.evt?.body.uci;
  if (!uci) return;
  const call = getAbandonedWebCall(lineDev, msg);
  if (call) {
    if (call.audibleAlertTimeout > 0) {
      diag.trace?.('abandonedCallASA', `audibleAlertTimeout is <${call.audibleAlertTimeout}>`);
      let calls = ActiveCalls.getCallsByUCI(uci);
      if (calls.length === 0) calls = ActiveCalls.getCallsByUCICallHeader(uci);
      if (calls.length > 0) {
        for (let c of calls) {
          c.setCallerDisc(true);
        }
      } else {
        diag.warn('abandonedCallASA', `Can not get calls by uci <${uci}`);
      }

      if (call.state === CallState.Disconnected) {
        if (call.webConf && call.webConf.members.length > 1) {
          call.setCallState(CallState.Finishing);
        } else {
          /* Do not set call State to Finishing if it's not conference or conf size is not greater than 1
           * One call senarios: -- Barged-in : No SIP Bye(SIP INFO ASA) from Asterisk.
           *                    -- single call: a SIP Bye(SIP INFO ASA) is coming from Asterisk
           */
        }
        try {
          let result = await call.audibleAlertProgress(call.audibleAlertTimeout);
          diag.trace?.('abandonedCallASA', `${result}`);
        } catch (e) {
          diag.warn('arbandonedCallASA', `${e}`);
        } finally {
        }
      }
    }
  }
}

async function acdStatus(lineDev: WebLineDev, msg: VccMsg): Promise<void> {
  diag.trace?.('acdStatus', `acd status update received <${msg.evt?.body.status}> for agent <${msg.evt?.body.agent}>`);

  const { agentId, status } = msg.evt?.body;

  // for now we only support ACD state update for NotReady
  if (agentId === lineDev.agentId) {
    if (status === 'NotReady') {
      // we received a NotReady from the voip server due to ring timeout
      // update the node state and preferred state, then sync the other nodes
      const msgNode = lineDev.webNodes.find((node) => node.getNodeId() === msg.node);

      if (msgNode) {
        msgNode.acdLoginState.loginStatus = AcdLoginStatus.LoggedIn;
        msgNode.acdLoginState.ready = false;
        msgNode.acdLoginState.reasonCode = undefined;
        msgNode.acdLoginState.reasonDesc = undefined;
      }

      /* eslint-disable no-param-reassign */
      if (lineDev.preferredAcdLoginState.loginStatus === AcdLoginStatus.LoggedIn) {
        lineDev.preferredAcdLoginState.ready = false;
        lineDev.preferredAcdLoginState.reasonCode = undefined;
        lineDev.preferredAcdLoginState.reasonDesc = undefined;
      }

      // sync the ACD NotReady state across nodes
      await Promise.allSettled(
        lineDev.webNodes.map((node) => {
          if (node === msgNode) {
            return Promise.resolve();
          }
          return node.acdNotReady(lineDev.agentId, lineDev.device);
        })
      );

      const acdLoginState = consolidateAcdLoginState(lineDev.webNodes.map((node) => node.acdLoginState));
      lineDev.setAcdLoginState(acdLoginState);

/*
      if (acdLoginState.ready === false && lineDev.appServerClient) {
        await lineDev.appServerClient
          .reportAcdNotReady(
            acdLoginState.qlist.map((qmem) => `Q${qmem.queue}`).join(';'),
            acdLoginState.reasonCode?.toString() || '',
            acdLoginState.reasonDesc || ''
          )
          .catch(async (e: string) => {
            diag.warn('acdStatus', `Error reporting AcdNotReady: ${e}`);
          });
      }
    */
      /* eslint-enable no-param-reassign */
    }
  }
}

function excludeParkEvt(lineDev: WebLineDev, msg: VccMsg): boolean {
  if (msg.evt?.body?.exDev) {
    const exDevs = (msg.evt?.body?.exDev as string).split('&');
    if (exDevs.find((dev) => dev === lineDev.device)) {
      return true;
    }
  }
  return false;
}

function addParkedCall(
  node: WebNode,
  remoteChannel: string,
  trunkAddress: string,
  uci: string,
  callType: string,
  parkDN: string,
  trunkUci: string,
  initRoute: string
) {
  const callHeader = new CallHeader();

  callHeader.remoteChannel = remoteChannel;
  callHeader.trunkAddress = trunkAddress;
  callHeader.uCI = uci;
  callHeader.trunkUniqueID = trunkUci;
  callHeader.initialRoute = initRoute || '';

  const call = new WebCall(null, node, {
    callHeader,
    cfg: new DirectionCfg(initRoute ? Direction.Incoming : Direction.Outgoing),
    initialState: CallState.Park,
    uniqueCallId: uci,
  });

  call.callType = callType === 'TEXT' ? CallType.Text : CallType.Voice;
  call.parkDN = parkDN;

  ActiveCalls.add(call);
  call.setCallState(CallState.Park);

  return call;
}

function parkAbandoned(lineDev: WebLineDev, msg: VccMsg) {
  diag.trace?.('parkAbandoned', `caller disconnect received for parked call on trunk <${msg.evt?.body.initCall}>`);

  const call = getAbandonedWebCall(lineDev, msg);
  if (call && CallState.parked(call.state)) {
    call.finishCall();
  }
  // DT Do we really need to set the call abandonned and remove it right after?
}

function parkPark(lineDev: WebLineDev, msg: VccMsg) {
  if (msg.evt?.body) {
    if (!excludeParkEvt(lineDev, msg)) {
      const node = msg.node && lineDev.getWebNodeById(msg.node);
      const { call, trunkAddress, uci, callType, parkDN, trunkUci, initRoute } = msg.evt.body;
      if (node && call && trunkAddress && uci && callType && parkDN) {
        const parkedCall = ActiveCalls.findByRemoteChannel(call);

        if (parkedCall) {
          // cancel the delayed 'finish' started when transitioning to Park in sharedlineRelease handler
          parkWaiters.get(parkedCall.webCallId)?.();
          parkWaiters.delete(parkedCall.webCallId);

          parkedCall.parkDN = parkDN;
          parkedCall.setCallState(CallState.Park);
          parkedCall.changeLine(null);
        } else if (!parkedCall && !ActiveCalls.findByLocalChannel(call)) {
          // a call we don't know about was parked, so add it
          addParkedCall(node, call, trunkAddress, uci, callType, parkDN, trunkUci || '', initRoute || '');
        }
      }
    }
  }
}

function parkTimeout(lineDev: WebLineDev, msg: VccMsg) {
  diag.trace?.('parkTimeout', 'handling Vcc park timeout');

  if (!msg.evt?.body || !msg.evt.body.event) {
    diag.trace?.('parkTimeout', 'bad park timeout event format. Expected event field');
    return;
  }

  if (!msg.evt.body.call) {
    return;
  }

  if (typeof msg.evt.body.call !== 'string') {
    diag.trace?.('parkTimeout', 'bad park timeout event format. Expected call field with string type');
    return;
  }

  const call = ActiveCalls.findByRemoteChannel(msg.evt.body.call as string);

  if (call && CallState.parked(call.state)) {
    switch (msg.evt.body.event) {
      case 'ReofferDevice':
        diag.trace?.('parkTimeout', `parked call <${msg.evt.body.call}> reoffered to device <${msg.evt.body.device}>`);
        if (msg.evt.body.device === lineDev.device) {
          lineDev.report(new ParkReofferDevice(call, msg.evt.body.device));
        } else {
          // call re-offered to device which isn't this position
          call.parkDN = '';
          call.setCallState(CallState.Busy);
        }
        break;
      case 'ReofferRoute':
        diag.trace?.('parkTimeout', `parked call <${msg.evt.body.call}> reoffered to route <${msg.evt.body.route}>`);
        lineDev.report(new ParkReofferRoute(call, msg.evt.body.route));
        call.parkDN = '';
        call.finishCall();
        break;
      case 'TimeoutWarning':
        diag.trace?.(
          'parkTimeout',
          `parked call <${msg.evt.body.call}> timeout warning. Remaining sec <${msg.evt.body.remainingSec}>`
        );
        if (msg.evt.body.remainingSec > 0) {
          lineDev.report(new ParkTimeoutWarning(call, msg.evt.body.remainingSec));
        }
        break;
      case 'TimeoutReached':
        diag.trace?.(
          'parkTimeout',
          `parked call <${msg.evt.body.call}> timeout reached. Max park time remaining sec <${msg.evt.body.remainingSec}>`
        );
        lineDev.report(new ParkTimeoutReached(call, msg.evt.body.remainingSec));
        break;
      default:
        // unhandled park timeout event
        break;
    }
  }
}

function parkUnpark(lineDev: WebLineDev, msg: VccMsg) {
  if (!excludeParkEvt(lineDev, msg)) {
    const call = msg.evt?.body?.call;
    if (call) {
      const unparkedCall = ActiveCalls.findByRemoteChannel(call);

      if (unparkedCall) {
        unparkedCall.parkDN = '';
        if (CallState.parked(unparkedCall.state) && !unparkedCall.isSharedlineCall()) {
          // sharedline calls will be put in the right state by sharedline messages
          // other unparked calls need to be removed since they are no longer visible to the agent
          unparkedCall.finishCall();
        }
      }
    }
  }
}

function callLink(lineDev: WebLineDev, msg: VccMsg) {
  const { caller, callerTrunkAddress, callee, calleeTrunkAddress, cssid, uci } = msg.evt?.body || {};

  diag.trace?.('callLink', `Handling callLink caller=${caller}, callee=${callee}, cssid=${cssid}`);

  if (caller && callee && cssid) {
    const call = ActiveCalls.findByCSSID(cssid);

    if (call) {
      if (!call.callHeader.localChannel && caller) {
        diag.trace?.('callLink', `Update call localChannel to ${caller}`);
        call.callHeader.localChannel = caller;
      }
      if (!call.callHeader.remoteChannel && callee) {
        diag.trace?.('callLink', `Update call remoteChannel to ${callee} and trunkAddress to ${calleeTrunkAddress}`);
        call.callHeader.remoteChannel = callee;
        call.callHeader.uCI = uci || '';
        call.infoRec.uniqueCallId = call.callHeader.uCI;
        call.infoRec.trunkAddress = calleeTrunkAddress;
      }
      // it is possible for callee to put us on hold or park if callee is a position.
      // when they unhold or unpark, we get a call link with the roles reversed.
      // in this situation we need to update the remoteChannel to the new value
      if (call.callHeader.localChannel === callee) {
        diag.trace?.(
          'callLink',
          `Possible re-link from remote end. Update call remoteChannel to ${caller} and trunkAddress to ${callerTrunkAddress}`
        );
        call.callHeader.remoteChannel = caller;
        call.infoRec.trunkAddress = callerTrunkAddress;
      }
    } else {
      diag.trace?.('callLink', `No matching call with cssid ${cssid}`);
    }
  }
}

function callReplace(lineDev: WebLineDev, msg: VccMsg) {
  const { oldCall, oldNode, newCall, newNode, newTrunkAddress } = msg.evt?.body;

  diag.trace?.(
    'callReplace',
    `Handling callReplace oldcall=${oldCall}, oldNode=${oldNode}, newCall=${newCall}, newNode=${newNode}, newTrunkAddress=${newTrunkAddress}`
  );

  if (oldCall && newCall) {
    const call = ActiveCalls.findByRemoteChannel(oldCall);

    if (call) {
      diag.trace?.('callReplace', `Updating call matching remote channel ${oldCall} to ${newCall}`);
      call.callHeader.remoteChannel = newCall;
      call.infoRec.trunkAddress = newTrunkAddress;

      if (oldNode && newNode) {
        const newWebNode = lineDev.getWebNodeByClusterName(newNode);
        if (newWebNode) {
          diag.trace?.(
            'callReplace',
            `Updating call node <${call.webNode.getNodeId()}> to <${newWebNode.getNodeId()}> for remote channel ${newCall}`
          );
          call.webNode = newWebNode;
        }
      }
    } else {
      diag.trace?.('callReplace', `No matching call with remote channel ${oldCall}`);
    }
  }
}

function callRinging(lineDev: WebLineDev, msg: VccMsg) {
  const call =
    (msg.evt?.body?.cssid && ActiveCalls.findByCSSID(msg.evt.body.cssid)) ||
    (msg.evt?.body?.uci && ActiveCalls.findByUCI(msg.evt.body.uci));
  if (call) {
    if (msg.node && msg.node === call.webNode.getNodeId()) {
      let status: CallRingingStatus = CallRingingStatus.RingingFail;

      if (msg.evt?.body?.status === 'ok') {
        status = CallRingingStatus.RingingOK;
        if (!call.callHeader.localChannel && msg.evt?.body?.call && msg.evt?.body?.call.includes(lineDev.device)) {
          call.callHeader.localChannel = msg.evt.body.call;
        }
      } else if (msg.evt?.body?.status === 'progress') {
        status = CallRingingStatus.RingingProgress;
      } else {
        status = CallRingingStatus.RingingFail;
      }

      call.dispatchEvent(
        new CallRinging({
          node: msg.node ? msg.node : 0,
          cssid: msg.evt?.body?.cssid,
          uci: msg.evt?.body?.uci,
          status,
        })
      );

      if (status === CallRingingStatus.RingingProgress) {
        lineDev.report(new CallRingingProgress(call));
      }
    } else {
      diag.warn(
        'callRinging',
        `%s.%s, callRinging is from node <${
          msg.node
        }> and the call is on node <${call.webNode.getNodeId()}>. Not for me`
      );
    }
  }
}

function confAnswered(lineDev: WebLineDev, msg: VccMsg) {
  const callee = msg.evt?.body?.call;

  if (callee) {
    const call = ActiveCalls.findByRemoteChannel(callee.toString());

    if (call && call.state === CallState.Proceeding) {
      diag.trace?.('confAnswered', `Conference invite to remote call <${callee}> was answered`);
      call.setCallState(CallState.Connected);
    }
  }
}

function confCongestion(lineDev: WebLineDev, msg: VccMsg) {
  const callee = msg.evt?.body?.call;

  if (callee) {
    const call = ActiveCalls.findByRemoteChannel(callee.toString());

    if (call && call.state === CallState.Proceeding) {
      diag.trace?.('confCongestion', `Conference invite to remote call <${callee}> is congested`);
      call.congestionState =
        msg.evt?.body?.congestionMode === 'DialCongestionWithRAN'
          ? CongestionState.CongestedServerTone
          : CongestionState.CongestedClientTone;
      call.setCallState(CallState.Connected);
    }
  }
}

function confRingbackRestart(lineDev: WebLineDev, msg: VccMsg) {
  const cssid = msg.evt?.body?.cssid;

  if (cssid) {
    const call = ActiveCalls.get().find((c) => c.cssId === cssid && c.state === CallState.Proceeding);

    if (call) {
      diag.trace?.('confRingbackRestart', `Conference invite to call <${call.webCallId}> ringback restart`);
      call.ringbackOnProceeding.needed = true;
      call.updateProgressTone(CallState.Proceeding);
    }
  }
}

function confRingbackStop(lineDev: WebLineDev, msg: VccMsg) {
  const cssid = msg.evt?.body?.cssid;

  if (cssid) {
    const call = ActiveCalls.get().find((c) => c.cssId === cssid && c.state === CallState.Proceeding);

    if (call) {
      diag.trace?.('confRingbackStop', `Conference invite to call <${call.webCallId}> ringback stop`);
      call.ringbackOnProceeding.needed = false;
      call.updateProgressTone(CallState.Proceeding);
    }
  }
}

function lpChannelPrefix(lineDev: WebLineDev, msg: VccMsg) {
  // This VCC event is to update missing call info for outgoing LinePool dials.
  // However, this event can also arrive for outgoing LinePool dials for Conferencing,
  // in which case it is unnecessary and should be ignored.
  // We need to find a matching call that also needs to have its call info updated.
  let call: WebCall | undefined;

  if (msg.evt?.body?.cssid) {
    call = ActiveCalls.get().find(
      (c) => c.cssId === msg.evt?.body?.cssid && !c.callHeader.remoteChannel && !c.callHeader.localChannel
    );
  }
  if (!call && msg.evt?.body?.uci) {
    call = ActiveCalls.get().find(
      (c) => c.callHeader.uCI === msg.evt?.body?.uci && !c.callHeader.remoteChannel && !c.callHeader.localChannel
    );
  }

  if (call) {
    if (msg.node && msg.node === call.webNode.getNodeId()) {
      call.callHeader.uCI = msg.evt?.body?.uci || '';
      call.infoRec.uniqueCallId = call.callHeader.uCI;
      call.infoRec.trunkAddress = msg.evt?.body?.trunkAddress || '';
      call.callHeader.localChannel = msg.evt?.body?.localCall || '';
      call.callHeader.remoteChannel = msg.evt?.body?.trunkCall || '';
      diag.trace?.(
        'lpChannelPrefix',
        `Updated call info for call <${call.webCallId}>. lc=${call.callHeader.localChannel}, rc=${call.callHeader.remoteChannel}`
      );
    } else {
      diag.trace?.(
        'lpChannelPrefix',
        `The event is from node <${msg.node}> and the call is on node <${call.webNode.getNodeId()}>, Not for me`
      );
    }
  } else {
    diag.trace?.(
      'lpChannelPrefix',
      `The event is from node <${msg.node}> and failed to match outbound LP call by cssid <${msg.evt?.body?.cssid}> or uci <${msg.evt?.body?.uci}>`
    );
  }
}

function nenaStatusQueueStateChange(lineDev: WebLineDev, msg: VccMsg) {
  const queueIdentifier = msg.evt?.body?.queueIdentifier;
  const newState = msg.evt?.body?.newState;

  if (queueIdentifier && newState) {
    lineDev.nenaQueueStateManager.updateCache(
      nenaQueueStateFullFromVcc({
        queueIdentifier,
        queueState: newState.queueState,
        override: newState.override,
        overrideReason: newState.overrideReason,
        baseQueueState: newState.baseQueueState,
      })
    );
  }
}

function nenaStatusServiceStateChange(lineDev: WebLineDev, msg: VccMsg) {
  const serviceIdentifier = msg.evt?.body?.serviceIdentifier;
  const newState = msg.evt?.body?.newState;

  if (serviceIdentifier && newState) {
    lineDev.nenaServiceStateManager.updateCache(
      nenaServiceStateFullFromVcc({
        serviceIdentifier,
        serviceState: newState.serviceState,
        override: newState.override,
        overrideReason: newState.overrideReason,
        baseServiceState: newState.baseServiceState,
      })
    );
  }
}

async function msrpTextOwnershipChange(lineDev: WebLineDev, msg: VccMsg) {
  const idx = msrpTextOwnershipChange.cnt++;
  const uci = msg.evt?.body.uci;
  const nodeId = msg.node;

  let call: WebCall | undefined;
  if (uci) {
    call = ActiveCalls.findByUCI(uci);
    if (!call) call = ActiveCalls.findByCallUCI(uci);
  }

  if (call) {
    call.callType = CallType.Text;
    const newOwner = msg.evt?.body?.owner;
    diag.out(
      'msrpTextOwnershipChange',
      `Report ReqIdx#${idx} Call Id<${call.webCallId}>/uci<${uci}> new TextOwnership:${newOwner} from nodeId:${nodeId}`
    );
    lineDev.report(new TextOwnerChange(call, newOwner));
  } else {
    diag.warn('msrpTextOwnershipChange', `[${idx}] Failed finding an active call ${uci}`);
  }
}

msrpTextOwnershipChange.cnt = 0;

async function callReferNotifySipfrag(lineDev: WebLineDev, msg: VccMsg) {
  const uci = msg.evt?.body.uci;
  const chanName = msg.evt?.body.channelName;
  const referResp = msg.evt?.body.referResp;
  const sipfrag = msg.evt?.body.sipfrag;
  const nodeId = msg.node;

  const call = uci && ActiveCalls.findByUCI(uci);
  if (call) {
    const newOwner = msg.evt?.body?.owner;
    diag.out(
      'callReferNotifySipfrag',
      `Report Call Id<${call.webCallId}> uci<${uci}>/chanName<${chanName}> with referResp<${referResp}> and sipfrag<${sipfrag}> from nodeId:${nodeId}`
    );
    lineDev.report(new CallReferNotifySipfragEvent(call, uci, chanName, referResp, sipfrag));
  } else {
    diag.warn('callReferNotifySipfrag', `Failed finding an active call ${uci}`);
  }
}

async function configUpdate(lineDev: WebLineDev, msg: VccMsg) {
  // We only read the following 'configUpdate' event members for now because, there is no actual usage yet.
  const nodeId = msg.node;
  let node = lineDev.webNodes.find((n) => n.getNodeId() === nodeId);
  if (!node) return;

  const viperVersion = msg.evt?.body.viperVersion;
  const t2tBlockBargeIn = msg.evt?.body.t2tBlockBargeIn;
  const qList = msg.evt?.body.qList;
  const rgList = msg.evt?.body.rgList;

  // PWeb-1280: Implement block unsupervised transfer feature
  const curLdUnsupervisedTxfrBlockedDNs = node.unsupervisedTxfrBlockedDNs;
  const vccBlockUnsupervisedTxfrList = msg.evt?.body.blockUnsupervisedTxfrList;
  if (vccBlockUnsupervisedTxfrList)
    node.unsupervisedTxfrBlockedDNs = (vccBlockUnsupervisedTxfrList as string).split('&');
  else node.unsupervisedTxfrBlockedDNs = [];
  diag.out(
    'configUpdate',
    `Updated node<${nodeId}> unsupervisedTxfrBlockedDNs from [${curLdUnsupervisedTxfrBlockedDNs}] --> [${node.unsupervisedTxfrBlockedDNs}]`
  );

  // PWEB-1139: Support "Allow Hold State on Shared Call" configuration parameter
  const curMMHoldKeepAlive = node.mmHoldKeepAlive;
  if (msg.evt?.body.mmHoldKeepAlive === '1') {
    node.mmHoldKeepAlive = true;
  } else {
    node.mmHoldKeepAlive = false;
  }
  diag.out(
    'configUpdate',
    `Updated node<${nodeId}> mmHoldKeepAlive from   [${curMMHoldKeepAlive}] --> [${node.mmHoldKeepAlive}]`
  );
}

async function nodeStateChange(lineDev: WebLineDev, msg: VccMsg) {
  diag.out('nodeStateChange', `Received nodeStateChange: ${JSON.stringify(msg.evt?.body)}`);
  const nodeId = msg.node;
  const state = msg.evt?.body as ViperNodeState;
  if (Object.values(ViperNodeState).indexOf(state) >= 0) {
    let node = lineDev.webNodes.find((n) => n.getNodeId() === nodeId);
    if (!node) return;
    if (state !== node.nodeState) {
      let old = node.nodeState;
      node.nodeState = state;
      diag.out('nodeStateChange', `nodeStateChange: new state ${state} on node <${nodeId}> with last state ${old}`);
      lineDev.report(new ViperNodeStateChange(state, old, node.getNodeId()));
      if (node.isNodeUp()) {
        node.getInitialStates();
        try {
          // Use node state change to get initical call state
          // We will re-factory this when something equavalent to "LINKSTATUS" introduced
          await node.getInitialCallState();
        } catch (e) {
          diag.warn(
            'nodeStateChange',
            `nodeStateChange: new state ${state} on node <${nodeId}> with warning ${JSON.stringify(e)}`
          );
        }
      } else if (node.isNodeDown()) {
        try {
          await ActiveCalls.get().reduce(
            (p, c) =>
              p.then(async () => {
                if (nodeId === c.webNode.getNodeId()) {
                  if (c.sipId) await c.getWebPhone().hangupCall(c.sipId, nodeId);
                  c.finishCall(true);
                }
              }),
            Promise.resolve()
          );
        } catch (e) {
          diag.warn(
            'nodeStateChange',
            `nodeStateChange: new state ${state} on node <${nodeId}>. Terminate active calls: ${JSON.stringify(e)}`
          );
        }
      } else {
        diag.warn('nodeStateChange', `nodeStateChange: new state ${state} on node <${nodeId}> is not expected}`);
      }
    }
    node.nodeState = state;
  }
}

async function nodeStates(lineDev: WebLineDev, msg: VccMsg) {
  diag.out('nodeStates', `Received nodeStates: ${JSON.stringify(msg.evt?.body)}`);
  const status = msg.evt?.body as Array<ViperNodeStatus>;
  lineDev.report(new ViperNodesStates(status));
  for (let nodeStatus of status) {
    let node = lineDev.webNodes.find((n) => n.getNodeId() === nodeStatus.nodeId);
    if (!node) {
      diag.warn('nodeStates', `Can not find webNode by id ${nodeStatus.nodeId}`);
      continue;
    }
    node.nodeState = nodeStatus.nodeState;
  }
  try {
    const results = await Promise.allSettled(
      lineDev.webNodes.map((node) => {
        if (node.isNodeUp()) {
          return node.getInitialStates();
        } else return Promise.resolve();
      })
    );

    if (lineDev.preferredAcdLoginState.loginStatus === AcdLoginStatus.LoginUnknown) {
      const acdLoginState = consolidateAcdLoginState(lineDev.webNodes.map((node) => node.acdLoginState));
      lineDev.setAcdLoginState(acdLoginState);
    }
    if (lineDev.preferredRgLoginState.loginStatus === RgLoginStatus.LoginUnknown) {
      const rgLoginState = consolidateRgLoginState(lineDev.webNodes.map((node) => node.rgLoginState));

      lineDev.setRgLoginState(rgLoginState);
    }

    // Use nodeStates to get initial call state at start up situation.
    // Impact by VccGW reboot will be addressed later.
    await Promise.allSettled(
      lineDev.webNodes.map((node) => {
        if (node.isNodeUp()) {
          return node.getInitialCallState();
        } else return Promise.resolve();
      })
    );
  } catch (e) {
    diag.warn('nodeStates', `${JSON.stringify(e)}`);
  }
}

async function confInfo(lineDev: WebLineDev, msg: VccMsg) {
  const node = msg.node && lineDev.getWebNodeById(msg.node);
  if (!node) {
    diag.warn('confInfoEvent', `Can't find node from node id <${msg.node}> in VccMsg`);
    return;
  }

  const participantsXml: string = msg.evt?.body?.participants;
  if (!participantsXml) {
    diag.warn('confInfoEvent', `participant list empty ignore update`);
    return;
  }

  const param: ConfInfoParam = msg.evt?.body;

  diag.trace?.(
    'confInfo',
    `Received Conference event on <${param.chan}, ${param.uci}, ${param.confDN}, ${param.confId}, ${param.confOwner}, seq=${param.seqNum}}>`
  );

  if (!ConfInfo.seqNumValidation(node, param.seqNum)) {
    diag.warn(
      'confInfo',
      `ConfInfo user event with seqNum (${param.seqNum}) ignored, since last Processed SeqNum is (${ConfInfo.getSeq(
        node
      )})`
    );
    return;
  }

  // locate calls by uci
  const calls = ActiveCalls.getCallsByUCI(param.uci);
  let call: WebCall | undefined;
  if (calls.length) {
    call = calls.find((c) => c.state !== CallState.Busy && c.state !== CallState.Finished && c.sipId);
  }

  // create confInfo obj base on the event that is just received.
  try {
    const confInfo = ConfInfo.constructConfInfo(node, participantsXml, param);
    ConfInfo.updateConfInfos(node, confInfo);
    await ConfInfo.process(node, param.confDN, call);
  } catch (e) {
    diag.out('confInfo', `Caught ${JSON.stringify(e)}`);
  }
}

async function agentMembershipModify(lineDev: WebLineDev, msg: VccMsg) {
  const node = msg.node && lineDev.getWebNodeById(msg.node);
  if (!node) return;

  const data = msg.evt?.body as AgentMembershipUpdate;

  if (data) processAgentMembershipModifyByNode(lineDev, node, data);
  else diag.warn('agentMembershipModify', `Unexpected format data: ${JSON.stringify(msg.evt?.body)}`);
}

const vccEventHandlers = new Map([
  ['/abandonedCall/ASA', abandonedCallASA],
  ['/abandonedCall/BSA', abandonedCallBSA],
  ['/acdStatus', acdStatus],
  ['/callLink', callLink],
  ['/callReplace', callReplace],
  ['/callRinging', callRinging],
  ['/confAnswered', confAnswered],
  ['/confCongestion', confCongestion],
  ['/confRingbackRestart', confRingbackRestart],
  ['/confRingbackStop', confRingbackStop],
  ['/lpChannelPrefix', lpChannelPrefix],
  ['/nenaStatusQueueStateChange', nenaStatusQueueStateChange],
  ['/nenaStatusServiceStateChange', nenaStatusServiceStateChange],
  ['/sharedLine/connect', sharedlineConnect],
  ['/sharedLine/disconnect', sharedlineDisconnect],
  ['/sharedLine/forcedHold', sharedlineForcedHold],
  ['/sharedLine/hold', sharedlineHold],
  ['/sharedLine/release', sharedlineRelease],
  ['/vpark/abandoned', parkAbandoned],
  ['/vpark/park', parkPark],
  ['/vpark/timeout', parkTimeout],
  ['/vpark/unpark', parkUnpark],
  ['/msrpTextOwnershipChange', msrpTextOwnershipChange],
  ['/nodeStateChange', nodeStateChange],
  ['/nodeStates', nodeStates],
  ['/confInfo', confInfo],
  ['/callReferNotifySipfrag', callReferNotifySipfrag],
  ['/configUpdate', configUpdate],
  ['/agentMembershipModify', agentMembershipModify],
]);

export function vccEventHandler(lineDev: WebLineDev, msg: VccMsg) {
  diag.trace?.('vccEventHandler', `received Vcc Evt: ${JSON.stringify(msg)}`);

  if (msg.evt?.path) {
    vccEventHandlers.get(msg.evt.path)?.(lineDev, msg);
  }
}

export { vccEventHandler as default };
