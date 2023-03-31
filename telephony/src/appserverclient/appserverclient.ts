import { webCfg } from '../config/webcfg';
import { ReconnectingWS } from './reconnecting-ws';
import * as ExtInterface from '../telephonyexternalinterfacedef';
import { Diag } from '../common/diagClient';

const diag = new Diag('appserverclient.appserverclient');

export enum AgentStatus {
  AGENT_LOG_ON = 'AGENT LOG ON',
  AGENT_LOG_OFF = 'AGENT LOG OFF',
  RINGGROUP_LOG_ON = 'RINGGROUP LOG ON',
  RINGGROUP_LOG_OFF = 'RINGGROUP LOG OFF',
  DYNAMIC_ACD_LOG_ON = 'DYNAMIC ACD LOG ON',
  ACD_LOG_ON = 'ACD LOG ON',
  DYNAMIC_ACD_LOG_OFF = 'DYNAMIC ACD LOG OFF',
  ACD_LOG_OFF = 'ACD LOG OFF',
  ACD_READY = 'ACD READY',
  ACD_NOT_READY = 'ACD NOT READY',
  ON_CALL = 'ON CALL',
  OFF_CALL = 'OFF CALL',
  DYNAMICON_ACD_LOG_ON = 'DYNAMICON ACD LOG ON',
  DYNAMICON_ACD_LOG_OFF = 'DYNAMICON ACD LOG OFF',
}

export enum AppServerNode {
  NM = 'nm',
  NODE_ALL = 'ts_all',
  NODE_ANY = 'ts_any',
  NODE_PRIMARY = 'ts_primarynode',
  NODE_SECONDARY = 'ts_secondarynode',
  NODE_3 = 'ts_node3',
  NODE_4 = 'ts_node4',
  NODE_5 = 'ts_node5',
  NODE_6 = 'ts_node6',
}

export function getAppServerNode(nodeId: number): AppServerNode {
  let appServerNode: AppServerNode;
  switch (nodeId) {
    case 1:
      appServerNode = AppServerNode.NODE_PRIMARY;
      break;
    case 2:
      appServerNode = AppServerNode.NODE_SECONDARY;
      break;
    case 3:
      appServerNode = AppServerNode.NODE_3;
      break;
    case 4:
      appServerNode = AppServerNode.NODE_4;
      break;
    case 5:
      appServerNode = AppServerNode.NODE_5;
      break;
    case 6:
      appServerNode = AppServerNode.NODE_6;
      break;
    default:
      appServerNode = AppServerNode.NODE_PRIMARY;
      break;
  }
  return appServerNode;
}

export function getFirstAppServerNode(): AppServerNode {
  return AppServerNode.NODE_ANY;
}

export enum Direction {
  INCOMING = 'incoming',
  OUTGOING = 'outgoing',
}

export enum AppServerClientResponseStatus {
  SUCCESS = 'success',
  FAILURE = 'failure',
}

export class AppServerClientResponse {
  status = '';
  reason = '';
}

export class DbrResponse extends AppServerClientResponse {
  request_id = '';
}

export class DbrExResponse extends DbrResponse {
  ani = '';
  ali = '';
  ali_result = '';
  pidflo = '';
  time_count = 0;
}

export class LvfResponse extends AppServerClientResponse {
  request_id = '';
  response = '';
}

class MessageRequest {
  constructor() {
    // @ts-ignore
    this.body.position_id = 0;
  }
  'content-type'?: string;
  id?: string;
  destination?: AppServerNode[];
  type?: string;
  source?: string;
  body?: {
    version?: string;
    position_id: number;
    message?: string;
    priority?: string;
    number?: string;
    position_name?: string;
    position_dn?: string;
    agent_logon_id?: string;
    agent_first_name?: string;
    agent_middle_name?: string;
    agent_last_name?: string;
    agent_role?: string;
    psap_id?: string;
    psap_name?: string;
    ani?: string;
    db_number?: number;
    reason?: string;
    ucid?: string;
    key?: string;
    short_value?: string;
    long_value?: string;
    agency_id?: string;
    agency_name?: string;
    agency_type_id?: string;
    agency_type_name?: string;
    transfer_failure?: boolean;
    viper_node?: string;
    dialed_number?: string;
    duration?: number;
    fail_duration?: number;
    abandoned_ucid?: string;
    error?: boolean;
    status?: AgentStatus;
    acdq_list?: string;
    rg_list?: string;
    reason_code?: string;
    reason_code_desc?: string;
    route?: string;
    direction?: string;
    incident_key?: string;
    transcript?: string;
    request_id?: string;
    destination?: string;
    node?: AppServerNode;
    agentPrimaryState?: string;
    agentSecondaryState?: string;
    connectedCallUcid?: string;
    text?: string;
    protocol?: string;
    params?: object;
    civic_address?: string;
    service_uri?: string;
  };
}

function getViperNodeName(node: AppServerNode): string {
  let viperNode: string;
  switch (node) {
    case AppServerNode.NODE_PRIMARY:
      viperNode = 'PRIMARY';
      break;
    case AppServerNode.NODE_SECONDARY:
      viperNode = 'SECONDARY';
      break;
    case AppServerNode.NODE_3:
      viperNode = 'NODE3';
      break;
    case AppServerNode.NODE_4:
      viperNode = 'NODE4';
      break;
    case AppServerNode.NODE_5:
      viperNode = 'NODE5';
      break;
    case AppServerNode.NODE_6:
      viperNode = 'NODE6';
      break;
    default:
      viperNode = 'PRIMARY';
      break;
  }
  return viperNode;
}

export class AppServerClient extends EventTarget {
  private position_id: number = 0;
  private position_name: string = '';
  private position_dn: string = '';

  private agent_logon_id: string = '';
  private agent_first_name: string = '';
  private agent_middle_name: string = '';
  private agent_last_name: string = '';
  private agent_role: string = '';
  private psap_id: string = '';
  private psap_name: string = '';

  private sequenceId: number = 0;

  private rwsc: ReconnectingWS | null = null;
  private wsLinkStatus: boolean;

  constructor() {
    super();
    this.wsLinkStatus = false;
    this.wsReadyState = this.wsReadyState.bind(this);
  }

  async attachDtmf(destination: AppServerNode, ucid: string, transcript: string): Promise<AppServerClientResponse> {
    diag.trace?.('attachDtmf', `Send: attach_dtmf_request to ${destination} for call ${ucid} with ${transcript}`);

    let response: AppServerClientResponse = new AppServerClientResponse();
    try {
      let message: MessageRequest = {
        id: this.generateId(),
        'content-type': 'attach_dtmf_request',
        destination: [destination],
        type: 'request',
        source: this.position_id.toString(),
        body: {
          version: '0.0.1',
          position_id: this.position_id,
          ucid,
          transcript,
        },
      };

      let message_str = JSON.stringify(message);
      if (this.rwsc != null) {
        let res = await this.rwsc.sendRequest(message.id as string, message_str);
        if (res) {
          let obj = JSON.parse(res);
          response = { status: obj.body.status, reason: obj.body.reason };
          diag.trace?.('attachDtmf', `Response received with status ${obj.body.status}`);
        }
      }
    } catch (e) {
      diag.err('attachDtmf', 'Cannot send a message due to: ' + e);
      throw e;
    }

    return response;
  }

