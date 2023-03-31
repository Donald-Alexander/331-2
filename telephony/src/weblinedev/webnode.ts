import * as InternalInterface from '../telephonyinternalinterfacedef';
import * as ExtInterface from '../telephonyexternalinterfacedef';
import { WebLineDev } from './weblinedev';
import { NodeConfig } from '../config/nodeConfig';
import { VccMsg } from '../vcc/VccMsg';
import { VccError } from '../vcc/VccError';
import { CallOp } from '../webcall/callop';
import { WebCall } from '../webcall/webcall';
import { ForceConnectSync } from './forceconnect/forceconnect';
import {
  AcdLoginState,
  AcdLoginStatus,
  AcdOpResult,
  AcdOpStatus,
  AcdQueueMembership,
  packAcdQlist,
  PackedAcdQueueMembership,
  unpackAcdQlist,
} from './loginState/acdLoginState';
import { RgLoginState, RgLoginStatus, RgOpStatus } from './loginState/rgLoginState';
import { getVoipClusterName } from '../config/nodeId';
import { Diag } from '../common/diagClient';
import {
  InitialAgentStatus,
  InitialAcdStatus,
  InitialRingGroupStatus,
  InitialCallStateRep,
  LinkInfo,
} from '../telephonyinternalinterfacedef';
import ActiveCalls from '../webcall/activecalls';
import { NenaQueueState, NenaQueueStateFull, NenaServiceState, NenaServiceStateFull } from './nenaState/nenaStateTypes';
import { CallHeader } from '../telephonyutil';
import {
  AgentQueueStatus,
  DynamicACDSnapshotResp,
  processDynamicACDStatusSnapshot,
} from './dynamicACDBySupervisor/dynamicACDStatus';

const moduleName = 'webnode';
const diag = new Diag(moduleName);

const acdOpStatusMap = new Map<string, AcdOpStatus>([
  ['LoggedOn', AcdOpStatus.Ok],
  ['LoggedOff', AcdOpStatus.Ok],
  ['AgentBusy', AcdOpStatus.AgentBusy],
  ['AgentNotInQueue', AcdOpStatus.AgentNotInQueue],
  ['DeviceBusy', AcdOpStatus.DeviceBusy],
  ['NoAgentID', AcdOpStatus.NoAgentId],
  ['NoQueue', AcdOpStatus.NoQueue],
  ['NotExist', AcdOpStatus.NotExist],
  ['UnknownQueue', AcdOpStatus.UnknownQueue],
]);

function mapVccAcdOpStatus(status: string): AcdOpStatus {
  return acdOpStatusMap.get(status) || AcdOpStatus.Unknown;
}

const rgOpStatusMap = new Map<string, RgOpStatus>([
  ['LoggedOn', RgOpStatus.Ok],
  ['LoggedOff', RgOpStatus.Ok],
  ['AgentBusy', RgOpStatus.AgentBusy],
  ['DeviceBusy', RgOpStatus.DeviceBusy],
  ['NotExist', RgOpStatus.NotExist],
  ['OtherDevice', RgOpStatus.OtherDevice],
]);

function mapVccRgOpStatus(status: string): RgOpStatus {
  return rgOpStatusMap.get(status) || RgOpStatus.Unknown;
}

const vccNenaQueueStateToEnumMap = new Map<string, NenaQueueState>([
  ['NONE', NenaQueueState.None],
  ['ACTIVE', NenaQueueState.Active],
  ['INACTIVE', NenaQueueState.Inactive],
  ['DISABLED', NenaQueueState.Disabled],
  ['FULL', NenaQueueState.Full],
  ['STANDBY', NenaQueueState.Standby],
]);

function vccNenaQueueStateToEnum(state: string): NenaQueueState {
  return vccNenaQueueStateToEnumMap.get(state) || NenaQueueState.None;
}

const vccNenaQueueStateFromEnumMap = new Map<NenaQueueState, string>([
  [NenaQueueState.None, 'NONE'],
  [NenaQueueState.Active, 'ACTIVE'],
  [NenaQueueState.Inactive, 'INACTIVE'],
  [NenaQueueState.Disabled, 'DISABLED'],
  [NenaQueueState.Full, 'FULL'],
  [NenaQueueState.Standby, 'STANDBY'],
]);

function vccNenaQueueStateFromEnum(state: NenaQueueState): string {
  return vccNenaQueueStateFromEnumMap.get(state) || 'NONE';
}

export interface VccNenaQueueState {
  queueIdentifier: string;
  queueState: string;
  override?: boolean;
  overrideReason?: string;
  baseQueueState?: string;
}

export function nenaQueueStateFullFromVcc(vccState: VccNenaQueueState): NenaQueueStateFull {
  const baseState = vccNenaQueueStateToEnum(vccState.override ? vccState.baseQueueState || '' : vccState.queueState);
  const overrideState = vccState.override ? vccNenaQueueStateToEnum(vccState.queueState || '') : NenaQueueState.None;
  const overrideReason = vccState.overrideReason || '';

  return new NenaQueueStateFull(vccState.queueIdentifier, baseState, vccState.override, overrideState, overrideReason);
}

const vccNenaServiceStateToEnumMap = new Map<string, NenaServiceState>([
  ['NONE', NenaServiceState.None],
  ['NORMAL', NenaServiceState.Normal],
  ['UNMANNED', NenaServiceState.Unmanned],
  ['SCHEDULED_MAINTENANCE_DOWN', NenaServiceState.ScheduledMaintenanceDown],
  ['SCHEDULED_MAINTENANCE_AVAILABLE', NenaServiceState.ScheduledMaintenanceAvailable],
  ['MAJOR_INCIDENT_IN_PROGRESS', NenaServiceState.MajorIncidentInProgress],
  ['PARTIAL_SERVICE', NenaServiceState.PartialService],
  ['OVERLOADED', NenaServiceState.Overloaded],
  ['GOING_DOWN', NenaServiceState.GoingDown],
  ['DOWN', NenaServiceState.Down],
]);

function vccNenaServiceStateToEnum(state: string): NenaServiceState {
  return vccNenaServiceStateToEnumMap.get(state) || NenaServiceState.None;
}

const vccNenaServiceStateFromEnumMap = new Map<NenaServiceState, string>([
  [NenaServiceState.None, 'NONE'],
  [NenaServiceState.Normal, 'NORMAL'],
  [NenaServiceState.Unmanned, 'UNMANNED'],
  [NenaServiceState.ScheduledMaintenanceDown, 'SCHEDULED_MAINTENANCE_DOWN'],
  [NenaServiceState.ScheduledMaintenanceAvailable, 'SCHEDULED_MAINTENANCE_AVAILABLE'],
  [NenaServiceState.MajorIncidentInProgress, 'MAJOR_INCIDENT_IN_PROGRESS'],
  [NenaServiceState.PartialService, 'PARTIAL_SERVICE'],
  [NenaServiceState.Overloaded, 'OVERLOADED'],
  [NenaServiceState.GoingDown, 'GOING_DOWN'],
  [NenaServiceState.Down, 'DOWN'],
]);

function vccNenaServiceStateFromEnum(state: NenaServiceState): string {
  return vccNenaServiceStateFromEnumMap.get(state) || 'NONE';
}

export interface VccNenaServiceState {
  serviceIdentifier: string;
  serviceState: string;
  override?: boolean;
  overrideReason?: string;
  baseServiceState?: string;
}

export function nenaServiceStateFullFromVcc(vccState: VccNenaServiceState): NenaServiceStateFull {
  const baseState = vccNenaServiceStateToEnum(
    vccState.override ? vccState.baseServiceState || '' : vccState.serviceState
  );
  const overrideState = vccState.override
    ? vccNenaServiceStateToEnum(vccState.serviceState || '')
    : NenaServiceState.None;
  const overrideReason = vccState.overrideReason || '';

  return new NenaServiceStateFull(
    vccState.serviceIdentifier,
    baseState,
    vccState.override,
    overrideState,
    overrideReason
  );
}

export class WebNode extends EventTarget {
  self: this;
  lineDev: WebLineDev;
  nodeCfgEx: NodeConfig;
  agentLoginStatus: InternalInterface.AgentLoginStatus;
  acdLoginState: AcdLoginState;
  rgLoginState: RgLoginState;
  nodeState: ExtInterface.ViperNodeState;
  firstInitialCallState: boolean = true;
  unsupervisedTxfrBlockedDNs: Array<string> = [];
  mmHoldKeepAlive: boolean = false;
  dynamicACDStatus: Array<AgentQueueStatus> = [];
  mmDrop: boolean = false;
  constructor(lineDev: WebLineDev, nodeCfgEx: NodeConfig) {
    super();
    this.self = this;
    this.lineDev = lineDev;
    this.nodeCfgEx = nodeCfgEx;
    this.nodeState = ExtInterface.ViperNodeState.Unknown;
    this.agentLoginStatus = new InternalInterface.AgentLoginStatus(null, null);
    this.acdLoginState = {
      loginStatus: AcdLoginStatus.LoginUnknown,
      ready: false,
      qlist: [],
    };
    this.rgLoginState = { loginStatus: RgLoginStatus.LoginUnknown, rgList: [] };
  }

