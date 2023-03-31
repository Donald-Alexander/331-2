import * as ExtInterface from '../telephonyexternalinterfacedef';
import { SubscriberOptions } from 'sip-js/lib/api/subscriber-options';
import { WebNode } from './webnode';
import { WebPhone } from '../webphone/interfaces/webphone';
import { ISubsEventMsg } from '../webphone/interfaces/sip-subscribeNotify';
import { jitter } from '../webphone/sip/lib/utils';
import { Diag } from '../common/diagClient';
import { getNodeId } from '../config/nodeId';
import { WebCall } from '../webcall/webcall';

const moduleName = 'weblinedev.listenjoin';
const diag = new Diag(moduleName);
const SIP_PRESENCE_EXPIRE = 7200; //2h

export enum ListenJoinMonitoringMode {
  Off = 0,
  Listen = 1,
  Join = 2,
  Whisper = 3,
}

export enum ListenJoinResponses {
  Undefined = 0,
  Success,
  Success_LimitedNodes,
  Error_CallOperationAlreadyInProgress,
  Error_ExistingCallInState,
  Error_ForceConnectOperationHasBeenInitiated,
  Error_ExpectingPosDNOrAgentID,
  Error_PositionIsBeingMonitoredByAnotherPosition,
  Error_AllNodesFailed,
  Error_Unknown,
}
// IMPORTANT: The following array MUST be in sych with the ENUM just above.
export const arrListenJoinResponses = [
  { index: ListenJoinResponses.Undefined, text: 'Undefined' },
  { index: ListenJoinResponses.Success, text: 'Success' },
  { index: ListenJoinResponses.Success_LimitedNodes, text: 'Success - Limited Nodes' },
  {
    index: ListenJoinResponses.Error_CallOperationAlreadyInProgress,
    text: 'Unable to start or modify listenJoin. Call operation already in progress',
  },
  {
    index: ListenJoinResponses.Error_ExistingCallInState,
    text: 'Unable to start or modify listenJoin. Existing calls in state that prevents operations',
  },
  {
    index: ListenJoinResponses.Error_ForceConnectOperationHasBeenInitiated,
    text: 'A Force connect operation has been initiated on a call',
  },
  { index: ListenJoinResponses.Error_ExpectingPosDNOrAgentID, text: 'Error - Expecting position DN or AgentID' },
  {
    index: ListenJoinResponses.Error_PositionIsBeingMonitoredByAnotherPosition,
    text: 'Error - This position is being monitored by another position',
  },
  { index: ListenJoinResponses.Error_AllNodesFailed, text: 'Error - All nodes failed' },
  { index: ListenJoinResponses.Error_Unknown, text: 'Unknown' },
];

export enum ClientKeepAliveState {
  UP = 0,
  DOWN,
}
// IMPORTANT: The following array MUST be in sych with the ENUM just above.
export const arrClientKeepAliveState = [
  { index: ClientKeepAliveState.UP, text: 'UP' },
  { index: ClientKeepAliveState.DOWN, text: 'DOWN' },
];

enum LJSubsState {
  UnsubscribeInProgress = 0,
  Unsubscribed,
  Subscribed,
}
// IMPORTANT: The following array MUST be in sych with the ENUM just above.
const arrNodeStatus = [
  { index: LJSubsState.Unsubscribed, text: 'Unsubscribed' },
  { index: LJSubsState.Subscribed, text: 'Subscribed' },
];

enum ListenJoinSubscribeResponses {
  Undefined = 0,
  SkipNodeIsDown,
  Res200OK,
  FailedToSend,
  TimedOut,
  Err406_ExpPosOrAgentId,
  Err406_FailedGettingPosDNFromAgentID,
  Err409_PosMonitoredByAnotherPos,
  Unknown,
}
// IMPORTANT: The following array MUST be in sych with the ENUM just above.
const arrListenJoinSubscribeResponses = [
  { index: ListenJoinSubscribeResponses.Undefined, text: 'Undefined' },
  { index: ListenJoinSubscribeResponses.SkipNodeIsDown, text: 'Skip subscription.  Node is down !' },
  { index: ListenJoinSubscribeResponses.Res200OK, text: '200 OK' },
  { index: ListenJoinSubscribeResponses.FailedToSend, text: 'Subscription failed to sent' },
  { index: ListenJoinSubscribeResponses.TimedOut, text: 'Subscription Timed Out' },
  {
    index: ListenJoinSubscribeResponses.Err406_ExpPosOrAgentId,
    text: '406 Not Acceptable - Expecting position DN or AgentID',
  },
  {
    index: ListenJoinSubscribeResponses.Err406_FailedGettingPosDNFromAgentID,
    text: '406 Not Acceptable - Failed getting position DN from the AgentId',
  },
  {
    index: ListenJoinSubscribeResponses.Err409_PosMonitoredByAnotherPos,
    text: '409 Conflict - This position is being monitored by another position',
  },
  { index: ListenJoinSubscribeResponses.Unknown, text: 'Unknown' },
];

