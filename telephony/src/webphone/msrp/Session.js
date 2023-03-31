// Dependencies
import { EventEmitter } from 'events';
import * as Message from './Message.js'
import { Util } from './Util.js';
import { Sdp } from './Sdp.js';
import { URI } from './URI.js';



export class Session extends EventEmitter {
  //msrp;
  //configuredBasePort;
  //configuredHighestPort

  constructor(msrp, sipCallID) {
    super();
    this.msrp = msrp;

    // Create factory function objects
    this.util = Util();

    // Load configuration
    this.configuredBasePort = /* msrp.Config.outboundBasePort || */ 49152;
    this.configuredHighestPort = /* msrp.Config.outboundHighestPort || */ 65535;

    /**
     * MSRP Session
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
     * @property {String} subject Outgoing MSRP first message received from the GUI to be sent once the TCP connection is established
    */
    this.sipCallID = sipCallID;
    this.sid = this.util.newMID();
    this.localEndpoint = null;
    this.remoteEndpoints = [];
    this.localSdp = null;
    this.remoteSdp = null;
    this.webSocketHandler = null;
    this.updated = false;
    this.ended = false;
    this.reinvite = false; // TODO: Deprecated
    this.heartbeatsTransIds = {};
    this.heartbeatPingFunc = null;
    this.heartbeatTimeoutFunc = null;
    this.setHasNotRan = true;
    this.getHasNotRan = true;
    this.subject = "";
  }


  /**
   * Sends an MSRP Message to the Session's remote party
   * @param  {String}   body        Message body
   * @param  {String}   contentType Message Content-Type
   * @param  {Function} callback    Callback function
   */
  sendMessage = function(body, contentType, callback) {
    var session = this;

    // Check if the remote endpoint will accept the message by checking its SDP
    var contentValues = contentType.split('/');
    var canSend = session.remoteSdp.attributes['accept-types'].some(function(acceptType) {
      if (acceptType === contentType || acceptType === '*') {
        return true;
      }
      var acceptValues = acceptType.split('/');
      return (acceptValues[0] === contentValues[0] && acceptValues[1] === '*');    
    });
    
    if (session.remoteSdp.attributes.sendonly || session.remoteSdp.attributes.inactive) {
      canSend = false;
    }

    if (session.remoteSdp.media && session.remoteSdp.media[0] && session.remoteSdp.media[0].attributes) {
      if (session.remoteSdp.media[0].attributes.sendonly) {
        canSend = false;
      }
    }

    if (canSend) {
      if (session.webSocketHandler) {
        session.webSocketHandler.sendMessage(session, {
          body: body,
          contentType: contentType
        }, {
          toPath: session.remoteEndpoints,
          localUri: session.localEndpoint
        }, callback);
      } else {
        // We don't have a socket. Did the other side send a connection?
        console.error('[MSRP Session] Cannot send message because there is not an active socket! Did the remote side connect? Check a=setup line in SDP media.');
        return;
      }
    } else {
      console.warn('[MSRP Session] Cannot send message due to remote endpoint SDP attributes');
      return;
    }
  };

  /**
   * Function called during the SDP negotiation to create the local SDP.
   */
  createLocalDescription = function() {
    var session = this;
    var msrp = this.msrp;
    console.debug('[MSRP Session] Creating local SDP...');

    // Create and configure local SDP
    var localSdp = new Sdp();

    // Skip Origin 
    localSdp.origin.id = this.util.dateToNtpTime(new Date());
    localSdp.origin.version = localSdp.origin.id;
    localSdp.origin.address = msrp.msrpConfig.host;
    // Session-name
    localSdp.sessionName = msrp.msrpConfig.sessionName;
    // Connection address
    localSdp.connection.address = msrp.msrpConfig.host;
    // Accept-types
    localSdp.addAttribute('accept-types', msrp.msrpConfig.acceptTypes);
    // Setup
    if (session.remoteSdp) {
      if (session.remoteSdp.attributes.setup) {
        if (session.remoteSdp.attributes.setup[0] === 'active' || session.remoteSdp.attributes.setup[0] === 'actpass') {
          localSdp.addAttribute('setup', 'passive');
        } else if (session.remoteSdp.attributes.setup[0] === 'passive') {
          localSdp.addAttribute('setup', 'active');
        } else {
          console.error('[MSRP Session] Invalid remote a=setup value');
          // return callbacks.onFailure('Invalid remote a=setup value');
        }
      } else {
        localSdp.addAttribute('setup', 'active');
      }
    } else {
      localSdp.addAttribute('setup', msrp.msrpConfig.setup === 'passive' ? 'passive' : 'active');
    }

    // Path
    var path = 'msrp://' + msrp.msrpConfig.host + '/' + session.sid + ';tcp';
    localSdp.addAttribute('path', path);
    // Port
    localSdp.media.push('message ' + msrp.msrpConfig.port + ' TCP/MSRP *');

    // Update session information
    session.localSdp = localSdp;
    session.localEndpoint = new URI(path);
    session.getHasNotRan = false;

    // Extra logic for session updates
    var callback;
    if (session.updated) {
      // Emit update event after calling startConnection
      callback = function() {
        session.emit('update', session);
        session.emit('reinvite', session); // TODO: Deprecated
      };
    }

    // Start connection if needed
    session.startConnection(callback);
  };

