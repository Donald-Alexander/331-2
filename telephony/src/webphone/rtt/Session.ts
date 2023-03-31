// Dependencies
import { EventEmitter } from 'events';
import { Util } from './Util';
import { Sdp, Media } from '../rtt/Sdp';
import { URI } from '../rtt/URI';
import { SipRtt } from '../interfaces/sip-rtt';
import { WebSocketHandler } from './WebSocketHandler';
import { Tracing } from 'trace_events';
import { Diag } from '../../common/diagClient';

const diag = new Diag('rtt.Session');

export class RTTSession extends EventEmitter {
  rtt: SipRtt;
  util: any;
  sid: string;
  sipCallID: string;
  rttID: number;
  configuredBasePort: number;
  configuredHighestPort: number;
  localEndpoint: object;
  remoteEndpoints: string[];
  localSdp?: Sdp;
  remoteSdp?: Sdp;
  updated: boolean;
  webSocketHandler?: WebSocketHandler;
  ended: boolean;
  reinvite: boolean;
  setHasNotRan: boolean;
  getHasNotRan: boolean;
  subject: string;
  rttSenderInfo: string;
  rttSequenceNumber: number;

  constructor(rtt: SipRtt, sipCallID: string) {
    super();
    this.rtt = rtt;

    // Create factory function objects
    this.util = Util();

    // Load configuration
    this.configuredBasePort = /* rtt.Config.outboundBasePort || */ 49152;
    this.configuredHighestPort = /* rtt.Config.outboundHighestPort || */ 65535;

    /**
     * RTT Session
     * @class
     * @property {String} sipCallID SIP Call-ID
     * @property {String} sid Session ID
     * @property {Object} localEndpoint URI object describing the local endpoint
     * @property {Array<String>} remoteEndpoints Array of remote endpoints
     * @property {Object} localSdp SDP object contanining the local SDP
     * @property {Object} remoteSdp SDP object contanining the remote SDP
     * @property {Object} socket Session socket
     * @property {Boolean} updated Flag indicating if Session has been updated since it was initially created
     * @property {Boolean} ended Flag that indicating if Session is ended
     * @property {Boolean} reinvite (Deprecated) Flag that indicates if a re-INVITE has just been received // TODO: Deprecated
     * @property {Object} heartbeatsTransIds Dictionary of heartbeats transaction IDs
     * @property {Function} heartbeatPingFunc Ping function for heartbeats
     * @property {Function} heartbeatTimeoutFunc Timeout function for heartbeats
     * @property {Boolean} setHasNotRan Flag indicating if setDescription has already been called during the SDP negotiation
     * @property {Boolean} getHasNotRan Flag indicating if getDescription has already been called during the SDP negotiation
     * @property {String} subject Outgoing RTT first message received from the GUI to be sent once the TCP connection is established
     */
    this.sipCallID = sipCallID;
    this.sid = this.util.newMID();
    this.localEndpoint = {};
    this.remoteEndpoints = [];
    this.localSdp = undefined;
    this.remoteSdp = undefined;
    this.webSocketHandler = undefined;
    this.updated = false;
    this.ended = false;
    this.reinvite = false; // TODO: Deprecated
    /* HEARBEATS not used
    this.heartbeatsTransIds = {};
    this.heartbeatPingFunc = null;
    this.heartbeatTimeoutFunc = null;
    */
    this.setHasNotRan = true;
    this.getHasNotRan = true;
    this.subject = '';
    this.rttID = 0;
    this.rttSenderInfo = '';
    this.rttSequenceNumber = 0;
  }

  /**
   * Sends an RTT Message to the Session's remote party
   * @param  {String}   body        Message body
   * @param  {String}   contentType Message Content-Type
   * @param  {Function} callback    Callback function
   */
  sendMessage(body: string, contentType: string, callback: Function) {
    var session = this;

    var canSend = true;
    if (session.remoteSdp && (session.remoteSdp.attributes.sendonly || session.remoteSdp.attributes.inactive)) {
      canSend = false;
      diag.warn('sendMessage', '[RTT Session] Cannot send message because remote media side set to sendonly.');
    }

    if (
      session.remoteSdp &&
      session.remoteSdp.media &&
      session.remoteSdp.media[0] &&
      session.remoteSdp.media[0].attributes
    ) {
      if (session.remoteSdp.media[0].attributes.sendonly) {
        canSend = false;
      }
    }

    if (canSend) {
      diag.trace?.('sendMessage', '[RTT Session] Can send message');
      if (session.webSocketHandler) {
        session.webSocketHandler.sendMessage(
          session,
          {
            body: body,
            contentType: contentType,
          },
          {
            toPath: session.remoteEndpoints,
            localUri: session.localEndpoint,
          },
          callback
        );
      } else {
        // We don't have a socket. Did the other side send a connection?
        diag.err(
          'sendMessage',
          '[RTT Session] Cannot send message because there is not an active socket! Did the remote side connect? Check a=setup line in SDP media.'
        );
        return;
      }
    } else {
      diag.warn('sendMessage', '[RTT Session] Cannot send message due to remote endpoint SDP attributes');
      return;
    }
  }