function getEnumResponse(errorMsg: string | undefined): ListenJoinSubscribeResponses {
  if (!errorMsg) return ListenJoinSubscribeResponses.Undefined;

  const found = arrListenJoinSubscribeResponses.find((element) => element.text.indexOf(errorMsg) >= 0);

  if (found) return found.index;
  else return ListenJoinSubscribeResponses.Unknown;
}

export class ListenJoinChange extends Event {
  mode: ListenJoinMonitoringMode;
  posOrAgent: string;
  constructor(mode: ListenJoinMonitoringMode, posOrAgent: string) {
    super('ListenJoinChange');
    this.mode = mode;
    this.posOrAgent = posOrAgent;
  }
}

export function ljModeString(mode: ListenJoinMonitoringMode): string {
  switch (mode) {
    case ListenJoinMonitoringMode.Off:
      return 'Off';
    case ListenJoinMonitoringMode.Listen:
      return 'Listen';
    case ListenJoinMonitoringMode.Join:
      return 'Join';
    case ListenJoinMonitoringMode.Whisper:
      return 'Whisper';
    default:
      return 'Off';
  }
}

export class ListenJoin {
  lineDev: {
    webPhone: WebPhone;
    webNodes: Array<WebNode>;
    report: (event: Event) => void;
    incrementConnectCount: (call: WebCall | undefined) => void;
    decrementConnectCount: (call: WebCall | undefined) => void;
  };
  mode: ListenJoinMonitoringMode = ListenJoinMonitoringMode.Off;
  monPosOrAgent: string = '';
  monPosSipCallId: string = ''; // This is the WebPos INVITE SIP Call-ID towards the node in order to make a chanSpy request
  monPosCallNodeId: number = 0;
  nodesSubsState: Map<number, LJSubsState>;
  clientNodesKeepAliveState: Map<number, ClientKeepAliveState>;

  constructor(lineDev: {
    webPhone: WebPhone;
    webNodes: Array<WebNode>;
    report: (event: Event) => void;
    incrementConnectCount: (call: WebCall | undefined) => void;
    decrementConnectCount: (call: WebCall | undefined) => void;
  }) {
    this.lineDev = lineDev;
    this.nodesSubsState = new Map();
    this.clientNodesKeepAliveState = new Map();

    // binding
    this.processNodeStateChange = this.processNodeStateChange.bind(this);
    this.processClientKeepAliveStateUpd = this.processClientKeepAliveStateUpd.bind(this);
    this.processSubsTerminatedMessageHandler = this.processSubsTerminatedMessageHandler.bind(this);
  }

  async monitor(mode: ListenJoinMonitoringMode, posOrAgent: string) {
    return new Promise<ListenJoinResponses>(async (resolve, reject) => {
      const currPosOrAgent = this.monPosOrAgent;

      // This is a position or AgentID changes
      if (posOrAgent !== currPosOrAgent && this.mode !== ListenJoinMonitoringMode.Off) {
        const strCurrMode = ljModeString(this.mode);
        const strInputMode = ljModeString(mode);
        if (strCurrMode !== strInputMode)
          diag.out(
            'monitor',
            `L&J new mode from <${strCurrMode}> --> <${strInputMode}> AND, new position or AgentID from <${currPosOrAgent}> --> <${posOrAgent}>`
          );
        else
          diag.out(
            'monitor',
            `L&J current <${strCurrMode}> mode is switching from position or AgentID <${currPosOrAgent}> --> <${posOrAgent}>`
          );

        await this.cancel(true);

        this.subscribeAllNodes(mode, posOrAgent)
          .then(async (successId: ListenJoinResponses) => {
            const strMsg = arrListenJoinResponses[successId].text;
            diag.out('monitor', strMsg);
            return resolve(successId);
          })
          .catch(async (errorId: ListenJoinResponses) => {
            const strMsg = arrListenJoinResponses[errorId].text;
            diag.err('monitor', strMsg);
            return reject(errorId);
          });
      }
      // This is a mode change with the same position or AgentID to monitor
      else if (posOrAgent === currPosOrAgent && mode !== this.mode && this.mode !== ListenJoinMonitoringMode.Off) {
        this.switchMode(mode, posOrAgent)
          .then(async (msg: string) => {
            diag.out('monitor', msg);
            return resolve(ListenJoinResponses.Success);
          })
          .catch(async (error: string) => {
            diag.warn('monitor', error);
            return reject(ListenJoinResponses.Error_Unknown);
          });
      } else {
        this.subscribeAllNodes(mode, posOrAgent)
          .then(async (successId: ListenJoinResponses) => {
            const strMsg = arrListenJoinResponses[successId].text;
            diag.out('monitor', strMsg);
            return resolve(successId);
          })
          .catch(async (errorId: ListenJoinResponses) => {
            const strMsg = arrListenJoinResponses[errorId].text;
            diag.err('monitor', strMsg);
            return reject(errorId);
          });
      }
    });
  }