  async attachMsrp(destination: AppServerNode, ucid: string, transcript: string): Promise<AppServerClientResponse> {
    diag.trace?.('attachMsrp', `Send: attach_msrp_request to ${destination} for call ${ucid} with ${transcript}`);

    let response: AppServerClientResponse = new AppServerClientResponse();
    try {
      let message: MessageRequest = {
        id: this.generateId(),
        'content-type': 'attach_msrp_request',
        destination: [destination],
        type: 'request',
        source: this.position_id.toString(),
        body: {
          version: '0.0.1',
          position_id: this.position_id,
          ucid,
          transcript,
        },
      };
      let message_str = JSON.stringify(message);
      if (this.rwsc != null) {
        let res = await this.rwsc.sendRequest(message.id as string, message_str);
        if (res) {
          let obj = JSON.parse(res);
          response = { status: obj.body.status, reason: obj.body.reason };
          diag.trace?.('attachMsrp', `Response received with status ${obj.body.status}`);
        }
      }
    } catch (e) {
      diag.err('attachMsrp', 'Cannot send a message due to: ' + e);
      throw e;
    }
    return response;
  }

  async attachTdd(destination: AppServerNode, ucid: string, transcript: string): Promise<AppServerClientResponse> {
    diag.trace?.('attachTdd', `Send: attach_tdd_request to ${destination} for call ${ucid} with ${transcript}`);

    let response: AppServerClientResponse = new AppServerClientResponse();
    try {
      let message: MessageRequest = {
        id: this.generateId(),
        'content-type': 'attach_tdd_request',
        destination: [destination],
        type: 'request',
        source: this.position_id.toString(),
        body: {
          version: '0.0.1',
          position_id: this.position_id,
          ucid,
          transcript,
        },
      };
      let message_str = JSON.stringify(message);
      if (this.rwsc != null) {
        let res = await this.rwsc.sendRequest(message.id as string, message_str);
        if (res) {
          // console.log('res', res);
          let obj = JSON.parse(res);
          response = { status: obj.body.status, reason: obj.body.reason };
          diag.trace?.('attachTdd', `Response received with status ${obj.body.status}`);
        }
      }
    } catch (e) {
      diag.err('attachTdd', 'Cannot send a message due to: ' + e);
      throw e;
    }
    return response;
  }

  async dbr(ani: string, db_number: number, reason: string): Promise<DbrResponse> {
    diag.trace?.('dbr', `Send: dbr_request with ${ani}, ${db_number}, ${reason}`);

    let response: DbrResponse = new DbrResponse();
    try {
      let message: MessageRequest = {
        id: this.generateId(),
        'content-type': 'dbr_request',
        type: 'request',
        source: this.position_id.toString(),
        destination: [AppServerNode.NODE_ANY],
        body: {
          version: '0.0.1',
          position_id: this.position_id,
          db_number: db_number,
          ani: ani,
          reason: reason,
        },
      };
      let message_str = JSON.stringify(message);
      if (this.rwsc != null) {
        let res = await this.rwsc.sendRequest(message.id as string, message_str);
        if (res) {
          let obj = JSON.parse(res);

          response = { status: obj.body.status, reason: '', request_id: obj.body.request_id };
          if (obj.body.reason != null) response.reason = obj.body.reason;

          diag.trace?.('dbr', `Response received with status ${obj.body.status}`);
        }
      }
    } catch (e) {
      diag.err('dbr', 'Cannot send a message due to: ' + e);
      throw e;
    }
    return response;
  }

  async dbr_ex(ani: string, db_number: number, reason: string): Promise<DbrExResponse> {
    // send dbr_request and wait for response, ALI comes later in update event
    let response = await this.dbr(ani, db_number, reason);

    return await new Promise((resolve, reject) => {
      let handler = (event: CustomEvent) => {
        try {
          let dbrExResponse: DbrExResponse = {
            status: response.status,
            reason: response.reason,
            request_id: response.request_id,
            ani: event.detail['ani'],
            ali: event.detail['ali'],
            pidflo: event.detail['pidflo'],
            ali_result: event.detail['ali_result'],
            time_count: event.detail['time_count'],
          };

          // match received update to the request just sent
          if (dbrExResponse.ani === ani) {
            diag.trace?.('dbr_ex', `Receive DBR update for ${ani}`);
            this.removeEventListener('dbr_update', handler as EventListener);
            resolve(dbrExResponse);
          }
        } catch (e) {
          diag.err('dbr_ex', `Catch error ${e}`);
          reject(e);
        }
      };

      setTimeout(() => {
        this.removeEventListener('dbr_update', handler as EventListener);
        reject(new Error('DBR timed out'));
      }, 10000);

      if ((response.status = AppServerClientResponseStatus.SUCCESS)) {
        this.addEventListener('dbr_update', handler as EventListener);
      } else {
        // get failure response
        diag.err('dbr_ex', `DBR response failure`);
        this.removeEventListener('dbr_update', handler as EventListener);
        reject(new Error('DBR response failure'));
      }
    });
  }

  async cancelBlockingDbr(): Promise<AppServerClientResponse> {
    diag.trace?.('cancelBlockingDbr', `Dispatch dbr_update event`);

    // TODO: add in json protocol between client and TS
    let body = {
      status: 'success',
      reason: 'cancelled',
    };
    this.dispatchEvent(new CustomEvent('dbr_update', { detail: body }));

    let response: AppServerClientResponse = new AppServerClientResponse();
    response.status = body.status;
    response.reason = body.reason;
    return response;
  }

  async detectTdd(destination: AppServerNode, ucid: string): Promise<AppServerClientResponse> {
    diag.trace?.('detectTdd', `Send: detect_tdd_request to ${destination} for call ${ucid}`);

    let response: AppServerClientResponse = new AppServerClientResponse();
    try {
      let message: MessageRequest = {
        id: this.generateId(),
        'content-type': 'detect_tdd_request',
        destination: [destination],
        type: 'request',
        source: this.position_id.toString(),
        body: {
          version: '0.0.1',
          position_id: this.position_id,
          ucid,
        },
      };
      let message_str = JSON.stringify(message);
      if (this.rwsc != null) {
        let res = await this.rwsc.sendRequest(message.id as string, message_str);
        if (res) {
          let obj = JSON.parse(res);
          response = { status: obj.body.status, reason: obj.body.reason };
          diag.trace?.('detectTdd', `Response received with status ${obj.body.status}`);
        }
      }
    } catch (e) {
      diag.err('detectTdd', 'Cannot send a message due to' + e);
      throw e;
    }

    return response;
  }