  getNodeId() {
    return this.nodeCfgEx.id;
  }

  getVoipClusterName() {
    return getVoipClusterName(this.nodeCfgEx.id);
  }

  GetAgentLoginStatusRec() {
    return this.agentLoginStatus;
  }
  setMMDrop(mmDrop: boolean) {
    this.mmDrop = mmDrop;
  }
  getMMDrop() {
    return this.mmDrop;
  }

  private async vccRequest(
    req: {
      path: string;
      query?: any;
      body?: any;
    },
    timeout?: number
  ): Promise<{ status: string; reason: string; body?: any }> {
/*
    const { vccClient } = this.lineDev;
    const response = await vccClient.request({ node: this.getNodeId(), req }, timeout || 2000);
    return response.res!;
*/
    return {status: '499', reason:'No server available'};
  }


  async acdLogin(agentId: string, device: string, qlist: AcdQueueMembership[]): Promise<AcdOpResult> {
    diag.trace?.('acdLogin', `acdLogin agentId:${agentId}, device:${device}, qlist:${JSON.stringify(qlist)}`);

    try {
      const body = { agentId, device, qlist: packAcdQlist(qlist) };
      diag.trace?.('acdLogin', `acdLogin on node <${this.getNodeId()}>: ${JSON.stringify(body)}`);

      const res = await this.vccRequest({
        path: '/acdLogin',
        body,
      });

      if (res.status !== '200') {
        // bad request or server error
        this.acdLoginState = {
          loginStatus: AcdLoginStatus.LoginUnknown,
          ready: false,
          qlist: [],
        };
        diag.warn(
          'acdLogin',
          `VCC request failed. status=${res.status}, err=${res.body?.err}, message=${
            res.body?.message || 'VCC operation failed'
          }`
        );
        return { status: AcdOpStatus.Error, acdLoginState: { ...this.acdLoginState } };
      }

      if (res.body.status === 'LoggedOn') {
        this.acdLoginState = {
          loginStatus: AcdLoginStatus.LoggedIn,
          ready: !res.body.paused || false,
          qlist: unpackAcdQlist(res.body.qlist as PackedAcdQueueMembership[]),
        };
      } else {
        // If failing to log in and an ACD call is ringing and not forceconnecting, reject it.
        const fcs = new ForceConnectSync(null, this.lineDev, CallOp.AcdLogOn);
        if (!fcs.getGoAhead()) {
          diag.trace?.(
            'acdLogin',
            `A Force connect operation has been initiated on call <${fcs.getForceConnectCall()?.webCallId}>`
          );
        } else {
          diag.trace?.('acdLogin', `${this.nodeCfgEx.proxyName} AcdLogOut rejecting ACD calls`);
          // rejectACDCalls(this);
          ForceConnectSync.erase(fcs);
        }

        this.acdLoginState = {
          loginStatus: AcdLoginStatus.LoggedOut,
          ready: false,
          qlist: [],
        };
      }

      return { status: mapVccAcdOpStatus(res.body.status), acdLoginState: { ...this.acdLoginState } };
    } catch (e) {
      // bad vccClient connection?
      this.acdLoginState = {
        loginStatus: AcdLoginStatus.LoginUnknown,
        ready: false,
        qlist: [],
      };
      diag.warn('acdLogin', `got error ${e}`);
      return { status: AcdOpStatus.Error, acdLoginState: { ...this.acdLoginState } };
    }
  }

  async acdLogout(agentId: string, device: string, reasonCode?: number, reasonDesc?: string): Promise<AcdOpResult> {
    try {
      const body = { agentId, device, reasonCode: reasonCode?.toString(), reasonDesc };
      diag.trace?.('acdLogout', `ACD logout on node <${this.getNodeId()}>: ${JSON.stringify(body)}`);

      const res = await this.vccRequest({
        path: '/acdLogout',
        body,
      });

      if (res.status !== '200') {
        // bad request or server error
        this.acdLoginState = {
          loginStatus: AcdLoginStatus.LoginUnknown,
          ready: false,
          qlist: [],
        };
        diag.warn(
          'acdLogout',
          `VCC request failed. status=${res.status}, err=${res.body?.err}, message=${
            res.body?.message || 'VCC operation failed'
          }`
        );
        throw new Error('Incapable'); // temporary for now
      }

      if (res.body.status === 'LoggedOn') {
        // If logging out and an ACD call is ringing and not forceconnecting, reject it.
        const fcs = new ForceConnectSync(null, this.lineDev, CallOp.AcdLogOff);
        if (!fcs.getGoAhead()) {
          diag.trace?.(
            'acdLogout',
            `A Force connect operation has been initiated on call <${fcs.getForceConnectCall()?.webCallId}>`
          );
        } else {
          diag.trace?.('acdLogout', `${this.nodeCfgEx.proxyName} ACD LogOut rejecting ACD calls`);
          // rejectACDCalls(this);
          ForceConnectSync.erase(fcs);
        }

        if (res.body.paused) {
          this.acdLoginState = {
            loginStatus: AcdLoginStatus.LoggedIn,
            ready: !res.body.paused || false,
            reasonCode,
            reasonDesc,
            qlist: res.body.qlist || [],
          };
        } else {
          this.acdLoginState = {
            loginStatus: AcdLoginStatus.LoggedIn,
            ready: !res.body.paused || false,
            qlist: res.body.qlist || [],
          };
        }
      } else {
        diag.trace?.('acdLogout', `Vcc response <${res.body.status}> on node ${this.getNodeId()}`);
        this.acdLoginState = {
          loginStatus: AcdLoginStatus.LoggedOut,
          ready: false,
          reasonCode,
          reasonDesc,
          qlist: [],
        };
      }

      return { status: mapVccAcdOpStatus(res.body.status), acdLoginState: { ...this.acdLoginState } };
    } catch (e) {
      // bad vccClient connection?
      this.acdLoginState = {
        loginStatus: AcdLoginStatus.LoginUnknown,
        ready: false,
        qlist: [],
      };
      diag.warn('acdLogout', `got error ${e}`);
      throw e;
    }
  }

  async acdReady(agentId: string, device: string): Promise<AcdOpResult> {
    try {
      const body = { agentId, device };
      diag.trace?.('acdReady', `Set ACD ready on node <${this.getNodeId()}>: ${JSON.stringify(body)}`);

      const res = await this.vccRequest({
        path: '/acdReady',
        body,
      });

      if (res.status !== '200') {
        // bad request or server error
        this.acdLoginState = {
          loginStatus: AcdLoginStatus.LoginUnknown,
          ready: false,
          qlist: [],
        };
        diag.warn(
          'acdReady',
          `VCC request failed. status=${res.status}, err=${res.body?.err}, message=${
            res.body?.message || 'VCC operation failed'
          }`
        );
        throw new Error('Incapable'); // temporary for now
      }

      if (res.body.status === 'LoggedOn') {
        this.acdLoginState = {
          loginStatus: AcdLoginStatus.LoggedIn,
          ready: !res.body.paused || false,
          qlist: this.acdLoginState.qlist,
        };
      } else {
        const fcs = new ForceConnectSync(null, this.lineDev, CallOp.AcdReady);
        if (!fcs.getGoAhead()) {
          diag.trace?.(
            'acdReady',
            `A Force connect operation has been initiated on call <${fcs.getForceConnectCall()?.webCallId}>`
          );
        } else {
          diag.trace?.('acdReady', `${this.nodeCfgEx.proxyName} ACD Ready rejecting ACD calls`);
          // rejectACDCalls(this);
          ForceConnectSync.erase(fcs);
        }

        this.acdLoginState = {
          loginStatus: AcdLoginStatus.LoggedOut,
          ready: false,
          qlist: [],
        };
      }

      return { status: mapVccAcdOpStatus(res.body.status), acdLoginState: { ...this.acdLoginState } };
    } catch (e) {
      // bad vccClient connection?
      this.acdLoginState = {
        loginStatus: AcdLoginStatus.LoginUnknown,
        ready: false,
        qlist: [],
      };
      diag.warn('acdReady', `got error ${e}`);
      throw e;
    }
  }

