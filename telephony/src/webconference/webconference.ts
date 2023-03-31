import { WebLineDev } from '../weblinedev/weblinedev';
import { WebCall } from '../webcall/webcall';
import { CallOp } from '../webcall/callop';
import { CallState, CongestionState } from '../webcall/callState';
import { WebNode } from '../weblinedev/webnode';
import {
  ConferenceConsultType,
  ConferenceMember,
  ConferenceMemberType,
  ConferenceState,
  ConfStateUpdate,
  WebConference,
} from './conferenceTypes';
import { ActiveConferences } from './activeConferences';
import * as ConfUtil from './conferenceUtil';
import { DialingPrefix, CallType } from '../telephonyexternalinterfacedef';
import { Diag } from '../common/diagClient';
import { ConfInfo, Participant, ParticipantAdded, ParticipantRemoved, ParticipantUpdated } from './confinfo';

const moduleName = 'webconference';
const diag = new Diag(moduleName);

export class WebConferenceImpl implements WebConference {
  // WebConference interface
  readonly confId: number;
  state: ConferenceState = ConferenceState.Idle;
  members: ConferenceMember[] = [];
  ownerDevice: string;
  consultCall: WebCall | null = null;
  systemConfId: string;
  participantsMap: Map<string, Participant>;
  eventTarget: EventTarget;

  // other members
  private readonly lineDev: WebLineDev;
  private callStateUpdateSuspended: boolean = false;
  private vccConf: string = '';
  private node: WebNode;

  constructor(lineDev: WebLineDev, initialCall: WebCall, owner?: string) {
    this.lineDev = lineDev;
    this.confId = ConfUtil.nextConfId();
    this.ownerDevice = owner || '';
    this.node = initialCall.webNode;
    this.systemConfId = '';
    this.participantsMap = new Map();
    this.eventTarget = new EventTarget();

    this.addMember({ call: initialCall, memberType: ConferenceMemberType.InitialCall });
  }

  // -----
  // WebConference interface
  // -----
  /** Remove and drop the most recent consultation call */
  async cancel(): Promise<void> {
    try {
      this.callStateUpdateSuspended = true;

      if (this.state === ConferenceState.HoldPendingConference) {
        try {
          try {
            if (this.consultCall) {
              await ConfUtil.hangupConsultCall(this.consultCall);
              if (this.consultCall.state !== CallState.Finished) {
                this.consultCall.finishCall();
              }
              this.clearConsultCall();
            }
          } finally {
            await this._unhold();
          }
        } finally {
          if (this.members.length > 0) {
            await this.node.conferenceUnlock(this.vccConf, this.lineDev.device);
          }
        }
      } else if (this.state === ConferenceState.Connected) {
        const consultMember = this.members.reverse().find((mem) => mem.memberType === ConferenceMemberType.ConsultCall);
        if (consultMember) {
          const { localChannel, remoteChannel } = consultMember.call.callHeader;
          await consultMember.call.webNode.conferenceRemove(remoteChannel, localChannel);
          if (consultMember.call.state !== CallState.Finished) {
            consultMember.call.finishCall();
          }
          this.removeMember(consultMember.call.webCallId);
        }
      } else {
        throw new Error(`Unable to cancel conference. Operation not allowed from Conference state ${this.state}`);
      }
    } finally {
      this.callStateUpdateSuspended = false;
      this.updateState();
    }
  }

  /** Connect the current consultation call */
  async connect(): Promise<void> {
    if (this.state !== ConferenceState.HoldPendingConference) {
      throw new Error(`Invalid conference state <${this.state}> for action`);
    }
    if (this.members.length === 0) {
      throw new Error('Unable to connect consultation call. No conference members remaining');
    }
    if (!this.consultCall) {
      throw new Error('No active consultation call');
    }
    if (!CallState.connected(this.consultCall.state)) {
      throw new Error(`Unable to connect consultation call in state <${this.consultCall.state}>`);
    }
    if (this.consultCall.congestionState !== CongestionState.NotCongested) {
      throw new Error(`Unable to connect consultation call in congestionOnDestination state`);
    }

    const { consultCall } = this;

    if (CallOp.inProgress(consultCall)) {
      diag.warn('connect', `call ${CallOp.inProgress(this)} already in progress for <${consultCall.webCallId}>`);
      throw new Error('cannot connect consutlation call that has operation already in progress');
    }

    try {
      this.callStateUpdateSuspended = true;

      const fromCall = this.members[0].call;
      const node = fromCall.webNode;

      try {
        try {
          CallOp.start(consultCall, CallOp.ConfConnect);

          await node.conferenceJoin(
            fromCall.callHeader.remoteChannel,
            consultCall.callHeader.remoteChannel,
            this.lineDev.device
          );

          // the consultation call is now a full conference member
          // NOTE: we keep the state as Connected even though it should be transitioned to IHold like the other conference calls.
          //       This is to avoid call and conference state management issues at the P911 GUI level. see PWEB-2085
          consultCall.callHeader.localChannel = fromCall.callHeader.localChannel;
          consultCall.changeLine(fromCall.webLine);
          this.addMember({ call: consultCall, memberType: ConferenceMemberType.ConsultCall });
          this.consultCall = null;
        } catch (e) {
          // join failed. Clean up the consultation call
          ConfUtil.hangupConsultCall(consultCall);
          consultCall.finishCall();
          this.clearConsultCall();
          throw e;
        } finally {
          CallOp.end(consultCall);
          await this._unhold();
        }
      } finally {
        await node.conferenceUnlock(this.vccConf, this.lineDev.device);
      }
    } finally {
      this.callStateUpdateSuspended = false;
      this.updateState();
    }
  }

