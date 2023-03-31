import { Diag } from '../../common/diagClient';
import { WebLineDev } from '../weblinedev';
import { WebNode } from '../webnode';
import { AcdMemberType, AcdQueueMembership } from '../loginState/acdLoginState';

const diag = new Diag('weblinedev.dynamicacdbysupervisor');

export enum AgentStat {
  ACDLogOn,
  ACDLogOff,
  DynamicACDLogOn,
  DynamicACDLogOff,
  DynamicOnACDLogOn,
  DynamicOnACDLogOff,
}

enum Action {
  LogOn = 'Logon',
  LogOff = 'Logoff',
  QueueAdd = 'QueueAdd',
  QueueRemove = 'QueueRemove',
}

export interface QueueStat {
  queueId: string;
  stat: AgentStat;
}

export interface AgentMembershipUpdate {
  svn: string | undefined;
  update: AgentQueueStatus;
  superAgent: string | undefined;
  changedQueue: AcdQueueMembership | undefined;
  action: Action;
}

export interface AgentQueueStatus {
  agent: string;
  queuesStatus: QueueStat[];
  manageable: boolean;
}

export interface SVNAgentsInfo {
  svn: string; //sat3
  agents: string[];
}

export class DynamicACDUpdate extends Event {
  agentQueueStatus: AgentQueueStatus;
  constructor(agentQueueStat: AgentQueueStatus) {
    super('DynamicACDUpdate');
    this.agentQueueStatus = agentQueueStat;
  }
}

export interface DynamicACDSnapshotResp {
  snapshot: AgentQueueStatus[];
  svnAgents: SVNAgentsInfo[];
}

export function processDynamicACDStatusSnapshot(node: WebNode, resp: DynamicACDSnapshotResp) {
  diag.trace?.(
    'processDynamicACDStatusSnapshot',
    `starting, snapshot <${JSON.stringify(resp.snapshot)}>, svnAgents <${JSON.stringify(
      resp.svnAgents
    )}> on node <${node.getNodeId()}>`
  );

  node.dynamicACDStatus = resp.snapshot as AgentQueueStatus[];

  let svnAgents = resp.svnAgents as SVNAgentsInfo[];
  for (let elem of node.dynamicACDStatus) {
    /* At primary/seconday/.. node: supervisor can manage all non-SVN agents
     * I am Not a satellite agent (pweb for now). find non-svn agents to set it manageable
     */
    elem.manageable = svnAgents.every((item) => !item.agents.includes(elem.agent));

    // (Not implement yet)At SVN node: supervisor can only manage same SVN agents
  }
}

export async function reportDynamicACDUpdate(lineDev: WebLineDev, node: WebNode, agentId: string) {
  if (!lineDev.dynamicACDSubscribed) return;
  const update = lineDev.dynamicACDStatus.find((i) => i.agent === agentId);
  diag.trace?.(
    'reportDynamicACDUpdate',
    `[Enter] Current lineDev status for agent <${agentId}> : <${JSON.stringify(update)}>`
  );
  if (!update) {
    const cur = node.dynamicACDStatus.find((i) => i.agent === agentId);
    if (cur) {
      lineDev.dynamicACDStatus.push(JSON.parse(JSON.stringify(cur)));
      diag.out(
        'reportDynamicACDUpdate',
        `[Adding...] new data: ${JSON.stringify(cur)}. By event from node<${node.getNodeId()}>`
      );
      const evt = new DynamicACDUpdate(cur);
      lineDev.report(evt);
    } else {
      diag.out('reportDynamicACDUpdate', `node<${node.getNodeId()}> No data No need to report! `);
    }
  } else {
    let report = false;
    const newStateOnNode = node.dynamicACDStatus.find((i) => i.agent === agentId);
    if (!newStateOnNode) {
      // Anohter agent static ACD logOff. Use the first event received from a node to update lineDev.
      // The events coming later won't be here. It will be processed above
      diag.out('reportDynamicACDUpdate', `[removing] cur data: <${JSON.stringify(update)}>`);
      const newArr = lineDev.dynamicACDStatus.filter((i) => i.agent !== agentId);
      lineDev.dynamicACDStatus = newArr;
      update.queuesStatus.length = 0;
      diag.out(
        'reportDynamicACDUpdate',
        `[Removing...] ${agentId} with <${JSON.stringify(update)}>. By the notification from node<${node.getNodeId()}>`
      );
      report = true;
    } else {
      /* Compare what is changed on current node with what is stored in linedev directly to report the update for now
       * The coming event from other node that has same information won't need to report again.
       * We will consider later if goes to the way like, await Promise.allsettled for waiting for all nodes to be updated
       * by their own events with a waiting timeout in case of a node in maintenance. Not necessory for now!
       */
      // Find difference
      if (update.manageable !== newStateOnNode.manageable) report = true;
      else if (update.queuesStatus.length !== newStateOnNode.queuesStatus.length) report = true;
      else {
        for (const qsConsolidate of newStateOnNode.queuesStatus) {
          let qs = update.queuesStatus.find((item) => item.queueId === qsConsolidate.queueId);
          if (!qs) report = true;
          else if (qs.stat !== qsConsolidate.stat) report = true;
          if (report) break;
        }
      }

      if (report) {
        diag.out('reportDynamicACDUpdate', `[Changing...] cur: <${JSON.stringify(update)}>`);
        diag.out('reportDynamicACDUpdate', `[Changing...] new: <${JSON.stringify(newStateOnNode)}>`);
        update.manageable = newStateOnNode.manageable;
        update.queuesStatus = JSON.parse(JSON.stringify(newStateOnNode.queuesStatus));
      }
    }

    if (report) {
      const evt = new DynamicACDUpdate(update);
      lineDev.report(evt);
    }
  }
}

