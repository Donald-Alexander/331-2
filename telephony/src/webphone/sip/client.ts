import { EventEmitter } from 'events';
import { Core } from 'sip-js';
import { Notification } from 'sip-js/lib/api/notification';
import { Subscriber } from 'sip-js/lib/api/subscriber';
import { SubscriberOptions } from 'sip-js/lib/api/subscriber-options';
import { SubscriptionState } from 'sip-js/lib/api/subscription-state';
import { UserAgent } from 'sip-js/lib/api/user-agent';
import { UserAgentOptions } from 'sip-js/lib/api/user-agent-options';
import { InviterOptions } from 'sip-js/lib/api/inviter-options';

import { Publisher } from 'sip-js/lib/api/publisher';
import { PublisherOptions } from 'sip-js/lib/api/publisher-options';

import { ClientStatus, ReconnectionMode } from './enums';
import * as Features from './features';
import { Invitation } from './invitation';
import { Inviter } from './inviter';
import { createFrozenProxy } from './lib/freeze';
import { log } from './logger';
import { ISession, SessionImpl } from './session';
import { statusFromDialog } from './subscription';
import { second } from './time';
import { ITransport, ReconnectableTransport, TransportFactory, UAFactory } from './transport';
import { IClientOptions, IMedia } from './types';

// @ts-ignore: Unreachable file error
import { SipMsrp } from '../interfaces/sip-msrp';
import { ISubsEventMsg } from '../interfaces/sip-subscribeNotify';
import { ClientKeepAliveState } from '../../weblinedev/listenJoin';
import { SipRtt } from '../interfaces/sip-rtt';

// TODO: use EventTarget instead of EventEmitter.

// Diag module
import { Diag } from '../../common/diagClient';
const diag = new Diag('sip.client');

export interface INotifyInfos {
  event: string;
  subscriptionState: string;
  body: string;
  status: string;
}

export interface IClient {
  /**
   * To setup a different voip account, sipserver or media devices. If you want
   * to adapt media devices it is better to do it on-the-fly by adapting the
   * media property on client (to change it globally) or by adapting the media
   * property on session.
   */
  reconfigure(options: IClientOptions): Promise<void>;

  /**
   * To setup a different new webrtc-srv
   * to adapt media devices it is better to do it on-the-fly by adapting the
   * media property on client (to change it globally) or by adapting the media
   * property on session.
   */
  reconfigureNewWebRTC(options: IClientOptions, reInviteCalls: number): Promise<void>;

  /**
   * Connect (and subsequently register) to server.
   */
  connect(reInviteCalls: number): Promise<boolean>;

  /**
   * Unregister (and subsequently disconnect) to server.
   */
  disconnect(): Promise<void>;

  /**
   * Call this before you want to delete an instance of this class.
   */
  close(): Promise<void>;

  isConnected(): boolean;

  /*
   * To hold an call by matching its session.id .
   */
  hold(id: string): Promise<boolean>;

  /*
   * To unhold an call by matching its session.id .
   */
  unhold(id: string): Promise<boolean>;

  /*
   * To update client session "holdstate" flag.
   */
  updSessionHoldState(id: string, state: boolean): Promise<void>;

  /**
   * Make an outgoing call. Requires you to be registered to a sip server.
   *
   * Returns a promise which resolves as soon as the connected sip server
   * emits a progress response, or rejects when something goes wrong in that
   * process.
   *
   * @param uri  For example "sip:497920039@voipgrid.nl"
   */
  invite(uri: string, options: InviterOptions, msrp: SipMsrp | undefined, rtt: SipRtt | undefined): Promise<ISession>;

  subscribe(uri: string, event: string, options: SubscriberOptions): Promise<void>;
  unsubscribe(uri: string, event: string, options: SubscriberOptions): Promise<void>;

  getSession(id: string): ISession | undefined;
  getSessions(): ISession[];