  /** Drop initial call and end the conference */
  async drop(): Promise<void> {
    if (this.state !== ConferenceState.Connected) {
      throw new Error(`Unable to drop conference. Operation not allowed from Conference state ${this.state}`);
    }
    if (this.hasCongestedConsultMembers()) {
      throw new Error(`Unable to transfer. One or more consultation calls in congestionOnDestination state`);
    }

    // Check unsupervised transfer blocked
    const index = this.getConsulCallNotConnectedMemberIndex();
    if (index >= 0 && this.members[index].call.isUnsupervisedTxfrBlocked()) {
      diag.trace?.('drop', `Consult call is not connected and, unsupervised transfers are blocked: Cancel Conference`);
      this.cancel();
    } else if (this.members.length > 0) {
      try {
        this.callStateUpdateSuspended = true;
        await this.members[0].call.drop();
        this.postDropMemberCleanup();
      } finally {
        this.callStateUpdateSuspended = false;
        this.updateState();
      }
    }
  }

  /** Place conference calls on hold */
  async hold(): Promise<void> {
    if (this.state !== ConferenceState.Connected) {
      throw new Error(`Unable to hold conference. Operation not allowed from Conference state ${this.state}`);
    }

    if (this.members.length > 0) {
      try {
        this.callStateUpdateSuspended = true;
        await this._hold();
      } finally {
        this.callStateUpdateSuspended = false;
        this.updateState();
      }
    }
  }

  /** Unhold conference calls */
  async unhold(): Promise<void> {
    if (this.state !== ConferenceState.Hold) {
      throw new Error(`Unable to unhold conference. Operation not allowed from Conference state ${this.state}`);
    }

    if (this.members.length > 0) {
      try {
        this.callStateUpdateSuspended = true;
        await this._unhold();
      } finally {
        this.callStateUpdateSuspended = false;
        this.updateState();
      }
    }
  }

  /** Add new call to conference through Normal or NoHold conference */
  inviteCall(destAddr: string, prefix: DialingPrefix | null, consultType: ConferenceConsultType): Promise<WebCall> {
    if (this.state !== ConferenceState.Connected) {
      throw new Error('Must be in connected state to invite into conference');
    }

    if (destAddr === this.lineDev.device) {
      throw new Error('Conference to self not permitted');
    }

    // prepare the destination address and alternates
    const dialAddrs = ConfUtil.prepareDialAddrs(this.members[0].call, destAddr, prefix);

    // Normal conference is NOT allowed with MSRP call.  Switch to NHC instead.
    const initialCall = this.members[0].call;
    if (consultType === ConferenceConsultType.Normal && initialCall.callType === CallType.Text) {
      diag.out(
        moduleName,
        'inviteCall',
        `Normal conference not allowed with initial MSRP call<${initialCall.webCallId}>.  Will perform a NHC instead.`
      );
      consultType = ConferenceConsultType.NoHold;
    }

    switch (consultType) {
      case ConferenceConsultType.NoHold:
        return this.nhcInvite(dialAddrs);
      case ConferenceConsultType.Normal:
        return this.consultInvite(dialAddrs);
      default:
        throw new Error('Conference consult type not supported for addCall conference operation');
    }
  }