  async dial(destination: AppServerNode, ucid: string, number: string): Promise<AppServerClientResponse> {
    diag.trace?.('dial', `Send: dial_request to ${destination} for call ${ucid} with ${number}`);

    let response: AppServerClientResponse = new AppServerClientResponse();
    try {
      let message: MessageRequest = {
        id: this.generateId(),
        'content-type': 'dial_request',
        destination: [destination],
        type: 'request',
        source: this.position_id.toString(),
        body: {
          version: '0.0.1',
          position_id: this.position_id,
          number,
          ucid,
        },
      };
      let message_str = JSON.stringify(message);
      if (this.rwsc != null) {
        let res = await this.rwsc.sendRequest(message.id as string, message_str);
        if (res) {
          let obj = JSON.parse(res);
          response = { status: obj.body.status, reason: obj.body.reason };
          diag.trace?.('dial', `Response received with status ${obj.body.status}`);
        }
      }
    } catch (e) {
      diag.err('dial', 'Cannot send a message due to' + e);
      throw e;
    }

    return response;
  }

  async enableDtmf(destination: AppServerNode, ucid: string): Promise<AppServerClientResponse> {
    diag.trace?.('enableDtmf', `Send: enable_dtmf_request to ${destination} for call ${ucid}`);

    let response: AppServerClientResponse = new AppServerClientResponse();
    try {
      let message: MessageRequest = {
        id: this.generateId(),
        'content-type': 'enable_dtmf_request',
        destination: [destination],
        type: 'request',
        source: this.position_id.toString(),
        body: {
          version: '0.0.1',
          position_id: this.position_id,
          ucid,
        },
      };
      let message_str = JSON.stringify(message);
      if (this.rwsc != null) {
        let res = await this.rwsc.sendRequest(message.id as string, message_str);
        if (res) {
          let obj = JSON.parse(res);
          response = { status: obj.body, reason: obj.body.reason };
          diag.trace?.('enableDtmf', `Response received with status ${obj.body.status}`);
        }
      }
    } catch (e) {
      diag.err('enableDtmf', 'Cannot send a message due to' + e);
      throw e;
    }

    return response;
  }

  async hookflash(destination: AppServerNode, ucid: string): Promise<AppServerClientResponse> {
    diag.trace?.('hookflash', `Send: hookflash_request to ${destination} for call ${ucid}`);

    let response: AppServerClientResponse = new AppServerClientResponse();
    try {
      let message: MessageRequest = {
        id: this.generateId(),
        'content-type': 'hookflash_request',
        destination: [destination],
        type: 'request',
        source: this.position_id.toString(),
        body: {
          version: '0.0.1',
          position_id: this.position_id,
          ucid,
        },
      };
      let message_str = JSON.stringify(message);
      if (this.rwsc != null) {
        let res = await this.rwsc.sendRequest(message.id as string, message_str);
        if (res) {
          let obj = JSON.parse(res);
          response = { status: obj.body.status, reason: obj.body.reason };
          diag.trace?.('hookflash', `Response received with status ${obj.body.status}`);
        }
      }
    } catch (e) {
      diag.err('hookflash', 'Cannot send a message due to' + e);
      throw e;
    }

    return response;
  }

  // async isAppServerNodeUp(node: AppServerNode): Promise<boolean> {
  //     let response = false;
  //     try {
  //         let message: MessageRequest = {
  //             id: this.generateId(),
  //             "content-type": "is_app_server_node_up",
  //             type: "request",
  //             source: this.position_id.toString(),
  //             body: {
  //                 version: "0.0.1",
  //                 position_id: this.position_id,
  //                 node
  //             }
  //         };
  //         let message_str = JSON.stringify(message);
  //         if (this.rwsc != null) {
  //             let res = await this.rwsc.sendRequest(message.id as string, message_str);
  //             if (res) {
  //                 console.log('res', res);
  //                 response = res;
  //             }
  //         }

  //     } catch (e) {
  //         console.error('Cannot send a message due to', e);
  //         throw e;
  //     }
  //     return response;
  // }

  async positionConnect(destination: AppServerNode, ucid: string): Promise<AppServerClientResponse> {
    diag.trace?.('positionConnect', `Send: position_connect_request to ${destination} for call ${ucid}`);

    let response: AppServerClientResponse = new AppServerClientResponse();
    try {
      let message: MessageRequest = {
        id: this.generateId(),
        'content-type': 'position_connect_request',
        destination: [destination],
        type: 'request',
        source: this.position_id.toString(),
        body: {
          version: '0.0.1',
          position_id: this.position_id,
          ucid,
        },
      };
      let message_str = JSON.stringify(message);
      if (this.rwsc != null) {
        let res = await this.rwsc.sendRequest(message.id as string, message_str);
        if (res) {
          // console.log('res', res);
          let obj = JSON.parse(res);
          response = { status: obj.body.status, reason: obj.body.reason };
          diag.trace?.('positionConnect', `Response received with status ${obj.body.status}`);
        }
      }
    } catch (e) {
      diag.err('positionConnect', 'Cannot send a message due to' + e);
      throw e;
    }

    return response;
  }

  async positionDisconnect(destination: AppServerNode, ucid: string): Promise<AppServerClientResponse> {
    diag.trace?.('positionDisconnect', `Send: position_disconnect_request to ${destination} for call ${ucid}`);

    let response: AppServerClientResponse = new AppServerClientResponse();
    try {
      let message: MessageRequest = {
        id: this.generateId(),
        'content-type': 'position_disconnect_request',
        destination: [destination],
        type: 'request',
        source: this.position_id.toString(),
        body: {
          version: '0.0.1',
          position_id: this.position_id,
          ucid,
        },
      };
      let message_str = JSON.stringify(message);
      if (this.rwsc != null) {
        let res = await this.rwsc.sendRequest(message.id as string, message_str);
        if (res) {
          let obj = JSON.parse(res);
          response = { status: obj.body.status, reason: obj.body.reason };
          diag.trace?.('positionDisconnect', `Response received with status ${obj.body.status}`);
        }
      }
    } catch (e) {
      diag.err('positionDisconnect', 'Cannot send a message due to' + e);
      throw e;
    }

    return response;
  }

  private async reportAgentLogOn(): Promise<AppServerClientResponse> {
    return this.reportAgentStatus('', '', '', AgentStatus.AGENT_LOG_ON, '', '', '', '', '', '');
  }

  private async reportAgentLogOff(): Promise<AppServerClientResponse> {
    return this.reportAgentStatus('', '', '', AgentStatus.AGENT_LOG_OFF, '', '', '', '', '', '');
  }

  async reportAcdLogOn(acdq_list: string): Promise<AppServerClientResponse> {
    return this.reportAgentStatus('', '', '', AgentStatus.ACD_LOG_ON, acdq_list, '', '', '', '', '');
  }

  async reportAcdLogOff(
    acdq_list: string,
    reason_code: string,
    reason_code_desc: string
  ): Promise<AppServerClientResponse> {
    return this.reportAgentStatus(
      '',
      '',
      '',
      AgentStatus.ACD_LOG_OFF,
      acdq_list,
      '',
      reason_code,
      reason_code_desc,
      '',
      ''
    );
  }

