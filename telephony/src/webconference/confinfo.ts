import { WebCall } from '../webcall/webcall';
import { Diag } from '../common/diagClient';
import { WebNode } from '../weblinedev/webnode';
import { ActiveCalls } from '../webcall/activecalls';
import { CallOp } from '../webcall/callop';
import { ActiveConferences } from './activeConferences';
import { WebConferenceImpl } from './webconference';
import { ConferenceState } from './conferenceTypes';

const moduleName = 'confinfo';
const diag = new Diag(moduleName);

export enum ParticipantType {
  Internal = 'Internal',
  External = 'External',
}

export enum Status { // Status based on RFC 4575
  status_not_set = 'status_not_set',
  connected = 'connected',
  disconnected = 'disconnected',
  on_hold = 'on_hold',
  pending = 'pending',
  alerting = 'alerting',
  dialing_in = 'dialing_in',
  dialing_out = 'dialing_out',
  disconnecting = 'disconnecting',
}

export enum JoiningMethod { // Joining Method (direction) based on RFC 4575, !!! Initial values have to be using 'dash' to match what are in UserEvent
  joining_method_not_set = 'joining_method_not_set',
  dialed_in = 'dialed-in',
  dialed_out = 'dialed-out',
  focus_owner = 'focus-owner',
}

interface DynType {
  [name: string]: string;
}

interface DataTree {
  name?: string;
  value?: string;
  attributes?: AllAttributes;
  childNodes?: Array<DataTree>;
}

export interface Endpoint {
  name: string;
  attributes?: AllAttributes;
  status?: Status;
  joiningMethod?: JoiningMethod;
  joiningInfoWhen?: string;
}

export interface AllAttributes {
  xmlns?: string;
  entity?: string;
  state?: string;
  xastchannel?: string;
  xtype?: string;
}

export interface User {
  name?: string;
  attributes?: AllAttributes;
  displayText?: string;
  endpoint?: Endpoint;
  muted?: string;
  deafen?: string;
  uci?: string;
  trunknumber?: string;
  posdn?: string;
  observing?: string;
  cssid?: string;
  coruxowner?: string;
}

export interface ConfInfoParam {
  chan: string;
  uci: string;
  confDN: string;
  confId: string;
  confOwner: string;
  seqNum: number;
}

export interface ConfInfo {
  node: WebNode;
  attributes?: AllAttributes;
  param: ConfInfoParam;
  participantsMap?: Map<string, Participant>;
  users: Array<User>;
}

export class ParticipantAdded extends Event {
  added: Participant;
  conf: WebConferenceImpl;
  constructor(newParticipant: Participant, conf: WebConferenceImpl) {
    super('ParticipantAdded');
    this.added = newParticipant;
    this.conf = conf;
  }
}

export class ParticipantUpdated extends Event {
  updated: Participant;
  conf: WebConferenceImpl;
  constructor(newParticipant: Participant, conf: WebConferenceImpl) {
    super('ParticipantUpdated');
    this.updated = newParticipant;
    this.conf = conf;
  }
}

export class ParticipantRemoved extends Event {
  removed: Participant;
  conf: WebConferenceImpl;
  constructor(newParticipant: Participant, conf: WebConferenceImpl) {
    super('ParticipantRemoved');
    this.removed = newParticipant;
    this.conf = conf;
  }
}

export class Participant {
  type: ParticipantType = ParticipantType.Internal;
  status: Status = Status.status_not_set;
  participantId: string = '';
  participantName: string = '';
  participantDN: string = '';
  ucid: string = '';
  joiningInfoWhen: string = '';
  joiningMethod: JoiningMethod = JoiningMethod.joining_method_not_set;
  trunkAddr: string = '';
  telephoneNumber: string = '';
  astChannel: string = '';
  confDN: string = '';
  isMuted: boolean = false;
  isDeafened: boolean = false;
  call?: WebCall;
  self: Participant;
  constructor() {
    this.self = this;
  }
  equal(that: Participant) {
    return this.self === that;
  }
}

const confInfoSeqNumMap: Map<WebNode, number> = new Map(); // node, seqNum
const confInfos: Map<string, ConfInfo[]> = new Map(); // confDn, confInfo[]
export class ConfInfo {}
export declare namespace ConfInfo {
  function getSeq(node: WebNode): number;
  function storeLastSeq(node: WebNode, seq: number): void;
  function toJSON(ele: Element): object;
  function xmlToJSON(xml: string): DataTree | undefined;
  function jsonToUsers(jsonData: any, user?: User): Array<User>;
  function updateParticipants(node: WebNode, param: ConfInfoParam, users: Array<User>, confInfo: ConfInfo): void;
  export function constructConfInfo(node: WebNode, xml: string, param: ConfInfoParam): ConfInfo;
  export function process(node: WebNode, confDn: string, call?: WebCall): Promise<void>;
  export function seqNumValidation(node: WebNode, seqNum: number): boolean;
  export function updateConfInfos(node: WebNode, confInfo: ConfInfo): void;
  export function getParticipantByCall(call: WebCall): User;
  export function getConfInfo(node: WebNode, confDn: string): ConfInfo | undefined;
}