  /** Add existing call to conference through Call Patch */
  async patchCall(otherCall: WebCall): Promise<void> {
    // check if other call is already in a conference
    if (ActiveConferences.find((conf) => conf.members.find((mem) => mem.call.webCallId === otherCall.webCallId))) {
      throw new Error('Other call to patch already part of a conference');
    }

    // check that conference and call states are compatible for the operation
    if (
      !(
        (this.state === ConferenceState.Connected && otherCall.state === CallState.IHold) ||
        (this.state === ConferenceState.Hold && otherCall.state === CallState.Connected)
      )
    ) {
      throw new Error(
        `Other call in state <${otherCall.state}> cannot be patched into conference in state <${this.state}>`
      );
    }

    // check that patch call can be put into the conference
    if (!ConfUtil.canJoinConference(otherCall)) {
      throw new Error('Other call cannot participate in a conference');
    } else if (!ConfUtil.callsAreCompatible(this.members[0].call, otherCall)) {
      throw new Error('Other call is not compatible with existing conferencing');
    }

    await this.patch(otherCall);

    if (this.state === ConferenceState.Hold) {
      diag.trace?.('patchCall', 'conf state is hold, need to unhold');
      await this.unhold();
    }
  }

  /** Conference event reporter */
  report(evt: Event): void {
    this.lineDev.report(evt);
  }

  /** Transfer conference to consultation call, and drop self */
  async transfer(): Promise<void> {
    if (this.state === ConferenceState.HoldPendingConference) {
      await this.transferPendingConference();
    } else {
      await this.transferConference();
    }
  }

  /** Notifier when call state changes */
  callStateUpdate(call: WebCall): void {
    if (!this.callStateUpdateSuspended && this.state !== ConferenceState.Finished) {
      if (this.members.find((mem) => mem.call.webCallId === call.webCallId)) {
        if (call.state === CallState.Finished && call.sipId) {
          // the call is finished and was 'owning' the sip dialog.
          // find a call in the conference on the same line to become the new sip dialog 'owner'
          const otherCall = this.members.find((mem) => mem.call !== call && mem.call.webLine === call.webLine)?.call;

          if (otherCall) {
            otherCall.sipId = call.sipId;
            // eslint-disable-next-line no-param-reassign
            call.sipId = undefined;
          }
        }
        // do the update async in case there are side effects in updateState() that cause a recursive callStateUpdate()
        Promise.resolve().then(() => {
          this.updateState();
        });
      } else if (call.webCallId === this.consultCall?.webCallId) {
        if (call.state === CallState.Finished) {
          // consultation call is finished
          this.clearConsultCall();
        }
        // do the update async in case there are side effects in updateState() that cause a recursive callStateUpdate()
        Promise.resolve().then(() => {
          this.updateState();
        });
      }
    }
  }

  // -----
  // Public functions
  // -----

  /** Add a call to the conference by consultation call. Normal (Sameline) Conference */
  async consultInvite(dialAddrs: Array<{ longdistance: boolean; tokens: string[] }>): Promise<WebCall> {
    if (this.members.length === 0) {
      throw new Error('cannot invite into empty conference');
    }

    const fromCall = this.members[0].call;
    const line = fromCall.webLine;

    if (!line) {
      throw new Error('cannot invite when from call is not on a line');
    }

    if (!fromCall.cssId) {
      fromCall.cssId = fromCall.getCSSID('_CONF');
    }

    const trunkCall = fromCall.callHeader.remoteChannel;
    const agentDevice = this.lineDev.device;

    this.callStateUpdateSuspended = true;

    try {
      if (this.ownerDevice !== agentDevice || !this.vccConf) {
        const { conf: vccConf } = await this.node.conferenceAcquire(trunkCall, agentDevice);
        this.vccConf = vccConf;
        this.ownerDevice = agentDevice;
      }

      await this.node.conferenceLock(this.vccConf, agentDevice);

      try {
        await this._hold();
        const consultCall = await ConfUtil.makeConsultCall(this.lineDev, fromCall, dialAddrs);

        if (dialAddrs.length === 1 && fromCall?.webNode?.isUnsupervisedTxfrBlockedDN(dialAddrs[0].tokens[0])) {
          consultCall.setUnsupervisedTxfrBlocked();
          diag.trace?.(
            'consultInvite',
            `Set unsupervised Xfer flag on consultation CallId <${consultCall.webCallId}> with dial address <${dialAddrs[0].tokens[0]}>`
          );
        } else consultCall.clearUnsupervisedTxfrBlocked();

        this.setConsultCall(consultCall);
        return consultCall;
      } catch (e) {
        this.node.conferenceUnlock(this.vccConf, agentDevice);
        throw e;
      }
    } finally {
      this.callStateUpdateSuspended = false;
      this.updateState();
    }
  }