  connect(node: WebNode, agentCall: string) {
    const dialingExten = this.mode === ListenJoinMonitoringMode.Listen ? '**9100' : '**9000';

    diag.out(
      'connect',
      `L&J make call in <${ljModeString(this.mode)}> mode --> ${node.nodeCfgEx.proxyAddress}/channel(${agentCall})`
    );

    this.lineDev.incrementConnectCount(undefined);

    this.lineDev.webPhone.makeCall(
      -1,
      `sip:${dialingExten}@${node.nodeCfgEx.proxyAddress}:5060`,
      node.getNodeId(),
      [`x-ListenJoin: yes`, `x-channel: ${agentCall}`],
      '',
      true
    );
  }

  async disconnect(nodeId: number = this.monPosCallNodeId) {
    const callNodeId = this.monPosCallNodeId;
    if (callNodeId !== nodeId) return;

    const sipCallID = this.monPosSipCallId;
    if (sipCallID && callNodeId) {
      diag.trace?.(
        `disconnect`,
        `Hanging up active L&J <${ljModeString(
          this.mode
        )}> call towards nodeId(${callNodeId}) with SIP Call-ID=${sipCallID}`
      );
      await this.lineDev.webPhone.hangupCall(sipCallID, callNodeId).catch(() => {
        diag.warn('disconnect', 'failed to hangup L&J active call');
      });
    }
    this.monPosCallNodeId = 0;
    this.monPosSipCallId = '';
  }

  async cancel(silent: Boolean = false) {
    if (this.mode === ListenJoinMonitoringMode.Off) return;

    diag.out('cancel', `CANCEL L&J with monitored Position or AgentID ${this.monPosOrAgent}`);

    return new Promise<void>(async (resolve, reject) => {
      // If exist, terminate current L&J call
      this.disconnect();

      await this.unsubscribeAllNodes()
        .then(async () => {
          diag.out('cancel', 'Successfull L&J Cancel');
          return resolve();
        })
        .catch(async () => {
          diag.out('cancel', 'Failed L&J Cancel');
          return reject();
        })
        .finally(async () => {
          // Reset L&J.  if silent is set, Do not RESET current state and, do not report status event to the GUI.
          if (!silent) this.reset();
        });
    });
  }

  private reset() {
    this.mode = ListenJoinMonitoringMode.Off;
    this.monPosOrAgent = '';

    const evt = new ListenJoinChange(this.mode, this.monPosOrAgent);
    this.lineDev.report(evt);
  }

  private async switchMode(mode: ListenJoinMonitoringMode, position: string): Promise<string> {
    /* N.B.: We can assume here the mode is different because, it is already managed by the listenJoin() function */
    const strPrevMode = ljModeString(this.mode);
    const strNewMode = ljModeString(mode);

    // Position to monitor must be the same
    if (this.monPosOrAgent !== position) {
      diag.warn(
        'switchMode',
        // eslint-disable-next-line max-len
        `L&J failed switching mode.  Wrong position !  Position MUST be the same as per initially started such as ${position}.  You need to terminate the active L&J before changing the position to monitor.`
      );
      throw new Error(
        // eslint-disable-next-line max-len
        `L&J failed switching mode.  Wrong position !  Position MUST be the same as per initially started such as ${position}.  You need to terminate the active L&J before changing the position to monitor.`
      );
    }

    diag.out(
      'switchMode',
      `L&J is switching from <${strPrevMode}> --> <${strNewMode}> mode on monitoring position ${position}`
    );

    // There is no need to send a SIP INFO if no active call is being monitored.
    if (this.monPosCallNodeId === 0) {
      diag.trace?.(
        'switchMode',
        `L&J No need to send a SIP INFO to switch mode because, no active call is being monitored on the ${position}.`
      );
      this.reportUpdate(mode);
      return `L&J No need to send a SIP INFO to switch mode because, no active call is being monitored on the ${position}.`;
    }

    const dtmfDigit = mode === ListenJoinMonitoringMode.Listen ? '4' : '6';
    const requestOptions = {
      body: {
        contentDisposition: 'render',
        contentType: 'application/dtmf-relay',
        content: `Signal=${dtmfDigit}\r\nDuration=1000`,
      },
    };

    try {
      await this.lineDev.webPhone.sendInfo(this.monPosSipCallId, requestOptions, this.monPosCallNodeId);
      this.reportUpdate(mode);
      diag.trace?.('switchMode', `Successfull switched from from <${strPrevMode}> --> <${strNewMode}> mode`);
      return `Successfull switched from from <${strPrevMode}> --> <${strNewMode}> mode`;
    } catch (e) {
      diag.warn('switchMode', `Failed switching mode from <${strPrevMode}> --> <${strNewMode}> with error': ${e}`);
      throw new Error(`L&J Failed switching mode from <${strPrevMode}> --> <${strNewMode}> with error': ${e}`);
    }
  }

