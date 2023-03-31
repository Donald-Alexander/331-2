import { Line } from 'client-web-api/src/config/model/Line';
import { Node } from 'client-web-api/src/config/model/Node';
import * as ExtInterface from '../telephonyexternalinterfacedef';
import { webCfg } from './webcfg';

export interface ILineConfig {
  name: string;
  lineType: ExtInterface.LineType;
  rttMediaOutgoingCallsMode: ExtInterface.RttMediaOutgoingCallsMode;
  shareType: ExtInterface.LineSharedType;
  trunkType: ExtInterface.LineTrunkType;
  uri: string;

  isOneStepDialing: boolean;
  isT2TTransfer: boolean;
  isBeepInjection: boolean; // aka. RecordingTone
  isRingDown: boolean;
  isIncomingOnly: boolean;
  isAutoRecording: boolean;
  isTTYAutoDetection: boolean;
  isTTYGreetingMessage: boolean;

  npa: string;
  nxx: string;
  prefix: ExtInterface.DialingPrefix | null;
  hfPrefix: ExtInterface.DialingPrefix | null;

  midCallDialing: string;
  ringerPriority: number;

  preferredNode: string;
  alternateNodes: Array<string>;
}

export class LineConfig {
  private readonly _lineCfg: ILineConfig;
  private _extra: Line;

  constructor(line: Line) {
    const jsonObj: any = line.json; //TODO: we should access raw json data, not ILine
    this._extra = line;

    this._lineCfg = {
      name: jsonObj.Address || '',
      lineType: ExtInterface.LineType.LTUnknown,
      rttMediaOutgoingCallsMode: ExtInterface.RttMediaOutgoingCallsMode.RttMediaOutgoingCallsDisable,
      trunkType: ExtInterface.LineTrunkType.LTTUnknown,
      shareType: ExtInterface.LineSharedType.LSTUnknown,
      uri: jsonObj.URI || '',

      isOneStepDialing: jsonObj.OneStepDialing || false,
      isT2TTransfer: jsonObj.TrunkToTrunkTransfer || false,
      isBeepInjection: jsonObj.RecordingTone || false,
      isRingDown: jsonObj.Ringdown || false,
      isIncomingOnly: jsonObj.IncomingOnly || false,
      isAutoRecording: jsonObj.AutoRecording || false,
      isTTYAutoDetection: jsonObj.TTYAutoDetection || false,
      isTTYGreetingMessage: jsonObj.TTYGreetingsMessage || false,

      npa: jsonObj.Npa || '',
      nxx: jsonObj.Nxx || '',
      prefix: null,
      hfPrefix: null,

      midCallDialing: jsonObj.MidCallDialing || '',
      ringerPriority: jsonObj.RingerPriority || 0,

      preferredNode: '',
      alternateNodes: [],
    };

    this.fetchPrefixes(jsonObj);
    this.setLineType(jsonObj);
    this.setLineTrunkType(jsonObj);
    this.setLineSharedType(jsonObj);

    this.fetchPreferredNode(jsonObj.PrefferedNode);
    this.fetchAlternateNodes(jsonObj.AlternateNodes);

    this.fetchProfileAttributeOverride(line);

    if (this._lineCfg.name === '' || this._lineCfg.lineType === ExtInterface.LineType.LTUnknown) {
      throw new Error('Invalid Line configuration');
    }
  }

  // LineType
  private setLineType(jsonObj: any) {
    // Intercom = 0,    Acd = 1,    Other = 2,
    switch (jsonObj.LineType) {
      case 0:
        this._lineCfg.lineType = ExtInterface.LineType.LTIntercom;
        break;
      case 1:
        this._lineCfg.lineType = ExtInterface.LineType.LTACD;
        break;
      case 2:
        if (jsonObj.Address.match(/^911\d\d\d/i)) {
          this._lineCfg.lineType = ExtInterface.LineType.LT911;
        } else if (jsonObj.Address.match(/^SIP\d\d\d/i)) {
          this._lineCfg.lineType = ExtInterface.LineType.LTSIP;
        } else if (jsonObj.Address.match(/^AIM\d\d\d/i) || jsonObj.Address.match(/^ADM\d\d\d/i)) {
          this._lineCfg.lineType = ExtInterface.LineType.LTADM;
        }
        break;
      default:
        this._lineCfg.lineType = ExtInterface.LineType.LTUnknown;
    }
  }