  async reportRingGroupLogOn(rg_list: string): Promise<AppServerClientResponse> {
    return this.reportAgentStatus('', '', '', AgentStatus.RINGGROUP_LOG_ON, '', rg_list, '', '', '', '');
  }

  async reportRingGroupLogOff(rg_list: string): Promise<AppServerClientResponse> {
    return this.reportAgentStatus('', '', '', AgentStatus.RINGGROUP_LOG_OFF, '', rg_list, '', '', '', '');
  }

  async reportDynamicAcdLogOn(acdq_list: string, agent_id: string): Promise<AppServerClientResponse> {
    return this.reportAgentStatus('', '', agent_id, AgentStatus.DYNAMIC_ACD_LOG_ON, acdq_list, '', '', '', '', '');
  }

  async reportDynamicAcdLogOff(acdq_list: string, agent_id: string): Promise<AppServerClientResponse> {
    return this.reportAgentStatus('', '', agent_id, AgentStatus.DYNAMIC_ACD_LOG_OFF, acdq_list, '', '', '', '', '');
  }

  async reportDynamicOnAcdLogOn(acdq_list: string, agent_id: string): Promise<AppServerClientResponse> {
    return this.reportAgentStatus('', '', agent_id, AgentStatus.DYNAMICON_ACD_LOG_ON, acdq_list, '', '', '', '', '');
  }

  async reportDynamicOnAcdLogOff(acdq_list: string, agent_id: string): Promise<AppServerClientResponse> {
    return this.reportAgentStatus('', '', agent_id, AgentStatus.DYNAMICON_ACD_LOG_OFF, acdq_list, '', '', '', '', '');
  }

  async reportAcdReady(acdq_list: string): Promise<AppServerClientResponse> {
    return this.reportAgentStatus('', '', '', AgentStatus.ACD_READY, acdq_list, '', '', '', '', '');
  }

  async reportAcdNotReady(
    acdq_list: string,
    reason_code: string,
    reason_code_desc: string
  ): Promise<AppServerClientResponse> {
    return this.reportAgentStatus(
      '',
      '',
      '',
      AgentStatus.ACD_NOT_READY,
      acdq_list,
      '',
      reason_code,
      reason_code_desc,
      '',
      ''
    );
  }

  async reportOnCall(
    ucid: string,
    viper_node: AppServerNode,
    route: string,
    is_incoming: boolean
  ): Promise<AppServerClientResponse> {
    let direction: string = is_incoming ? 'incoming' : 'outgoing';
    return this.reportAgentStatus(
      ucid,
      getViperNodeName(viper_node),
      '',
      AgentStatus.ON_CALL,
      '',
      '',
      '',
      '',
      route,
      direction,
      viper_node
    );
  }

  async reportOffCall(ucid: string, viper_node: AppServerNode): Promise<AppServerClientResponse> {
    return this.reportAgentStatus(
      ucid,
      getViperNodeName(viper_node),
      '',
      AgentStatus.OFF_CALL,
      '',
      '',
      '',
      '',
      '',
      '',
      viper_node
    );
  }

  private async reportAgentStatus(
    ucid: string,
    viper_node: string,
    agent_logon_id: string,
    status: AgentStatus,
    acdq_list: string,
    rg_list: string,
    reason_code: string,
    reason_code_desc: string,
    route: string,
    direction: string,
    destination: AppServerNode = AppServerNode.NODE_ANY
  ): Promise<AppServerClientResponse> {
    diag.trace?.(
      'reportAgentStatus',
      `Send: report_agent_status_request to ${destination} with ${ucid}, ${viper_node}, ${agent_logon_id}, ${status}, ${acdq_list}, ${rg_list}, ${reason_code}, ${reason_code_desc},  ${route}, ${direction}`
    );
    let response: AppServerClientResponse = new AppServerClientResponse();
    try {
      let message: MessageRequest = {
        id: this.generateId(),
        'content-type': 'report_agent_status_request',
        type: 'request',
        source: this.position_id.toString(),
        destination: [destination],
        body: {
          version: '0.0.1',
          position_id: this.position_id,
          ucid: ucid !== '' ? ucid : undefined,
          viper_node: viper_node !== '' ? viper_node : undefined,
          agent_logon_id: agent_logon_id !== '' ? agent_logon_id : undefined,
          status,
          acdq_list: acdq_list !== '' ? acdq_list : undefined,
          rg_list: rg_list !== '' ? rg_list : undefined,
          reason_code: reason_code !== '' ? reason_code : undefined,
          reason_code_desc: reason_code_desc !== '' ? reason_code_desc : undefined,
          route: route !== '' ? route : undefined,
          direction: direction !== '' ? direction : undefined,
        },
      };
      let message_str = JSON.stringify(message);
      if (this.rwsc != null) {
        let res = await this.rwsc.sendRequest(message.id as string, message_str);
        if (res) {
          let obj = JSON.parse(res);
          response = { status: obj.body.status, reason: obj.body.reason };
          diag.trace?.('reportAgentStatus', `Response received with status ${obj.body.status}`);
        }
      }
    } catch (e) {
      diag.err('reportAgentStatus', 'Cannot send a message due to' + e);
      throw e;
    }

    return response;
  }

  async reportAliError(ucid: string, viper_node: AppServerNode, error: boolean): Promise<AppServerClientResponse> {
    diag.trace?.('reportAliError', `Send: report_ali_error_request to ${viper_node} for call ${ucid} with ${error}`);

    let response: AppServerClientResponse = new AppServerClientResponse();
    try {
      let message: MessageRequest = {
        id: this.generateId(),
        'content-type': 'report_ali_error_request',
        type: 'request',
        source: this.position_id.toString(),
        destination: [viper_node],
        body: {
          version: '0.0.1',
          position_id: this.position_id,
          ucid,
          viper_node: getViperNodeName(viper_node),
          error,
        },
      };
      let message_str = JSON.stringify(message);
      if (this.rwsc != null) {
        let res = await this.rwsc.sendRequest(message.id as string, message_str);
        if (res) {
          let obj = JSON.parse(res);
          response = { status: obj.body.status, reason: obj.body.reason };
          diag.trace?.('reportAliError', `Response received with status ${obj.body.status}`);
        }
      }
    } catch (e) {
      diag.err('reportAliError', 'Cannot send a message due to' + e);
      throw e;
    }

    return response;
  }