  /**
   * Function to return MSRP SDP into string format.
   */
  getLocalDescription = function() {
    return this.localSdp.toStringLimited();
  }

  /**
   * Function called during the SDP negotiation to set the remote SDP.
   * @param  {String}   description Remote description
   * @param  {Function} onSuccess   onSuccess callback
   * @param  {Function} onFailure   onFailure callback
   */
  setDescription = function(description /*, onSuccess, onFailure*/) {
    var session = this;
    console.debug('[MSRP Session] Processing remote SDP...');

    // Parse received SDP
    var remoteSdp = new Sdp(description);

    // Retrieve MSRP media attributes
    var remoteMsrpMedia = remoteSdp.media.find(function(mediaObject) {
      return mediaObject.proto.includes('/MSRP');
    });
    remoteSdp.attributes = remoteMsrpMedia.attributes;

    // Path check
    if (!remoteSdp.attributes.path) {
      console.error('[MSRP Session] Path attribute missing in remote endpoint SDP');
      // return onFailure('Path attribute missing in remote endpoint SDP');
    }

    // If we are updating an existing session, enable updated flag and close existing socket when needed
    if (session.remoteSdp) {
      session.updated = true;
      session.reinvite = true; // Deprecated
      if (session.webSocketHandler.socket) {
        if (remoteSdp.attributes.path !== session.remoteSdp.attributes.path) {
          console.debug(`[MSRP Session] Remote path updated: ${session.remoteSdp.attributes.path.join(' ')} -> ${remoteSdp.attributes.path.join(' ')}`);
          session.closeSocket();
        }
        if (remoteSdp.attributes.inactive) {
          console.debug('[MSRP Session] Remote party connection changed to inactive');
          session.closeSocket();
        }
      }
    }

    // Update session information
    session.remoteSdp = remoteSdp;
    session.remoteEndpoints = remoteSdp.attributes.path;
    session.setHasNotRan = false;

    // Success! Remote SDP processed
    // onSuccess();

    // Start connection if needed
    // session.startConnection();
  };

  /**
   * Ends a session
   */
  end = function() {
    var session = this;
    var msrp = this.msrp;

    // Return if session is already ended
    if (session.ended) {
      console.debug(`[MSRP Session] MSRP session ${session.sid} already ended`);
      return;
    }

    console.debug(`[MSRP Session] Ending MSRP session ${session.sid}...`);
    // Stop heartbeats if needed
    if (msrp.msrpConfig.heartbeats !== false) {
      session.stopHeartbeats();
    }

    // Close socket if needed.  IMPORTANT: For now, we always keep the socket open 
    // if (session.webSocketHandler.socket) {
    //   session.closeSocket();
    // }
    
    // Set ended flag to true
    session.ended = true;
    // Emit 'end' event
    session.emit('end', session);
  };

  /**
   * Sets the session's socket and and the needed socket event listeners
   * @param  {Object} socket Socket
   */
  setWebSocketHandler = function(socketHandler) {
    var session = this;
    session.webSocketHandler = socketHandler;

    // TODO: Add origin check. Ticket: https://github.com/cwysong85/msrp-node-lib/issues/20
/*
    // Forward socket events
    socket.on('close', function(hadError) {
      session.emit('socketClose', hadError, session);
    });
    socket.on('error', function() {
      session.emit('socketError', session);
    });
    socket.on('timeout', function() {
      session.emit('socketTimeout', session);
    });

    // Emit socketConnect event
    session.emit('socketSet', session);
    session.emit('socketConnect', session); // TODO: Deprecated
*/
  };

