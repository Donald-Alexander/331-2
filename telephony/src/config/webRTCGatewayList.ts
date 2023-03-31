import { webCfg } from './webcfg';
import { WebRTCGateway } from 'client-web-api/src/config/model/WebRTCGateway';

export interface IWebRTCGateway {
  srv1Address: string; // address of webrtc?-srv1
  srv2Address: string; // address of webrtc?-srv2
  sipsPort: string;
  msrpPort: string;
  rttPort: string;
  voipServers: string[];
  group: number;
}

interface NodeInfo {
  Node: number;
  voipClusterName: string;
}

interface ServerInfo {
  Id: number;
  Name: string;
  IPAddress: string;
}

export class WebRTCGatewayList {
  private readonly _list: Array<IWebRTCGateway> = [];

  constructor() {
    // retrieve all webRTC gateways configured in VIPER
    const webRTCGateways: WebRTCGateway[] = webCfg.configHandler.collectionWebRTCGateway.getAll();

    // get webrtc1-srv
    const webrtc1_srv = webRTCGateways?.find((item) => item.json.Name === 'webrtc1-srv');
    if (webrtc1_srv) {
      const jsonObj = webrtc1_srv.json;
      const nodeInfo: Array<NodeInfo> = jsonObj.Nodes;
      const serverInfo: Array<ServerInfo> = jsonObj.Servers;
      const webrtcgateway: IWebRTCGateway = {
        voipServers: [],
        srv1Address: '',
        srv2Address: '',
        sipsPort: String(webrtc1_srv.json.SipsPort) || '4443',
        msrpPort: String(webrtc1_srv.json.MsrpPort) || '4444',
        rttPort: /*String(webrtc1_srv.json.RttPort) ||*/ '5554',
        group: 1,
      };
      let isSrv1Set: boolean = false;
      let isSrv2Set: boolean = false;

      const srv1 = serverInfo?.find((server) => server.Name === 'webrtc1-srv1');
      if (srv1) {
        webrtcgateway.srv1Address = srv1.IPAddress;
        isSrv1Set = true;
      }

      const srv2 = serverInfo?.find((server) => server.Name === 'webrtc1-srv2');
      if (srv2) {
        webrtcgateway.srv2Address = srv2.IPAddress;
        isSrv2Set = true;
      }

      if (!isSrv1Set) {
        webrtcgateway.srv1Address = srv2?.IPAddress!;
      }

      if (!isSrv2Set) {
        webrtcgateway.srv2Address = srv1?.IPAddress!;
      }

      if (nodeInfo && nodeInfo.length) {
        nodeInfo.forEach((node) => {
          webrtcgateway.voipServers.push(node.voipClusterName);
        });
      }

      this._list.push(webrtcgateway);
    }

    // get webrtc2-srv
    const webrtc2_srv = webRTCGateways?.find((item) => item.json.Name === 'webrtc2-srv');
    if (webrtc2_srv) {
      const jsonObj = webrtc2_srv.json;
      const nodeInfo: Array<NodeInfo> = jsonObj.Nodes;
      const serverInfo: Array<ServerInfo> = jsonObj.Servers;
      const webrtcgateway: IWebRTCGateway = {
        voipServers: [],
        srv1Address: '',
        srv2Address: '',
        sipsPort: String(webrtc2_srv.json.SipsPort) || '4443',
        msrpPort: String(webrtc2_srv.json.MsrpPort) || '4444',
        rttPort: /*String(webrtc2_srv.json.RttPort) ||*/ '5554',
        group: 2,
      };

      let isSrv1Set: boolean = false;
      let isSrv2Set: boolean = false;

      const srv1 = serverInfo?.find((server) => server.Name === 'webrtc2-srv1');
      if (srv1) {
        webrtcgateway.srv1Address = srv1.IPAddress;
        isSrv1Set = true;
      }

      const srv2 = serverInfo?.find((server) => server.Name === 'webrtc2-srv2');
      if (srv2) {
        webrtcgateway.srv2Address = srv2.IPAddress;
        isSrv2Set = true;
      }

      if (!isSrv1Set) {
        webrtcgateway.srv1Address = srv2?.IPAddress!;
      }
      if (!isSrv2Set) {
        webrtcgateway.srv2Address = srv1?.IPAddress!;
      }

      if (nodeInfo && nodeInfo.length) {
        nodeInfo.forEach((node) => {
          webrtcgateway.voipServers.push(node.voipClusterName);
        });
      }

      this._list.push(webrtcgateway);
    }
  }

  public getWebRTC1(): IWebRTCGateway | undefined {
    return this._list.length >= 1 ? this._list[0] : undefined;
  }

  public getWebRTC2(): IWebRTCGateway | undefined {
    return this._list.length >= 2 ? this._list[1] : undefined;
  }

  public getAll(): Array<IWebRTCGateway> {
    return this._list;
  }
}
