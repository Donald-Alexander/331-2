import { CallState } from '../webcall/callState';
import { WebCall } from '../webcall/webcall';
import { ActiveConferences } from './activeConferences';
import { WebConferenceImpl } from './webconference';
import { ConferenceConsultType, ConferenceState, WebConference } from './conferenceTypes';
import { callsAreCompatible, canJoinConference, chooseCallPatchAnchor, prepareDialAddrs } from './conferenceUtil';
import { DialingPrefix } from '../telephonyexternalinterfacedef';
import { Diag } from '../common/diagClient';
import { CallOp } from '../webcall/callop';

const moduleName = 'webconference';
const diag = new Diag(moduleName);

async function conferenceCreateNoHold(
  fromCall: WebCall,
  dialAddrs: Array<{ longdistance: boolean; tokens: string[] }>
): Promise<{ conference: WebConference; fromCall: WebCall; toCall: WebCall }> {
  if (!fromCall || !fromCall.webLine || !dialAddrs || dialAddrs.length === 0) {
    throw new Error(`invalid parameters to ${conferenceCreateNoHold.name}`);
  }

  if (fromCall.state !== CallState.Connected) {
    throw new Error('fromCall is not connected');
  }

  // check if fromCall is already in a conference
  const activeConf = ActiveConferences.find((conf) =>
    conf.members.find((mem) => mem.call.webCallId === fromCall.webCallId)
  );

  if (activeConf) {
    throw new Error('fromCall is already part of a conference');
  }

  const noholdConf = new WebConferenceImpl(fromCall.webLine.lineDev, fromCall);
  CallOp.start(noholdConf, CallOp.ConfCreatingNoholdConsultation);
  try {
    // invite NHC call leg to the meetme
    const toCall = await noholdConf.nhcInvite(dialAddrs);

    noholdConf.ownerDevice = fromCall.webLine.lineDev.device;
    noholdConf.state = ConferenceState.Connected;
    ActiveConferences.add(noholdConf);

    return { conference: noholdConf, fromCall, toCall };
  } catch (e) {
    if (fromCall.webConf === noholdConf) {
      // eslint-disable-next-line no-param-reassign
      fromCall.webConf = null;
    }
    throw e;
  } finally {
    CallOp.end(noholdConf);
  }
}

async function conferenceCreateNormal(
  fromCall: WebCall,
  dialAddrs: Array<{ longdistance: boolean; tokens: string[] }>
): Promise<{ conference: WebConference; fromCall: WebCall; toCall: WebCall }> {
  if (!fromCall || !fromCall.webLine || !dialAddrs || dialAddrs.length === 0) {
    throw new Error('invalid parameters to conferenceCreateNormal');
  }

  if (fromCall.state !== CallState.Connected) {
    throw new Error('fromCall is not connected');
  }

  // check if fromCall is already in a conference
  const activeConf = ActiveConferences.find((conf) =>
    conf.members.find((mem) => mem.call.webCallId === fromCall.webCallId)
  );

  if (activeConf) {
    throw new Error('fromCall is already part of a conference');
  }

  const conf = new WebConferenceImpl(fromCall.webLine.lineDev, fromCall);
  CallOp.start(conf, CallOp.ConfCreatingNormalConsultation);
  try {
    conf.state = ConferenceState.Connected;
    conf.ownerDevice = fromCall.webLine.lineDev.device;

    // create the consultation call
    const toCall = await conf.consultInvite(dialAddrs);

    ActiveConferences.add(conf);

    return { conference: conf, fromCall, toCall };
  } catch (e) {
    if (fromCall.webConf === conf) {
      // eslint-disable-next-line no-param-reassign
      fromCall.webConf = null;
    }
    throw e;
  } finally {
    CallOp.end(conf);
  }
}

