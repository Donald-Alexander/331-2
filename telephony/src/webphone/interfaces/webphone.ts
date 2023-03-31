import { ClientImpl, INotifyInfos } from '../sip/client';
import { SessionImpl } from '../sip/session';
import { mediacfg } from './sip-media';
import { Client, IClient } from '../sip/client';
import { register } from './sip-register';
import { unregister } from './sip-unregister';
import { makeCall } from './sip-makecall';
import { makeVccCall } from './sip-makeVccCall';
import { incomingCall } from './sip-incomingcall';
import {
  subscribe,
  unsubscribe,
  incomingNotify,
  subscribeAccepted,
  subscribeFailure,
  ISubsEventMsg,
} from './sip-subscribeNotify';
import { answer } from './sip-answercall';
import { hangupCall } from './sip-hangupcall';
import { hold } from './sip-holdcall';
import { unhold } from './sip-unholdcall';
import { updHoldState } from './sip-updholdstate';
import { reject } from './sip-rejectcall';
import { sendInfo } from './sip-sendInfo';
import { cancel } from './sip-cancel';
import { sessionTerminated } from './sip-session';
import { SessionStatus } from '../sip/enums';
import { webCfg, WebPhoneCfg } from '../../config/webcfg';
import { tandemTransfer } from './sip-tandemtransfer';
import * as deviceManager from '../../weblinedev/deviceManager';
import { CtiHardwareType } from '../../telephonyexternalinterfacedef';
import { MsrpCfg, msrpConfig } from '../msrp/config';
import { RttCfg, rttConfig } from '../rtt/config';
import { SipRtt } from './sip-rtt';
import { SipMsrp } from './sip-msrp';
import { getNodeId } from '../../config/nodeId';
import { ClientKeepAliveState } from '../../weblinedev/listenJoin';
import { vmSubscribe, vmUnsubscribe, vmSendDigit } from './sip-voicemail';
import { RequestOptions } from 'sip-js/lib/core/messages/outgoing-request';
import { Diag } from '../../common/diagClient';

const diag = new Diag('webphone');

export interface VoiceClient {
  nodeId: number;
  client: IClient;
}

export interface MsrpClient {
  nodeId: number;
  client: IClient;
  msrp: SipMsrp;
}
export interface RttClient {
  nodeId: number;
  client: IClient;
  rtt: SipRtt;
}
export class WebPhone extends EventTarget {
  // private members
  webPhoneCfg: WebPhoneCfg;
  _voiceClients: VoiceClient[];
  _msrpClients: MsrpClient[];
  _rttClients: RttClient[];
  _clients: Array<IClient> = [];
  _msrps: Array<SipMsrp> = [];
  _rtts: Array<SipRtt> = [];
  constructor(webPhoneCfg: WebPhoneCfg) {
    super();
    this.webPhoneCfg = webPhoneCfg;
    this._voiceClients = this.createVoiceClients(this.webPhoneCfg);
    this._msrpClients = this.createMsrpClients(this.webPhoneCfg);
    this._rttClients = this.createRttClients(this.webPhoneCfg);
  }