  private async subscribeAllNodes(mode: ListenJoinMonitoringMode, posOrAgent: string) {
    this.nodesSubsState.clear();
    const nodeResponses = new Map<number, ListenJoinSubscribeResponses>();
    nodeResponses.clear();

    const strMode = ljModeString(mode);
    diag.out('subscribeAllNodes', `Initiating L&J in <${strMode}> mode for position/agent ${posOrAgent}`);

    return new Promise<ListenJoinResponses>(async (resolve, reject) => {
      for (const node of this.lineDev.webNodes) {
        const uri = 'sip:' + node.nodeCfgEx.proxyAddress + ':5060';
        const nodeId = node.getNodeId();

        // Make sure the VCC node is UP
        if (!node.isNodeUp()) {
          const VoipCluster = node.getVoipClusterName();
          diag.warn('subscribeAllNodes', `[Node ${nodeId}]/${VoipCluster} DOWN.  Skip L&J subscribe !`);
          nodeResponses.set(nodeId, ListenJoinSubscribeResponses.SkipNodeIsDown);
          this.nodesSubsState.set(nodeId, LJSubsState.Unsubscribed);
          continue;
        }

        // Make sure the node client keep alive is UP
        const nodeKeepAliveState = this.clientNodesKeepAliveState.get(nodeId);
        if (nodeKeepAliveState === ClientKeepAliveState.DOWN) {
          const VoipCluster = node.getVoipClusterName();
          diag.warn('subscribeAllNodes', `[Node ${nodeId}]/${VoipCluster} keep alive DOWN.  Skip L&J subscribe !`);
          nodeResponses.set(nodeId, ListenJoinSubscribeResponses.SkipNodeIsDown);
          this.nodesSubsState.set(nodeId, LJSubsState.Unsubscribed);
          continue;
        }

        await this.subscribe(nodeId, uri, posOrAgent)
          .then(async (msgId: ListenJoinSubscribeResponses) => {
            diag.out('subscribeAllNodes', `[Node ${nodeId}] Success ${arrListenJoinSubscribeResponses[msgId].text}`);
            nodeResponses.set(nodeId, msgId);
          })
          .catch(async (msgId: ListenJoinSubscribeResponses) => {
            diag.err(
              'subscribeAllNodes',
              `[Node ${nodeId}] Failed Error = ${arrListenJoinSubscribeResponses[msgId].text}`
            );
            nodeResponses.set(nodeId, msgId);
          });
      }

      // Display node subscribe responses
      diag.out('subscribeAllNodes', 'We have got all node reponses:\n');
      for (const [nodeId, msgId] of nodeResponses)
        diag.out('subscribeAllNodes', `[Node ${nodeId}] response = ${arrListenJoinSubscribeResponses[msgId].text}`);

      // Manage global response
      let globalResponse = this.processNodeResponses(nodeResponses);
      if (
        globalResponse === ListenJoinResponses.Success ||
        globalResponse === ListenJoinResponses.Success_LimitedNodes
      ) {
        this.reportUpdate(mode, posOrAgent);
        return resolve(globalResponse);
      }

      return reject(globalResponse);
    });
  }