  async acdNotReady(agentId: string, device: string, reasonCode?: number, reasonDesc?: string): Promise<AcdOpResult> {
    try {
      const body = { agentId, device, reasonCode: reasonCode?.toString(), reasonDesc };
      diag.trace?.('acdNotReady', `Set ACD NotReady on node <${this.getNodeId()}>: ${JSON.stringify(body)}`);

      const res = await this.vccRequest({
        path: '/acdNotReady',
        body,
      });

      if (res.status !== '200') {
        // bad request or server error
        this.acdLoginState = {
          loginStatus: AcdLoginStatus.LoginUnknown,
          ready: false,
          qlist: [],
        };
        diag.warn(
          'acdNotReady',
          `VCC request failed. status=${res.status}, err=${res.body?.err}, message=${
            res.body?.message || 'VCC operation failed'
          }`
        );
        throw new Error('Incapable'); // temporary for now
      }

      if (res.body.status === 'LoggedOn') {
        const fcs = new ForceConnectSync(null, this.lineDev, CallOp.AcdNotReady);
        if (!fcs.getGoAhead()) {
          diag.trace?.(
            'acdNotReady',
            `A Force connect operation has been initiated on call <${fcs.getForceConnectCall()?.webCallId}>`
          );
        } else {
          diag.trace?.('acdNotReady', `${this.nodeCfgEx.proxyName} ACD NotReady rejecting ACD calls`);
          // rejectACDCalls(this);
          ForceConnectSync.erase(fcs);
        }

        if (res.body.paused) {
          this.acdLoginState = {
            loginStatus: AcdLoginStatus.LoggedIn,
            ready: !res.body.paused || false,
            reasonCode,
            reasonDesc,
            qlist: this.acdLoginState.qlist,
          };
        } else {
          this.acdLoginState = {
            loginStatus: AcdLoginStatus.LoggedIn,
            ready: !res.body.paused || false,
            qlist: this.acdLoginState.qlist,
          };
        }
      } else {
        this.acdLoginState = {
          loginStatus: AcdLoginStatus.LoggedOut,
          ready: false,
          qlist: [],
        };
      }

      return { status: mapVccAcdOpStatus(res.body.status), acdLoginState: { ...this.acdLoginState } };
    } catch (e) {
      // bad vccClient connection?
      this.acdLoginState = {
        loginStatus: AcdLoginStatus.LoginUnknown,
        ready: false,
        qlist: [],
      };
      diag.warn('acdNotReady', `got error ${e}`);
      throw e;
    }
  }

  async queueAcdLogOn(queue: string, device: string, agentId: string): Promise<AcdOpResult> {
    try {
      const superAgent = agentId.localeCompare(this.lineDev.agentId) !== 0 ? this.lineDev.agentId : '';
      const body = { queue, device, agentId, superAgent };
      diag.trace?.(
        'queueAcdLogOn',
        `Agent <${
          this.lineDev.agentId
        }> doing queueAcdLogOn agent <${agentId}> on node <${this.getNodeId()}>: ${JSON.stringify(body)}`
      );

      const res = await this.vccRequest({
        path: '/queueAcdLogOn',
        body,
      });

      if (res.status !== '200') {
        diag.trace?.(
          'queueAcdLogOn',
          `VCC request failed. status=${res.status}, err=${res.body?.err}, message=${
            res.body?.message || 'VCC operation failed'
          }`
        );
        throw new Error(AcdOpStatus.VccFailureOnDynamicQueue);
      }

      diag.trace?.('queueAcdLogOn', `${this.nodeCfgEx.proxyName} vcc response success`);
      if (!superAgent) {
        // expected respone for logging on myself
        this.acdLoginState = {
          loginStatus: AcdLoginStatus.LoggedIn,
          ready: !res.body.paused || false,
          qlist: unpackAcdQlist(res?.body?.qlist as PackedAcdQueueMembership[]),
        };

        return { status: mapVccAcdOpStatus(res.body.status), acdLoginState: { ...this.acdLoginState } };
      } else return { status: AcdOpStatus.Unknown, acdLoginState: { ...this.acdLoginState } };
    } catch (e) {
      // bad vccClient connection?
      this.acdLoginState = {
        loginStatus: AcdLoginStatus.LoginUnknown,
        ready: false,
        qlist: [],
      };
      diag.warn('queueAcdLogOn', `${this.nodeCfgEx.proxyName} : error <${e}>`);
      throw e;
    }
  }

  async queueAcdLogOff(queue: string, device: string, agentId: string): Promise<AcdOpResult> {
    try {
      const superAgent = agentId.localeCompare(this.lineDev.agentId) !== 0 ? this.lineDev.agentId : '';
      const body = { queue, device, agentId, superAgent };
      diag.trace?.(
        'queueAcdLogOff',
        `Agent <${
          this.lineDev.agentId
        } queueAcdLogOff agent<${agentId}> on node <${this.getNodeId()}>: ${JSON.stringify(body)}`
      );

      const res = await this.vccRequest({
        path: '/queueAcdLogOff',
        body,
      });

      if (res.status !== '200') {
        diag.trace?.(
          'queueAcdLogOff',
          `VCC request failed. status=${res.status}, err=${res.body?.err}, message=${
            res.body?.message || 'VCC operation failed'
          }`
        );
        throw new Error(AcdOpStatus.VccFailureOnDynamicQueue);
      }

      diag.trace?.('queueAcdLogOff', `${this.nodeCfgEx.proxyName} vcc response success`);
      if (!superAgent) {
        // expected respone for logging off myself
        this.acdLoginState = {
          loginStatus: AcdLoginStatus.LoggedIn,
          ready: !res.body.paused || false,
          qlist: unpackAcdQlist(res?.body?.qlist as PackedAcdQueueMembership[]),
        };
        return { status: mapVccAcdOpStatus(res.body.status), acdLoginState: { ...this.acdLoginState } };
      } else return { status: AcdOpStatus.Unknown, acdLoginState: { ...this.acdLoginState } };
    } catch (e) {
      // bad vccClient connection?
      this.acdLoginState = {
        loginStatus: AcdLoginStatus.LoginUnknown,
        ready: false,
        qlist: [],
      };
      diag.warn('queueAcdLogOff', `${this.nodeCfgEx.proxyName} : error <${e}>`);
      throw e;
    }
  }

  // eslint-disable-next-line class-methods-use-this
  setAgentLoginEx(loginStatus: ExtInterface.LoggedStatus, bInitialStatus: boolean) {
    if (loginStatus === ExtInterface.LoggedStatus.LoggedIn) {
      diag.trace?.(
        'setAgentLoginEx',
        `New status is LoggedIn, setting aentLoginStatus.LoginID to ${this.lineDev.agentId}`
      );
    }

    this.agentLoginStatus.loginId = this.lineDev.agentId;
    this.agentLoginStatus.loginStatus = loginStatus;
    // Inform linedev of login status
    this.lineDev.agentLoginOnNode(this, bInitialStatus);
  }

  async vmSubscribe() {
    const nodeId = this.getNodeId();

    if (nodeId == 1) {
      const primaryUri = this.nodeCfgEx.proxyAddress + ':5060';

      await this.lineDev.webPhone
        .vmSubscribe(primaryUri)
        .then(async () => {
          diag.trace?.('vmSubscribe', 'Telephony WebPhone VM subscribed');
        })
        .catch(async (e: string) => {
          diag.warn('vmSubscribe', 'Failed to subscribe WebPhone ' + e);
        });
    }
  }

  async vmUnsubscribe() {
    const nodeId = this.getNodeId();

    if (nodeId == 1) {
      const primaryUri = this.nodeCfgEx.proxyAddress + ':5060';

      await this.lineDev.webPhone
        .vmUnsubscribe(primaryUri)
        .then(async () => {
          diag.trace?.('vmUnsubscribe', 'Telephony WebPhone VM unSubscribed');
        })
        .catch(async (e: string) => {
          diag.warn('vmUnsubscribe', 'Failed to unsubscribe to VM WebPhone ' + e);
        });
    }
  }

  async sendDigitBySipInfo(
    dialData: {
      trunkCall: string;
      clientCall: string;
      addr: string;
      outsideBridge: string;
      sipId: string;
    },
    nodeId: number
  ) {
    await this.lineDev.webPhone
      .sendDigitBySipInfo(dialData.addr, dialData.sipId, nodeId)
      .then(async () => {
        diag.trace?.('sendDigitBySipInfo', 'Telephony WebPhone SIP INFO digit sent');
      })
      .catch(async (e: string) => {
        diag.warn('sendDigitBySipInfo', 'Failed to send SIP INFO WebPhone ' + e);
      });
  }

  async nextACDCall(agentId: string, device: string) {
    if (this.acdLoginState.loginStatus === AcdLoginStatus.LoggedIn) {
      if (this.nodeState !== ExtInterface.ViperNodeState.NodeUp) {
        diag.warn('nextACDCall', `Node status is ${this.nodeState}: ACD functions not allowed`);
        throw new Error('Incapable');
      }
      try {
        const body = { agentId, device };
        diag.trace?.('nextACDCall', `Get next ACD Call on node <${this.getNodeId()}>: ${JSON.stringify(body)}`);

        const res = await this.vccRequest({
          path: '/acdCancelWrapup',
          body,
        });

        if (res.status !== '200') {
          diag.warn(
            'nextACDCall',
            `VCC request failed. status=${res.status}, err=${res.body?.err}, message=${
              res.body?.message || 'VCC operation failed'
            } on node <${this.getNodeId()}>`
          );
          throw new Error('Incapable');
        }
        diag.trace?.('nextACDCall', `cancel wrapup time Success`);
      } catch (e) {
        diag.warn('nextACDCall', `got error ${e}`);
        throw e;
      }
    } else {
      diag.warn('nextACDCall', `Not logged on: abort`);
      throw new Error('Incapable');
    }
  }