async function delayProcessConfInfo(obj: any): Promise<void> {
  // pause a bit until other callOp completes
  let target: EventTarget;
  if (obj instanceof WebCall) {
    target = obj;
  } else if (obj instanceof WebConferenceImpl) {
    target = obj.eventTarget;
  } else {
    throw new Error(`The object ${JSON.stringify(obj)} Not suported`);
  }

  if (!CallOp.inProgress(obj)) {
    return Promise.resolve();
  }

  diag.out('delayProcessConfInfo', `The callOp ${CallOp.inProgress(obj)} is in progress`);
  let goAhead: any;
  try {
    return await new Promise((resolve, reject) => {
      const timeout = 5000;
      const timer = window.setTimeout(reject, timeout, new Error('delayed'));
      goAhead = () => {
        window.clearTimeout(timer);
        resolve();
      };
      target.addEventListener('CallOpDoneNotif', goAhead as EventListener);
    });
  } catch (e) {
    diag.warn(
      'delayProcessConfInfo',
      `The callOp is ${CallOp.inProgress(obj)} too long. Give up creating conference from confInfo event`
    );
    if (e instanceof Error) throw e;
    else throw new Error(`${JSON.stringify(e)}`);
  } finally {
    target.removeEventListener('CallOpDoneNotif', goAhead);
  }
}

ConfInfo.getConfInfo = function getConfInfo(node: WebNode, confDn: string): ConfInfo | undefined {
  return confInfos.get(confDn)?.find((info) => info.node === node);
};