  /**
   * Function called during the SDP negotiation to create the local SDP.
   */
  createLocalDescription() {
    var session = this;
    var rtt = this.rtt;
    diag.trace?.('createLocalDescription', '[RTT Session] Creating local SDP...');

    // Create and configure local SDP
    var localSdp = new Sdp();

    // Skip Origin
    localSdp.origin.id = this.util.dateToNtpTime(new Date());
    localSdp.origin.version = localSdp.origin.id;
    localSdp.origin.address = rtt.rttConfig.host;
    // Session-name
    localSdp.sessionName = rtt.rttConfig.sessionName;
    // Connection address
    localSdp.connection.address = rtt.rttConfig.host;
    // Accept-types
    localSdp.addAttribute('accept-types', rtt.rttConfig.acceptTypes);
    // Setup
    if (session.remoteSdp) {
      if (session.remoteSdp.attributes.setup) {
        if (session.remoteSdp.attributes.setup[0] === 'active' || session.remoteSdp.attributes.setup[0] === 'actpass') {
          localSdp.addAttribute('setup', 'passive');
        } else if (session.remoteSdp.attributes.setup[0] === 'passive') {
          localSdp.addAttribute('setup', 'active');
        } else {
          diag.err('createLocalDescription', '[RTT Session] Invalid remote a=setup value');
          // return callbacks.onFailure('Invalid remote a=setup value');
        }
      } else {
        localSdp.addAttribute('setup', 'active');
      }
    } else {
      localSdp.addAttribute('setup', rtt.rttConfig.setup === 'passive' ? 'passive' : 'active');
    }

    // Path
    var path = 'rtt://' + rtt.rttConfig.host + '/' + session.sid + ';tcp';
    localSdp.addAttribute('path', path);
    // Port
    //if (session.remoteSdp) {
    //  if (session.remoteSdp.attributes.media.attributes.)
    //}
    localSdp.media.push(new Media('text ' + rtt.rttConfig.port + ' TCP/RTT *'));

    // Update session information
    session.localSdp = localSdp;
    session.localEndpoint = new URI(path);
    session.getHasNotRan = false;

    // Extra logic for session updates
    var callback;
    if (session.updated) {
      // Emit update event after calling startConnection
      callback = function () {
        session.emit('update', session);
        session.emit('reinvite', session); // TODO: Deprecated
      };
    }

    if (session.rttID != 0 && !session.setHasNotRan && !session.getHasNotRan) {
      diag.trace?.('createLocalDescription', `[RTT Session] Session rttID = ${session.rttID} is connected.`);
    }

    // Start connection if needed
    session.startConnection(callback);
  }

  /**
   * Function to return RTT SDP into string format.
   */
  getLocalDescription() {
    if (!this.localSdp) return 0;
    return this.localSdp.toStringLimited();
  }