export async function conferenceCreateConsult(
  fromCall: WebCall,
  destAddr: string,
  prefix: DialingPrefix | null,
  consultType: ConferenceConsultType
): Promise<{ conference: WebConference; toCall: WebCall }> {
  if (!CallState.connected(fromCall.state) || !fromCall.webLine) {
    throw new Error('Conference call must be in connected state to setup conference');
  }

  if (destAddr === fromCall.webLine.lineDev.device) {
    throw new Error('Conference to self not permitted');
  }

  if (!canJoinConference(fromCall)) {
    throw new Error('Call cannot participate in a conference');
  }

  // prepare the destination address and alternates
  const dialAddrs = prepareDialAddrs(fromCall, destAddr, prefix);

  switch (consultType) {
    case ConferenceConsultType.NoHold:
      return conferenceCreateNoHold(fromCall, dialAddrs);
    case ConferenceConsultType.Normal:
      return conferenceCreateNormal(fromCall, dialAddrs);
    default:
      throw new Error('Conference consult type not supported for setup conference operation');
  }
}

export async function conferenceCreateCallPatch(
  connectedCall: WebCall,
  heldCall: WebCall
): Promise<{ conference: WebConference; fromCall: WebCall; patchCall: WebCall }> {
  if (!connectedCall || !connectedCall.webLine || !heldCall || !heldCall.webLine) {
    diag.warn('conferenceCreateCallPatch', 'invalid parameters to conferenceCreateCallPatch');
    throw new Error('invalid parameters to conferenceCreateCallPatch');
  } else if (!(CallState.connected(connectedCall.state) && heldCall.state === CallState.IHold)) {
    diag.warn(
      'conferenceCreateCallPatch',
      'connectedCall must be Connected and heldCall in IHold to create conference by call patch'
    );
    throw new Error('connectedCall must be Connected and heldCall in IHold to create conference by call patch');
  }

  // check if either call is already in a conference
  if (
    ActiveConferences.find((conf) =>
      conf.members.find(
        (mem) => mem.call.webCallId === connectedCall.webCallId || mem.call.webCallId === heldCall.webCallId
      )
    )
  ) {
    diag.warn('conferenceCreateCallPatch', 'One or more calls already part of a conference');
    throw new Error('One or more calls already part of a conference');
  }

  // check that the calls can be put in conference together
  if (!canJoinConference(connectedCall) || !canJoinConference(heldCall)) {
    diag.trace?.('conferenceCreateCallPatch', 'One or more calls cannot participate in a conference');
    throw new Error('One or more calls cannot participate in a conference');
  } else if (!callsAreCompatible(connectedCall, heldCall)) {
    diag.trace?.('conferenceCreateCallPatch', 'The calls are not compatible for conferencing');
    throw new Error('The calls are not compatible for conferencing');
  }

  // determine which call will should anchor the conference
  const fromCall = chooseCallPatchAnchor(connectedCall, heldCall);
  const patchCall = fromCall === connectedCall ? heldCall : connectedCall;

  const conf = new WebConferenceImpl(connectedCall.webLine.lineDev, fromCall);

  try {
    conf.state = CallState.connected(fromCall.state) ? ConferenceState.Connected : ConferenceState.Hold;
    conf.ownerDevice = connectedCall.webLine.lineDev.device;

    // patch the other call
    await conf.patch(patchCall);

    if (conf.state === ConferenceState.Hold) {
      diag.trace?.('conferenceCreateCallPatch', 'conf state is hold, need to unhold');
      await conf.unhold();
    }

    // Assign confContextObjId of patched call to match fromCall.
    if (fromCall.confContextObjId) {
      patchCall.assignContextId(fromCall.confContextObjId);
    } else {
      patchCall.assignContextId(fromCall.contextObjId);
    }

    ActiveConferences.add(conf);

    return { conference: conf, fromCall, patchCall };
  } catch (e) {
    if (connectedCall.webConf === conf) {
      // eslint-disable-next-line no-param-reassign
      connectedCall.webConf = null;
    }
    if (heldCall.webConf === conf) {
      // eslint-disable-next-line no-param-reassign
      heldCall.webConf = null;
    }
    throw e;
  }
}

export default { conferenceCreateConsult, conferenceCreateCallPatch };