  /** Add a call to the conference by dialing out. No-Hold Conference (NHC) */
  async nhcInvite(dialAddrs: Array<{ longdistance: boolean; tokens: string[] }>): Promise<WebCall> {
    if (this.members.length === 0) {
      throw new Error('cannot invite into empty conference');
    }

    const fromCall = this.members[0].call;
    const line = fromCall.webLine;

    if (!line) {
      throw new Error('cannot invite when from call is not on a line');
    }

    if (!fromCall.cssId) {
      fromCall.cssId = fromCall.getCSSID('_CONF');
    }

    const trunkCall = fromCall.callHeader.remoteChannel;
    const agentDevice = this.lineDev.device;

    if (this.ownerDevice !== agentDevice || !this.vccConf) {
      const { conf: vccConf } = await this.node.conferenceAcquire(trunkCall, agentDevice);
      this.vccConf = vccConf;
      this.ownerDevice = agentDevice;
    }

    const toCall = await ConfUtil.makeNoHoldCall(fromCall, dialAddrs);

    if (dialAddrs.length === 1 && fromCall?.webNode?.isUnsupervisedTxfrBlockedDN(dialAddrs[0].tokens[0])) {
      toCall.setUnsupervisedTxfrBlocked();
      diag.trace?.(
        'nhcInvite',
        `Set unsupervised Xfer flag on consultation call ${toCall.webCallId} with dial address ${dialAddrs[0].tokens[0]}`
      );
    } else toCall.clearUnsupervisedTxfrBlocked();

    this.addMember({ call: toCall, memberType: ConferenceMemberType.ConsultCall });
    line.addCall(toCall);
    toCall.setCallState(CallState.Proceeding);

    return toCall;
  }

  /** Add a call to the conference by call patch */
  async patch(patchCall: WebCall): Promise<void> {
    if (CallOp.inProgress(patchCall)) {
      diag.warn('patch', `call ${CallOp.inProgress(this)} already in progress for <${patchCall.webCallId}>`);
      throw new Error('cannot patch call that has operation already in progress');
    }

    try {
      CallOp.start(patchCall, CallOp.ConfPatch);

      if (this.members.length === 0) {
        throw new Error('cannot patch into empty conference');
      }

      const fromCall = this.members[0].call;
      const line = fromCall.webLine;

      if (!line) {
        throw new Error('cannot patch when from call is not on a line');
      }

      if (!fromCall.cssId) {
        fromCall.cssId = fromCall.getCSSID('_CONF');
      }

      const trunkCall = fromCall.callHeader.remoteChannel;
      const agentDevice = this.lineDev.device;

      this.callStateUpdateSuspended = true;

      try {
        if (this.ownerDevice !== agentDevice || !this.vccConf) {
          const { conf: vccConf } = await this.node.conferenceAcquire(trunkCall, agentDevice);
          this.vccConf = vccConf;
          this.ownerDevice = agentDevice;
        }

        await this.node.conferenceLock(this.vccConf, agentDevice);

        try {
          // we use the patchCall node and not the conference node to properly handle
          // the case of internode call patch
          const response = await patchCall.webNode.callPatch(
            patchCall.callHeader.remoteChannel,
            agentDevice,
            this.vccConf,
            this.node.getVoipClusterName()
          );

          if (response.patchOp === 'Patched') {
            // expected case for same-node call patch
          } else if (response.patchOp === 'PatchParked') {
            // expected case for internode call patch
            // on the voip server, the patch call will create a proxy call into the conference node,
            // and the conference node will send an update through a callReplace event
            diag.trace?.('patch', `PatchParked. reposonse=${response}`);

            if (response.internode && patchCall.webNode.getNodeId() !== this.node.getNodeId()) {
/*
              // wait for the callReplace event to update the patchCall node
              diag.trace?.('patch', `PatchParked. waiting for new call node from callReplace event`);
              await this.node.callReplaceWait(patchCall.callHeader.remoteChannel);
              */

              // it is possible we get the callReplace event before the main handler,
              // just wait for all handlers to have their chance before checking the patchCall node
              await Promise.resolve();
              if (patchCall.webNode.getNodeId() !== this.node.getNodeId()) {
                diag.trace?.('patch', `PatchParked. Failed to get patchCall node update for internode call patch`);
                throw new Error('Failed to get patchCall node update for internode call patch');
              }
            }
            diag.trace?.(
              'patch',
              `PatchParked. calling conferenceJoin with remote channel=${patchCall.callHeader.remoteChannel}`
            );
            // join the updated patch call, which is now on the same node, to the conference
            await this.node.conferenceJoin(trunkCall, patchCall.callHeader.remoteChannel, agentDevice);
          } else {
            throw new Error(`Unexpected VCC callPatch status <${response.patchOp}>`);
          }

          // eslint-disable-next-line no-param-reassign
          patchCall.callHeader.localChannel = fromCall.callHeader.localChannel;
          patchCall.changeLine(fromCall.webLine);
          patchCall.setCallState(fromCall.state);

          // Assign confContextObjId of patched call to match fromCall
          if (fromCall.confContextObjId) {
            patchCall.assignContextId(fromCall.confContextObjId);
          } else {
            patchCall.assignContextId(fromCall.contextObjId);
          }

          this.addMember({ call: patchCall, memberType: ConferenceMemberType.PatchCall });
        } catch (e) {
          this.node.conferenceUnlock(this.vccConf, agentDevice);
          throw e;
        }
      } finally {
        this.callStateUpdateSuspended = false;
        this.updateState();
      }
    } finally {
      CallOp.end(patchCall);
    }
  }