  /**
   * Function called during the SDP negotiation to set the remote SDP.
   * @param  {String}   description Remote description
   * @param  {Function} onSuccess   onSuccess callback
   * @param  {Function} onFailure   onFailure callback
   */
  setDescription(description: string /*, onSuccess, onFailure*/) {
    var session = this;
    diag.trace?.('setDescription', '[RTT Session] Processing remote SDP...');

    // Parse received SDP
    var remoteSdp = new Sdp(description);

    // Retrieve RTT media attributes
    var remoteRttMedia = remoteSdp.media.find(function (mediaObject) {
      return mediaObject.proto.includes('/RTT');
    });
    if (remoteRttMedia) remoteSdp.attributes = remoteRttMedia.attributes;

    // Path check
    if (!remoteSdp.attributes.path) {
      diag.err('setDescription', '[RTT Session] Path attribute missing in remote endpoint SDP');
      // return onFailure('Path attribute missing in remote endpoint SDP');
    }

    // If we are updating an existing session, enable updated flag and close existing socket when needed
    if (session.remoteSdp) {
      session.updated = true;
      session.reinvite = true; // Deprecated
      if (session.webSocketHandler && session.webSocketHandler.socket) {
        if (remoteSdp.attributes.path !== session.remoteSdp.attributes.path) {
          diag.trace?.(
            'setDescription',
            `[RTT Session] Remote path updated: ${session.remoteSdp.attributes.path.join(
              ' '
            )} -> ${remoteSdp.attributes.path.join(' ')}`
          );
          session.closeSocket();
        }
        if (remoteSdp.attributes.inactive) {
          diag.trace?.('setDescription', '[RTT Session] Remote party connection changed to inactive');
          session.closeSocket();
        }
      }
    }

    // Update session information
    session.remoteSdp = remoteSdp;
    session.remoteEndpoints = remoteSdp.attributes.path;
    session.setHasNotRan = false;
    if (remoteRttMedia) session.rttID = remoteRttMedia.port;
    diag.trace?.('setDescription', '[RTT Session] Sessions rttID = ' + session.rttID);

    if (session.rttID != 0 && !session.setHasNotRan && !session.getHasNotRan) {
      diag.trace?.('setDescription', '[RTT Session] Session rttID = ' + session.rttID + 'is connected.');
    }
  }

  /**
   * Ends a session
   */
  end() {
    var session = this;
    var rtt = this.rtt;

    // Return if session is already ended
    if (session.ended) {
      diag.trace?.('end', `[RTT Session] RTT session ${session.sid} already ended (rttID=${session.rttID})`);
      return;
    }

    diag.trace?.('end', `[RTT Session] Ending RTT session ${session.sid} (rttID=${session.rttID})...`);

    // Set ended flag to true
    session.ended = true;
    // Emit 'end' event
    session.emit('end', session);
  }

  /**
   * Sets the session's socket and and the needed socket event listeners
   * @param  {Object} socket Socket
   */
  setWebSocketHandler(socketHandler: WebSocketHandler) {
    var session = this;
    session.webSocketHandler = socketHandler;
  }

  /**
   * Closes a session socket
   */
  closeSocket() {
    var rtt = this.rtt;
    var session = this;

    /* -- JUST DO NOT DO SEE NEED TO DO THIS
    if (session.webSocketHandler && session.webSocketHandler.socket) {
      // Check if the session socket is being reused by other session
      var isSocketReused = rtt.sessionController.sessions.filter( (sessionItem) => {
        return sessionItem.socket === session.webSocketHandler.socket;
      }).length > 1;

      // Close the socket if it is not being reused by other session
      if (!isSocketReused) {
        console.debug(`[RTT Session] Closing RTT session ${session.sid} socket...`);
        session.webSocketHandler.socket.end();
      }

      // Clean the session socket attribute
      console.debug(`[RTT Session] Removing RTT session ${session.sid} socket...`);
      delete session.webSocketHandler.socket;
    }
*/
  }

  /**
   * Helper function for establishing connections when the SDP negotiation has been completed
   * @param  {Function} callback Callback
   */
  startConnection(callback?: Function) {
    var session = this;
    var rtt = this.rtt;

    // If the SDP negotiation has not been completed, return
    if (session.getHasNotRan || session.setHasNotRan || !session.remoteSdp || !session.localSdp) {
      diag.trace?.('startConnection', '[RTT Session] Unable to start connection yet. SDP negotiation in progress.');
      return;
    }

    /*
    // If the session has an active connection, return
    if (session.webSocketHandler.socket && !session.webSocketHandler.socket.destroyed) {
      console.warn('[RTT Session] Session already has an active connection.');
      return;
    }
    */

    // If inactive attribute is present, do not connect
    if (session.remoteSdp.attributes.inactive) {
      diag.warn('startConnection', '[RTT Session] Found "a=inactive" in remote endpoint SDP. Connection not needed.');
      return;
    }

    // If the local endpoint is active, connect to the remote party
    if (session.localSdp.attributes.setup[0] === 'active') {
      var remoteEndpointUri = new URI(session.remoteEndpoints[0]);
      var localEndpointUri = session.localEndpoint;
    }

    // Reset SDP negotiation flags
    session.getHasNotRan = true;
    session.setHasNotRan = true;
  }

  /**
   * Function called during the SDP negotiation to set the remote SDP.
   * @param  {String}   sender Remote sender info
   */
  setSenderInfo(sender: string) {
    var session = this;
    session.rttSenderInfo = sender;
  }
}