  private async subscribe(nodeId: number, uri: string, posOrAgent: string = this.monPosOrAgent) {
    let subsAcceptedMessageHandler: any;
    let subsFailureMessageHandler: any;

    const options: SubscriberOptions = {
      // Introducing a jitter here, to avoid thundering herds.
      expires: SIP_PRESENCE_EXPIRE + jitter(SIP_PRESENCE_EXPIRE, 5),
      extraHeaders: [`x-ListenJoinMon: ${posOrAgent}`],
    };

    return new Promise<ListenJoinSubscribeResponses>(async (resolve, reject) => {
      const promiseSubsAcceptedMessage = new Promise<ListenJoinSubscribeResponses>((resolve, reject) => {
        subsAcceptedMessageHandler = (event: any) => {
          const successResponse: ISubsEventMsg = event.detail;
          return resolve(ListenJoinSubscribeResponses.Res200OK);
        };
        diag.trace?.('promiseSubsAcceptedMessage', `[Node ${nodeId}] Adding 'accepted' subscribe event listener`);
        this.lineDev.webPhone.addEventListener('subsAcceptedMsg', subsAcceptedMessageHandler as EventListener);
      });

      const promiseSubsFailureMessage = new Promise<ListenJoinSubscribeResponses>((resolve, reject) => {
        subsFailureMessageHandler = (event: any) => {
          const errorMsg: ISubsEventMsg = event.detail;
          const eRes = getEnumResponse(errorMsg.errorReason);
          return reject(eRes);
        };
        diag.trace?.('promiseSubsFailureMessage', `[Node ${nodeId}] Adding 'failure' subscribe event listener`);
        this.lineDev.webPhone.addEventListener('subsFailureMsg', subsFailureMessageHandler as EventListener);
      });

      await this.lineDev.webPhone
        .subscribe(uri, 'x-viper-monitor', nodeId, options)
        .then(async () => {
          diag.out('subscribe', `[Node ${nodeId}] Sent subscribe with uri=${uri}`);
        })
        .catch(async (e) => {
          diag.warn('subscribe', `[Node ${nodeId}] Failed sending subscribe to uri=${uri} with error = ${e}`);
          return reject(ListenJoinSubscribeResponses.FailedToSend);
        });

      // The subscribe will be sent very soon.  Wait to see if an error is returned by the remote peer
      let promiseTimeout = new Promise<ListenJoinSubscribeResponses>((resolve, reject) => {
        let id = setTimeout(() => {
          clearTimeout(id);
          return reject(ListenJoinSubscribeResponses.TimedOut);
        }, 3000);
      });

      const promises = [promiseTimeout, promiseSubsAcceptedMessage, promiseSubsFailureMessage];
      await Promise.race(promises)
        .then((msgId: ListenJoinSubscribeResponses) => {
          diag.trace?.('subscribe', `[Node ${nodeId}] Success/${arrListenJoinSubscribeResponses[msgId].text}`);
          this.nodesSubsState.set(nodeId, LJSubsState.Subscribed);
          return resolve(msgId);
        })
        .catch((msgId: ListenJoinSubscribeResponses) => {
          diag.err?.('subscribe', `[Node ${nodeId}] Failed/${arrListenJoinSubscribeResponses[msgId].text}`);
          this.nodesSubsState.set(nodeId, LJSubsState.Unsubscribed);
          return reject(msgId);
        })
        .finally(() => {
          diag.trace?.('subscribe', `[Node ${nodeId}] Removing all subscribe event listeners`);
          this.lineDev.webPhone.removeEventListener('subsAcceptedMsg', subsAcceptedMessageHandler as EventListener);
          this.lineDev.webPhone.removeEventListener('subsFailureMsg', subsFailureMessageHandler as EventListener);
        });

      diag.trace?.('subscribe', `[Node ${nodeId}] subscribe done !`);

      return reject(ListenJoinSubscribeResponses.Undefined);
    });
  }

  // This is mainly used by Listen and Join feature
  // eslint-disable-next-line class-methods-use-this
  private async unsubscribeAllNodes() {
    diag.out('unsubscribeAllNodes', `Unsubscribe L&J with monitored position or AgentID ${this.monPosOrAgent}`);

    return new Promise<void>(async (resolve, reject) => {
      let failure: boolean = false;
      for (const node of this.lineDev.webNodes) {
        const uri = 'sip:' + node.nodeCfgEx.proxyAddress + ':5060';
        const nodeId = node.getNodeId();

        // Make sure the VCC node is UP
        if (!node.isNodeUp()) {
          const VoipCluster = node.getVoipClusterName();
          diag.warn('unsubscribeAllNodes', `[Node ${nodeId}]/${VoipCluster} DOWN.  Skip L&J Unsubscribe !`);
          continue;
        }

        await this.unsubscribe(nodeId, uri)
          .then(async (msg: string) => {
            diag.out('unsubscribeAllNodes', `[Node ${nodeId}] Success ${msg}`);
          })
          .catch(async (err: string) => {
            diag.warn('unsubscribeAllNodes', `[Node ${nodeId}] Failed with Error = ${err}`);
            failure = true;
          });
      }

      if (failure) return reject();
      else return resolve();
    });
  }