  /** Remove call from conference */
  async removeCall(call: WebCall): Promise<void> {
    if (this.state !== ConferenceState.Connected) {
      throw new Error(`Cannot remove call. Conference remove not allowed from state ${this.state}`);
    }

    const member = this.members.find((mem) => mem.call.webCallId === call.webCallId);

    if (!member) {
      throw new Error('Cannot remove call. Call not part of conference');
    }

    try {
      this.callStateUpdateSuspended = true;
      const { localChannel, remoteChannel } = member.call.callHeader;
      await member.call.webNode.conferenceRemove(remoteChannel, localChannel);
      if (member.call.state !== CallState.Finished) {
        member.call.finishCall();
      }
      this.removeMember(member.call.webCallId);
    } finally {
      this.callStateUpdateSuspended = false;
      this.updateState();
    }
  }

  /** Remove all calls from conference */
  async removeAll(): Promise<void> {
    if (this.state !== ConferenceState.Connected) {
      throw new Error(`Cannot remove all. Conference remove not allowed from state ${this.state}`);
    }

    if (this.members.length === 0) {
      throw new Error('Cannot remove all from empty conference');
    }

    try {
      this.callStateUpdateSuspended = true;
      const initCall = this.members[0].call;
      const { localChannel, remoteChannel } = initCall.callHeader;
      await initCall.webNode.conferenceRemove(remoteChannel, localChannel, { removeAll: true });
      this.members.forEach((mem) => {
        if (mem.call.state !== CallState.Finished) {
          mem.call.finishCall();
        }
      });
      this.removeAllMembers();
    } finally {
      this.callStateUpdateSuspended = false;
      this.updateState();
    }
  }

  /** Remove participant from conference */
  async removeFromConference(theParticipant: Participant): Promise<void> {
    if (this.state !== ConferenceState.Connected) {
      throw new Error(`Cannot remove participant. Conference participant remove not allowed from state ${this.state}`);
    }

    if (this.members.length === 0) {
      throw new Error('Cannot remove all from empty conference');
    }

    if (!theParticipant) {
      throw new Error('Cannot remove participant from empty conference');
    }

    try {
      this.callStateUpdateSuspended = true;
      const initCall = this.members[0].call;
      const { localChannel } = initCall.callHeader;
      const remoteChannel = theParticipant.astChannel;
      await initCall.webNode.conferenceRemove(remoteChannel, localChannel, { removeAll: false });
    } finally {
      this.callStateUpdateSuspended = false;
      this.updateState();
    }
  }

  /** Remove all participant from conference */
  async removeAllFromConference(): Promise<void> {
    if (this.state !== ConferenceState.Connected) {
      throw new Error(`Cannot remove all participants. Conference remove not allowed from state ${this.state}`);
    }

    if (this.members.length === 0) {
      throw new Error('Cannot remove all participants from empty conference');
    }

    await this.removeAll();
  }

  /** Deafen/Undeafen participant  */
  async deafenParticipant(confParticipant: Participant, deafen: boolean): Promise<void> {
    const request: string = deafen ? 'Deafen' : 'Undeafen';

    diag.out('deafenParticipant', `Starting ${request} participant `);

    if (this.state !== ConferenceState.Connected) {
      throw new Error(
        `Cannot ${request} participant. Conference participant ${request} not allowed from state ${this.state}`
      );
    }

    if (this.members.length === 0) {
      throw new Error(`Cannot ${request} all from empty conference`);
    }

    if (!confParticipant) {
      throw new Error(`Cannot ${request} participant from empty conference`);
    }

    try {
      this.callStateUpdateSuspended = true;
      const initCall = this.members[0].call;
      const { localChannel } = initCall.callHeader;
      const remoteChannel = confParticipant.astChannel;
      const { confDN } = confParticipant;
      await initCall.webNode.deafenParticipant(remoteChannel, localChannel, confDN, { deafen });
    } finally {
      this.callStateUpdateSuspended = false;
      this.updateState();
    }
  }