  processAgentStatus(requestUri: string, response: VccMsg) {
    let success = false;
    let agentBusy = false;
    let deviceBusy = false;
    if (!this.agentLoginStatus) return;

    diag.trace?.(
      'processAgentStatus',
      `got response ${JSON.stringify(response.res)} from node ${this.nodeCfgEx.proxyName}`
    );
    const info = response.res!.body;
    switch (info.status) {
      default:
        success = false;
        break;
      case 'LoggedOn':
        if (this.lineDev.agentId === info.agentId) {
          this.agentLoginStatus.loggedAtOtherDevice = ''; // reset
          success = true;
        } else {
          success = false;
          diag.warn('processAgentStatus', `Agent log on failed(reason: Received a bad AgentId ${info.agentId}`);
        }
        break;
      case 'AgentBusy':
        if (!info.agentId) {
        } else if (this.lineDev.agentId === info.agentId) {
          if (info.otherDevice) {
            this.agentLoginStatus.loginId = this.lineDev.agentId;
            this.agentLoginStatus.loginStatus = ExtInterface.LoggedStatus.LoggedOut;
            this.agentLoginStatus.loggedAtOtherDevice = info.otherAgent;
            agentBusy = true;
          }
        } else {
          diag.warn(
            'processAgentStatus',
            `Agent <${this.lineDev.agentId}> log on failed(reason: Received a bad AgentId ${info.agentId}`
          );
        }
        break;
      case 'DeviceBusy':
        this.agentLoginStatus.loginStatus = ExtInterface.LoggedStatus.LoginUnknown;
        deviceBusy = true;
        diag.warn(
          'processAgentStatus',
          `User <${this.lineDev.agentId}> not logged. DeviceBusy by agent: ${info.otherAgent}`
        );
        break;
      case 'NotExist':
        if (requestUri === '/agentLogout') {
          success = true;
          this.agentLoginStatus.loginStatus = ExtInterface.LoggedStatus.LoggedOut;
          diag.out('processAgentStatus', `User <${this.lineDev.agentId}> logged out (reason: agent does not exist)`);
        } else {
          diag.out('processAgentStatus', `User <${this.lineDev.agentId}> not logged (reason: agent does not exist)`);
        }
        break;
      case 'LoggedOff':
        success = true;
        diag.out('processAgentStatus', `User <${this.lineDev.agentId}> logged off`);
        break;
    }

    if (success) {
      if (requestUri === '/agentLogin') {
        this.setAgentLoginEx(ExtInterface.LoggedStatus.LoggedIn, false);
        //only subscribe to the primaryNode
        if (this.getNodeId() == 1) this.vmSubscribe();
      } else if (requestUri === '/agentLogout') {
        if (this.getNodeId() == 1) this.vmUnsubscribe();
        this.setAgentLoginEx(ExtInterface.LoggedStatus.LoggedOut, false);
      }
    }
    if (agentBusy) {
      throw new ExtInterface.AgentLogonException(info.agentId, '', info.otherDevice);
    }
    if (deviceBusy) {
      throw new ExtInterface.AgentLogonException(info.agentId, info.otherAgent, '');
    }
  }

  async agentLogin(loginData: {
    agentId: string;
    device: string;
    password: string;
    firstName: string;
    middleName: string;
    lastName: string;
    psapName: string;
    psapId: string;
    role: string;
  }) {
    diag.trace?.('agentLogin', `agentLogin on node <${this.getNodeId()}>: agentId=${loginData.agentId}`);
/*
    if (!this.agentLoginStatus) {
      const agentInfo: InternalInterface.AgentInfo = {
        firstName: loginData.firstName,
        middleName: loginData.middleName,
        lastName: loginData.lastName,
        pSAPID: loginData.psapId,
        pSAPName: loginData.psapName,
        role: loginData.role,
      };
      this.agentLoginStatus = new InternalInterface.AgentLoginStatus(agentInfo, null);
    }
    if (this.agentLoginStatus.loginStatus === ExtInterface.LoggedStatus.LoggedIn) {
      diag.out(
        'agentLogin',
        `${loginData.agentId} is already in Logged-in state on node <${this.getNodeId()}>. Is it a fresh page?`
      );
      throw new ExtInterface.AgentAlreadyLogonLocally(loginData.agentId);
    }

    const requestUri = '/agentLogin';
    const body = loginData;
    const timeout = 2000;
    let res = null;
    const nodeId = this.getNodeId();
    if (this.lineDev.vccClient) {
      diag.trace?.('agentLogin', `VCC agentLogin request ${JSON.stringify(body)}`);
      const response = await this.lineDev.vccClient
        .request({ node: nodeId, req: { path: requestUri, body } }, timeout)
        .catch((e) => {
          diag.warn('agentLogin', `VCC request error: ${e}`);
          throw e;
        });

      res = response.res;
      if (res && res.status && res.status === '200') {
        this.processAgentStatus(requestUri, response);
      } else {
        throw new Error('Incapable'); // temporary for now: Timeout, EquipmentDown, DeviceNotFound, DeviceBusy, Incapable, AgentAlreadyLoggedOn, AgentAlreadyLoggedOnLocally,
      }
    }
*/
  }

  async agentLogout() {
    diag.trace?.('agentLogout', `Enter`);
    const requestUri = '/agentLogout';
    const body = { agentId: this.lineDev.agentId, device: this.lineDev.device };
    const timeout = 2000;
    let res = null;
    const nodeId = this.getNodeId();
/*
    if (this.lineDev.vccClient) {
      diag.trace?.('agentLogout', `VCC agentLogout request ${JSON.stringify(body)}`);
      const response = await this.lineDev.vccClient
        .request({ node: nodeId, req: { path: requestUri, body } }, timeout)
        .catch((e) => {
          diag.warn('agentLogout', `VCC request error: ${e}`);
          throw e;
        });
      res = response.res;
      if (res && res.status && res.status === '200') {
        this.processAgentStatus(requestUri, response);
      } else {
        throw new Error('Incapable'); // temporary for now
      }
    }
    */
  }

  async rgLogin(agentId: string, device: string, rgList: string[]): Promise<ExtInterface.RgOpResult> {
    diag.trace?.('rgLogin', `Enter`);

    try {
      const res = await this.vccRequest({ path: '/rgLogin', body: { agentId, device, rgList } });

      if (res.status !== '200') {
        // bad request or server error
        this.rgLoginState = { loginStatus: RgLoginStatus.LoginUnknown, rgList: [] };
        diag.warn('rgLogin', `VCC request failed with status code ${res.status}`);
        throw new Error('Incapable'); // temporary for now
      }

      if (res.body.status === 'LoggedOn') {
        this.rgLoginState = { loginStatus: RgLoginStatus.LoggedIn, rgList: res.body.rgList || [] };
      } else {
        this.rgLoginState = { loginStatus: RgLoginStatus.LoggedOut, rgList: [] };
      }

      return { status: mapVccRgOpStatus(res.body.status), rgLoginState: { ...this.rgLoginState } };
    } catch (e) {
      // bad vccClient connection?
      this.rgLoginState = { loginStatus: RgLoginStatus.LoginUnknown, rgList: [] };
      diag.warn('rgLogin', `got error: ${e}`);
      throw e;
    }
  }

  async rgLogout(agentId: string, device: string): Promise<ExtInterface.RgOpResult> {
    diag.trace?.('rgLogout', `Enter`);

    try {
      const res = await this.vccRequest({ path: '/rgLogout', body: { agentId, device } });

      if (res.status !== '200') {
        // bad request or server error
        this.rgLoginState = { loginStatus: RgLoginStatus.LoginUnknown, rgList: [] };
        diag.warn('rgLogout', `VCC request failed with status code ${res.status}`);
        throw new Error('Incapable'); // temporary for now
      }

      if (res.body.status === 'LoggedOn') {
        this.rgLoginState = { loginStatus: RgLoginStatus.LoggedIn, rgList: res.body.rgList || [] };
      } else {
        diag.trace?.('rgLogout', `Vcc response <${res.body.status}> on node ${this.getNodeId()}`);
        this.rgLoginState = { loginStatus: RgLoginStatus.LoggedOut, rgList: [] };
      }

      return { status: mapVccRgOpStatus(res.body.status), rgLoginState: { ...this.rgLoginState } };
    } catch (e) {
      // bad vccClient connection?
      this.rgLoginState = { loginStatus: RgLoginStatus.LoginUnknown, rgList: [] };
      diag.warn('rgLogout', `got error: ${e}`);
      throw e;
    }
  }

  async getInitialStates() {
    diag.trace?.('getInitialStates', `enter`);
    try {
      const res = await this.vccRequest({ path: '/initialStatus', query: { device: this.lineDev.device } });
      if (res.status !== '200') {
        // bad request or server error
        diag.warn('getInitialStates', `request failed with status code ${res.status}`);
        throw new Error(`request failed with status code ${res.status}`);
      }

      const { agentId, status, voipProxies, qlist } = res.body?.queue;
      const acdStatus = {
        agentId,
        status,
        voipProxies,
        qList: unpackAcdQlist((qlist ? qlist : []) as PackedAcdQueueMembership[]),
      } as InitialAcdStatus;
      const agentStatus = res.body?.agent as InitialAgentStatus;
      const rgStatus = res.body.rg as InitialRingGroupStatus;
      await Promise.allSettled([
        this.processInitialAcdStatus(acdStatus),
        this.processInitialAgentStatus(agentStatus),
        this.processInitialRingGroupStatus(rgStatus),
      ]);

      // PWeb-1280: Implement block unsupervised transfer feature
      if ((res.body?.blockUnsupervisedTxfrList as string).length) {
        this.unsupervisedTxfrBlockedDNs = (res.body?.blockUnsupervisedTxfrList as string).split('&');
        diag.out(
          'getInitialStates',
          `Initial node<${this.getNodeId()}> unsupervisedTxfrBlockedDNs = [${this.unsupervisedTxfrBlockedDNs}]`
        );
      }

      // PWEB-1139: Support "Allow Hold State on Shared Call" configuration parameter
      if (res.body?.mmHoldKeepAlive === '1') {
        this.mmHoldKeepAlive = true;
        diag.out('getInitialStates', `Initial node<${this.getNodeId()}> Hold State on Shared Call enabled`);
      } else {
        this.mmHoldKeepAlive = false;
      }

      return Promise.resolve();
    } catch (e) {
      diag.warn('getInitialStates', `${JSON.stringify(e)}`);
      return Promise.reject(new ExtInterface.Incapable(`${JSON.stringify(e)}`));
    }
  }