  /**
   * Do an attended transfer from session a to session b.
   *
   * ```typescript
   * const sessionA = await client.invite(uri);
   * const sessionB = await client.invite(uri);
   *
   * if (await sessionA.accepted()) {
   *   await client.attendedTransfer(sessionA, sessionB);
   * }
   * ```
   */
  attendedTransfer(a: { id: string }, b: { id: string }): Promise<boolean>;

  createPublisher(contact: string, options: PublisherOptions): Publisher;

  /* tslint:disable:unified-signatures */
  /**
   * When receiving an invite, a (frozen) proxy session is returned which can be
   * used to display what is needed in your interface.
   *
   * ```typescript
   * client.on('invite', session => {
   *   const { number, displayName } = session.remoteIdentity;
   *
   *   // accept the incoming session after 5 seconds.
   *   setTimeout(() => session.accept(), 5000)
   *
   *   await session.accepted();
   *
   *   // session is accepted!
   *
   *   // terminate the session after 5 seconds.
   *   setTimeout(() => session.terminate(), 5000)
   * })
   *
   * ```
   */
  on(event: 'invite', listener: (session: SessionImpl) => void): this;

  /**
   * When a notify event for a specific subscription occurs, the status is
   * parsed from the XML request body and forwarded through the
   * `subscriptionNotify` event.
   *
   * ```typescript
   * const contact: string = 'sip:12345678@voipgrid.nl';
   *
   * client.on('subscriptionNotify', (contact, status) => {
   *   console.log(`${contact}: ${notification}`);
   * })
   *
   * await client.subscribe(contact);
   * ```
   */
  on(event: 'subscriptionNotify', listener: (infos: INotifyInfos) => void): this;

  /**
   * When a subscription accepted occurs, a subscriptionAccepted event is emitted
   */
  on(event: 'subscriptionAccepted', listener: (infos: ISubsEventMsg) => void): this;

  /**
   * When a subscription failure occurs, a subscriptionFailure event is emitted
   */
  on(event: 'subscriptionFailure', listener: (infos: ISubsEventMsg) => void): this;

  /**
   * When a subscription failure occurs, a subscriptionFailure event is emitted
   */
  on(event: 'subscriptionTerminated', listener: (index: string) => void): this;

  /**
   * When a session is added to the sessions by an incoming or outgoing
   * call, a sessionAdded event is emitted.
   */
  on(event: 'sessionAdded', listener: (id: string) => void): this;

  /**
   * When a session is removed because it is terminated  a sessionRemoved event
   * is emitted.
   */
  on(event: 'sessionRemoved', listener: (id: string) => void): this;

  /**
   * Receive statusUpdate from transport
   */
  on(event: 'statusUpdate', listener: (staus: any) => void): this;
  /* tslint:enable:unified-signatures */

  /**
   * Each time a transport SIP OPTIONS is answered or not, a 'keepAliveStateUpd' event is emitted.
   */
  on(event: 'keepAliveStateUpd', listener: (clientIP: string, state: ClientKeepAliveState) => void): this;
}

interface ISubscriptionNotification {
  request: Core.IncomingRequestMessage;
}

/**
 * @hidden
 */
export class ClientImpl extends EventEmitter implements IClient {
  public defaultMedia: IMedia;

  private readonly sessions: { [index: string]: SessionImpl } = {};
  private subscriptions: { [index: string]: Subscriber } = {};
  private connected: boolean = false;

  private transportFactory: TransportFactory;
  private transport: ITransport | undefined;

  constructor(uaFactory: UAFactory, transportFactory: TransportFactory, options: IClientOptions) {
    super();

    if (!Features.checkRequired()) {
      throw new Error('unsupported_browser');
    }

    this.defaultMedia = options.media;

    this.transportFactory = transportFactory;
    this.configureTransport(uaFactory, options);
  }

  public async reconfigure(options: IClientOptions) {
    await this.disconnect();

    this.defaultMedia = options.media;
    if (this.transport) {
      this.transport.configure(options);
      await this.connect();
    } else diag.warn('reconfigure', `No WebRTC connection !`);
  }