  private listenIncoming(client: IClient) {
    const name = 'listenIncoming';
    client.on('sessionAdded', () => {
      diag.out(name, `Created a new dialog. current Nbr. sessions = ${client.getSessions().length}`);
    });

    client.on('sessionRemoved', () => {
      diag.out(name, `Removed a dialog. current Nbr. sessions = ${client.getSessions().length}`);
    });

    client.on('statusUpdate', (newStatus: any) => {
      diag.out(name, `Status update to ${newStatus}`);
    });

    client.on('invite', (session: SessionImpl) => {
      this.incomingCall(session);
    });

    client.on('subscriptionNotify', (infos: INotifyInfos) => {
      this.incomingNotify(infos);
    });

    client.on('subscriptionAccepted', (eventMsg: ISubsEventMsg) => {
      this.subscribeAccepted(eventMsg);
    });

    client.on('subscriptionFailure', (eventMsg: ISubsEventMsg) => {
      this.subscribeFailure(eventMsg);
    });

    client.on('subscriptionTerminated', (index: string) => {
      const subsTerminatedEvent = new CustomEvent('subsTerminatedMsg', { detail: index });
      this.dispatchEvent(subsTerminatedEvent);
    });

    // prettier-ignore
    client.on('keepAliveStateUpd', (clientIP: string, state: ClientKeepAliveState) => {
      // Dispatch client connect event
      const eventKeepAliveStateUpd = new CustomEvent('keepAliveStateUpd', {
        detail: { clientIP: clientIP, state: state },
      });
      this.dispatchEvent(eventKeepAliveStateUpd);

      // Transport faillure detected on webrtc-gateway
      if (state === ClientKeepAliveState.DOWN) {
        diag.out( name, `Transport faillure detected from webrtc-gateway IP '${clientIP}'`);

        let reInviteCalls: number = 0;
        const sessions = client.getSessions();
        if (sessions.length) {
          diag.out(
            name,
            `Client webrtc-gateway IP ${clientIP} has currently ${sessions.length} active call(s).  Request node to RE-INVITE calls`
          );

          /* PWEB-2401: General n♦ote:
                        - The goal here is to terminate the session at the stack level without sending a SIP BYE.
                        - We do not want to send a SIP BYE because, if the WebRTCClient network connection is short enough, the SIP BYE
                          may reach VIPER and terminate the call.
                        
                        Technical notes:
                        - We must terminate all sessions here in order to prevent the sip.js client to send automatically the SIP BYE
                          at the time the client is closing. 
                        - In summary, if we do not terminate all sessions here, a SIP BYE is going to be sent later and so,
                          it may reach VIPER and terminate the call.
                        - Please note we have little control with the SIP BYE that is sent by the SIP stack at the time the sip.js client is closing
                        - The fact the following "session.terminate()" here is changing the session state to "terminated", NO SIP BYE is
                          going to be sent later on(client close) 

                        SIP.JS changes required (0.15.6.2):
                        - Basically, we must skip sending the SIP BYE with the session.terminate() right below.
                        - Therefore, the new SIP header "x-IgnoreBy" is used by the SIP stack to skip sending the SIP BYE.
                        - However, we still change the session state to 'terminated' and so, it is terminated cleanly.
          */

          let options: RequestOptions = { extraHeaders: ['x-IgnoreBye: true'] };
          sessions.forEach((session) => {
            reInviteCalls++;
            session.setKeepAppSessionAlive(true);
            if (session.isIncoming) {
              if (session.status === SessionStatus.RINGING) {
                session.reject().catch((msg: string) => {
                  diag.warn( name, `keepAliveStateUpd: Session reject return '${msg}'`);
                });
              } else if (session.status === SessionStatus.ACTIVE) {
                session.terminate(undefined, options).catch((msg: string) => {
                  diag.warn( name, `keepAliveStateUpd: Session terminate return '${msg}'`);
                });
              }
            } else {
              // Outgoing Call
              if (session.status === SessionStatus.ACTIVE) {
                session.terminate(undefined, options).catch((msg: string) => {
                  diag.warn( name, `keepAliveStateUpd: Session terminate return '${msg}'`);
                });
              }
            }
          });
        } else {
          diag.out( name, `Client webrtc-gateway IP ${clientIP} has NO active calls.  No need to REOFFER calls from Node`);
        }
        this.reconfigureToMateWebrtcGW(this.webPhoneCfg, clientIP, state, reInviteCalls);
      }
    });
  }