  reSendAgentLogin(loginData: {
    agentId: string;
    device: string;
    password: string;
    firstName: string;
    middleName: string;
    lastName: string;
    psapName: string;
    psapId: string;
    role: string;
  }) {
    // Agent current loggedOn. Force an Agent log on on the node.
    diag.out('reSendAgentLogin', `log off first then login`);
    this.agentLogout()
      .then(() => {})
      .catch(() => {
        diag.warn('reSendAgentLogin', `Exception while calling agentLogout()[resend]: ${this.nodeCfgEx.proxyName}`);
      });

    this.agentLogin(loginData)
      .then(() => {})
      .catch((e) => {
        diag.warn('reSendAgentLogin', `Exception while calling agentLogin()[resend]: ${this.nodeCfgEx.proxyName}`);
      });
  }

  reSendRingGroupLogin() {
    diag.out('reSendRingGroupLogin', `log off first then login`);
    this.rgLogout(this.lineDev.agentId, this.lineDev.device)
      .then(() => {})
      .catch(() => {
        diag.warn('reSendRingGroupLogin', `Exception while calling rgLogout[resend]: ${this.nodeCfgEx.proxyName}`);
      });

    this.rgLogin(this.lineDev.agentId, this.lineDev.device, this.lineDev.preferredRgLoginState.rgList)
      .then(() => {})
      .catch(() => {
        diag.warn('reSendRingGroupLogin', `Exception while calling rgLogin[resend]: ${this.nodeCfgEx.proxyName}`);
      });
  }

  reSendAcd(acdLoginStatus: AcdLoginState) {
    // intial state is only used for resync only if state not matching between Asterisk and telephony
    // User has choices to set ACD status unlike Agent and RG. Resync incudes Login/out raedy/notready.
    try {
      if (this.isNodeUp() && this.lineDev.acdLoginState.loginStatus !== acdLoginStatus.loginStatus) {
        diag.out(
          'reSendAcd',
          `initial status <${acdLoginStatus.loginStatus}>(received) on node <${this.nodeCfgEx.id}> does not match current telephony state <${this.lineDev.acdLoginState.loginStatus}> for agent <${this.lineDev.agentId}, resync>`
        );
        if (this.lineDev.acdLoginState.loginStatus === AcdLoginStatus.LoggedIn)
          this.acdLogin(this.lineDev.agentId, this.lineDev.device, this.lineDev.storeProvidedQueueList).then;
        if (this.lineDev.acdLoginState.loginStatus === AcdLoginStatus.LoggedOut)
          this.acdLogout(this.lineDev.agentId, this.lineDev.device);
      }

      if (this.isNodeUp() && this.lineDev.acdLoginState.ready !== acdLoginStatus.ready) {
        diag.out(
          'reSendAcd',
          `initial ready status <${
            acdLoginStatus.ready ? 'Ready' : 'Notready'
          }>(received) does not match current node<${this.nodeCfgEx.id}> ready state <${
            this.lineDev.acdLoginState.ready ? 'Ready' : 'Notready'
          }> for agent <${this.lineDev.agentId}, resync>`
        );
        if (this.lineDev.acdLoginState.ready) this.acdReady(this.lineDev.agentId, this.lineDev.device);
        else this.acdNotReady(this.lineDev.agentId, this.lineDev.device);
      }
    } catch (e) {
      diag.warn('reSendAcd', `Exception while calling reSendAcd: ${this.nodeCfgEx.proxyName}`);
    }
  }

  private async processInitialAgentStatus(agentStatus: InitialAgentStatus) {
    diag.trace?.(
      'processInitialAgentStatus',
      `Received initial status <${agentStatus.status}> on node <${this.nodeCfgEx.id}> for agent <${agentStatus.agentId}> in status ${this.agentLoginStatus.loginStatus}`
    );

    if (this.lineDev.agentStatusREC.loginStatus === ExtInterface.LoggedStatus.LoginUnknown) {
      // initially startup, consolidate with other nodes
      if (agentStatus.status === 'LoggedOn') {
        this.setAgentLoginEx(ExtInterface.LoggedStatus.LoggedIn, true);
        if (agentStatus.acdStatusSubscription !== this.lineDev.dynamicACDSubscribed) {
          if (this.lineDev.dynamicACDSubscribed) await this.subscribeDynamicACDStatus(this.lineDev.subscribedQueueList);
          else await this.unSubscribeDynamicACDStatus();
        }
      } else {
        this.setAgentLoginEx(ExtInterface.LoggedStatus.LoggedOut, true);
      }
      diag.trace?.(
        'processInitialAgentStatus',
        `set agentLoginState on node <${this.nodeCfgEx.id}> with initial status <${agentStatus.status}> for agent <${agentStatus.agentId}>`
      );
    } else if (this.lineDev.agentStatusREC.loginStatus === ExtInterface.LoggedStatus.LoggedIn) {
      // network issue may caused inconsistent agent status. re-sync
      // Note we don't have to deal with confition of lineDev.agentStatusREC.loginStatus in LoggedOff cuz agent only loggedOut when webClient exits
      if (agentStatus.status === 'LoggedOff') {
        const loginData = {
          agentId: this.lineDev.agentId,
          device: this.lineDev.device,
          password: '',
          firstName: this.lineDev.agentStatusREC.firstName,
          middleName: this.lineDev.agentStatusREC.middleName,
          lastName: this.lineDev.agentStatusREC.lastName,
          psapName: this.lineDev.agentStatusREC.pSAPName,
          psapId: this.lineDev.agentStatusREC.pSAPId,
          role: this.lineDev.agentStatusREC.role,
        };

        diag.out('processInitialAgentStatus', `resync now. reSendAgentLogin `);
        this.reSendAgentLogin(loginData);
      }
      /* this.lineDev.dynamicACDSubscribed
       * else if (agentStatus.status === 'LoggedOn' && agent) {
       */
    }
    return Promise.resolve();
  }

  private async processInitialAcdStatus(acdStatus: InitialAcdStatus) {
    diag.trace?.(
      'processInitialAcdStatus',
      `Recieved initial status <${acdStatus.status}> on node <${this.nodeCfgEx.id}> for agent <${acdStatus.agentId}> in telephony status <${this.lineDev.preferredAcdLoginState.loginStatus}>`
    );

    let status: AcdLoginStatus = AcdLoginStatus.LoggedOut;

    if (acdStatus.status === 'LoggedOff') status = AcdLoginStatus.LoggedOut;
    if (acdStatus.status === 'Ready' || acdStatus.status === 'NotReady') status = AcdLoginStatus.LoggedIn;

    const acdLoginStatus: AcdLoginState = {
      loginStatus: status,
      ready: acdStatus.status === 'Ready' ? true : false,
      qlist: acdStatus.qList ? acdStatus.qList : [],
    };

    if (this.lineDev.acdLoginState.loginStatus === AcdLoginStatus.LoginUnknown) {
      // Going to consolidate
      diag.trace?.(
        'processInitialAcdStatus',
        `set acdLoginState on node <${this.nodeCfgEx.id}> with initial status <${acdStatus.status}> for agent <${acdStatus.agentId}>`
      );
      this.acdLoginState = acdLoginStatus;
    } else {
      // try to resync node if applicable
      // Note: ACD can be loggedOff in webClient (lineDev) on purpose so the re-sync operation is base on the state on lineDev
      this.reSendAcd(acdLoginStatus);
    }
    return Promise.resolve();
  }

  private async processInitialRingGroupStatus(rgStatus: InitialRingGroupStatus) {
    diag.trace?.(
      'processInitialRingGroupStatus',
      `Recieved initial status <${rgStatus.status}> on node <${this.nodeCfgEx.id}> for agent <${rgStatus.agentId}> in status <${this.rgLoginState.loginStatus}>`
    );

    const rgLoginStatus: RgLoginState = {
      loginStatus: rgStatus.status === 'LoggedOn' ? RgLoginStatus.LoggedIn : RgLoginStatus.LoggedOut,
      rgList: [],
    };

    if (this.lineDev.preferredRgLoginState.loginStatus === RgLoginStatus.LoginUnknown) {
      diag.trace?.(
        'processInitialRingGroupStatus',
        `set rgLoginState on node <${this.nodeCfgEx.id}> with initial status <${rgStatus.status}> for agent <${rgStatus.agentId}>`
      );
      this.rgLoginState = rgLoginStatus;
    } else if (this.lineDev.rgLoginState.loginStatus === RgLoginStatus.LoggedIn) {
      // network issue may caused inconsistent agent status. re-sync
      // Note we don't have to deal with the condition of lineDev.rgLoginState.loginStatus in LoggedOff cuz agent only loggedOut when webClient exits
      if (rgStatus.status === 'LoggedOff') {
        diag.out('processInitialRingGroupStatus', `resync now. reSendRingGroupLogin`);
        this.reSendRingGroupLogin();
      }
    }
    return Promise.resolve();
  }