  async lvf(
    request_id: string,
    civic_address: string,
    service_uri: string,
    ucid: string,
    viper_node: AppServerNode
  ): Promise<AppServerClientResponse> {
    diag.trace?.(
      'lvf',
      `Send: lvf_request to ${viper_node} for call ${ucid} with ${request_id}, ${civic_address}, ${service_uri}`
    );

    let response: AppServerClientResponse = new AppServerClientResponse();
    try {
      let message: MessageRequest = {
        id: this.generateId(),
        'content-type': 'lvf_request',
        type: 'request',
        source: this.position_id.toString(),
        destination: [viper_node],
        body: {
          version: '0.0.1',
          position_id: this.position_id,
          ucid,
          viper_node: getViperNodeName(viper_node),
          request_id,
          civic_address,
          service_uri,
        },
      };
      let message_str = JSON.stringify(message);
      if (this.rwsc != null) {
        let res = await this.rwsc.sendRequest(message.id as string, message_str);
        if (res) {
          let obj = JSON.parse(res);
          response = { status: obj.body.status, reason: obj.body.reason };
          diag.trace?.('lvf', `Response received with status ${obj.body.status}`);
        }
      }
    } catch (e) {
      diag.err('lvf', 'Cannot send a message due to' + e);
      throw e;
    }

    return response;
  }

  async lvf_ex(
    request_id: string,
    civic_address: string,
    service_uri: string,
    ucid: string,
    viper_node: AppServerNode | undefined
  ): Promise<LvfResponse> {
    // send lvr_request and wait for response that comes later in update event
    let response = await this.lvf(
      request_id,
      civic_address,
      service_uri,
      ucid,
      viper_node === undefined ? AppServerNode.NODE_ANY : viper_node
    );

    return await new Promise((resolve, reject) => {
      let handler = (event: CustomEvent) => {
        try {
          let lvfResponse: LvfResponse = {
            status: response.status,
            reason: response.reason,
            request_id: event.detail['request_id'],
            response: event.detail['response'],
          };

          // match received update to the request just sent
          if (lvfResponse.request_id === request_id) {
            diag.trace?.('lvf_ex', `Receive LVF update for ${request_id}`);
            this.removeEventListener('lvf_update', handler as EventListener);

            if (lvfResponse.response === '') {
              reject(new Error('No LVF response'));
            } else {
              resolve(lvfResponse);
            }
          }
        } catch (e) {
          diag.err('lvf_ex', `Catch error ${e}`);
          reject(e);
        }
      };

      setTimeout(() => {
        this.removeEventListener('lvf_update', handler as EventListener);
        reject(new Error('LVF timed out'));
      }, 10000);

      if ((response.status = AppServerClientResponseStatus.SUCCESS)) {
        this.addEventListener('lvf_update', handler as EventListener);
      } else {
        // get failure response
        diag.err('lvf_ex', `LVF response failure`);
        this.removeEventListener('lvf_update', handler as EventListener);
        reject(new Error('LVF response failure'));
      }
    });
  }

  async cancelLvf(request_id: string): Promise<AppServerClientResponse> {
    diag.trace?.('cancelLvf', `Dispatch lvf_update event`);

    // TODO: add in json protocol between client and TS
    let body = {
      status: 'success',
      reason: 'cancelled',
      request_id,
      response: '',
    };
    this.dispatchEvent(new CustomEvent('lvf_update', { detail: body }));

    let response: AppServerClientResponse = new AppServerClientResponse();
    response.status = body.status;
    response.reason = body.reason;
    return response;
  }

  async reportBroadcastMessage(
    msg_destination: string,
    message: string,
    priority: string,
    incident_key: string
  ): Promise<AppServerClientResponse> {
    diag.trace?.(
      'reportBroadcastMessage',
      `Send: report_broadcast_message_request with ${msg_destination}, ${message}, ${priority}, ${incident_key}`
    );

    let response: AppServerClientResponse = new AppServerClientResponse();
    try {
      let message_request: MessageRequest = {
        id: this.generateId(),
        'content-type': 'report_broadcast_message_request',
        type: 'request',
        source: this.position_id.toString(),
        destination: [AppServerNode.NODE_ANY],
        body: {
          version: '0.0.1',
          position_id: this.position_id,
          message,
          priority,
          incident_key,
          destination: msg_destination,
        },
      };
      let message_str = JSON.stringify(message_request);
      if (this.rwsc != null) {
        let res = await this.rwsc.sendRequest(message_request.id as string, message_str);
        if (res) {
          let obj = JSON.parse(res);
          response = { status: obj.body.status, reason: obj.body.reason };
          diag.trace?.('reportBroadcastMessage', `Response received with status ${obj.body.status}`);
        }
      }
    } catch (e) {
      diag.err('reportBroadcastMessage', 'Cannot send a message due to' + e);
      throw e;
    }

    return response;
  }

  async reportCallTransfer(
    viper_node: AppServerNode,
    ucid: string,
    key: string,
    short_value: string,
    long_value: string,
    agency_id: string,
    agency_name: string,
    agency_type_id: string,
    agency_type_name: string,
    transfer_failure: boolean
  ): Promise<AppServerClientResponse> {
    diag.trace?.(
      'reportCallTransfer',
      `Send: report_call_transfer_request to ${viper_node} for call ${ucid} with ${key}, ${short_value}, ${long_value}, ${agency_id}, ${agency_name}, ${agency_type_id}, ${agency_type_name}, ${transfer_failure}`
    );

    let response: AppServerClientResponse = new AppServerClientResponse();
    try {
      let message: MessageRequest = {
        id: this.generateId(),
        'content-type': 'report_call_transfer_request',
        type: 'request',
        source: this.position_id.toString(),
        destination: [viper_node],
        body: {
          version: '0.0.1',
          position_id: this.position_id,
          ucid,
          key,
          short_value,
          long_value,
          agency_id,
          agency_name,
          agency_type_id,
          agency_type_name,
          transfer_failure,
        },
      };
      let message_str = JSON.stringify(message);
      if (this.rwsc != null) {
        let res = await this.rwsc.sendRequest(message.id as string, message_str);
        if (res) {
          let obj = JSON.parse(res);
          response = { status: obj.body.status, reason: obj.body.reason };
          diag.trace?.('reportCallTransfer', `Response received with status ${obj.body.status}`);
        }
      }
    } catch (e) {
      diag.err('reportCallTransfer', 'Cannot send a message due to' + e);
      throw e;
    }

    return response;
  }

  async reportDbrReason(request_id: string, ani: string, reason: string): Promise<AppServerClientResponse> {
    diag.trace?.('reportDbrReason', `Send: report_dbr_reason_request with ${request_id} for ${ani} with ${reason}`);

    let response: AppServerClientResponse = new AppServerClientResponse();
    try {
      let message: MessageRequest = {
        id: this.generateId(),
        'content-type': 'report_dbr_reason_request',
        type: 'request',
        source: this.position_id.toString(),
        destination: [AppServerNode.NODE_ANY],
        body: {
          version: '0.0.1',
          position_id: this.position_id,
          ani,
          reason,
          request_id,
        },
      };
      let message_str = JSON.stringify(message);
      if (this.rwsc != null) {
        let res = await this.rwsc.sendRequest(message.id as string, message_str);
        if (res) {
          let obj = JSON.parse(res);
          response = { status: obj.body.status, reason: obj.body.reason };
          diag.trace?.('reportDbrReason', `Response received with status ${obj.body.status}`);
        }
      }
    } catch (e) {
      diag.err('reportDbrReason', 'Cannot send a message due to' + e);
      throw e;
    }

    return response;
  }