  public async reconfigureNewWebRTC(options: IClientOptions, reInviteCalls: number) {
    if (this.transport) await this.transport.disconnect({ hasRegistered: false });

    this.defaultMedia = options.media;
    if (this.transport) {
      this.transport.configure(options);
      await this.connect(reInviteCalls);
    } else diag.warn('reconfigureNewWebRTC', `No WebRTC connection !`);
  }

  public connect(reInviteCalls: number = -1): Promise<boolean> {
    if (this.transport) return this.transport.connect(reInviteCalls);
    else diag.warn('connect', `No WebRTC connection !`);
    return Promise.resolve(false);
  }

  public async disconnect(): Promise<void> {
    // Actual unsubscribing is done in ua.stop
    if (this.transport) await this.transport.disconnect({ hasRegistered: true });
    else diag.warn('disconnect', `No WebRTC connection !`);
    this.subscriptions = {};
  }

  public isConnected(): boolean {
    return this.connected;
  }

  public async hold(id: string): Promise<boolean> {
    let session = this.getSession(id);
    if (session) {
      return session.hold();
    } else {
      return Promise.reject(false);
    }
  }

  public async unhold(id: string): Promise<boolean> {
    let session = this.getSession(id);
    if (session) {
      return session.unhold();
    } else {
      return Promise.reject(false);
    }
  }

  public async updSessionHoldState(id: string, state: boolean): Promise<void> {
    let session = this.getSession(id);
    if (session) {
      session.upgHoldState(state);
      return Promise.resolve();
    } else {
      return Promise.reject();
    }
  }

  public async invite(
    uri: string,
    options: InviterOptions,
    msrp: SipMsrp | undefined,
    rtt: SipRtt | undefined
  ): Promise<ISession | any> {
    if (!this.transport || !this.transport.registeredPromise) throw new Error('Register first!');
    else await this.transport.registeredPromise;

    let session: SessionImpl | undefined;
    try {
      // Retrying this once if it fails. While the socket seems healthy, it
      // might in fact not be. In that case the act of sending data over the
      // socket (the act of inviting in this case) will cause us to detect
      // that the socket is broken. In that case getConnection will try to
      // regain connection, to quickly re-invite over the newly created
      // socket (or not).
      session = await this.tryInvite(uri, options, msrp, rtt).catch(async () => {
        diag.err('invite', 'The WebSocket broke during the act of inviting.');
        if (this.transport) {
          await this.transport.getConnection(ReconnectionMode.ONCE);
          if (this.transport.status !== ClientStatus.CONNECTED) {
            throw new Error('Not sending out invite. It appears we are not connected.');
          }
          diag.out('invite', 'New WebSocket is created.');
          return await this.tryInvite(uri, options, msrp, rtt);
        } else {
          diag.warn('invite', `No WebRTC connection !`);
          return undefined;
        }
      });
    } catch (e) {
      diag.err('invite', e);
      return Promise.resolve(false);
    }

    if (session !== undefined) return session.freeze();
  }

  public async close() {
    await this.disconnect();

    if (this.transport) {
      this.transport.close();
      this.transport.removeAllListeners();
      delete this.transport;
    } else diag.warn('close', `No WebRTC connection !`);
  }

