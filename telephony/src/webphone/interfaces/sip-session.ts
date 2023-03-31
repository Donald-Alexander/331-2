import { WebPhone } from './webphone';
import { ISession } from '../sip/session';
import { SessionStats } from '../sip/session-stats';
import { Diag } from '../../common/diagClient';
const diag = new Diag('sip-session');

const mos = document.querySelector('#mos');
function printStats(stats: SessionStats) {
  const last = (stats.mos.last || 0).toFixed(2);
  const low = (stats.mos.lowest || 0).toFixed(2);
  const high = (stats.mos.highest || 0).toFixed(2);
  const avg = (stats.mos.average || 0).toFixed(2);
  diag.trace?.('printStats', `MOS: ${last} low ${low} high ${high} avg ${avg}`);
}

export async function runSession(webphone: WebPhone, session: ISession) {
  const hold = async () => await session.hold();
  const unhold = async () => await session.unhold();
  // const blindTransfer = async () => await session.blindTransfer(CONF.blindTransferTo);
  // const attTransfer = async () => await attendedTransfer(session);

  session.audioConnected
    .then(() => diag.trace?.('runSession', 'audio connected!'))
    .catch(() => diag.err('runSession', 'connecting audio failed'));

  session.on('callQualityUpdate', (sessionId: string, stats: SessionStats) => {
    printStats(stats);
    // mos.innerHTML = (stats.mos.last || 0).toFixed(2);
  });

  try {
    diag.trace?.('runSession', `waiting for session terminated: ${session.id}`);
    await session.terminated();
    diag.trace?.('runSession', `Call session terminated: ${session.id}`);
  } finally {
    printStats(session.stats);
  }
}

export async function sessionTerminated(this: WebPhone, id: string, nodeId: number): Promise<string | void> {
  const voiceClient = this.voiceClients.find((client) => client.nodeId === nodeId);
  if (!voiceClient) throw 'Can not find voiceclient';
  const session = voiceClient.client.getSession(id);

  return session?.terminated() || Promise.resolve();
}