  async reportOutgoingCallFailure(
    ucid: string,
    viper_node: string,
    dialed_number: string,
    duration: number,
    fail_duration: number,
    abandoned_ucid: string
  ): Promise<AppServerClientResponse> {
    diag.trace?.(
      'reportOutgoingCallFailure',
      `Send: report_outgoing_call_failure_request to ${viper_node} for call ${ucid} with ${dialed_number}, ${duration}, ${fail_duration}, ${abandoned_ucid}`
    );

    let response: AppServerClientResponse = new AppServerClientResponse();
    try {
      let message: MessageRequest = {
        id: this.generateId(),
        'content-type': 'report_outgoing_call_failure_request',
        type: 'request',
        source: this.position_id.toString(),
        destination: [AppServerNode.NODE_ANY],
        body: {
          version: '0.0.1',
          position_id: this.position_id,
          ucid,
          viper_node,
          dialed_number,
          duration,
          fail_duration,
          abandoned_ucid,
        },
      };
      let message_str = JSON.stringify(message);
      if (this.rwsc != null) {
        let res = await this.rwsc.sendRequest(message.id as string, message_str);
        if (res) {
          let obj = JSON.parse(res);
          response = { status: obj.body.status, reason: obj.body.reason };
          diag.trace?.('reportOutgoingCallFailure', `Response received with status ${obj.body.status}`);
        }
      }
    } catch (e) {
      diag.err('reportOutgoingCallFailure', 'Cannot send a message due to' + e);
      throw e;
    }

    return response;
  }

  async reportRecallAbandoned(
    ucid: string,
    viper_node: AppServerNode,
    abandoned_ucid: string,
    dir: ExtInterface.Direction
  ): Promise<AppServerClientResponse> {
    diag.trace?.(
      'reportRecallAbandoned',
      `Send: report_recall_abandoned_request to ${viper_node} for call ${ucid} for ${abandoned_ucid}, ${dir}`
    );

    let response: AppServerClientResponse = new AppServerClientResponse();
    try {
      let message: MessageRequest = {
        id: this.generateId(),
        'content-type': 'report_recall_abandoned_request',
        type: 'request',
        source: this.position_id.toString(),
        destination: [viper_node],
        body: {
          version: '0.0.1',
          position_id: this.position_id,
          ucid,
          viper_node: getViperNodeName(viper_node),
          abandoned_ucid,
          direction: dir == ExtInterface.Direction.Incoming ? 'incoming' : 'outgoing',
        },
      };
      let message_str = JSON.stringify(message);
      if (this.rwsc != null) {
        let res = await this.rwsc.sendRequest(message.id as string, message_str);
        if (res) {
          let obj = JSON.parse(res);
          response = { status: obj.body.status, reason: obj.body.reason };
          diag.trace?.('reportRecallAbandoned', `Response received with status ${obj.body.status}`);
        }
      }
    } catch (e) {
      diag.err('reportRecallAbandoned', 'Cannot send a message due to' + e);
      throw e;
    }

    return response;
  }

  async reportAbandonedCallDisposition(abandoned_ucid: string, reason: string): Promise<AppServerClientResponse> {
    diag.trace?.(
      'reportAbandonedCallDisposition',
      `Send: report_abandoned_disp_request for call ${abandoned_ucid} with ${reason}`
    );

    let response: AppServerClientResponse = new AppServerClientResponse();
    try {
      let message: MessageRequest = {
        id: this.generateId(),
        'content-type': 'report_abandoned_disp_request',
        type: 'request',
        source: this.position_id.toString(),
        destination: [AppServerNode.NODE_ANY],
        body: {
          version: '0.0.1',
          position_id: this.position_id,
          abandoned_ucid,
          reason,
        },
      };
      let message_str = JSON.stringify(message);
      if (this.rwsc != null) {
        let res = await this.rwsc.sendRequest(message.id as string, message_str);
        if (res) {
          let obj = JSON.parse(res);
          response = { status: obj.body.status, reason: obj.body.reason };
          diag.trace?.('reportAbandonedCallDisposition', `Response received with status ${obj.body.status}`);
        }
      }
    } catch (e) {
      diag.err('reportAbandonedCallDisposition', 'Cannot send a message due to' + e);
      throw e;
    }

    return response;
  }

  async retransmit(destination: AppServerNode, ucid: string) {
    diag.trace?.('retransmit', `Send: retransmit_request to ${destination} for call ${ucid}`);

    return new Promise<AppServerClientResponse>(async (resolve, reject) => {
      let response: AppServerClientResponse = new AppServerClientResponse();
      try {
        let message: MessageRequest = {
          id: this.generateId(),
          'content-type': 'retransmit_request',
          destination: [destination],
          type: 'request',
          source: this.position_id.toString(),
          body: {
            version: '0.0.1',
            position_id: this.position_id,
            ucid,
          },
        };
        let message_str = JSON.stringify(message);
        if (this.rwsc != null) {
          let res = await this.rwsc.sendRequest(message.id as string, message_str);
          if (res) {
            let obj = JSON.parse(res);
            response = { status: obj.body.status, reason: obj.body.reason };
            diag.trace?.('tandemTransfer', `Response received with status ${obj.body.status}`);
          } else {
            diag.err('retransmit', 'Cannot send retransmit_request');
            reject(new Error('Cannot send retransmit_request'));
          }
        }
      } catch (e) {
        diag.err('retransmit', 'Cannot send a message due to' + e);
        reject(e);
      }

      resolve(response);
    });
  }

  async tandemTransfer(destination: AppServerNode, ucid: string): Promise<AppServerClientResponse> {
    let response: AppServerClientResponse = new AppServerClientResponse();
    try {
      diag.trace?.('tandemTransfer', `Send: tandem_transfer_request to ${destination} for call ${ucid}`);

      let message: MessageRequest = {
        id: this.generateId(),
        'content-type': 'tandem_transfer_request',
        destination: [destination],
        type: 'request',
        source: this.position_id.toString(),
        body: {
          version: '0.0.1',
          position_id: this.position_id,
          ucid,
        },
      };
      let message_str = JSON.stringify(message);
      if (this.rwsc != null) {
        let res = await this.rwsc.sendRequest(message.id as string, message_str);
        if (res) {
          let obj = JSON.parse(res);
          response = { status: obj.body.status, reason: obj.body.reason };
          diag.trace?.('tandemTransfer', `Response received with status ${obj.body.status}`);
        }
      }
    } catch (e) {
      diag.err('tandemTransfer', 'Cannot send a message due to' + e);
      throw e;
    }

    return response;
  }