  /**
   * Closes a session socket
   */
  closeSocket = function() {
    var msrp = this.msrp;
    var session = this;

    if (session.webSocketHandler.socket) {
      // Check if the session socket is being reused by other session
      var isSocketReused = msrp.sessionController.sessions.filter(function(sessionItem) {
        return sessionItem.socket === session.webSocketHandler.socket;
      }).length > 1;

      // Close the socket if it is not being reused by other session
      if (!isSocketReused) {
        console.debug(`[MSRP Session] Closing MSRP session ${session.sid} socket...`);
        session.webSocketHandler.socket.end();
      }

      // Clean the session socket attribute
      console.debug(`[MSRP Session] Removing MSRP session ${session.sid} socket...`);
      delete session.webSocketHandler.socket;
    }
  };

  /**
   * Stops MSRP heartbeats
   */
  stopHeartbeats = function() {
    var session = this;
    console.debug(`[MSRP Session] Stopping MSRP heartbeats for session ${session.sid}...`);

    clearInterval(session.heartbeatPingFunc);
    clearInterval(session.heartbeatTimeoutFunc);
    session.heartbeatPingFunc = null;
    session.heartbeatTimeoutFunc = null;
  };

  /**
   * Starts MSRP heartbeats
   */
  startHeartbeats = function() {
    var session = this;
    var msrp = this.msrp;
    var heartbeatsInterval = msrp.msrpConfig.heartbeatsInterval || 5000;
    var heartbeatsTimeout = msrp.msrpConfig.heartbeatsTimeout || 10000;

    console.debug(`[MSRP Session] Starting MSRP heartbeats for session ${session.sid}...`);

    // Send heartbeats
    function sendHeartbeat() {
      session.sendMessage(' ', 'text/x-msrp-heartbeat', null);
    }
    session.heartbeatPingFunc = setInterval(sendHeartbeat, heartbeatsInterval);

    // Look for timeouts every second
    function heartbeatTimeoutMonitor() {
      for (var key in session.heartbeatsTransIds) { // Loop through all stored heartbeats
        if (session.heartbeatsTransIds.hasOwnProperty(key)) { // Check if key has a property
          var diff = Date.now() - session.heartbeatsTransIds[key]; // Get time difference
          if (diff > heartbeatsTimeout) { // If the difference is greater than heartbeatsTimeout
            console.error(`[MSRP Session] MSRP heartbeat timeout for session ${session.sid}`);
            session.emit('heartbeatTimeout', session);
            delete session.heartbeatsTransIds[key];
          }
        }
      }
    }
    session.heartbeatTimeoutFunc = setInterval(heartbeatTimeoutMonitor, 1000);
  };

  /**
   * Helper function for establishing connections when the SDP negotiation has been completed
   * @param  {Function} callback Callback
   */
  startConnection = function(callback) {
    var session = this;
    var msrp = this.msrp;

    // If the SDP negotiation has not been completed, return
    if (session.getHasNotRan || session.setHasNotRan || !session.remoteSdp || !session.localSdp) {
      console.debug('[MSRP Session] Unable to start connection yet. SDP negotiation in progress.');
      return;
    }

    /*
    // If the session has an active connection, return
    if (session.webSocketHandler.socket && !session.webSocketHandler.socket.destroyed) {
      console.warn('[MSRP Session] Session already has an active connection.');
      return;
    }
    */

    // If inactive attribute is present, do not connect
    if (session.remoteSdp.attributes.inactive) {
      console.warn('[MSRP Session] Found "a=inactive" in remote endpoint SDP. Connection not needed.');
      return;
    }

    // If the local endpoint is active, connect to the remote party
    if (session.localSdp.attributes.setup[0] === 'active') {
      var remoteEndpointUri = new URI(session.remoteEndpoints[0]);
      var localEndpointUri = session.localEndpoint;

      /*
      // Do nothing if we are trying to connect to ourselves
      if (localEndpointUri.authority === remoteEndpointUri.authority) {
        console.warn(`[MSRP Session] Not creating a new TCP connection for session ${session.sid} because we would be talking to ourself. Returning...`);
        return;
      }
      */

      // Send bodiless MSRP message
      const socket = session.webSocketHandler.socket;
      var request = new Message.OutgoingRequest({
        toPath: session.remoteEndpoints,
        localUri: session.localEndpoint.uri
      }, 'SEND');
      try {
        socket.send(request.encode(), function() {
          if (callback) {
            callback();
          }
        });
      } catch (error) {
        console.error(`[MSRP Session] An error ocurred while sending the initial bodiless MSRP message: ${error.toString()}`);
      }
    }

    // Start heartbeats if enabled and not running yet
    if (msrp.msrpConfig.heartbeats !== false && !session.heartbeatPingFunc && !session.heartbeatTimeoutFunc) {
      session.startHeartbeats();
    }

    // Reset SDP negotiation flags
    session.getHasNotRan = true;
    session.setHasNotRan = true;
  };

};