  async getInitialCallState() {
    diag.out('getInitialCallState', `enter node <${this.nodeCfgEx.id}>`);
    try {
      const res = await this.vccRequest({
        path: '/initialCallState',
        body: { device: this.lineDev.device, first: this.firstInitialCallState },
      });
      if (res.status !== '200') {
        // bad request or server error
        diag.warn('getInitialCallState', `request failed with status code ${res.status}`);
        throw new Error(`request failed with status code ${res.status}`);
      }
      this.firstInitialCallState = false;

      const states = res.body?.state as Array<InitialCallStateRep>;

      if (!states || states.length === 0) {
        diag.out('getInitialCallState', `No initial calls`);
        return;
      }

      this.processInitialCallState(states);
    } catch (e) {
      diag.warn('getInitialCallState', `${JSON.stringify(e)}`);
      throw new ExtInterface.Incapable(`${JSON.stringify(e)}`);
    }
  }

  processInitialCallState(initialCallStates: Array<InitialCallStateRep>) {
    diag.out('processInitialCallState', `${JSON.stringify(initialCallStates)}`);

    initialCallStates.forEach((item) => {
      if (item.uci && ActiveCalls.findByUCI(item.uci)) {
        // already have this call, skip it
        return;
      }

      const state = item.state as InternalInterface.InitialCallState;

      if (state === InternalInterface.InitialCallState.Park) {
        if (!item.call || !item.trunkAddr || !item.uci) {
          // invalid data
          return;
        }
        const callHeader = new CallHeader();

        callHeader.remoteChannel = item.call;
        callHeader.trunkAddress = item.trunkAddr;
        callHeader.uCI = item.uci;
        callHeader.initialRoute = item.initRoute || '';

        const call = new WebCall(null, this, {
          callHeader,
          cfg: new InternalInterface.DirectionCfg(
            item.initRoute ? ExtInterface.Direction.Incoming : ExtInterface.Direction.Outgoing
          ),
          initialState: ExtInterface.CallState.Park,
          uniqueCallId: item.uci,
        });

        call.callType = item.callType === 'TEXT' ? ExtInterface.CallType.Text : ExtInterface.CallType.Voice;
        call.parkDN = item.parkDN || '';

        ActiveCalls.add(call);
        call.setCallState(ExtInterface.CallState.Park);
      } else if (
        state === InternalInterface.InitialCallState.Busy ||
        state === InternalInterface.InitialCallState.Hold ||
        state === InternalInterface.InitialCallState.IHold ||
        state === InternalInterface.InitialCallState.Connected
      ) {
        if (!item.initCall || !item.trunkAddr || !item.uci) {
          // invalid data
          return;
        }
        const isAcdCall = item.route?.startsWith('Q') && /&ACD/.test(item.route);
        const ownedByThisPos = item.connectedBy === this.lineDev.device;

        if (isAcdCall && !ownedByThisPos) {
          diag.trace?.(
            'processInitialCallState',
            `ACD call ${item.uci} was answered by another position: do not create call`
          );
          return;
        }

        const lineType = isAcdCall
          ? ExtInterface.LineType.LTACD
          : this.lineDev.getWantedLineType(item.trunkAddr, false);
        const line = this.lineDev.getFreeLine(lineType, item.trunkAddr, false, false);

        if (!line) {
          diag.warn('processInitialCallState', `Unable to get line for call ${item.uci} with state ${state}`);
          return;
        }

        diag.trace?.('processInitialCallState', `creating call for ${item.uci}`);

        const callHeader = new CallHeader();

        callHeader.remoteChannel = item.initCall || '';
        callHeader.trunkAddress = item.trunkAddr || '';
        callHeader.uCI = item.uci || '';
        callHeader.trunkUniqueID = item.trunkUci || '';
        callHeader.initialRoute = item.initRoute || '';

        const call = new WebCall(line, this, {
          callHeader,
          cfg: new InternalInterface.DirectionCfg(
            item.initRoute ? ExtInterface.Direction.Incoming : ExtInterface.Direction.Outgoing
          ),
          initialState: ExtInterface.CallState.Idle,
          uniqueCallId: item.uci,
        });

        // set conference ID  with item.confId
        // checkfor bargein with item.posList
        // set trunkToTrunkTransferfoAllCalls with item.t2t
        line.addCall(call);
        if (state === InternalInterface.InitialCallState.Busy) {
          call.setCallState(isAcdCall ? ExtInterface.CallState.IHold : ExtInterface.CallState.Busy);
        } else if (state === InternalInterface.InitialCallState.Hold) {
          call.setCallState(isAcdCall ? ExtInterface.CallState.IHold : ExtInterface.CallState.Hold);
        } else if (state === InternalInterface.InitialCallState.IHold) {
          call.setCallState(ExtInterface.CallState.IHold);
        } else if (state === InternalInterface.InitialCallState.Connected) {
          diag.warn('processInitialCallState', `Unsupported initial state ${state}. Setting to IHold instead`);
          call.setCallState(ExtInterface.CallState.IHold);
        }
      }
    });
  }

  async callAnswer(trunkCall: string, agentCall: string) {
    const body = { trunkCall, agentCall };
    diag.trace?.('callAnswer', `Enter: ${JSON.stringify(body)}`);

    const res = await this.vccRequest({
      path: '/callAnswer',
      body,
    });

/*
    if (res.status !== '200') {
      // bad request or server error
      throw new ExtInterface.Incapable('VCC callAnswer operation failed');
    }
    */
  }

  async callBarge(trunkCall: string, agentCall: string): Promise<{ status: string }> {
    const body = { trunkCall, agentCall };
    diag.trace?.('callBarge', `Enter: ${body}`);

    const res = await this.vccRequest({
      path: '/callBarge',
      body,
    });

    if (res.status !== '200') {
      // bad request or server error
      if (res.body?.status === 'TooSoon') {
        throw new ExtInterface.LineLocked('TooSoon');
      } else throw new ExtInterface.Incapable('VCC callBarge operation failed');
    }

    return { status: res.body.status };
  }

  async callBlindTransfer(
    trunkCall: string,
    agentCall: string,
    cssid: string,
    satelliteSiteId: string | null,
    dialAddrs: Array<{ longdistance: boolean; tokens: string[] }>
  ): Promise<void> {
    const body = { trunkCall, agentCall, cssid, satelliteSiteId, dialAddrs };
    diag.trace?.('callBlindTransfer', `Enter: ${body}`);

    const res = await this.vccRequest({
      path: '/callBlindTransfer',
      body,
    });

    if (res.status !== '202') {
      // bad request or server error
      throw new Error('VCC callBlindTransfer operation failed');
    }
  }

  async callDrop(trunkCall: string, agentCall: string): Promise<{ status: string; meetmeOnHold: boolean }> {
    const body = { trunkCall, agentCall };
    diag.trace?.('callDrop', `Enter: ${JSON.stringify(body)}`);

    const res = await this.vccRequest({
      path: '/callDrop',
      body,
    });

    if (res.status !== '200') {
      // bad request or server error
      throw new Error('VCC callDrop operation failed');
    }

    return { status: res.body.status, meetmeOnHold: res.body.meetmeOnHold };
  }

  async callHold(
    trunkCall: string,
    agentCall: string,
    options?: { confHold?: boolean; connectedLineType?: string; lastDialedRoute?: string; exclusive?: boolean }
  ): Promise<{ holdOp: string }> {
    const body = {
      trunkCall,
      agentCall,
      connectedConf: options?.confHold,
      connectedLineType: options?.connectedLineType,
      lastDialedRoute: options?.lastDialedRoute,
      exclusive: options?.exclusive,
    };
    diag.trace?.('callHold', `Enter: ${JSON.stringify(body)}`);

    const res = await this.vccRequest({
      path: '/callHold',
      body,
    });

    if (res.status !== '200') {
      // bad request or server error
      throw new Error('VCC callHold operation failed');
    }

    return { holdOp: res.body.holdOp };
  }

  async callUnhold(trunkCall: string, agentCall: string) {
    const body = { trunkCall, agentCall };
    diag.trace?.('callUnhold', `Enter: ${JSON.stringify(body)}`);

    const res = await this.vccRequest({
      path: '/callUnhold',
      body,
    });

    if (res.status !== '200' && res.body?.err === 'ExclusiveHold') {
      throw new ExtInterface.ExclusiveHoldUnholdFailure('');
    } else if (res.status !== '200') {
      // bad request or server error
      if (res.body?.message) {
        throw new ExtInterface.Incapable(`${res.body?.message}`);
      } else {
        throw new ExtInterface.Incapable(`VCC callUnhold operation failed`);
      }
    }
  }