  /** Mute/Unmute participant  */
  async muteParticipant(confParticipant: Participant, mute: boolean): Promise<void> {
    const request: string = mute ? 'Mute' : 'Unmute';

    diag.out('muteParticipant', `Starting ${request} participant `);

    if (this.state !== ConferenceState.Connected) {
      throw new Error(
        `Cannot ${request} participant. Conference participant ${request} not allowed from state ${this.state}`
      );
    }

    if (this.members.length === 0) {
      throw new Error(`Cannot ${request} all from empty conference`);
    }

    if (!confParticipant) {
      throw new Error(`Cannot ${request} participant from empty conference`);
    }

    try {
      this.callStateUpdateSuspended = true;
      const initCall = this.members[0].call;
      const { localChannel } = initCall.callHeader;
      const remoteChannel = confParticipant.astChannel;
      const { confDN } = confParticipant;
      await initCall.webNode.muteParticipant(remoteChannel, localChannel, confDN, { mute });
    } finally {
      this.callStateUpdateSuspended = false;
      this.updateState();
    }
  }

  // -----
  // Private helpers
  // -----

  private addMember(member: ConferenceMember) {
    if (!this.members.find((mem) => mem.call.webCallId === member.call.webCallId)) {
      this.members.push(member);
      // eslint-disable-next-line no-param-reassign
      member.call.webConf = this;
    }
  }

  private removeMember(callId: number) {
    this.members.forEach((mem) => {
      if (mem.call.webCallId === callId) {
        // eslint-disable-next-line no-param-reassign
        mem.call.webConf = null;
      }
    });
    this.members = this.members.filter((mem) => mem.call.webCallId !== callId);
  }

  private removeAllMembers() {
    this.members.forEach((mem) => {
      // eslint-disable-next-line no-param-reassign
      mem.call.webConf = null;
    });
    this.members = [];
  }

  private setConsultCall(call: WebCall) {
    this.consultCall = call;
    this.consultCall.webConf = this;
  }

  private clearConsultCall() {
    if (this.consultCall) {
      this.consultCall.webConf = null;
      this.consultCall = null;
    }
  }

  private async _hold(): Promise<void> {
    const { call } = this.members[0];

    // Check unsupervised transfer blocked
    const index = this.getConsulCallNotConnectedMemberIndex();
    if (index >= 0 && this.members[index].call.isUnsupervisedTxfrBlocked()) {
      diag.warn?.(
        '_hold',
        // eslint-disable-next-line max-len
        `ConferenceId <${this.confId}> ConsultCall <${this.members[index].call.webCallId}> isn't connected, and unsupervised transfers are blocked: cancel conference and hold original call`
      );
      this.cancel();
    }

    await call.hold({
      confHold: true,
      connectedLineType: call.webLine?.lineType.toString(),
      lastDialedRoute: call.callHeader.route,
    });
    if (CallState.hold(call.state)) {
      // put all other calls on hold
      this.members.forEach((mem) => {
        if (mem.call !== call) {
          // eslint-disable-next-line no-param-reassign
          mem.call.callHeader.localChannel = call.callHeader.localChannel;
          mem.call.setCallState(CallState.IHold);
        }
      });
    }
  }

  private async _unhold() {
    const { call } = this.members[0];
    await call.unhold();
    if (CallState.connected(call.state)) {
      // put all other calls connected
      this.members.forEach((mem) => {
        if (mem.call !== call) {
          // eslint-disable-next-line no-param-reassign
          mem.call.callHeader.localChannel = call.callHeader.localChannel;
          if (!(mem.memberType === ConferenceMemberType.ConsultCall && mem.call.state === CallState.Proceeding)) {
            mem.call.setCallState(CallState.Connected);
          }
        }
      });
    }
  }

  private hasCongestedConsultMembers(): boolean {
    return !!this.members.find(
      (mem) =>
        mem.memberType === ConferenceMemberType.ConsultCall && mem.call.congestionState !== CongestionState.NotCongested
    );
  }

  private postDropMemberCleanup() {
    this.members.forEach((mem) => {
      if (mem.call.state === CallState.Finished) {
        return;
      }

      if (mem.memberType === ConferenceMemberType.InitialCall && mem.call.isSharedlineCall()) {
        const line = this.lineDev.getLineByTrunkAddress(mem.call.infoRec.trunkAddress);
        if (line) {
          mem.call.changeLine(line);
        } else {
          mem.call.finishCall();
        }
      } else {
        mem.call.finishCall();
      }
    });
  }

  private postTransferMemberCleanup() {
    if (this.consultCall) {
      this.consultCall.finishCall();
      this.clearConsultCall();
    }

    // the remaining cleanup is same as Drop
    this.postDropMemberCleanup();
  }