  private async unsubscribe(nodeId: number, uri: string) {
    let unsubsAcceptedMessageHandler: any;
    let unsubsFailureMessageHandler: any;

    const savedSubsState = this.nodesSubsState.get(nodeId);
    this.nodesSubsState.set(nodeId, LJSubsState.UnsubscribeInProgress);

    const options: SubscriberOptions = {
      extraHeaders: [`x-ListenJoinMon: ${this.monPosOrAgent}`],
    };

    return new Promise<string>(async (resolve, reject) => {
      await this.lineDev.webPhone
        .unsubscribe(uri, 'x-viper-monitor', nodeId, options)
        .then(async (msg: string) => {
          diag.trace?.('unsubscribe', `[Node ${nodeId}] Sent unsubscribe to uri=${uri}`);
          this.nodesSubsState.set(nodeId, LJSubsState.Unsubscribed);
          return resolve(msg);
        })
        .catch(async (e: string) => {
          diag.warn('unsubscribe', `[Node ${nodeId}] Failed sending unsubscribe to uri=${uri} with Error = ${e}`);
          if (savedSubsState != undefined) this.nodesSubsState.set(nodeId, savedSubsState);
          return reject(e);
        });

      diag.trace?.('unsubscribe', `[Node ${nodeId}] unsubscribe done !`);
    });
  }

  private reportUpdate(mode: ListenJoinMonitoringMode, posOrAgent: string = this.monPosOrAgent) {
    let sendUpdFlag = false;
    const curMode = this.mode;
    const curPosOrAgent = this.monPosOrAgent;
    if (mode !== curMode) {
      this.mode = mode;
      sendUpdFlag = true;
    }
    if (posOrAgent !== curPosOrAgent) {
      this.monPosOrAgent = posOrAgent;
      sendUpdFlag = true;
    }
    if (sendUpdFlag) {
      const evt = new ListenJoinChange(mode, posOrAgent);
      this.lineDev.report(evt);
    }
  }

  private processNodeResponses(nodeResponses: Map<number, ListenJoinSubscribeResponses>): ListenJoinResponses {
    let globalResponse = ListenJoinResponses.Undefined;
    let nodeRxResp200OK = 0;
    for (let [nodeId, msgId] of nodeResponses.entries()) {
      if (msgId === ListenJoinSubscribeResponses.Res200OK) {
        nodeRxResp200OK++;
        if (globalResponse !== ListenJoinResponses.Success_LimitedNodes) globalResponse = ListenJoinResponses.Success;
      } else if (
        msgId === ListenJoinSubscribeResponses.SkipNodeIsDown ||
        msgId === ListenJoinSubscribeResponses.FailedToSend ||
        msgId === ListenJoinSubscribeResponses.TimedOut ||
        msgId === ListenJoinSubscribeResponses.Err406_FailedGettingPosDNFromAgentID
      ) {
        globalResponse = ListenJoinResponses.Success_LimitedNodes;
      } else if (msgId === ListenJoinSubscribeResponses.Err406_ExpPosOrAgentId) {
        this.cancel();
        return ListenJoinResponses.Error_ExpectingPosDNOrAgentID;
      } else if (msgId === ListenJoinSubscribeResponses.Err409_PosMonitoredByAnotherPos) {
        this.cancel();
        return ListenJoinResponses.Error_PositionIsBeingMonitoredByAnotherPosition;
      } else {
        this.cancel();
        return ListenJoinResponses.Error_Unknown;
      }
    }

    // Validate partial success global response
    // Once all nodes has been processed, make sure there is at least 1 success node before reporting a partial success to the GUI
    if (globalResponse === ListenJoinResponses.Success_LimitedNodes && !nodeRxResp200OK) {
      return ListenJoinResponses.Error_AllNodesFailed;
    }

    return globalResponse;
  }