ConfInfo.process = async function process(node: WebNode, confDn: string, call?: WebCall): Promise<void> {
  const confInfo = this.getConfInfo(node, confDn);
  let firstFoundTrunk: boolean = false;
  let telephoneNumber: string = '';
  if (!confInfo || !confInfo.participantsMap || confInfo.participantsMap.size === 0) {
    throw new Error(`Could not find proper confInfo associate with node: ${node.nodeCfgEx.name}`);
  } else if (confInfo.param.confId) {
    for (let [, participant] of confInfo.participantsMap) {
      if (participant.astChannel?.includes('SIP/SIP') && !firstFoundTrunk) {
        firstFoundTrunk = true;
        telephoneNumber = participant.telephoneNumber;
      }
      const c = participant.call as WebCall;
      if (c && c.sipId) {
        // any one of call has Sip call leg has reference to the same webConf as long as the web conference has been created
        call = c;
        break;
      }
    }
  }

  if (!call) throw new Error(`Could not locate a call from confInfo participants node: ${node.nodeCfgEx.name}`);

  /**
   * This will fix PWEB-1095 and PWEB-1094 to update caller ID for
   * pure SIP calls
   */
  if (call && confInfo.participantsMap.size > 0) {
    for (let [, participant] of confInfo.participantsMap) {
      if (participant.astChannel?.includes('SIP/SIP') && !firstFoundTrunk) {
        firstFoundTrunk = true;
        telephoneNumber = participant.telephoneNumber;
        break;
      }
    }
    if (firstFoundTrunk) call.updateSipTrunkPhoneNumber(telephoneNumber);
  }

  if (!call.webConf && confInfo.participantsMap.size <= 2) {
    // We don't have a conference created, and there are less then 2 participants in the confInfo events. Nothing to do
    diag.out(
      'process',
      `We don't have a conference created, and there are less then 2 participants (local and remote channel) in confInfo. Nothing to do`
    );
    confInfos.delete(confDn);
  } else if (!call.webConf) {
    // No conference yet and more than 2 participants. Must create it.
    if (
      CallOp.inProgress(call) === CallOp.Answer ||
      CallOp.inProgress(call) === CallOp.Barge ||
      CallOp.inProgress(call) === CallOp.Unhold ||
      CallOp.inProgress(call) === CallOp.ConfConnect ||
      CallOp.inProgress(call) === CallOp.ConfPatch
    ) {
      diag.trace?.(
        'process',
        `No conference exists for ucid : ${confInfo.param.uci} . But call is currently connecting. Postponed the processing after the connection is completed`
      );
      try {
        await delayProcessConfInfo(call);
      } catch (e) {
        diag.warn('process', `No conference exists. Caught ${JSON.stringify(e)}. Ignore confInfo event!!!!`);
        if (e instanceof Error) throw e;
        else throw new Error(`${JSON.stringify(e)}`);
      }
    }
    // check conference object in case of its creation was just done by other Op after postpone.
    if (!call.webConf) {
      diag.out('process', `No conference exists for ucid : ${confInfo.param.uci} .  Creating one.`);
      try {
        CallOp.start(call, CallOp.ConfInfoCreatingConf);
        // check if the call is already in a conference
        const activeConf = ActiveConferences.find((conf) =>
          conf.members.find((mem) => mem.call.webCallId === call?.webCallId)
        );

        if (activeConf) {
          throw new Error('fromCall is already part of a conference');
        }
        if (!call.webLine) throw new Error(`invalid webCall object without webLine`);

        const conf = new WebConferenceImpl(call.webLine.lineDev, call);
        conf.state = ConferenceState.Connected;
        conf.ownerDevice = call.webLine.lineDev.device;
        conf.systemConfId = confInfo.param.confId || '';
        ActiveConferences.add(conf);
        call.webConf = conf;
      } catch (e) {
        diag.warn('process', `failed to create conference: ${JSON.stringify(e)}`);
      } finally {
        CallOp.end(call);
      }
    }
  }

  // Now we update participants in webConf
  if (call.webConf) {
    diag.trace?.('process', `Conference exists associates with call webCallId $${call.webCallId}`);
    try {
      if (
        CallOp.inProgress(call.webConf) === CallOp.ConfCreatingNoholdConsultation ||
        CallOp.inProgress(call.webConf) === CallOp.ConfCreatingNormalConsultation
      ) {
        await delayProcessConfInfo(call.webConf);
      }

      if (CallOp.inProgress(call) === CallOp.ConfConnect || CallOp.inProgress(call) === CallOp.ConfPatch) {
        await delayProcessConfInfo(call);
      }
    } catch (e) {
      diag.warn('process', `Conference exists. Caught $${JSON.stringify(e)} ignore confInfo event!!!!`);
      if (e instanceof Error) throw e;
      else throw new Error(`${JSON.stringify(e)}`);
    }

    const updated = await call.webConf.updateParticipantsMap(confInfo);

    if (!call.webConf || !updated) {
      // if the conference is destroyed after updateState in updateParticipantsMap. Delete the confInfo accordingly.
      confInfos.delete(confInfo.param.confDN);
      diag.out('process', `confInfo for conference Dn $${confInfo.param.confDN} is cleaned-up`);
    }
  }
};

ConfInfo.seqNumValidation = function seqNumValidation(node: WebNode, seqNum: number): boolean {
  const valid = !!seqNum && (seqNum > this.getSeq(node) || this.getSeq(node) - seqNum > 10);
  if (valid) {
    if (this.getSeq(node) - seqNum > 10) {
      diag.warn(
        'seqNumValidation',
        `ConfInfo with seqNum (${seqNum}) should be ignored, but will be processed since the difference with last Processed SeqNum <${this.getSeq(
          node
        )}> is greater than 10`
      );
    }
  }
  return valid;
};

ConfInfo.getSeq = function getSeq(node: WebNode): number {
  const seqNum = confInfoSeqNumMap.get(node);
  return seqNum || 0;
};

ConfInfo.storeLastSeq = function storeLastSeq(node: WebNode, seq: number): void {
  confInfoSeqNumMap.set(node, seq);
};

ConfInfo.constructConfInfo = function constructConfInfo(node: WebNode, xml: string, param: ConfInfoParam): ConfInfo {
  const usersNameSpace = 'urn:ietf:params:xml:ns:conference-info';
  let jsonData;
  let users: User[] = [];
  try {
    jsonData = this.xmlToJSON(xml);
    if (jsonData) users = this.jsonToUsers(jsonData);
  } catch (e) {
    if (e instanceof Error) throw e;
    else throw new Error(`${JSON.stringify(e)}`);
  }

  if (!users.length) throw new Error(`failed to retrieve user data from confInfo event`);

  diag.trace?.('constructConfInfo', `Json data users: ${JSON.stringify(users)}`);

  const confInfo: ConfInfo = { node, attributes: jsonData?.attributes, param, users };

  diag.out('constructConfInfo', `Received ConfInfo with UsersNameSpace ${confInfo.attributes?.xmlns}`);

  if (usersNameSpace !== confInfo.attributes?.xmlns) confInfo.attributes = undefined; // ???

  this.storeLastSeq(node, param.seqNum);
  this.updateParticipants(node, param, users, confInfo);

  return confInfo;
};