  async callPark(trunkCall: string, agentCall: string): Promise<{ parkDN: string }> {
    const body = { trunkCall, agentCall };
    diag.trace?.('callPark', `Enter: ${body}`);

    const res = await this.vccRequest({
      path: '/callPark',
      body,
    });

    if (res.status !== '200') {
      throw new VccError(res.body?.err || '', res.body?.message || 'VCC operation failed');
    }

    return { parkDN: res.body?.parkDN || '' };
  }

  async callUnpark(trunkCall: string, agentCall: string) {
    const body = { trunkCall, agentCall };
    diag.trace?.('callUnpark', `Enter: ${body}`);

    const res = await this.vccRequest({
      path: '/callUnpark',
      body,
    });

    if (res.status !== '200') {
      throw new VccError(res.body?.err || '', res.body?.message || 'VCC operation failed');
    }
  }

  async callPatch(
    patchCall: string,
    agentDevice: string,
    conf: string,
    confNode: string
  ): Promise<{ patchOp: string; internode: boolean }> {
    const body = { patchCall, agentDevice, conf, confNode };
    diag.trace?.('callPatch', `Enter: ${body}`);

    const res = await this.vccRequest({
      path: '/callPatch',
      body,
    });

    if (res.status !== '200') {
      throw new VccError(res.body?.err || '', res.body?.message || 'VCC operation failed');
    }

    return { patchOp: res.body?.status || '', internode: res.body?.internode };
  }

  async conferenceAcquire(trunkCall: string, agentDevice: string): Promise<{ conf: string }> {
    const body = { trunkCall, agentDevice };
    diag.trace?.('conferenceAcquire', `Enter: ${body}`);

    const res = await this.vccRequest({
      path: '/conferenceAcquire',
      body,
    });

    if (res.status !== '200') {
      throw new VccError(res.body?.err || '', res.body?.message || 'VCC operation failed');
    }

    return { conf: res.body?.conf };
  }

  async conferenceInvite(inviteParams: {
    trunkCall: string;
    agentCall: string;
    cssid: string;
    uci: string;
    originalUci?: string;
    satelliteSiteId?: string;
    dialAddrs: Array<{ longdistance: boolean; tokens: string[] }>;
    xHeaders?: Map<string, string>;
  }): Promise<{ call: string; progressTone: string }> {
    const timeout = 3000;
    const body: any = { ...inviteParams };
    diag.trace?.('conferenceInvite', `Enter: ${body}`);

    // need to transform xHeaders map to array of [name,value] pairs
    body.xHeaders = [];
    inviteParams.xHeaders?.forEach((val, key) => {
      body.xHeaders.push([key, val]);
    });

    const res = await this.vccRequest(
      {
        path: '/conferenceInvite',
        body,
      },
      timeout
    );

    if (res.status !== '200') {
      throw new VccError(res.body?.err || '', res.body?.message || 'VCC operation failed');
    }

    return { call: res.body?.call, progressTone: res.body?.progressTone };
  }

  async conferenceJoin(confCall: string, joinCall: string, agentDevice: string) {
    const body = { confCall, joinCall, agentDevice };
    diag.trace?.('conferenceJoin', `Enter: ${body}`);

    const res = await this.vccRequest({
      path: '/conferenceJoin',
      body,
    });

    if (res.status !== '200') {
      throw new VccError(res.body?.err || '', res.body?.message || 'VCC operation failed');
    }
  }

  async conferenceLock(conf: string, agentDevice: string) {
    const body = { conf, agentDevice };
    diag.trace?.('conferenceLock', `Enter: ${body}`);

    const res = await this.vccRequest({
      path: '/conferenceLock',
      body,
    });

    if (res.status !== '200') {
      throw new VccError(res.body?.err || '', res.body?.message || 'VCC operation failed');
    }
  }

  async conferenceRelease(conf: string, agentDevice: string) {
    const body = { conf, agentDevice };
    diag.trace?.('conferenceRelease', `Enter: ${body}`);

    const res = await this.vccRequest({
      path: '/conferenceRelease',
      body,
    });

    if (!(res.status === '200' || res.status === '202')) {
      throw new VccError(res.body?.err || '', res.body?.message || 'VCC operation failed');
    }
  }

  async conferenceRemove(call: string, agentCall: string, options?: { removeAll?: boolean }) {
    const body = { call, agentCall, removeAll: options?.removeAll };
    diag.trace?.('conferenceRemove', `Enter: ${body}`);

    const res = await this.vccRequest({
      path: '/conferenceRemove',
      body,
    });

    if (res.status !== '200') {
      throw new VccError(res.body?.err || '', res.body?.message || 'VCC operation failed');
    }
  }

  async conferenceUnlock(conf: string, agentDevice: string, options?: { cleanup?: boolean }) {
    const body = { conf, agentDevice, cleanup: options?.cleanup };
    diag.trace?.('conferenceUnlock', `Enter: ${body}`);

    const res = await this.vccRequest({
      path: '/conferenceUnlock',
      body,
    });

    if (!(res.status === '200' || res.status === '202')) {
      throw new VccError(res.body?.err || '', res.body?.message || 'VCC operation failed');
    }
  }

  async deafenParticipant(call: string, agentCall: string, conf: string, options?: { deafen?: boolean }) {
    const body = { call, agentCall, conf, deafen: options?.deafen };
    diag.trace?.('deafenParticipant', `Enter: ${body}`);

    const res = await this.vccRequest({
      path: '/conferenceDeafen',
      body,
    });

    if (res.status !== '200') {
      throw new VccError(res.body?.err || '', res.body?.message || 'VCC operation failed');
    }
  }

  async muteParticipant(call: string, agentCall: string, conf: string, options?: { mute?: boolean }) {
    const body = { call, agentCall, conf, mute: options?.mute };
    diag.trace?.('muteParticipant', `Enter: ${body}`);

    const res = await this.vccRequest({
      path: '/conferenceMute',
      body,
    });

    if (res.status !== '200') {
      throw new VccError(res.body?.err || '', res.body?.message || 'VCC operation failed');
    }
  }

  async consultConferenceInvite(inviteParams: {
    trunkCall: string;
    agentCall: string;
    cssid: string;
    uci: string;
    originalUci?: string;
    satelliteSiteId?: string;
    dialAddrs: Array<{ longdistance: boolean; tokens: string[] }>;
    xHeaders?: Map<string, string>;
  }): Promise<{ call: string; progressTone: string }> {
    const timeout = 3000;
    const body: any = { ...inviteParams };
    diag.trace?.('conferenceUnlock', `Enter: ${body}`);

    // need to transform xHeaders map to array of [name,value] pairs
    body.xHeaders = [];
    inviteParams.xHeaders?.forEach((val, key) => {
      body.xHeaders.push([key, val]);
    });

    const res = await this.vccRequest(
      {
        path: '/consultConferenceInvite',
        body,
      },
      timeout
    );

    if (res.status !== '200') {
      throw new VccError(res.body?.err || '', res.body?.message || 'VCC operation failed');
    }

    return { call: res.body?.call, progressTone: res.body?.progressTone };
  }

  async dialToChannel(dialData: {
    trunkCall: string;
    clientCall: string;
    addr: string;
    outsideBridge: string;
    sipId: string;
  }) {
    diag.trace?.('dialToChannel', `${JSON.stringify(dialData)}`);

    const res = await this.vccRequest({
      path: '/dialToChannel',
      body: dialData,
    });

    if (res.status !== '202') {
      const nodeId = this.getNodeId();
      // send the digit to primary node only for voicemail
      if (nodeId == 1)
        this.sendDigitBySipInfo(dialData, nodeId)
          .then(() => {
            diag.trace?.('dialToChannel', `SIP INFO successfully sent: ${JSON.stringify(dialData)}`);
          })
          .catch(() => {
            diag.warn?.('dialToChannel', `SIP INFO failed to send: ${JSON.stringify(dialData)}`);
            throw new VccError(res.body?.err || '', res.body?.message || 'VCC operation failed');
          });
    }
  }

  async takeMSRPTextOwnership(uci: string, requester: string) {
    diag.trace?.('takeMSRPTextOwnership', `Parameters: uci=${uci} , requester=${requester}`);
    const res = await this.vccRequest({
      path: '/msrpTextOwnership',
      body: { uci, requester },
    });

    if (res.status !== '202') {
      throw new VccError(res.body?.err || '', res.body?.message || 'VCC operation failed');
    }
  }