  // LineTrunkType
  private setLineTrunkType(jsonObj: any) {
    if (jsonObj.Type === 'trunk911') {
      this._lineCfg.trunkType = ExtInterface.LineTrunkType.LTTCIM;
    } else if (jsonObj.Type === 'trunkAdmin') {
      this._lineCfg.trunkType = ExtInterface.LineTrunkType.LTTAIM;
    } else if (jsonObj.Type === 'lineAdminM1K') {
      this._lineCfg.trunkType = ExtInterface.LineTrunkType.LTTCAS;
    } else if (jsonObj.Type === 'line911SIP') {
      this._lineCfg.trunkType = ExtInterface.LineTrunkType.LTTNG911;
    } else {
      this._lineCfg.trunkType = ExtInterface.LineTrunkType.LTTUnknown;
    }
  }

  // LineSharedType
  private setLineSharedType(jsonObj: any) {
    if (jsonObj.SubType === 'Public') {
      this._lineCfg.shareType = ExtInterface.LineSharedType.LSTPublic;
    } else if (jsonObj.SubType === 'Private') {
      this._lineCfg.shareType = ExtInterface.LineSharedType.LSTPrivate;
    } else if (jsonObj.SubType === 'Shared') {
      this._lineCfg.shareType = ExtInterface.LineSharedType.LSTShared;
    } else if (jsonObj.SubType === 'AutoPrivacy') {
      this._lineCfg.shareType = ExtInterface.LineSharedType.LSTAutoPrivacy;
    } else {
      this._lineCfg.shareType = ExtInterface.LineSharedType.LSTUnknown;
    }
  }

  private fetchPreferredNode(objectId: number) {
    let node: Node = webCfg.configHandler.collectionNode.get(objectId);
    this._lineCfg.preferredNode = node.voipClusterName;
  }

  private fetchAlternateNodes(objectIds: Array<number>) {
    if (objectIds) {
      objectIds.forEach((objectId) => {
        let node: Node = webCfg.configHandler.collectionNode.get(objectId);
        this._lineCfg.alternateNodes.push(node.voipClusterName);
      });
    }
  }

  private fetchProfileAttributeOverride(line: Line) {
    this._lineCfg.isAutoRecording = webCfg.configHandler.collectionProfile.lines.autoRecording(line);
    this._lineCfg.isTTYAutoDetection = webCfg.configHandler.collectionProfile.lines.ttyAutoDetection(line);
    this._lineCfg.isTTYGreetingMessage = webCfg.configHandler.collectionProfile.lines.ttyGreetingsMessage(line);
  }

  private fetchPrefixes(jsonObj: any) {
    let localPrefix: string = jsonObj.LocalPrefix || '';
    let longDistancePrefix: string = jsonObj.LongDistancePrefix || '';
    let forceNpaOnLocalCalls: ExtInterface.ForceNpaOnLocalCalls = ExtInterface.ForceNpaOnLocalCalls.Default;

    switch (jsonObj.ForceNpaOnLocalCalls) {
      case 0:
        forceNpaOnLocalCalls = ExtInterface.ForceNpaOnLocalCalls.Default;
        break;
      case 1:
        forceNpaOnLocalCalls = ExtInterface.ForceNpaOnLocalCalls.True;
        break;
      case 2:
        forceNpaOnLocalCalls = ExtInterface.ForceNpaOnLocalCalls.False;
        break;
      default:
    }

    if (localPrefix === '' && longDistancePrefix === '') {
      this._lineCfg.prefix = null;
    } else {
      this._lineCfg.prefix = new ExtInterface.DialingPrefix(
        localPrefix,
        longDistancePrefix,
        this._lineCfg.npa,
        this._lineCfg.nxx,
        forceNpaOnLocalCalls
      );
    }

    let hfLocalPrefix: string = jsonObj.FlashLocalPrefix || '';
    let hfLongDistancePrefix: string = jsonObj.FlashLongDistancePrefix || '';
    let hfForceNpaOnLocalCalls: ExtInterface.ForceNpaOnLocalCalls = ExtInterface.ForceNpaOnLocalCalls.Default;

    switch (jsonObj.FlashForceNpaOnLocalCalls) {
      case 0:
        hfForceNpaOnLocalCalls = ExtInterface.ForceNpaOnLocalCalls.Default;
        break;
      case 1:
        hfForceNpaOnLocalCalls = ExtInterface.ForceNpaOnLocalCalls.True;
        break;
      case 2:
        hfForceNpaOnLocalCalls = ExtInterface.ForceNpaOnLocalCalls.False;
        break;
      default:
    }

    if (hfLocalPrefix === '' && hfLongDistancePrefix === '') {
      this._lineCfg.hfPrefix = null;
    } else {
      this._lineCfg.hfPrefix = new ExtInterface.DialingPrefix(
        hfLocalPrefix,
        hfLongDistancePrefix,
        this._lineCfg.npa,
        this._lineCfg.nxx,
        hfForceNpaOnLocalCalls
      );
    }
  }