ConfInfo.updateParticipants = function updateParticipants(
  node: WebNode,
  param: ConfInfoParam,
  users: Array<User>,
  confInfo: ConfInfo
) {
  if (users.length) {
    for (let user of users) {
      const astChannel = user.attributes?.xastchannel;
      let call;
      if (astChannel) {
        call = ActiveCalls.findByLocalChannel(astChannel);
        if (!call) {
          call = ActiveCalls.findByRemoteChannel(astChannel);
        }
      }

      const participantId = user.attributes?.entity;
      if (user.observing === 'yes') continue;
      const participantName = user.displayText;
      // If coruxowner does not match position DN, ignore this participant.
      // This allow seeing consultation call before it gets added in the conference only on the machine that performs the consultation
      const coruxowner = user.coruxowner;
      if (coruxowner && coruxowner !== node.lineDev.device) {
        diag.trace?.(
          'updateParticipants',
          `Filtering participan -> ID: ${participantId}   Name: ${participantName}  coruxowner: ${user.coruxowner}`
        );
        continue;
      }

      const telephoneNumber = user.endpoint?.attributes?.entity;
      const participantStatus = user.endpoint?.status as Status;
      const joiningInfoWhen = user.endpoint?.joiningInfoWhen;
      const joiningMethod = user.endpoint?.joiningMethod as JoiningMethod;
      const participantDN = user.posdn;
      const participantUCI = user.uci;
      const participantTrunkNumber = user.trunknumber;
      const participantMuteState = user.muted;
      const participantDeafenState = user.deafen;
      let participantType = user.attributes?.xtype as ParticipantType;
      if (!participantType) {
        participantType = call ? ParticipantType.Internal : ParticipantType.External;
      }

      let confParticipant = new Participant();
      confParticipant.call = call;
      confParticipant.participantId = participantId || '';
      confParticipant.participantName = participantName || '';
      confParticipant.status = participantStatus;
      confParticipant.type = participantType;
      confParticipant.participantDN = participantDN || '';
      confParticipant.ucid = participantUCI || '';
      confParticipant.joiningInfoWhen = joiningInfoWhen || '';
      confParticipant.joiningMethod = joiningMethod;
      confParticipant.astChannel = astChannel || '';
      confParticipant.confDN = param.confDN || '';
      confParticipant.trunkAddr = participantTrunkNumber || '';
      confParticipant.telephoneNumber = telephoneNumber || '';
      confParticipant.isMuted = Boolean(participantMuteState && participantMuteState === 'yes');
      confParticipant.isDeafened = Boolean(participantDeafenState && participantDeafenState === 'yes');

      if (!confInfo.participantsMap) {
        confInfo.participantsMap = new Map();
      }
      if (participantId) confInfo.participantsMap.set(participantId, confParticipant);

      diag.out(
        'updateParticipants',
        `Particpant -> ID ${confParticipant.participantId}   Name: ${confParticipant.participantName}   Status: ${confParticipant.status}   Type: ${confParticipant.type}   DN: ${confParticipant.participantDN}   UCID: ${confParticipant.ucid}   when: ${confParticipant.joiningInfoWhen}   trunkAddr: ${confParticipant.trunkAddr}`
      );

      const infoTrace = `           -> IsMuted: ${participantMuteState} IsDeafened: ${participantDeafenState}  astChannel: ${astChannel} - joiningMethod: ${joiningMethod} - TelephoneNumber: ${telephoneNumber} - coruxowner: ${coruxowner}`;
      if (confParticipant.call) {
        diag.out('updateParticipants', `${infoTrace} - WebcallID: ${confParticipant.call.webCallId}`);
      } else {
        diag.out('updateParticipants', `${infoTrace} - No WebCall associated`);
      }
    }
  }
};