  private createVoiceClients(webPhoneCfg: WebPhoneCfg): VoiceClient[] {
    let voiceClients: VoiceClient[] = [];
    let oddNumPosition: boolean = parseInt(webPhoneCfg.userId) % 2 == 0 ? false : true;
    if (webPhoneCfg && webPhoneCfg.webRTCGWConfigData.length) {
      let media = mediacfg;
      if (
        webCfg.positionCfg.ctiHardwareType === CtiHardwareType.PowerStationG3 ||
        webCfg.positionCfg.ctiHardwareType === CtiHardwareType.Sonic ||
        webCfg.positionCfg.ctiHardwareType === CtiHardwareType.SonicG3
      ) {
        media.input.id = deviceManager.getDeviceId(deviceManager.IntradoAudioDeviceType.MicrophoneWave1);
        media.output.id = deviceManager.getDeviceId(deviceManager.IntradoAudioDeviceType.SpeakerWave1);
      }

      let webRTCActive1: string = '';

      let webRTCActive2: string = '';

      let account: any = '';
      let transport: any = '';

      for (let data of webPhoneCfg.webRTCGWConfigData) {
        if (oddNumPosition) {
          webRTCActive1 = data.srv1Address;
          webRTCActive2 = data.srv2Address;
          diag.out('createVoiceClients', `connecting to webrtc-srv at <${webRTCActive1}:${data.sipsPort}>`);

          account = {
            user: webPhoneCfg.userId,
            password: webPhoneCfg.password,
            uri: `sip:${webPhoneCfg.userId}@${webRTCActive1}:${data.sipsPort}`,
            name: webPhoneCfg.username,
          };

          transport = {
            wsServers: `wss://${webRTCActive1}:${data.sipsPort}/ws`,
            iceServers: [],
          };
        } else {
          webRTCActive1 = data.srv1Address;
          webRTCActive2 = data.srv2Address;

          diag.out('createVoiceClients', `connecting to webrtc-srv at <${webRTCActive2}:${data.sipsPort}>  `);

          account = {
            user: webPhoneCfg.userId,
            password: webPhoneCfg.password,
            uri: `sip:${webPhoneCfg.userId}@${webRTCActive2}:${data.sipsPort}`,
            name: webPhoneCfg.username,
          };

          transport = {
            wsServers: `wss://${webRTCActive2}:${data.sipsPort}/ws`,
            iceServers: [],
          };
        }

        try {
          const client = new Client({ account, transport, media, userAgentString: 'Intrado Webphone library' });
          this.listenIncoming(client);
          data.voipServers.forEach((server) => {
            let voiceClient: VoiceClient = {
              nodeId: getNodeId(server),
              client,
            };

            voiceClients.push(voiceClient);
            diag.out(
              'createVoiceClients',
              `Map: NodeId: ${voiceClient.nodeId} => client<${oddNumPosition ? webRTCActive1 : webRTCActive2}:${
                data.sipsPort
              }>`
            );
          });
          this.clients.push(client);
          diag.out(
            'createVoiceClients',
            `creates voice client to connect webRTCGateway<${oddNumPosition ? webRTCActive1 : webRTCActive2}:${
              data.sipsPort
            }>`
          );
        } catch (e) {
          diag.warn(
            'createVoiceClients',
            `voce client failure to webRTCGateway<${oddNumPosition ? webRTCActive1 : webRTCActive2}:${
              data.sipsPort
            }>, cause:${e}`
          );
        }
      }
    }
    return voiceClients;
  }

  private getFailedOnGroup(webPhoneCfg: WebPhoneCfg, failedIp: string) {
    let group: number = 0;
    for (let data of webPhoneCfg.webRTCGWConfigData) {
      if (failedIp.match(data.srv1Address)) group = data.group;
      if (failedIp.match(data.srv2Address)) group = data.group;
    }
    return group;
  }

  private async reconfigureToMateWebrtcGW(
    webPhoneCfg: WebPhoneCfg,
    failedIp: string,
    state: ClientKeepAliveState,
    reInviteCalls: number
  ) {
    const name = 'reconfigureToMateWebrtcGW';
    let webRTCActive1: string = '';
    let webRTCActive2: string = '';
    let failedOnGroup: number = 0;
    let srvToConfigure: string = '';

    for (let data of webPhoneCfg.webRTCGWConfigData) {
      failedOnGroup = this.getFailedOnGroup(webPhoneCfg, failedIp);
      webRTCActive1 = data.srv1Address;
      webRTCActive2 = data.srv2Address;

      if (failedOnGroup === data.group) {
        failedIp === webRTCActive1 ? (srvToConfigure = webRTCActive2) : (srvToConfigure = webRTCActive1);
        diag.out(
          name,
          `reconfiguring voice client on current group (${data.group}) to webrtc-srv at <${srvToConfigure}:${data.sipsPort}> state(${state}) `
        );

        this.reconfigureVoiceClients(
          this.webPhoneCfg,
          `sip:${srvToConfigure}:${data.sipsPort}`,
          failedOnGroup,
          reInviteCalls
        );
      }
    }
  }