  public processNodeStateChange(event: ExtInterface.ViperNodeStateChange) {
    const nodeId: number = event.nodeId;
    const newState: ExtInterface.ViperNodeState = event.newState;
    const oldState: ExtInterface.ViperNodeState = event.oldState;
    diag.trace?.('processNodeStateChange', `[Node ${nodeId}] L&J VCC state change from ${oldState} --> ${newState}`);

    if (newState !== oldState) {
      const nodeSubsState = this.nodesSubsState.get(nodeId);
      if (newState === ExtInterface.ViperNodeState.NodeUp) {
        if (this.mode === ListenJoinMonitoringMode.Off) {
          diag.out('processNodeStateChange', `[Node ${nodeId}] No active L&J.  Skip subscription !`);
          return;
        }

        if (nodeSubsState === LJSubsState.Subscribed) {
          diag.out('processNodeStateChange', `[Node ${nodeId}] already subscribed.  Skip subscription !`);
          return;
        }

        let node = this.lineDev.webNodes.find((n) => n.getNodeId() === nodeId);
        const uri = 'sip:' + node?.nodeCfgEx.proxyAddress + ':5060';
        this.subscribe(nodeId, uri)
          .then(async (msgId: ListenJoinSubscribeResponses) => {
            diag.out(
              'processNodeStateChange',
              `[Node ${nodeId}] Subscribe success ${arrListenJoinSubscribeResponses[msgId].text}`
            );
          })
          .catch(async (msgId: ListenJoinSubscribeResponses) => {
            diag.err(
              'processNodeStateChange',
              `[Node ${nodeId}] Subscribe failed with error = ${arrListenJoinSubscribeResponses[msgId].text}`
            );
          });
      } else if (newState === ExtInterface.ViperNodeState.NodeDown) {
        diag.out('processNodeStateChange', `[Node ${nodeId}] Actif subscribe.  Unsubscribe !`);

        let node = this.lineDev.webNodes.find((n) => n.getNodeId() === nodeId);
        const uri = 'sip:' + node?.nodeCfgEx.proxyAddress + ':5060';

        // If exist on that node, terminate current L&J call.
        this.disconnect(nodeId);

        this.unsubscribe(nodeId, uri)
          .then(async (msg: string) => {
            diag.out('processNodeStateChange', `[Node ${nodeId}] Unsubscribe successfully`);
          })
          .catch(async (e: string) => {
            diag.err('processNodeStateChange', `[Node ${nodeId}] Unsubscribe failed with error = ${e}`);
          });
      }
    }
  }

  public processClientKeepAliveStateUpd(event: CustomEvent) {
    const clientIP = event.detail.clientIP;
    const newState = event.detail.state;
    const strNewState = newState != undefined ? arrClientKeepAliveState[newState].text : 'Undefined';
    // diag.out('processClientKeepAliveStateUpd', `Got keep alive state ${strNewState} from WebRTC client IP=${clientIP}`);

    for (let webRTC of this.lineDev.webPhone.webPhoneCfg.webRTCGWConfigData) {
      if (webRTC.srv1Address === clientIP || webRTC.srv2Address === clientIP) {
        webRTC.voipServers.forEach((server) => {
          const nodeId = getNodeId(server);
          if (nodeId) {
            const prevState = this.clientNodesKeepAliveState.get(nodeId);
            const strPrevState = prevState !== undefined ? arrClientKeepAliveState[prevState].text : 'Undefined';
            // prettier-ignore
            if (newState !== prevState) {
              diag.out(
                'processClientKeepAliveStateUpd',
                `[Node ${nodeId}] Keep Alive state changed from ${strPrevState} --> ${strNewState}`
              );

              const nodeSubsState = this.nodesSubsState.get(nodeId);
              if (newState === ClientKeepAliveState.UP) {
                // Skip subscribe if L&J is OFF
                if (this.mode === ListenJoinMonitoringMode.Off) {
                  if (prevState !== undefined)
                    diag.out('processClientKeepAliveStateUpd', `[Node ${nodeId}] L&J if OFF.  Skip subscription !`);
                }
                // Skip subscribe if node has been subscribed
                else if (nodeSubsState === LJSubsState.Subscribed) {
                  diag.out(
                    'processClientKeepAliveStateUpd',
                    `[Node ${nodeId}] already subscribed.  Skip subscription !`
                  );
                } else {
                  let node = this.lineDev.webNodes.find((n) => n.getNodeId() === nodeId);
                  const uri = 'sip:' + node?.nodeCfgEx.proxyAddress + ':5060';
                  this.subscribe(nodeId, uri)
                    .then(async (msgId: ListenJoinSubscribeResponses) => {
                      diag.out(
                        'processClientKeepAliveStateUpd',
                        `[Node ${nodeId}] Subscribe result=${arrListenJoinSubscribeResponses[msgId].text}`
                      );
                    })
                    .catch(async (msgId: ListenJoinSubscribeResponses) => {
                      diag.err(
                        'processClientKeepAliveStateUpd',
                        `[Node ${nodeId}] Subscribe failed with error = ${arrListenJoinSubscribeResponses[msgId].text}`
                      );
                    });
                }
              } else if (newState === ClientKeepAliveState.DOWN && nodeSubsState === LJSubsState.Subscribed) {
                diag.out(
                  'processClientKeepAliveStateUpd',
                  `[Node ${nodeId}] Actif subscribe.  Unsubscribe !`
                );

                let node = this.lineDev.webNodes.find((n) => n.getNodeId() === nodeId);
                const uri = 'sip:' + node?.nodeCfgEx.proxyAddress + ':5060';
                this.unsubscribe(nodeId, uri)
                  .then(async (msg: string) => {
                    diag.out(
                      'processClientKeepAliveStateUpd',
                      `[Node ${nodeId}] Unsubscribe successfully`
                    );
                  })
                  .catch(async (e: string) => {
                    diag.err(
                      'processClientKeepAliveStateUpd',
                      `[Node ${nodeId}] Unsubscribe failed with error = ${e}`
                    );
                  });
              }
              this.clientNodesKeepAliveState.set(nodeId, newState);
            }
          } else
            diag.warn(
              'processClientKeepAliveStateUpd',
              `Failed getting VoIP servers nodeId from WebRTC Client IP=${clientIP}`
            );
        });
      }
    }
  }