ConfInfo.jsonToUsers = function jsonToUsers(jsonData: any, user?: User): Array<User> {
  const data = jsonData as DataTree;
  const users = [];
  if (data.childNodes?.length) {
    for (let i = 0; i < data.childNodes.length; i++) {
      const child = data.childNodes[i] as DataTree;
      if (!user)
        user = {
          name: child.name,
        };
      // There's childNotes within child. Invoke the function recursively.
      if (child.name === 'user') {
        user.attributes = child.attributes;
        this.jsonToUsers(child, user);
        diag.out('jsonToUsers', `user data: ${JSON.stringify(user)}`);
        users.push(user);
        user = undefined;
        continue;
      } else if (child.name === 'endpoint') {
        user.endpoint = { name: child.name };
        user.endpoint.attributes = child.attributes;
        this.jsonToUsers(child, user);
      } else if (child.name === 'joining-info') {
        this.jsonToUsers(child, user);
      }

      // there's no childNotes within child. Need to go through always
      if (!child.value || !child.name) continue;
      if (child.name === 'when') {
        if (user.endpoint) user.endpoint.joiningInfoWhen = child.value;
      } else if (child.name === 'status') {
        if (user.endpoint) user.endpoint.status = child.value as Status;
      } else if (child.name === 'joining-method') {
        if (user.endpoint) user.endpoint.joiningMethod = child.value as JoiningMethod;
      } else if (child.name === 'display-text') {
        user.displayText = child.value;
      } else if (child.name === 'muted') {
        user.muted = child.value;
      } else if (child.name === 'deafen') {
        user.deafen = child.value;
      } else if (child.name === 'uci') {
        user.uci = child.value;
      } else if (child.name === 'trunknumber') {
        user.trunknumber = child.value;
      } else if (child.name === 'observing') {
        user.observing = child.value;
      } else if (child.name === 'posdn') {
        user.posdn = child.value;
      } else if (child.name === 'cssid') {
        user.cssid = child.value;
      } else if (child.name === 'coruxowner') {
        user.cssid = child.value;
      } else {
        diag.warn('jsonToUsers', `!!! ${child.name} is not processed yet !!!`);
      }
    }
  }
  return users;
};

ConfInfo.xmlToJSON = function xmlToJSON(xml: string): DataTree | undefined {
  let jsonObj;
  const xmlParser = new DOMParser();
  try {
    const xmlDoc = xmlParser.parseFromString(xml, 'application/xml');
    const usersCollection = xmlDoc.getElementsByTagName('users');
    if (usersCollection.length > 0) {
      jsonObj = this.toJSON(usersCollection[0]);
    }
    diag.out('xmlToJSON', `jsonDataTree: ${JSON.stringify(jsonObj)}`);
  } catch (e) {
    throw new Error(`unable to load participants ${JSON.stringify(e)}`);
  }
  return jsonObj;
};

ConfInfo.toJSON = function toJSON(node: Element): any {
  let name;
  if (node.tagName) name = node.tagName.toLowerCase();
  else if (node.nodeName) name = node.nodeName;

  const json: DataTree = {
    name,
  };

  if (node.tagName) json.name = node.tagName.toLowerCase();
  else if (node.nodeName) json.name = node.nodeName;

  if (node.nodeValue) {
    json.value = node.nodeValue;
  } else if (node.childElementCount === 0 && node.textContent) {
    json.value = node.textContent;
  }

  const attrs = node.attributes;
  if (attrs) {
    const attr: DynType = { placeHolder: '' };
    for (let i = 0; i < attrs.length; i++) {
      const attrName = attrs[i].nodeName;
      const { value } = attrs[i];
      if (attrName) attr[attrName] = value;
    }
    if (Object.keys(attr).length > 1) {
      const key = 'placeHolder';
      delete attr[key];
      json.attributes = attr;
    }
  }

  const { childNodes } = node;
  if (node.childElementCount !== 0 && childNodes && childNodes.length) {
    json.childNodes = [];
    for (let i = 0; i < childNodes.length; i++) {
      const child = toJSON(childNodes[i] as Element);
      if (child) json.childNodes.push(child);
    }
  }
  return json;
};

ConfInfo.updateConfInfos = function updateConfInfos(node: WebNode, confInfo: ConfInfo): void {
  const found = this.getConfInfo(node, confInfo.param.confDN);
  const confInfoArray = confInfos.get(confInfo.param.confDN);
  if (confInfoArray) {
    const removed = confInfoArray.splice(found ? confInfoArray.indexOf(found) : 0, found ? 1 : 0, confInfo);
    if (removed.length) {
      diag.out(
        'updateConfInfos',
        `confInfo is replaced with confInfo DN: ${confInfo.param.confDN} and node: ${confInfo.node.nodeCfgEx.name}`
      );
    } else {
      diag.out(
        'updateConfInfos',
        `confInfo is added with confInfo DN: ${confInfo.param.confDN} and node: ${confInfo.node.nodeCfgEx.name}`
      );
    }
  } else {
    // add
    const newConfInfos = [];
    newConfInfos.push(confInfo);
    confInfos.set(confInfo.param.confDN, newConfInfos);
    diag.out(
      'updateConfInfos',
      `confInfo is initially added with confInfo DN: ${confInfo.param.confDN} and node: ${confInfo.node.nodeCfgEx.name}`
    );
  }
};

export default ConfInfo;