  public async subscribe(uri: string, event: string, options: SubscriberOptions) {
    const waitForRegisteredPromise = async (): Promise<boolean> => {
      return new Promise(async (resolve) => {
        await this.transport?.registeredPromise;
        resolve(true);
      });
    };

    const promisesClientRegistered = async (): Promise<boolean> => {
      let isRegisteredPromise = waitForRegisteredPromise();

      /* Wait 'promiseRegistered' state for a maximum of 2000ms */
      let promiseTimeout = new Promise<boolean>((resolve) => setTimeout(resolve, 2000, false));
      const promises = [isRegisteredPromise, promiseTimeout];
      return Promise.any(promises);
    };

    return new Promise<void>(async (resolve, reject) => {
      if (this.transport) {
        const isClientRegistered = await promisesClientRegistered();
        if (!isClientRegistered) {
          diag.warn('subscribe', `Failed waiting for client to register`);
          return reject('Failed waiting for client to register');
        }
      } else {
        diag.warn('subscribe', `client transport not defined !`);
        return reject('No client transport !');
      }

      let index = uri + '-|-' + event;
      if (this.subscriptions[index]) {
        diag.warn('subscribe', 'Already subscribed');
        return resolve();
      }

      if (this.transport) {
        this.subscriptions[index] = this.transport.createSubscriber(uri, event, options);

        this.subscriptions[index].delegate = {
          onNotify: (notification: Notification) => {
            notification.accept();
            const infos: INotifyInfos = {
              event: notification.request.headers.Event[0].raw,
              subscriptionState: notification.request.getHeader('Subscription-State')?.split(';')[0].trim() || '',
              body: notification.request.body,
              status: statusFromDialog(notification),
            };
            this.emit('subscriptionNotify', infos);
          },
        };

        this.subscriptions[index].stateChange.on((newState: SubscriptionState) => {
          switch (newState) {
            case SubscriptionState.Subscribed:
              resolve();
              break;
            case SubscriptionState.Terminated:
              diag.out('subscribe', `Subscription <${index}> terminated.`);
              delete this.subscriptions[index];
              this.emit('subscriptionTerminated', index);
              break;
          }
        });

        this.subscriptions[index].on('accepted', (response: Core.IncomingResponseMessage) => {
          const eventMsg: ISubsEventMsg = {
            event: event,
            destUri: uri,
            sipCallID: response.callId,
            errorCode: response.statusCode,
            errorReason: response.reasonPhrase,
          };
          this.emit('subscriptionAccepted', eventMsg);
        });

        this.subscriptions[index].on('failed', (response: Core.IncomingResponseMessage) => {
          if (!response) {
            this.removeSubscription(index);
            diag.err('subscribe', 'Subscribe failed without getting a response');
            const eventMsg: ISubsEventMsg = {
              event: event,
              destUri: uri,
              sipCallID: '',
              errorCode: -1,
              errorReason: 'Subscribe failed without getting a response',
            };
            this.emit('subscriptionFailure', eventMsg);
          } else {
            // If we get an ERROR code from the subscribe, send an EVENT in order to manage the ERROR at a upper level
            const errorCode = response.statusCode;
            const errorReason = response.reasonPhrase;

            diag.warn(
              'subscribe',
              `Subscription failed with returned SIP error=${errorCode}/${errorReason}. Report an ERROR Event`
            );
            this.removeSubscription(index);

            const eventMsg: ISubsEventMsg = {
              event: event,
              destUri: uri,
              sipCallID: response.callId,
              errorCode: errorCode,
              errorReason: errorReason,
            };
            this.emit('subscriptionFailure', eventMsg);

            /*
            let waitTime = 1000;
            const retryAfter = response.getHeader('Retry-After');
            if (retryAfter) {
              diag.out(modeuleName, 'subscribe', `Subscription rate-limited. Retrying after ${retryAfter} seconds.`);
              waitTime = Number(retryAfter) * second;
            }
            setTimeout(() => {
              this.removeSubscription(index);
              this.subscribe(uri, event, options).then(resolve).catch(reject);
            }, waitTime);
            */
          }
        });

        this.subscriptions[index].subscribe();
        resolve();
      } else {
        reject(`No WebRTC connection !`);
      }
    });
  }

  public async resubscribe(index: string) {
    if (!this.subscriptions[index]) {
      throw new Error('Cannot resubscribe to nonexistent subscription.');
    }

    this.removeSubscription(index);

    // Split the 'index' into uri and the subscribe event
    const indexInfos = index.split('-|-');
    if (indexInfos.length == 2) {
      await this.subscribe(indexInfos[0], indexInfos[1], {});
      diag.out('resubscribe', `Resubscribed to ${index}`);
    } else diag.err('resubscribe', `Failed resubscribing to ${index}`);
  }