// This funcition is to update dynamicACDStatus in node as per event from each node
export function processAgentMembershipModifyByNode(lineDev: WebLineDev, node: WebNode, data: AgentMembershipUpdate) {
  const { svn, update, superAgent, action, changedQueue } = data;
  const { agent, queuesStatus, manageable } = update;
  if (!update || !action || !agent) return;
  if (
    !agent.localeCompare(lineDev.agentId) &&
    superAgent &&
    (action === Action.QueueAdd || action === Action.QueueRemove)
  ) {
    // Got noified because of being queueACDLogOn/Off by other superAgent. This is for me
    if (changedQueue) {
      if (changedQueue.type === AcdMemberType.Static) return;
      const index = node.acdLoginState.qlist.findIndex((profile) => profile.queue === changedQueue.queue);
      if (index === -1 && action === Action.QueueAdd) node.acdLoginState.qlist.push(changedQueue);
      if (index !== -1 && action === Action.QueueRemove) node.acdLoginState.qlist.splice(index, 1);
      /* Report acdLoginstate if the node.acdLoginState that is being updated by the event is different than in lineDev
       * this is a simple way to consolidate based on the events coming from each nodes for now
       */

      if (lineDev.acdLoginState.qlist.length !== node.acdLoginState.qlist.length) {
        diag.out(
          'processAgentMembershipModifyByNode',
          `Report AcdLoginStateChange Superagent<${superAgent}> ${action} me to queueu<${changedQueue.queue}>`
        );
        lineDev.setAcdLoginState(JSON.parse(JSON.stringify(node.acdLoginState)));
      }
    }
  }

  if (lineDev.dynamicACDSubscribed && queuesStatus && action) {
    // I am one of superAgents too
    if (action === Action.LogOn) {
      const index = node.dynamicACDStatus.findIndex((i) => i.agent === agent);
      if (index !== -1) node.dynamicACDStatus.splice(index, 1); // clear up the old one if exists

      const qsArray = queuesStatus.filter(
        (q) => !lineDev.subscribedQueueList.length || lineDev.subscribedQueueList.includes(q.queueId)
      );
      if (qsArray.length) {
        node.dynamicACDStatus.push({ agent, manageable, queuesStatus: qsArray });
      }
    } else if (action === Action.LogOff) {
      // DynamiACDUpdate  to remove for subscriber
      const newArr = node.dynamicACDStatus.filter((agentStatus) => agentStatus.agent !== agent);
      if (newArr.length !== node.dynamicACDStatus.length) {
        node.dynamicACDStatus = newArr;
      }
    } else if (action === Action.QueueAdd || action === Action.QueueRemove) {
      if (
        changedQueue &&
        queuesStatus.length &&
        (!lineDev.subscribedQueueList.length || lineDev.subscribedQueueList.includes(changedQueue.queue))
      ) {
        let stat = AgentStat.DynamicACDLogOn;
        if (changedQueue.type === AcdMemberType.Dynamic)
          stat = action === Action.QueueAdd ? AgentStat.DynamicACDLogOn : AgentStat.DynamicACDLogOff;
        if (changedQueue.type === AcdMemberType.DynamicOn)
          stat = action === Action.QueueAdd ? AgentStat.DynamicOnACDLogOn : AgentStat.DynamicOnACDLogOff;
        if (changedQueue.type === AcdMemberType.Static) stat = AgentStat.ACDLogOn; // Should never have happened. Set it to logOn anyway

        const agentQueuesStatus = node.dynamicACDStatus.find((i) => i.agent === agent);
        if (agentQueuesStatus) {
          const ele = agentQueuesStatus.queuesStatus.find((qs) => qs.queueId === changedQueue.queue);
          if (ele) ele.stat = stat;
          else agentQueuesStatus.queuesStatus.push({ queueId: changedQueue.queue, stat }); // Won't happen. Sync data anyway.
        } else {
          diag.warn(
            'processAgentMembershipModifyByNode',
            `dynamicACDStatus on node<${node.getNodeId()}> does not have status for agent ${agent} and its the changeQueue <${
              changedQueue.queue
            } on Action :${action}>`
          );
        }
      }
    }
    if (
      action === Action.LogOn ||
      action === Action.LogOff ||
      action === Action.QueueAdd ||
      action === Action.QueueRemove
    ) {
      const found = node.dynamicACDStatus.find((i) => i.agent === agent);
      diag.trace?.(
        'processAgentMembershipModifyByNod',
        `Changed on Node<${node.getNodeId()}>: ${
          found ? JSON.stringify(found) : `${agent} dynamicACD participation removed`
        }`
      );
      reportDynamicACDUpdate(lineDev, node, agent);
    }
  }
}

