import { Node } from 'client-web-api/src/config/model/Node';
import * as ExtInterface from '../telephonyexternalinterfacedef';
import { getNodeId } from './nodeId';

enum ViperNodeName {
  primary = 'PrimaryNode',
  secondary = 'SecondaryNode',
  node3 = 'Node3',
  node4 = 'Node4',
  node5 = 'Node5',
  node6 = 'Node6',
}

// Compare two node for sorting
// -1 => a placed before b
//  1 => a placed after b
//  0 => no changes
export function compareViperNode(node1: NodeConfig, node2: NodeConfig): number {
  switch (node1.name) {
    case ViperNodeName.primary:
      return -1;
    case ViperNodeName.secondary:
      return node2.name === ViperNodeName.primary ? 1 : -1;
    case ViperNodeName.node3:
      return node2.name === ViperNodeName.primary || node2.name === ViperNodeName.secondary ? 1 : -1;
    case ViperNodeName.node4:
      return node2.name === ViperNodeName.node5 || node2.name === ViperNodeName.node6 ? -1 : 1;
    case ViperNodeName.node5:
      return node2.name === ViperNodeName.node6 ? -1 : 1;
    case ViperNodeName.node6:
      return 1;
    default:
      return 0;
  }
}

export interface INodeConfig {
  name: string;

  subnet: string;
  netMask: string;

  proxyName: string; // aka. proxyNodeName
  proxyAddress: string;

  isPotsEnable: boolean;
  potsSrvName: string;
  potsSrvAddress: string;
  potsSrvbName: string;
  potsSrvbAddress: string;

  npa: string;
  nxx: string;
  prefix: ExtInterface.DialingPrefix | null;
  hfPrefix: ExtInterface.DialingPrefix | null;
}

export class NodeConfig {
  private readonly _nodeConfig: INodeConfig;

  constructor(node: Node) {
    const jsonObj: any = node.json;

    this._nodeConfig = {
      name: jsonObj.Name || '',
      subnet: jsonObj.Subnet || '',
      netMask: jsonObj.Netmask || '',
      proxyName: jsonObj.VoipClusterName || '',
      proxyAddress: jsonObj.ProxyAddress || '',
      isPotsEnable: jsonObj.PotsEnable || false,
      potsSrvName: '',
      potsSrvAddress: '',
      potsSrvbName: '',
      potsSrvbAddress: '',
      npa: jsonObj.Npa || '',
      nxx: jsonObj.Nxx || '',
      prefix: null,
      hfPrefix: null,
    };

    if (jsonObj.BackroomServers.length >= 1) {
      this._nodeConfig.potsSrvName = jsonObj.BackroomServers[0].Name || '';
      this._nodeConfig.potsSrvAddress = jsonObj.BackroomServers[0].IPAddress || '';
    }
    if (jsonObj.BackroomServers.length >= 2) {
      this._nodeConfig.potsSrvbName = jsonObj.BackroomServers[1].Name || '';
      this._nodeConfig.potsSrvbAddress = jsonObj.BackroomServers[1].IPAddress || '';
    }

    this.fetchPrefixes(jsonObj);

    if (this._nodeConfig.name === '') {
      throw new Error('Not supported: VIPER node name is empty');
    }
  }

  private fetchPrefixes(jsonObj: any) {
    const localPrefix: string = jsonObj.LocalPrefix || '';
    const longDistancePrefix: string = jsonObj.LongDistancePrefix || '';
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
      this._nodeConfig.prefix = null;
    } else {
      this._nodeConfig.prefix = new ExtInterface.DialingPrefix(
        localPrefix,
        longDistancePrefix,
        this._nodeConfig.npa,
        this._nodeConfig.nxx,
        forceNpaOnLocalCalls
      );
    }

    const hfLocalPrefix: string = jsonObj.FlashLocalPrefix || '';
    const hfLongDistancePrefix: string = jsonObj.FlashLongDistancePrefix || '';
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
      this._nodeConfig.hfPrefix = null;
    } else {
      this._nodeConfig.hfPrefix = new ExtInterface.DialingPrefix(
        hfLocalPrefix,
        hfLongDistancePrefix,
        this._nodeConfig.npa,
        this._nodeConfig.nxx,
        hfForceNpaOnLocalCalls
      );
    }
  }

  // public accessors

  get name(): string {
    return this._nodeConfig.name;
  }

  get subnet(): string {
    return this._nodeConfig.subnet;
  }

  get netMask(): string {
    return this._nodeConfig.netMask;
  }

  get proxyName(): string {
    return this._nodeConfig.proxyName;
  }

  get proxyAddress(): string {
    return this._nodeConfig.proxyAddress;
  }

  get isPotsEnable(): boolean {
    return this._nodeConfig.isPotsEnable;
  }

  get potsSrvName(): string {
    return this._nodeConfig.potsSrvName;
  }

  get potsSrvAddress(): string {
    return this._nodeConfig.potsSrvAddress;
  }

  get potsSrvbName(): string {
    return this._nodeConfig.potsSrvbName;
  }

  get potsSrvbAddress(): string {
    return this._nodeConfig.potsSrvbAddress;
  }

  get npa(): string {
    return this._nodeConfig.npa;
  }

  get nxx(): string {
    return this._nodeConfig.nxx;
  }

  get nodePrefix(): ExtInterface.DialingPrefix | null {
    return this._nodeConfig.prefix;
  }

  get nodeHfPrefix(): ExtInterface.DialingPrefix | null {
    return this._nodeConfig.hfPrefix;
  }

  // TODO: how to determine id of SVN node?
  get id(): number {
    return getNodeId(this._nodeConfig.proxyName);
  }

  get json(): INodeConfig {
    return this._nodeConfig;
  }

  public isValidViperNode(): boolean {
    return (
      this.name === ViperNodeName.primary ||
      this.name === ViperNodeName.secondary ||
      this.name === ViperNodeName.node3 ||
      this.name === ViperNodeName.node4 ||
      this.name === ViperNodeName.node5 ||
      this.name === ViperNodeName.node6
    );
  }
}