  private async reconfigureVoiceClients(
    webPhoneCfg: WebPhoneCfg,
    newSipUri: string,
    failedOnGroup: number,
    reInviteCalls: number = -1
  ) {
    let newIpSplit = newSipUri.split(':');
    let newIp: string = newIpSplit[1];
    if (webPhoneCfg && webPhoneCfg.webRTCGWConfigData.length) {
      let media = mediacfg;
      if (
        webCfg.positionCfg.ctiHardwareType === CtiHardwareType.PowerStationG3 ||
        webCfg.positionCfg.ctiHardwareType === CtiHardwareType.Sonic ||
        webCfg.positionCfg.ctiHardwareType === CtiHardwareType.SonicG3
      ) {
        media.input.id = deviceManager.getDeviceId(deviceManager.IntradoAudioDeviceType.MicrophoneWave1);
        media.output.id = deviceManager.getDeviceId(deviceManager.IntradoAudioDeviceType.SpeakerWave1);
      }
      let account: any = '';
      let transport: any = '';
      for (let data of webPhoneCfg.webRTCGWConfigData) {
        if (data.group === failedOnGroup) {
          account = {
            user: webPhoneCfg.userId,
            password: webPhoneCfg.password,
            uri: `sip:${webPhoneCfg.userId}@${newIp}:${data.sipsPort}`,
            name: webPhoneCfg.username,
          };

          transport = {
            wsServers: `wss://${newIp}:${data.sipsPort}/ws`,
            iceServers: [],
          };

          try {
            let reconfiguredClient: Boolean = false;
            data.voipServers.forEach((server) => {
              if (!reconfiguredClient) {
                let nodeId: number = getNodeId(server);

                diag.out('reconfigureVoiceClients', `update voice client<${nodeId}> with <${newIp}:${data.sipsPort}>`);

                let voiceClient = this.voiceClients.length && this.voiceClients.find((c) => c.nodeId === nodeId);
                if (voiceClient) {
                  voiceClient?.client?.reconfigureNewWebRTC(
                    {
                      account,
                      transport,
                      media,
                      userAgentString: 'Intrado Webphone library',
                    },
                    reInviteCalls
                  );
                  reconfiguredClient = true;
                }
              }
            });
          } catch (e) {
            diag.warn(
              'reconfigureVoiceClients',
              `voce client failure to webRTCGateway<${newIp}:${data.sipsPort}>, cause:${e}`
            );
          }

          this.reconfigureMsrpClients(webPhoneCfg, newIp);
          this.reconfigureRttClients(webPhoneCfg, newIp);
        }
      }
    }
  }

  private createMsrpClients(webPhoneCfg: WebPhoneCfg): MsrpClient[] {
    let msrpClients: MsrpClient[] = [];
    let oddNumPosition: boolean = parseInt(webPhoneCfg.userId) % 2 == 0 ? false : true;

    let webRTCActive1: string = '';
    let webRTCActive2: string = '';
    let active1Weight: number = 0;
    let active2Weight: number = 0;

    if (webPhoneCfg && webPhoneCfg.webRTCGWConfigData.length) {
      for (let data of webPhoneCfg.webRTCGWConfigData) {
        oddNumPosition ? (active1Weight = 1) : (active2Weight = 1);
        webRTCActive1 = data.srv1Address;
        webRTCActive2 = data.srv2Address;
        const account: MsrpCfg = {
          enableStack: msrpConfig.enableStack,
          host: msrpConfig.host,
          port: msrpConfig.port,
          ProxyServer: `${oddNumPosition ? webRTCActive1 : webRTCActive2}:${data.msrpPort}`,
          sessionName: msrpConfig.sessionName,
          acceptTypes: msrpConfig.acceptTypes,
          setup: msrpConfig.setup,
          traceMessages: msrpConfig.traceMessages,
          heartbeats: msrpConfig.heartbeats,
        };

        if (account.enableStack) {
          let msrp: SipMsrp;
          try {
            msrp = new SipMsrp(account, this);
            data.voipServers.forEach((server) => {
              let nodeId = getNodeId(server);
              let voiceClient = this.voiceClients.length && this.voiceClients.find((c) => c.nodeId === nodeId);
              if (!voiceClient) throw 'Cannot find client';
              let msrpClient: MsrpClient = {
                nodeId,
                client: voiceClient?.client,
                msrp,
              };
              msrpClients.push(msrpClient);
              diag.out(
                'createMsrpClients',
                `Map: NodeId: ${nodeId} => msrp<${oddNumPosition ? webRTCActive1 : webRTCActive2}:${
                  data.msrpPort
                } and client<${data.sipsPort}>`
              );
            });
            this.msrps.push(msrp);
            diag.out(
              'createMsrpClients',
              `creates msrp client to connect WebRTCGateway<${oddNumPosition ? webRTCActive1 : webRTCActive2}:${
                data.msrpPort
              }>`
            );
          } catch (e) {
            diag.warn(
              'createMsrpClients',
              `msrp failure to webRTCGateway<${oddNumPosition ? webRTCActive1 : webRTCActive2}:${
                data.msrpPort
              }>, cause:${e}`
            );
          }
        }
      }
    }
    return msrpClients;
  }