  public unsubscribe(uri: string, event: string, options: SubscriberOptions) {
    return new Promise<void>(async (resolve, reject) => {
      let index = uri + '-|-' + event;
      if (!this.subscriptions[index]) {
        diag.out('unsubscribe', 'Already unsubscribed');
        return resolve();
      }

      try {
        this.subscriptions[index].unsubscribe(options);
        diag.out('unsubscribe', 'Successfull SIP Stack unsubscribe');
        return resolve();
      } catch (e) {
        diag.warn('unsubscribe', `Failed SIP Stack unsubscribe with error = ${e}`);
        return reject();
      } finally {
        this.removeSubscription(index);
      }
    });
  }

  public getSession(id: string): ISession | undefined {
    const session = this.sessions[id];
    if (session) {
      return session.freeze();
    }
    return session;
  }

  public getSessions(): ISession[] {
    return Object.values(this.sessions).map((session) => session.freeze());
  }

  public attendedTransfer(a: ISession, b: ISession): Promise<boolean> {
    const sessionA = this.sessions[a.id];
    if (!sessionA) {
      return Promise.reject('Session A not found');
    }

    const sessionB = this.sessions[b.id];
    if (!sessionB) {
      return Promise.reject('Session B not found');
    }

    return sessionA.attendedTransfer(sessionB);
  }

  public createPublisher(contact: string, options: PublisherOptions): Publisher {
    if (!this.transport || !this.transport.registeredPromise) {
      throw new Error('Register first!');
    }

    return this.transport.createPublisher(contact, options);
  }

  private configureTransport(uaFactory: UAFactory, options: IClientOptions) {
    this.transport = this.transportFactory(uaFactory, options);

    this.transport.on('reviveSessions', () => {
      Object.values(this.sessions).forEach(async (session) => {
        let modifiers = [];
        const msrpSession = (session as SessionImpl).getMsrpSession();
        if (msrpSession) modifiers.push((session as SessionImpl).msrpSdpChangeCb);
        const rttSession = (session as SessionImpl).getRttSession();
        if (rttSession) modifiers.push((session as SessionImpl).rttSdpChangeCb);
        session.rebuildSessionDescriptionHandler();
        await session.reinvite(modifiers);
      });
    });

    this.transport.on('keepAliveStateUpd', (clientIP: string, state: ClientKeepAliveState) => {
      this.emit('keepAliveStateUpd', clientIP, state);
    });

    this.transport.on('reviveSubscriptions', () => {
      Object.keys(this.subscriptions).forEach(async (index) => {
        // Awaiting each uri, because if a uri cannot be resolved
        // 'immediately' due to rate-limiting, there is a big chance that
        // the next re-subscribe will also be rate-limited. To avoid spamming
        // the server with a bunch of asynchronous requests, we handle them
        // one by one.
        await this.resubscribe(index);
      });
    });

    this.transport.on('invite', ({ invitation, cancelled }) => {
      const session = new Invitation({
        media: this.defaultMedia,
        session: invitation,
        onTerminated: this.onSessionTerminated.bind(this),
        cancelled,
        isIncoming: true,
      });

      this.addSession(session);

      this.emit('invite', session.freeze());
    });

    this.transport.on('statusUpdate', (status) => {
      diag.out('configureTransport', `Status change to: ${status}`);

      if (status === 'connected') {
        this.connected = true;
      }
      if (status === 'disconnected') {
        this.connected = false;
      }
      this.emit('statusUpdate', status);
    });
  }

  private onSessionTerminated(sessionId: string) {
    if (!(sessionId in this.sessions)) {
      diag.warn('onSessionTerminated', `Broken session (probably due to failed invite) ${sessionId} is terminated.`);
      return;
    }

    const session = this.sessions[sessionId];
    diag.out('onSessionTerminated', `Session ${sessionId} is terminated.`);
    this.removeSession(session);
  }