function consolidateAgentQueueStatus(consolidateItem: AgentQueueStatus, data: AgentQueueStatus): boolean {
  let consolidated = false;
  if (consolidateItem.manageable !== data.manageable) {
    consolidateItem.manageable = data.manageable;
    consolidated = true;
  }
  //queue
  for (const qsData of data.queuesStatus) {
    //if (consolidateItem.queuesStatus.every((consolidateQS) => consolidateQS.queueId !== qsData.queueId))
    const consolidateItemQsData = consolidateItem.queuesStatus.find((i) => i.queueId === qsData.queueId);
    if (!consolidateItemQsData) {
      consolidateItem.queuesStatus.push(qsData);
      consolidated = true;
    } else {
      if (qsData.stat === AgentStat.ACDLogOn) {
        /*do nothing*/
      } else if (qsData.stat === AgentStat.DynamicACDLogOff || qsData.stat === AgentStat.DynamicOnACDLogOff) {
        // if consolidated status was ACDLogOn, change it; if consolidated status was DynamicACDLogOn, leave as is
        if (consolidateItemQsData.stat === AgentStat.ACDLogOn) {
          consolidateItemQsData.stat = AgentStat.DynamicACDLogOff;
          consolidated = true;
        }
      } else if (qsData.stat === AgentStat.DynamicACDLogOn) {
        // if consolidated status was ACDLogOn or DynamicACDLogOff, change it
        if (consolidateItemQsData.stat !== AgentStat.DynamicACDLogOn) {
          consolidateItemQsData.stat = AgentStat.DynamicACDLogOn;
          consolidated = true;
        }
      } else if (qsData.stat === AgentStat.DynamicOnACDLogOn) {
        // if consolidated status was ACDLogOn or DynamicACDLogOff, change it
        if (consolidateItemQsData.stat !== AgentStat.DynamicOnACDLogOn) {
          consolidateItemQsData.stat = AgentStat.DynamicOnACDLogOn;
          consolidated = true;
        }
      }
    }
  }

  return consolidated;
}

function consolidateDynamicACDStatus(lineDev: WebLineDev): Array<AgentQueueStatus> {
  let consolidateList: AgentQueueStatus[] = [];
  lineDev.webNodes.map((node) => {
    if (node.dynamicACDStatus.length) {
      //agent
      for (const data of node.dynamicACDStatus) {
        //if (consolidateList.every((consolidateData) => consolidateData.agent !== data.agent))
        const consolidateItem = consolidateList.find((i) => i.agent === data.agent);
        if (!consolidateItem) {
          consolidateList.push(data);
        } else {
          consolidateAgentQueueStatus(consolidateItem, data);
        }
      }
    } else {
      diag.warn('onsolidateDynamicACDStatus', `No dynamicACDStatus data on node <${node.getNodeId()}>`);
    }
  });

  return consolidateList;
}

export async function subscribeDynamicACDStatus(
  lineDev: WebLineDev,
  queueList: Array<string>
): Promise<Array<AgentQueueStatus>> {
  // Emppty queueList means subscribing dynamic ACD status on all queues
  diag.trace?.('subscribeDynamicACDStatus', `on queuelist <${JSON.stringify(queueList)}>`);
  const results = await Promise.allSettled(
    lineDev.webNodes.map((node) => {
      return node.subscribeDynamicACDStatus(queueList);
    })
  );

  if (!results.some((r) => r.status === 'fulfilled')) {
    throw new Error(`failed to subscribe dynamicACDStatus on all nodes`);
  }

  lineDev.dynamicACDSubscribed = true;
  lineDev.subscribedQueueList = queueList;
  const list = consolidateDynamicACDStatus(lineDev);
  lineDev.dynamicACDStatus = list.length ? JSON.parse(JSON.stringify(consolidateDynamicACDStatus(lineDev))) : [];
  return JSON.parse(JSON.stringify(lineDev.dynamicACDStatus));
}

export async function unSubscribeDynamicACDStatus(lineDev: WebLineDev): Promise<void> {
  diag.trace?.('unSubscribeDynamicACDStatus', ``);
  const results = await Promise.allSettled(
    lineDev.webNodes.map((node) => {
      return node.unSubscribeDynamicACDStatus();
    })
  );

  if (!results.some((r) => r.status === 'fulfilled')) {
    throw new Error(`failed to unSubscribe dynamicACDStatus on all nodes`);
  }
  lineDev.dynamicACDSubscribed = false;
  lineDev.subscribedQueueList = [];
  lineDev.dynamicACDStatus = [];
}