  async reportAgentState(
    agentPrimaryState: string,
    agentSecondaryState: string,
    connectedCallUcid: string
  ): Promise<AppServerClientResponse> {
    diag.trace?.(
      'reportAgentState',
      `Send: report_agent_state_request with ${agentPrimaryState}, ${agentSecondaryState}, ${connectedCallUcid}`
    );

    let response: AppServerClientResponse = new AppServerClientResponse();
    try {
      let message: MessageRequest = {
        id: this.generateId(),
        'content-type': 'report_agent_state_request',
        type: 'request',
        source: this.position_id.toString(),
        destination: [AppServerNode.NODE_ANY],
        body: {
          version: '0.0.1',
          position_id: this.position_id,
          agentPrimaryState,
          agentSecondaryState,
          connectedCallUcid: connectedCallUcid !== '' ? connectedCallUcid : undefined,
        },
      };
      let message_str = JSON.stringify(message);
      if (this.rwsc != null) {
        let res = await this.rwsc.sendRequest(message.id as string, message_str);
        if (res) {
          let obj = JSON.parse(res);
          response = { status: obj.body.status, reason: obj.body.reason };
          diag.trace?.('reportAgentState', `Response received with status ${obj.body.status}`);
        }
      }
    } catch (e) {
      diag.err('reportAgentState', 'Cannot send a message due to' + e);
      throw e;
    }

    return response;
  }

  async detectRtt(destination: AppServerNode, ucid: string): Promise<AppServerClientResponse> {
    diag.trace?.('detectRtt', `Send: detect_rtt_request to ${destination} for call ${ucid}`);

    let response: AppServerClientResponse = new AppServerClientResponse();
    try {
      let message: MessageRequest = {
        id: this.generateId(),
        'content-type': 'detect_rtt_request',
        destination: [destination],
        type: 'request',
        source: this.position_id.toString(),
        body: {
          version: '0.0.1',
          position_id: this.position_id,
          ucid,
        },
      };
      let message_str = JSON.stringify(message);
      if (this.rwsc != null) {
        let res = await this.rwsc.sendRequest(message.id as string, message_str);
        if (res) {
          let obj = JSON.parse(res);
          response = { status: obj.body, reason: obj.body.reason };
          diag.trace?.('detectRtt', `Response received with status ${obj.body.status}`);
        }
      }
    } catch (e) {
      diag.err('detectRtt', 'Cannot send a message due to' + e);
      throw e;
    }

    return response;
  }

  async attachRtt(destination: AppServerNode, ucid: string, transcript: string): Promise<AppServerClientResponse> {
    let response: AppServerClientResponse = new AppServerClientResponse();
    try {
      diag.trace?.('attachRtt', `Send: attach_rtt_request to ${destination} for call ${ucid} with ${transcript}`);

      let message: MessageRequest = {
        id: this.generateId(),
        'content-type': 'attach_rtt_request',
        destination: [destination],
        type: 'request',
        source: this.position_id.toString(),
        body: {
          version: '0.0.1',
          position_id: this.position_id,
          ucid,
          transcript,
        },
      };

      let message_str = JSON.stringify(message);
      if (this.rwsc != null) {
        let res = await this.rwsc.sendRequest(message.id as string, message_str);
        if (res) {
          let obj = JSON.parse(res);
          response = { status: obj.body.status, reason: obj.body.reason };
          diag.trace?.('attachRtt', `Response received with status ${obj.body.status}`);
        }
      }
    } catch (e) {
      diag.err('attachRtt', 'Cannot send a message due to: ' + e);
      throw e;
    }

    return response;
  }

  async reportNonRtpMsg(
    destination: AppServerNode,
    ucid: string,
    text: string,
    direction: string,
    protocol: string
  ): Promise<AppServerClientResponse> {
    diag.trace?.(
      'reportNonRtpMsg',
      `Send: report_non_rtp_msg_request to ${destination} for call ${ucid} with ${text}, ${direction}, ${protocol}`
    );

    let response: AppServerClientResponse = new AppServerClientResponse();
    try {
      let message: MessageRequest = {
        id: this.generateId(),
        'content-type': 'report_non_rtp_msg_request',
        type: 'request',
        source: this.position_id.toString(),
        destination: [destination],
        body: {
          version: '0.0.1',
          position_id: this.position_id,
          ucid,
          text,
          direction,
          protocol,
        },
      };
      let message_str = JSON.stringify(message);
      if (this.rwsc != null) {
        let res = await this.rwsc.sendRequest(message.id as string, message_str);
        if (res) {
          let obj = JSON.parse(res);
          response = { status: obj.body.status, reason: obj.body.reason };
          diag.trace?.('reportNonRtpMsg', `Response received with status ${obj.body.status}`);
        }
      }
    } catch (e) {
      diag.err('reportNonRtpMsg', 'Cannot send a message due to' + e);
      throw e;
    }

    return response;
  }

  async terminate(): Promise<boolean> {
    if (this.rwsc != null) {
      this.rwsc.close();
    }

    return true;
  }

  async reportToCallCDR(viper_node: AppServerNode, ucid: string, params: object): Promise<AppServerClientResponse> {
    diag.trace?.(
      'reportToCallCDR',
      `Send: report_to_call_cdr_request to ${viper_node} for call ${ucid} with ${JSON.stringify(params)}`
    );

    let response: AppServerClientResponse = new AppServerClientResponse();
    try {
      let message: MessageRequest = {
        id: this.generateId(),
        'content-type': 'report_to_call_cdr_request',
        type: 'request',
        source: this.position_id.toString(),
        destination: [viper_node],
        body: {
          version: '0.0.1',
          position_id: this.position_id,
          ucid,
          params,
        },
      };
      let message_str = JSON.stringify(message);
      if (this.rwsc != null) {
        let res = await this.rwsc.sendRequest(message.id as string, message_str);
        if (res) {
          let obj = JSON.parse(res);
          response = { status: obj.body.status, reason: obj.body.reason };
          diag.trace?.('reportToCallCDR', `Response received with status ${obj.body.status}`);
        }
      }
    } catch (e) {
      diag.err('reportToCallCDR', 'Cannot send a message due to' + e);
      throw e;
    }

    return response;
  }

  async reportToAgentCDR(params: object): Promise<AppServerClientResponse> {
    diag.trace?.('reportToAgentCDR', `Send: report_to_agent_cdr_request with ${JSON.stringify(params)}`);

    let response: AppServerClientResponse = new AppServerClientResponse();
    try {
      let message: MessageRequest = {
        id: this.generateId(),
        'content-type': 'report_to_agent_cdr_request',
        type: 'request',
        source: this.position_id.toString(),
        destination: [AppServerNode.NODE_ANY],
        body: {
          version: '0.0.1',
          position_id: this.position_id,
          params,
        },
      };
      let message_str = JSON.stringify(message);
      if (this.rwsc != null) {
        let res = await this.rwsc.sendRequest(message.id as string, message_str);
        if (res) {
          let obj = JSON.parse(res);
          response = { status: obj.body.status, reason: obj.body.reason };
          diag.trace?.('reportToAgentCDR', `Response received with status ${obj.body.status}`);
        }
      }
    } catch (e) {
      diag.err('reportToAgentCDR', 'Cannot send a message due to' + e);
      throw e;
    }

    return response;
  }