  private async tryInvite(
    phoneNumber: string,
    options: InviterOptions,
    msrp: SipMsrp | undefined,
    rtt: SipRtt | undefined
  ): Promise<SessionImpl> {
    if (!this.transport) {
      diag.warn('tryInvite', `No WebRTC connection !`);
      throw new Error('No WebRTC connection !');
    }

    diag.trace?.('tryInvite', 'RTT - calling createInviter.');
    const outgoingSession = this.transport.createInviter(phoneNumber, options);
    diag.trace?.('tryInvite', 'RTT - calling new Inviter.');
    const session = new Inviter({
      media: this.defaultMedia,
      session: outgoingSession,
      onTerminated: this.onSessionTerminated.bind(this),
      isIncoming: false,
      msrp: msrp,
      rtt: rtt,
    });
    this.addSession(session);

    let rejectWithError;
    const disconnectedPromise = new Promise((_resolve, reject) => {
      rejectWithError = () => reject(new Error('Socket broke during inviting'));
      if (this.transport) {
        this.transport.once('transportDisconnected', rejectWithError);
      } else {
        reject(new Error('No WebRTC connection !'));
      }
    });

    try {
      await Promise.race([
        Promise.all([session.invite(), session.tried()]),
        session.accepted(), // trying might not always emitted, in that case accepted might have < not sure anymore
        disconnectedPromise,
      ]);
      return session;
    } catch (e) {
      this.removeSession(session);
      diag.err('tryInvite', 'Could not send an invite. Socket could be broken.');
      return Promise.reject(new Error('Could not send an invite. Socket could be broken.'));
    } finally {
      if (this.transport && rejectWithError) {
        this.transport.removeListener('transportDisconnected', rejectWithError);
      }
    }
  }

  private async removeSubscription(index: string) {
    if (!(index in this.subscriptions)) {
      return;
    }

    this.subscriptions[index].removeAllListeners();
    this.subscriptions[index].dispose();
    delete this.subscriptions[index];
  }

  private addSession(session: SessionImpl) {
    this.sessions[session.id] = session;
    this.emit('sessionAdded', { id: session.id });
    this.updatePriority();
  }

  private removeSession(session: SessionImpl) {
    delete this.sessions[session.id];
    this.emit('sessionRemoved', { id: session.id });
    this.updatePriority();
  }

  private updatePriority() {
    if (!this.transport) {
      return;
    }

    this.transport.updatePriority(Object.entries(this.sessions).length !== 0);
  }
}

type ClientCtor = new (options: IClientOptions) => IClient;

/**
 * A (frozen) proxy object for ClientImpl.
 * Only the properties listed here are exposed to the proxy.
 *
 * See [[IClient]] interface for more details on these properties.
 *
 * Typescript users of this library don't strictly need this, as Typescript
 * generally prevents using private attributes. But, even in Typescript there
 * are ways around this.
 */
export const Client: ClientCtor = function (clientOptions: IClientOptions) {
  const uaFactory = (options: UserAgentOptions) => {
    return new UserAgent(options);
  };

  const transportFactory = (factory: UAFactory, options: IClientOptions) => {
    return new ReconnectableTransport(factory, options);
  };

  const impl = new ClientImpl(uaFactory, transportFactory, clientOptions);
  // @ts-ignore
  createFrozenProxy(this, impl, [
    'attendedTransfer',
    'connect',
    'disconnect',
    'hold',
    'unhold',
    'updSessionHoldState',
    'getSession',
    'getSessions',
    'invite',
    'createPublisher',
    'isConnected',
    'on',
    'once',
    'reconfigure',
    'reconfigureNewWebRTC',
    'removeAllListeners',
    'removeListener',
    'subscribe',
    'resubscribe',
    'unsubscribe',
    'defaultMedia',
  ]);
} as any as ClientCtor;
