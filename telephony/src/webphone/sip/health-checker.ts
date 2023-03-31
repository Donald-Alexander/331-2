import pTimeout from 'p-timeout';

import { C, Core } from 'sip-js';

import { UserAgent } from 'sip-js/lib/api/user-agent';

export class HealthChecker {
  private optionsTimeout: number | undefined;
  private logger: Core.Logger;

  constructor(private userAgent: UserAgent) {
    this.logger = userAgent.userAgentCore.loggerFactory.getLogger('socket-health-checker');
  }

  public stop(): any {
    clearTimeout(this.optionsTimeout);
  }

  /**
   * Start a periodic OPTIONS message to be sent to the sip server, if it
   * does not respond, our connection is probably broken.
   */
  public start(): any {
    return pTimeout(
      new Promise<void>((resolve) => {
        clearTimeout(this.optionsTimeout);
        this.userAgent.userAgentCore.request(this.createOptionsMessage(), {
          onAccept: () => {
            resolve();
            this.userAgent.transport.emit('connected');
            this.optionsTimeout = window.setTimeout(() => {
              this.start();
            }, 2500);
          },
        });
      }),
      2000, // if there is no response after 2 seconds, emit disconnected.
      () => {
        const registrarServer = this.userAgent.configuration.uri;
        this.logger.error(`[${registrarServer}] No SIP OPTIONS responses to registrar server.`);
        clearTimeout(this.optionsTimeout);
        this.userAgent.transport.emit('disconnected');
      }
    );
  }

  private createOptionsMessage() {
    const settings = {
      params: {
        toUri: this.userAgent.configuration.uri,
        cseq: 1,
        fromUri: this.userAgent.userAgentCore.configuration.aor,
      },
      registrar: this.userAgent.configuration.uri,
    };

    /* If no 'registrarServer' is set use the 'uri' value without user portion. */
    let registrarServer: any = {};
    if (typeof this.userAgent.configuration.uri === 'object') {
      registrarServer = this.userAgent.configuration.uri.clone();
      registrarServer.user = undefined;
    } else {
      registrarServer = this.userAgent.configuration.uri;
    }
    settings.registrar = registrarServer;

    return this.userAgent.userAgentCore.makeOutgoingRequestMessage(
      C.OPTIONS,
      settings.registrar,
      settings.params.fromUri,
      settings.params.toUri ? settings.params.toUri : settings.registrar,
      settings.params
    );
  }
}