  private setState(newState: ConferenceState) {
    const oldState = this.state;
    this.state = newState;
    this.report(new ConfStateUpdate(this, oldState, newState));
    if (newState === ConferenceState.Finished) {
      if (this.vccConf && this.ownerDevice === this.lineDev.device) {
        this.node.conferenceRelease(this.vccConf, this.lineDev.device);
      }
      ActiveConferences.remove(this);
    }
  }

  private async transferPendingConference(): Promise<void> {
    const { consultCall } = this;

    if (!consultCall) {
      throw new Error('Unable to transfer to consultation call . No active consultation call');
    }
    if (!CallState.connected(consultCall.state)) {
      throw new Error(`Unable to transfer to consultation call in state <${consultCall.state}>`);
    }
    if (consultCall.congestionState !== CongestionState.NotCongested) {
      throw new Error(`Unable to transfer to consultation call in congestionOnDestination state`);
    }
    if (this.hasCongestedConsultMembers()) {
      throw new Error(`Unable to transfer. One or more consultation calls in congestionOnDestination state`);
    }
    if (this.members.length === 0) {
      throw new Error('Unable to transfer to consultation call. No conference members remaining');
    }

    // Check unsupervised transfer blocked
    if (consultCall.isUnsupervisedTxfrBlocked() && consultCall.state !== CallState.Connected) {
      throw new Error(
        `ConferenceId <${this.confId}> ConsultCall <${consultCall.webCallId}> isn't connected and unsupervised transfers are blocked: can't transfer`
      );
    }

    try {
      this.callStateUpdateSuspended = true;

      const fromCall = this.members[0].call;
      const node = fromCall.webNode;

      try {
        try {
          // transfer consultation call to conference
          await node.conferenceJoin(
            fromCall.callHeader.remoteChannel,
            consultCall.callHeader.remoteChannel,
            this.lineDev.device
          );

          if (fromCall.sipId) {
            // we are still connected to the call, drop it
            try {
              if (CallState.hold(fromCall.state)) {
                await fromCall.unhold(); // put us back into connected state so we can drop the call
              }
              await fromCall.drop();
            } catch (e) {
              // just absorb this error
            }
          }

          this.postTransferMemberCleanup();
        } catch (e) {
          // join failed. Clean up the consultation call
          ConfUtil.hangupConsultCall(consultCall);
          consultCall.finishCall();
          this.clearConsultCall();
          throw e;
        }
      } finally {
        await node.conferenceUnlock(this.vccConf, this.lineDev.device, { cleanup: true });
      }
    } finally {
      this.callStateUpdateSuspended = false;
      this.updateState();
    }
  }

  private async transferConference(): Promise<void> {
    if (this.hasCongestedConsultMembers()) {
      throw new Error(`Unable to transfer. One or more consultation calls in congestionOnDestination state`);
    }

    try {
      this.callStateUpdateSuspended = true;

      if (this.state === ConferenceState.Hold) {
        await this.unhold();
      }

      if (this.state === ConferenceState.Connected) {
        // Check unsupervised transfer blocked
        const index = this.getConsulCallNotConnectedMemberIndex();
        if (index >= 0 && this.members[index].call.isUnsupervisedTxfrBlocked()) {
          throw new Error(
            `ConferenceId <${this.confId}> ConsultCall <${this.members[index].call.webCallId}> unsupervised transfers are blocked: can't transfer`
          );
        }

        await this.drop();

        this.postDropMemberCleanup();
      } else {
        throw new Error(`Unable to transfer conference. Operation not allowed from Conference state ${this.state}`);
      }
    } finally {
      this.callStateUpdateSuspended = false;
      this.updateState();
    }
  }

