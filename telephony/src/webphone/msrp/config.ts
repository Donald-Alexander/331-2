export interface MsrpCfg {
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
export const msrpConfig = (
  {
    enableStack: true,
    host: 'WebPosition.invalid',
    port: 65535,
    traceMessages: true,
    sessionName: 'WebPosition',
    acceptTypes: 'text/plain text/x-msrp-heartbeat',
    setup: 'active',
    heartbeats: false,
  }
);