  private reconfigureMsrpClients(webPhoneCfg: WebPhoneCfg, newIp: string) {
    if (webPhoneCfg && webPhoneCfg.webRTCGWConfigData.length) {
      for (let data of webPhoneCfg.webRTCGWConfigData) {
        try {
          const uri = 'wss://' + `${newIp}:${data.msrpPort}`; /*+ '/'*/

          data.voipServers.forEach((server) => {
            let nodeId = getNodeId(server);
            let voiceClient = this.voiceClients.length && this.voiceClients.find((c) => c.nodeId === nodeId);
            if (!voiceClient) throw 'Cannot find client';

            diag.out('reconfigureMsrpClients', `Disconnecting : NodeId: ${nodeId}`);
            this.msrpClients[nodeId].msrp.webSocketHandler.disconnect();

            diag.out('reconfigureMsrpClients', `Reconnecting : NodeId: ${nodeId} => new msrp uri <${uri}>`);

            this.msrpClients[nodeId].msrp.webSocketHandler.connect(uri);
          });
        } catch (e) {
          diag.warn('reconfigureMsrpClients', `msrp failure to webRTCGateway, cause:${e}`);
        }
      }
    }
  }

  public stopMsrpClients(webPhoneCfg: WebPhoneCfg) {
    if (webPhoneCfg && webPhoneCfg.webRTCGWConfigData.length) {
      for (let data of webPhoneCfg.webRTCGWConfigData) {
        try {
          data.voipServers.forEach((server) => {
            let nodeId = getNodeId(server);
            let voiceClient = this.voiceClients.length && this.voiceClients.find((c) => c.nodeId === nodeId);
            if (!voiceClient) throw 'Cannot find client';

            diag.out('stopMsrpClients', `Disconnecting : NodeId: ${nodeId}`);
            this.msrpClients[nodeId].msrp.webSocketHandler.disconnect();
          });
        } catch (e) {
          diag.warn('stopMsrpClients', `msrp failure to webRTCGateway, cause:${e}`);
        }
      }
    }
  }

  private createRttClients(webPhoneCfg: WebPhoneCfg): RttClient[] {
    let rttClients: RttClient[] = [];
    let oddNumPosition: boolean = parseInt(webPhoneCfg.userId) % 2 == 0 ? false : true;

    let webRTCActive1: string = '';
    let webRTCActive2: string = '';
    let active1Weight: number = 0;
    let active2Weight: number = 0;

    if (webPhoneCfg && webPhoneCfg.webRTCGWConfigData.length) {
      for (let data of webPhoneCfg.webRTCGWConfigData) {
        oddNumPosition ? (active1Weight = 1) : (active2Weight = 1);
        webRTCActive1 = data.srv1Address;
        webRTCActive2 = data.srv2Address;
        const account: RttCfg = {
          enableStack: rttConfig.enableStack,
          host: rttConfig.host,
          port: rttConfig.port,
          ProxyServer: `${oddNumPosition ? webRTCActive1 : webRTCActive2}:${data.rttPort}`,
          sessionName: rttConfig.sessionName,
          acceptTypes: rttConfig.acceptTypes,
          setup: rttConfig.setup,
          traceMessages: rttConfig.traceMessages,
          heartbeats: rttConfig.heartbeats,
        };

        if (account.enableStack) {
          let rtt: SipRtt;
          try {
            rtt = new SipRtt(account, this);
            data.voipServers.forEach((server) => {
              let nodeId = getNodeId(server);
              let voiceClient = this.voiceClients.length && this.voiceClients.find((c) => c.nodeId === nodeId);
              if (!voiceClient) throw 'Cannot find client';
              let rttClient: RttClient = {
                nodeId,
                client: voiceClient?.client,
                rtt,
              };
              rttClients.push(rttClient);
              diag.out(
                'createRttClients',
                `Map: NodeId: ${nodeId} => rtt<${oddNumPosition ? webRTCActive1 : webRTCActive2}:${
                  data.rttPort
                } and client<${data.sipsPort}>`
              );
            });
            this.rtts.push(rtt);
            diag.out(
              'createRttClients',
              `creates rtt client to connect WebRTCGateway<${oddNumPosition ? webRTCActive1 : webRTCActive2}:${
                data.rttPort
              }>`
            );
          } catch (e) {
            diag.warn(
              'createRttClients',
              `rtt failure to webRTCGateway<${oddNumPosition ? webRTCActive1 : webRTCActive2}:${
                data.rttPort
              }>, cause:${e}`
            );
          }
        }
      }
    }
    return rttClients;
  }