  private updateState() {
    const oldState = this.state;
    let newState = oldState;

    // remove members that are no longer in a state that allows them to be in conferenece
    this.members = this.members.filter((mem) => {
      const { call } = mem;
      if (call.state === CallState.Finished || call.state === CallState.Abandoned || call.state === CallState.Busy) {
        call.webConf = null;
        return false;
      }
      return true;
    });

    if (this.members.length === 0) {
      newState = ConferenceState.Finished;
    } else if (this.members.length === 1 && !this.consultCall && this.participantsMap.size <= 2) {
      let isAllInternalParticipants = true;
      const lastMember = this.members[0];
      lastMember.call.webConf = null;
      this.members = [];
      newState = ConferenceState.Finished;
      diag.trace?.(
        'updateState',
        // eslint-disable-next-line max-len
        `--- turned to be single conference to be destoryed. webcall Id:<${lastMember.call.webCallId}> state:<${lastMember.call.state}>; conference id:<${this.confId}> state:<${newState}>`
      );

      for (const [, participant] of this.participantsMap) {
        isAllInternalParticipants =
          isAllInternalParticipants &&
          Boolean(participant.astChannel?.includes('SIP/2') || participant.astChannel?.includes('SIP/3'));
      }
      if (isAllInternalParticipants) {
        if (lastMember.call.isTrunkCall()) {
          diag.out('updateState', 'Two participants or less in single base call conference and allInternal.');
          const line = lastMember.call.webLine?.lineDev.getFreeIntercomLine();
          if (line) {
            lastMember.call.changeLine(line);
            lastMember.call.setCallState(lastMember.call.state);
            lastMember.call.interComCall = true;
          }
        }
      }
    } else {
      let numHold = 0;
      let numProceeding = 0;
      let numConnected = 0;
      this.members.forEach((mem) => {
        if (CallState.hold(mem.call.state)) {
          numHold += 1;
        } else if (mem.call.state === CallState.Proceeding) {
          numProceeding += 1;
        } else if (CallState.connected(mem.call.state)) {
          numConnected += 1;
        }
      });

      if (numHold > 0) {
        newState = this.consultCall ? ConferenceState.HoldPendingConference : ConferenceState.Hold;
      } else if ((numConnected >= 1 && (this.participantsMap.size > 2 || numProceeding >= 1)) || numConnected >= 2) {
        // either single conference or non-single conference
        newState = ConferenceState.Connected;
      } else {
        newState = ConferenceState.Idle;
      }
    }

    if (newState !== oldState) {
      this.setState(newState);
    }

    return this.state;
  }

  async updateParticipantsMap(confInfo: ConfInfo): Promise<Boolean> {
    for (let mem of this.members) {
      diag.trace?.(
        'updateParticipantsMap',
        `members: webCallId: <${mem.call.webCallId}> with type <${mem.memberType}>" in conference <${this.vccConf}>`
      );
    }
    if (!confInfo.participantsMap) return Promise.resolve(false);

    /* Call patch conference in setup may produce ConfInfo User Event for the channel that is exiting its own meetme to enter the conference
     * original call meetme. We need to discard those events in order to avoid destroying the call patch in setup.
     */
    if (
      this.members.length &&
      this.members.some((mem) => mem.memberType === ConferenceMemberType.PatchCall) &&
      confInfo.param.confDN
    ) {
      if (
        (this.members[0].call.isSharedlineCall() || this.members[0].call.isSIPCall()) &&
        this.vccConf !== confInfo.param.confDN
      ) {
        diag.out(
          'updateParticipantsMap',
          `Participant update for <${confInfo.param.confDN}>" not associated with the call patch conference; ignore`
        );
        return Promise.resolve(false);
      }
    }

    const confInitialCallMember = this.members.find((mem) => mem.memberType === ConferenceMemberType.InitialCall);
    if (!confInitialCallMember) {
      const err = `Could not find initial call member in conference: confId<${this.confId}, systemConfId<${this.systemConfId}>`;
      throw new Error(err);
    }

    this.systemConfId = confInfo.param.confId || '';

    // Check if participant added and participant already in the list
    for (let [participantId, participant] of confInfo.participantsMap) {
      const foundPart = this.participantsMap.get(participantId);
      if (!foundPart) {
        this.participantsMap.set(participantId, participant);
        this.report(new ParticipantAdded(participant, this as WebConferenceImpl));
        diag.out('updateParticipantMap', `Participant Added : ${participantId}`);
      } else {
        this.participantsMap.set(participantId, participant);
        this.report(new ParticipantUpdated(participant, this as WebConferenceImpl));
        diag.out('updateParticipantMap', `Participant updated : ${participantId}, status: ${participant.status}`);
      }
    }

    // Check if participant have been removed
    for (let [participantId, participant] of this.participantsMap) {
      if (!confInfo.participantsMap.get(participantId)) {
        //participant removed
        this.participantsMap.delete(participantId);
        this.report(new ParticipantRemoved(participant, this as WebConferenceImpl));
        diag.out('updateParticipantMap', `Participant removed: ${participantId}`);

        const removedChannel = participantId;
        if (participant.call && !participant.call.isSharedlineCall()) {
          // Is there need to set callRemovedOnNonSLMM flag in the call for it to be revoved ?
          // On SCE, the flag is used to remove the call when processing Hangup userevent. It may no longer a case in SaaS telephony
          // Comment here to tell the situation in case of needs.
        }
      }
    }

    this.updateState();
    return Promise.resolve(true);
  }

  private getConsulCallNotConnectedMemberIndex(): number {
    return this.members.findIndex(
      (mem) => mem.memberType === ConferenceMemberType.ConsultCall && mem.call.state !== CallState.Connected
    );
  }
}

export default WebConferenceImpl;