  // public accessors

  get address(): string {
    return this._lineCfg.name;
  }

  get lineType(): ExtInterface.LineType {
    return this._lineCfg.lineType;
  }

  get shareType(): ExtInterface.LineSharedType {
    return this._lineCfg.shareType;
  }

  get trunkType(): ExtInterface.LineTrunkType {
    return this._lineCfg.trunkType;
  }

  get uri(): string {
    return this._lineCfg.uri;
  }

  get isOneStepDialing(): boolean {
    return this._lineCfg.isOneStepDialing;
  }

  get isT2TTransfer(): boolean {
    return this._lineCfg.isT2TTransfer;
  }

  get isBeepInjection(): boolean {
    return this._lineCfg.isBeepInjection;
  }

  get isRingDown(): boolean {
    return this._lineCfg.isRingDown;
  }

  get isIncomingOnly(): boolean {
    return this._lineCfg.isIncomingOnly;
  }

  get isAutoRecording(): boolean {
    return this._lineCfg.isAutoRecording;
  }

  get isTTYAutoDetection(): boolean {
    return this._lineCfg.isTTYAutoDetection;
  }

  get isTTYGreetingMessage(): boolean {
    return this._lineCfg.isTTYGreetingMessage;
  }

  get npa(): string {
    return this._lineCfg.npa;
  }

  get nxx(): string {
    return this._lineCfg.nxx;
  }

  get linePrefix(): ExtInterface.DialingPrefix | null {
    return this._lineCfg.prefix;
  }

  get lineHfPrefix(): ExtInterface.DialingPrefix | null {
    return this._lineCfg.hfPrefix;
  }

  get midCallDialing(): string {
    return this._lineCfg.midCallDialing;
  }

  get ringerPriority(): number {
    return this._lineCfg.ringerPriority;
  }

  get preferredNode(): string {
    return this._lineCfg.preferredNode;
  }

  get alternateNodes(): Array<string> {
    return this._lineCfg.alternateNodes;
  }

  get json(): ILineConfig {
    return this._lineCfg;
  }

  get extra(): Line {
    return this._extra;
  }

  // Get base address (ie. 2005A) of a dynamically created Intercom line (ie. 2005E)
  get baseAddr(): string {
    if (this.lineType === ExtInterface.LineType.LTIntercom) {
      return this.address.substr(0, this.address.length - 1) + 'A';
    }
    return this.address;
  }
}

export function getLineConfig(lineAddress: string): LineConfig | undefined {
  try {
    let line: Line | null = webCfg.configHandler.collectionLine.getByAddress(lineAddress);
    if (line) {
      return new LineConfig(line);
    }
  } catch (e) {}
  return undefined;
}

export function cloneLineConfig(oldAddress: string, newAddress: string): LineConfig | undefined {
  try {
    const oldLine = webCfg.configHandler.collectionLine.getByAddress(oldAddress);
    const newLine = webCfg.configHandler.collectionLine.cloneFromLine(oldLine, newAddress);
    return new LineConfig(newLine);
  } catch (e) {}
  return undefined;
}