  async logoff(): Promise<boolean> {
    let response: AppServerClientResponse = await this.reportAgentLogOff();
    if (response.status !== 'success') {
      diag.warn('logoff', 'Unable to report AgentLogOff');
    }

    diag.trace?.('logoff', 'Send: logoff_request');

    try {
      let message: MessageRequest = {
        'content-type': 'logoff_request',
        type: 'request',
        source: this.position_id.toString(),
        body: {
          version: '0.0.1',
          position_id: this.position_id,
        },
      };
      if (this.rwsc != null) {
        message.id = this.generateId();
        message.destination = [AppServerNode.NM];
        await this.rwsc.sendRequest(message.id as string, JSON.stringify(message));

        // Iterate configured Node and send to each of them
        for (let node of webCfg.nodeCfgMap) {
          message.id = this.generateId();
          message.destination = [getAppServerNode(node.id)];
          await this.rwsc.sendRequest(message.id, JSON.stringify(message));
        }
      }
    } catch (e) {
      diag.err('logoff', 'Cannot send a message due to' + e);
      throw e;
    }

    return true;
  }

  async initialize(
    appSrvGwList: string[],
    position_id: number,
    position_name: string,
    position_dn: string
  ): Promise<void> {
    diag.trace?.('initialize', `Initialize appserverclient with ${position_id}, ${position_name}, ${position_dn}`);

    // Store Position information
    this.position_id = position_id;
    this.position_name = position_name;
    this.position_dn = position_dn;

    const urls: string[] = [];
    for (let i = 0; i < appSrvGwList.length; i++) {
      urls.push('wss://' + appSrvGwList[i] + '?posId=' + position_id);
    }
    this.rwsc = new ReconnectingWS(urls);

    this.rwsc.registerForReadyState(this.wsReadyState);

    await this.rwsc.open().then(() => {
      diag.out('initialize', 'Connected!');
      this.rwsc!.registerForUpdateEvents(this.updateEvent);
    });
  }

  async login(
    agent_logon_id: string,
    agent_first_name: string,
    agent_middle_name: string,
    agent_last_name: string,
    agent_role: string,
    psap_id: string,
    psap_name: string
  ): Promise<boolean> {
    diag.trace?.(
      'login',
      `login with ${agent_logon_id}, ${agent_first_name}, ${agent_middle_name}, ${agent_last_name}, ${agent_role}, ${psap_id}, ${psap_name},`
    );

    // Store Agent information
    this.agent_logon_id = agent_logon_id;
    this.agent_first_name = agent_first_name;
    this.agent_middle_name = agent_middle_name;
    this.agent_last_name = agent_last_name;
    this.agent_role = agent_role;
    this.psap_id = psap_id;
    this.psap_name = psap_name;

    try {
      if (this.rwsc != null) {
        this.rwsc.addEventListener('ReconnectedEvent', async () => {
          if (this.rwsc != null) {
            await this.loginInternal();
          }
        });

        await this.loginInternal();
      }
    } catch (e) {
      diag.err('login', 'Cannot send a message due to' + e);
      throw e;
    }

    let response: AppServerClientResponse = await this.reportAgentLogOn();
    if (response.status !== 'success') {
      diag.warn('login', 'Unable to report AgentLogOn');
    }

    return true;
  }

  private async loginInternal(destination: AppServerNode = AppServerNode.NODE_ALL) {
    diag.trace?.('loginInternal', `Send: login_request to ${destination}`);

    let message: MessageRequest = {
      'content-type': 'login_request',
      type: 'request',
      source: this.position_id.toString(),
      body: {
        version: '0.0.1',
        position_id: this.position_id,
        position_name: this.position_name,
        position_dn: this.position_dn,
        agent_logon_id: this.agent_logon_id,
        agent_first_name: this.agent_first_name,
        agent_middle_name: this.agent_middle_name,
        agent_last_name: this.agent_last_name,
        agent_role: this.agent_role,
        psap_id: this.psap_id,
        psap_name: this.psap_name,
      },
    };

    try {
      if (this.rwsc != null) {
        if (destination === AppServerNode.NODE_ALL) {
          // Send to NM
          message.id = this.generateId();
          message.destination = [AppServerNode.NM];
          await this.rwsc.sendRequest(message.id, JSON.stringify(message));

          // Iterate configured Node and send to each of them
          for (let node of webCfg.nodeCfgMap) {
            message.id = this.generateId();
            message.destination = [getAppServerNode(node.id)];
            await this.rwsc.sendRequest(message.id, JSON.stringify(message));
          }
        } else {
          message.id = this.generateId();
          message.destination = [destination];
          await this.rwsc.sendRequest(message.id, JSON.stringify(message));
        }
      }
    } catch (e) {
      diag.err('login', 'Cannot send a message due to' + e);
      throw e;
    }
  }

  private generateId(): string {
    if (this.sequenceId++ >= 100000) {
      this.sequenceId = 0;
    }
    let now = new Date();

    let date = now.toLocaleDateString('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' });
    let time = now.toLocaleTimeString('en-GB');

    let id =
      'P911WEB_' +
      date.replace(/-/g, '') +
      '_' +
      time.slice(0, 8).replace(/:/g, '') +
      '_' +
      this.sequenceId.toString().padStart(5, '0');
    return id;
  }

  private updateEvent = (parsedData: any) => {
    let contentType = parsedData['content-type'];
    diag.trace?.('updateEvent', 'Dispatch event for content-type: ' + contentType);

    switch (contentType) {
      case 'server_connection_update':
        this.loginInternal(parsedData['source']);
        this.dispatchEvent(new CustomEvent(contentType, { detail: parsedData['body'] }));
        break;

      case 'call_information_update':
      case 'service_list_update':
      case 'caller_disconnected_update':
      case 'dbr_update':
      case 'new_call_update':
      case 'release_call_update':
      case 'lvf_update':
        this.dispatchEvent(new CustomEvent(contentType, { detail: parsedData['body'] }));
        break;

      default:
        diag.warn('updateEvent', 'Unknown content-type: ' + contentType);
    }
  };

  private wsReadyState(readyState: number) {
    let formerLinkStatus: boolean = this.wsLinkStatus;
    if (this.rwsc && readyState === WebSocket.OPEN) {
      this.wsLinkStatus = true;
    } else {
      this.wsLinkStatus = false;
    }

    if (formerLinkStatus !== this.wsLinkStatus) {
      let appSrvGwStatusEvent: ExtInterface.AppSvrGwLinkStatus = new ExtInterface.AppSvrGwLinkStatus(
        this.wsLinkStatus ? ExtInterface.AppSvrGwLink.Up : ExtInterface.AppSvrGwLink.Down
      );
      this.dispatchEvent(appSrvGwStatusEvent);
    }
  }
}

// const appServerClient = new AppServerClient();
// Object.freeze(appServerClient);
// export { appServerClient };