  async acdConnectRequest(uci: string, acdAgent: string) {
    diag.trace?.('acdConnectRequest', `Node<${this.nodeCfgEx.id}> call with uci<${uci} to agent<${acdAgent}>`);
    const res = await this.vccRequest({
      path: '/acdConnectRequest',
      body: { uci, exten: `${acdAgent}`, priority: '1' },
    });

    if (res.status !== '200') {
      const err = res.body?.err || res.status;
      const message = res.body?.message || 'VCC operation failed';
      diag.warn('acdConnectRequest', `Resp: ${err}, message:${message}`);
      throw new VccError(err, message);
    }
    return Promise.resolve('success');
  }

/*
  async callLinkWait(trunkCall: string, agentCall: string, timeout?: number): Promise<LinkInfo> {
    const { vccClient } = this.lineDev;
    const callLinkHandler: EventListenerObject = {
      handleEvent: () => {},
    };

    try {
      return await new Promise<LinkInfo>((resolve, reject) => {
        const timeoutId = setTimeout(reject, timeout || 2000, new ExtInterface.Timeout('wait callLink event'));

        callLinkHandler.handleEvent = (e: CustomEvent) => {
          const vccMsg = e.detail as VccMsg;
          diag.trace?.('callLinkWait', `received callLink event: ${JSON.stringify(vccMsg?.evt?.body)}`);
          const { caller, callerTrunkAddress, callee, calleeTrunkAddress, cssid } = vccMsg?.evt?.body;
          const node = vccMsg.node || 0;
          const info: LinkInfo = { node, cssid, caller, callerTrunkAddress, callee, calleeTrunkAddress };
          if (caller === trunkCall) {
            clearTimeout(timeoutId);
            if (callee === agentCall) {
              diag.out('callLinkWait', `Got mine: ${JSON.stringify(info)}`);
              resolve(info);
            } else {
              reject(new ExtInterface.LineLocked('answered by other Pos already'));
            }
          }
        };
        vccClient.addEventListener('/callLink', callLinkHandler);
      });
    } finally {
      vccClient.removeEventListener('/callLink', callLinkHandler);
    } 
  }

  async callReplaceWait(call: string): Promise<{ newCall: string; newNode: string }> {
    const { vccClient } = this.lineDev;
    const timeout = 2000;

    const handler: EventListenerObject = {
      handleEvent: () => {},
    };

    try {
      const result = await new Promise<{ newCall: string; newNode: string }>((resolve, reject) => {
        const timeoutId = setTimeout(reject, timeout);

        handler.handleEvent = (e: CustomEvent) => {
          const vccMsg = e.detail as VccMsg;
          if (vccMsg?.evt?.body?.oldCall === call) {
            clearTimeout(timeoutId);
            resolve({ newCall: vccMsg.evt.body.newCall?.toString(), newNode: vccMsg.evt.body.newNode?.toString() });
          }
        };
        vccClient.addEventListener('/callReplace', handler);
      });

      return result;
    } finally {
      vccClient.removeEventListener('/callReplace', handler);
    }
    
  }
 */

  async nenaQueueStateGetAll(): Promise<NenaQueueStateFull[]> {
    const body = { queueIdentifierAll: true };
    diag.trace?.('nenaQueueStateGetAll', `Enter: ${body}`);

    const res = await this.vccRequest({
      path: '/nenaStatusGetQueueState',
      body,
    });

    if (res.status !== '200') {
      throw new VccError(res.body?.err || '', res.body?.message || 'VCC operation failed');
    }

    const nenaQueues: Array<VccNenaQueueState> = res.body?.nenaQueues || [];

    return nenaQueues
      .map((ele) => {
        return nenaQueueStateFullFromVcc(ele);
      })
      .filter((ele) => ele.queueIdentifier);
  }

  async nenaQueueStateGet(queueIdentifier: string): Promise<NenaQueueStateFull[]> {
    const body = { queueIdentifier };
    diag.trace?.('nenaQueueStateGet', `Enter: ${body}`);

    const res = await this.vccRequest({
      path: '/nenaStatusGetQueueState',
      body,
    });

    if (res.status !== '200') {
      throw new VccError(res.body?.err || '', res.body?.message || 'VCC operation failed');
    }

    const nenaQueues: Array<VccNenaQueueState> = res.body?.nenaQueues || [];

    return nenaQueues
      .map((ele) => {
        return nenaQueueStateFullFromVcc(ele);
      })
      .filter((ele) => ele.queueIdentifier);
  }

  async nenaQueueStateSetOverride(
    queueIdentifier: string,
    queueState: NenaQueueState,
    overrideReason: string
  ): Promise<void> {
    const body = { queueIdentifier, queueState: vccNenaQueueStateFromEnum(queueState), overrideReason };
    diag.trace?.('nenaQueueStateSetOverride', `Enter: ${body}`);

    const res = await this.vccRequest({
      path: '/nenaStatusSetQueueStateOverride',
      body,
    });

    if (res.status !== '200') {
      throw new VccError(res.body?.err || '', res.body?.message || 'VCC operation failed');
    }
  }

  async nenaQueueStateClearOverride(queueIdentifier: string): Promise<void> {
    const body = { queueIdentifier };
    diag.trace?.('nenaQueueStateClearOverride', `Enter: ${body}`);

    const res = await this.vccRequest({
      path: '/nenaStatusClearQueueStateOverride',
      body,
    });

    if (res.status !== '200') {
      throw new VccError(res.body?.err || '', res.body?.message || 'VCC operation failed');
    }
  }

  async nenaServiceStateGetAll(): Promise<NenaServiceStateFull[]> {
    const body = { serviceIdentifierAll: true };
    diag.trace?.('nenaServiceStateGetAll', `Enter: ${body}`);

    const res = await this.vccRequest({
      path: '/nenaStatusGetServiceState',
      body,
    });

    if (res.status !== '200') {
      throw new VccError(res.body?.err || '', res.body?.message || 'VCC operation failed');
    }

    const nenaServices: Array<VccNenaServiceState> = res.body?.nenaServices || [];

    return nenaServices
      .map((ele) => {
        return nenaServiceStateFullFromVcc(ele);
      })
      .filter((ele) => ele.serviceIdentifier);
  }

  async nenaServiceStateGet(serviceIdentifier: string): Promise<NenaServiceStateFull[]> {
    const body = { serviceIdentifier };
    diag.trace?.('nenaServiceStateGet', `Enter: ${body}`);

    const res = await this.vccRequest({
      path: '/nenaStatusGetServiceState',
      body,
    });

    if (res.status !== '200') {
      throw new VccError(res.body?.err || '', res.body?.message || 'VCC operation failed');
    }

    const nenaServices: Array<VccNenaServiceState> = res.body?.nenaServices || [];

    return nenaServices
      .map((ele) => {
        return nenaServiceStateFullFromVcc(ele);
      })
      .filter((ele) => ele.serviceIdentifier);
  }

  async nenaServiceStateSetOverride(
    serviceIdentifier: string,
    serviceState: NenaServiceState,
    overrideReason: string
  ): Promise<void> {
    const body = { serviceIdentifier, serviceState: vccNenaServiceStateFromEnum(serviceState), overrideReason };
    diag.trace?.('nenaServiceStateSetOverride', `Enter: ${body}`);

    const res = await this.vccRequest({
      path: '/nenaStatusSetServiceStateOverride',
      body,
    });

    if (res.status !== '200') {
      throw new VccError(res.body?.err || '', res.body?.message || 'VCC operation failed');
    }
  }

  async nenaServiceStateClearOverride(serviceIdentifier: string): Promise<void> {
    const body = { serviceIdentifier };
    diag.trace?.('nenaServiceStateClearOverride', `Enter: ${body}`);

    const res = await this.vccRequest({
      path: '/nenaStatusClearServiceStateOverride',
      body,
    });

    if (res.status !== '200') {
      throw new VccError(res.body?.err || '', res.body?.message || 'VCC operation failed');
    }
  }

  async subscribeDynamicACDStatus(queueList: Array<string>): Promise<void> {
    diag.trace?.(
      'subscribeDynamicACDStatus',
      `to Node<${this.nodeCfgEx.id}> with queueList <${queueList} and superAgent <${this.lineDev.agentId}>`
    );
    const res = await this.vccRequest({
      path: '/subscribeDynamicACDStatus',
      body: { queueList, device: `${this.lineDev.device}`, superAgent: `${this.lineDev.agentId}` },
    });

    if (res.status !== '200') {
      throw new VccError(res.body?.err || '', res.body?.message || 'VCC operation failed');
    }

    const resp = {
      snapshot: res.body.snapshot,
      svnAgents: res.body.svnAgents,
    } as DynamicACDSnapshotResp;
    processDynamicACDStatusSnapshot(this, resp);
  }

  async unSubscribeDynamicACDStatus(): Promise<void> {
    diag.trace?.(
      'unSubscribeDynamicACDStatus',
      `to Node<${this.nodeCfgEx.id}> , Agent <${this.lineDev.agentId}, PosId <${this.lineDev.device}>`
    );
    const res = await this.vccRequest({
      path: '/unSubscribeDynamicACDStatus',
      body: { device: `${this.lineDev.device}`, superAgent: `${this.lineDev.agentId}` },
    });

    if (res.status !== '200') {
      throw new VccError(res.body?.err || '', res.body?.message || 'VCC operation failed');
    }

    this.dynamicACDStatus = [];
  }

  public isNodeUp(): boolean {
    return this.nodeState === ExtInterface.ViperNodeState.NodeUp;
  }

  public isNodeDown(): boolean {
    return this.nodeState === ExtInterface.ViperNodeState.NodeDown;
  }

  isUnsupervisedTxfrBlockedDN(dn: string): boolean {
    return this.unsupervisedTxfrBlockedDNs.indexOf(dn) >= 0;
  }

  isMMHoldKeepAlive(): boolean {
    return this.mmHoldKeepAlive;
  }
}

export { WebNode as default };