  private reconfigureRttClients(webPhoneCfg: WebPhoneCfg, newIp: string) {
    if (webPhoneCfg && webPhoneCfg.webRTCGWConfigData.length) {
      for (let data of webPhoneCfg.webRTCGWConfigData) {
        try {
          const uri = 'wss://' + `${newIp}:${data.rttPort}` + '/';

          data.voipServers.forEach((server) => {
            let nodeId = getNodeId(server);
            let voiceClient = this.voiceClients.length && this.voiceClients.find((c) => c.nodeId === nodeId);
            if (!voiceClient) throw 'Cannot find client';

            diag.out('reconfigureRttClients', `Disconnecting : NodeId: ${nodeId}`);
            this.rttClients[nodeId].rtt.webSocketHandler.disconnect();

            diag.out('reconfigureRttClients', `Reconnecting : NodeId: ${nodeId} => new rtt uri <${uri}>`);

            this.rttClients[nodeId].rtt.webSocketHandler.connect(uri);
          });
        } catch (e) {
          diag.warn('reconfigureRttClients', `rtt failure to webRTCGateway, cause:${e}`);
        }
      }
    }
  }

  public stopRttClients(webPhoneCfg: WebPhoneCfg) {
    if (webPhoneCfg && webPhoneCfg.webRTCGWConfigData.length) {
      for (let data of webPhoneCfg.webRTCGWConfigData) {
        try {
          data.voipServers.forEach((server) => {
            let nodeId = getNodeId(server);
            let voiceClient = this.voiceClients.length && this.voiceClients.find((c) => c.nodeId === nodeId);
            if (!voiceClient) throw 'Cannot find client';

            diag.out('stopRttClients', `Disconnecting : NodeId: ${nodeId}`);
            this.rttClients[nodeId].rtt.webSocketHandler.disconnect();
          });
        } catch (e) {
          diag.warn('stopRttClients', `rtt failure to webRTCGateway, cause:${e}`);
        }
      }
    }
  }

  // Public methods
  public get voiceClients() {
    return this._voiceClients;
  }

  // Public methods
  public get msrpClients() {
    return this._msrpClients;
  }

  public getMsrp(nodeId: number): SipMsrp | boolean {
    let msrpClient = this.msrpClients.length && this.msrpClients.find((c) => c.nodeId === nodeId);
    if (msrpClient) return msrpClient.msrp;
    else return false;
  }

  public getClient(nodeId: number): IClient | boolean {
    let voiceClient = this.voiceClients.length && this.voiceClients.find((c) => c.nodeId === nodeId);
    if (voiceClient) return voiceClient.client;
    else return false;
  }

  public get rttClients() {
    return this._rttClients;
  }

  public getRtt(nodeId: number): SipRtt | boolean {
    let rttClient = this.rttClients.length && this.rttClients.find((c) => c.nodeId === nodeId);
    if (rttClient) return rttClient.rtt;
    else return false;
  }

  public get clients(): Array<IClient> {
    return this._clients;
  }

  public get msrps() {
    return this._msrps;
  }

  public get rtts() {
    return this._rtts;
  }

  public register = register.bind(this);
  public unregister = unregister.bind(this);
  public makeCall = makeCall.bind(this);
  public makeVccCall = makeVccCall.bind(this);
  public hangupCall = hangupCall.bind(this);
  public incomingCall = incomingCall.bind(this);
  public subscribe = subscribe.bind(this);
  public unsubscribe = unsubscribe.bind(this);
  public incomingNotify = incomingNotify.bind(this);
  public subscribeAccepted = subscribeAccepted.bind(this);
  public subscribeFailure = subscribeFailure.bind(this);
  public answer = answer.bind(this);
  public hold = hold.bind(this);
  public unhold = unhold.bind(this);
  public updHoldState = updHoldState.bind(this);
  public reject = reject.bind(this);
  public sendInfo = sendInfo.bind(this);
  public cancel = cancel.bind(this);
  public callTerminated = sessionTerminated.bind(this);
  public tandemTransfer = tandemTransfer.bind(this);
  public vmSubscribe = vmSubscribe.bind(this);
  public vmUnsubscribe = vmUnsubscribe.bind(this);
  public sendDigitBySipInfo = vmSendDigit.bind(this);
}