  public async processSubsTerminatedMessageHandler(event: CustomEvent) {
    /* IMPORTANT NOTES:
       - This function is called each time we usubscribe a Node and, a sudden/unexpected unsubscribe occured without asking for it
       - The sudden/unexpected unsubscribe without asking for it occurs as follow:
         1) Subscribe did not received its initial NOTIFY from the remote peer
         2) PWEB-1579 - SIP.JS Re-Subscribe issue:
              After NTIMER of the first Re-Subscribe, the subscription state change unexpectly to TERMINATE
       - Please note in all cases where we intentionally unsubscribe, the subscribe state(nodesSubsState) will be set to "UnsubscribeInProgress"
       - Therefore, the subscribe state(nodesSubsState) is "subscribed" only if a sudden/unexpected unsubscribe occured.
       - In summary, this function get fully executed, as follow, ONLY for sudden/unexpected unsubscribe and, as long as Node and WebRTC is UP:
         1) Terminate L&J call if present
         2) Unsubscribe the Node
         3) Re-Subscribe the node
    */

    // Get VoIP server IP + subscribe event
    const index: string = event.detail;
    let uri = '';
    let subsEvent = '';
    const indexInfos = index.split('-|-');
    if (indexInfos.length == 2) {
      uri = indexInfos[0];
      subsEvent = indexInfos[1];
    }

    // SKIP if NOT a L&J subscribe
    if (subsEvent !== 'x-viper-monitor') {
      return;
    }

    // If actif, terminate L&J silently and, restart it !
    if (this.mode !== ListenJoinMonitoringMode.Off) {
      const node = this.lineDev.webNodes.find((node) => uri.indexOf(node.nodeCfgEx.proxyAddress) !== -1);
      if (!node) return;

      // If subscribe state is "subscribed", It is probably a Re-Subscribe(See main note above)
      const nodeId = node.getNodeId();
      const currSubsState = this.nodesSubsState.get(nodeId);
      if (currSubsState === LJSubsState.Subscribed) {
        /* This is now a SUDDEN/UNEXPECTED subscribe termination. */

        // Make sure the node client keep alive is UP
        const nodeKeepAliveState = this.clientNodesKeepAliveState.get(nodeId);
        if (nodeKeepAliveState === ClientKeepAliveState.DOWN) {
          const VoipCluster = node.getVoipClusterName();
          diag.warn(
            'processSubsTerminatedMessageHandler',
            `NodeId<${nodeId}>/${VoipCluster} keep alive DOWN.  Skip L&J node resubscribe !`
          );
          return;
        }

        // Make sure the VCC node is UP
        if (!node.isNodeUp()) {
          const VoipCluster = node.getVoipClusterName();
          diag.warn(
            'processSubsTerminatedMessageHandler',
            `NodeId<${nodeId}>/${VoipCluster} DOWN.  Skip L&J node resubscribe !`
          );
          return;
        }

        diag.warn(
          'processSubsTerminatedMessageHandler',
          `L&J Subscribe index [${index}] terminated UNEXPECTEDLY.  Re-Subscribe the node silently !`
        );

        // If exist on that node, terminate current L&J call.
        this.disconnect(nodeId);

        await this.unsubscribe(nodeId, uri)
          .then(async (msg: string) => {
            diag.out('processSubsTerminatedMessageHandler', `NodeId<${nodeId}> = ${msg}`);
          })
          .catch(async (err: string) => {
            diag.warn('processSubsTerminatedMessageHandler', `NodeId<${nodeId}> = Error ${err}`);
          });

        const posOrAgent = this.monPosOrAgent;
        await this.subscribe(nodeId, uri, posOrAgent)
          .then(async (msgId: ListenJoinSubscribeResponses) => {
            diag.out(
              'processSubsTerminatedMessageHandler',
              `Success subscribe NodeId<${nodeId}>/${arrListenJoinSubscribeResponses[msgId].text}`
            );
          })
          .catch(async (msgId: ListenJoinSubscribeResponses) => {
            diag.err(
              'processSubsTerminatedMessageHandler',
              `Failed subscribe NodeId<${nodeId}>/${arrListenJoinSubscribeResponses[msgId].text}`
            );
          });
      }
    }
  }
}
