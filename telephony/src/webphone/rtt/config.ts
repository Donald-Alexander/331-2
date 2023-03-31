export interface RttCfg {
  enableStack: boolean,
  host: string,
  port: number,
  ProxyServer: string,
  traceMessages: boolean;
  sessionName: string;
  acceptTypes: string;
  setup: string;
  heartbeats: boolean;
}


// host: 'WebPosition.invalid'
export const rttConfig = (
  {
    enableStack: true,
    host: 'WebPosition.invalid',
    port: 65535,
    traceMessages: true,
    sessionName: 'WebPosition',
    acceptTypes: 'text/plain text/x-rtt-heartbeat',
    setup: 'active',
    heartbeats: false,
  }
);


