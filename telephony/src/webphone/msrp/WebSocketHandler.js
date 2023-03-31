import * as Message from './Message.js'
import { ChunkReceiver } from './ChunkReceiver.js';
import { ChunkSender } from './ChunkSender.js';
import { Parser } from './Parser.js'
import { URI } from './URI.js';
import { Status, StatusComment } from './Status.js';


export class WebSocketHandler
{
  constructor(msrp) {
    this.msrp = msrp;
    this.socket = null;
    this.sessionController = msrp.sessionController;
    this.chunkReceivers = {};
    this.receiverCheckInterval = null;
    this.chunkSenders = {};
    this.activeSenders = [];
    this.traceMessages = this.msrp.msrpConfig.traceMessages;

    this.reconnectTimer = new Timer(() => {
      console.warn('%c%s: MSRP socket reconnection --> `%s`', 'color:blue', this.constructor.name, this.url);
      this.disconnect()
      this.connect(this.url)
    }, this.reconnectAfterMs)
  }

  connect = function(url) {
    console.log('%c%s: MSRP socket try to connect --> `%s`', 'color:blue', this.constructor.name, url);

    try {
      this.url = url;
      this.socket = new WebSocket(url, "msrp");
      // this.socket = new WebSocket(url, "echo-protocol");
    } catch (e) {
      console.error('%s: Failed creating websocket(%s)', this.constructor.name, e);
      throw e;
    }

    // Socket events
    this.socket.onopen = function(event) {
      // this.socket.send('First text message !');
      console.log('%c%s: MSRP WebSocket established `onopen` EVENT to "%s"', 'color:blue', this.constructor.name, this.url);
    }.bind(this);

    this.socket.onclose = function(event) {
      if (event.wasClean)
        console.log('%c%s: MSRP socket connection closed cleanly: code=%s, reason=%s', 'color:blue', this.constructor.name, event.code, event.reason);
      else {
        // e.g. server process killed or network down
        // event.code is usually 1006 in this case
        console.log('%c%s: MSRP socket connection died: code=%s, reason=%s', 'color:blue', this.constructor.name, event.code, event.reason);
        this.reconnectTimer.scheduleTimeout()
      }
    }.bind(this);

    this.socket.onerror = function(error) {
      console.error('%c%s: MSRP socket `onerror` EVENT: %s', 'color:red', this.constructor.name, error.message);
    }.bind(this);

    this.socket.onmessage = function(event) {
      const msrp = this.msrp;
      const data = event.data;
      console.log('%c%s: MSRP socket `onmessage` EVENT received', 'color:blue', this.constructor.name);

      // Trace MSRP message
      if (this.traceMessages)
        console.log('%c%s: MSRP socket `onmessage` received DATA:\n%s', 'color:blue', this.constructor.name, data);

      // Incoming data may include more than one MSRP message. Match messages using regex.
      const messages = data.match(/MSRP [^]*?-{7}\S*?[$#+]/g);
      if (messages) {
        messages.forEach(this.parseEachMessage);
      }
      else
        console.error('%c%s: MSRP socket `onmessage` Invalid incoming message:\n%s', 'color:blue',this.constructor.name, data);
    }.bind(this);
  } // END OF CONNECT

  reconnectAfterMs(tries) {
    return [500, 1000, 2000][tries - 1] || 3000
  }

  disconnect = function() {
    console.log('%c%s: MSRP socket disconnect from `%s`', 'color:blue', this.constructor.name, this.url);
    this.socket.onclose = function(){}
    this.socket.close()
  }

  /**
   * Helper function for sending messages via a specific socket
   * @param  {Object}   session    Session
   * @param  {Object}   message    Message
   * @param  {Object}   routePaths Route paths
   * @param  {Function} cb         Callback function
   */
  sendMessage = function(session, message, routePaths, cb) {
    // Sanity checks
    if (!session || !message || !routePaths) {
      console.error('[MSRP SocketHandler] Unable to send message. Missing arguments.');
      return;
    }

    const sender = new ChunkSender(session.msrp, routePaths, message.body, message.contentType);

    // Logic for keeping track of sent heartbeats
    if (session && message.contentType === 'text/x-msrp-heartbeat') {
      session.heartbeatsTransIds[sender.nextTid] = Date.now();
      console.debug(`[MSRP SocketHandler] MSRP heartbeat sent to ${sender.session.toPath} (tid: ${sender.nextTid})`);
    }

    session.webSocketHandler.activeSenders.push({
      sender: sender,
      socket: this,
      cb: cb
    });

    session.webSocketHandler.chunkSenders[sender.messageId] = sender;
    session.webSocketHandler.sendRequests();
  };

  // Parse each message
  parseEachMessage = function(message) {
    const parser = Parser();
    const parsedMessage = parser.parseMessage(message);
    if (!parsedMessage) {
      console.warn(`[MSRP WebSocketHandler] Unable to parse incoming message. Message was discarded. Message: ${message}`);
      return;
    }
    // Handle each message
    if (parsedMessage.method) {
      this.handleIncomingRequest(parsedMessage, this.socket);
    } else {
      this.handleIncomingResponse(parsedMessage);
    }
  }.bind(this);

  /**
   * Helper function for handling incoming requests
   * @param  {Object} request Request
   * @param  {Object} socket  Socket
   */
  handleIncomingRequest = function(request, socket) {
    const msrp = this.msrp;

    // Retrieve Session and other needed parameters
    const toUri = new URI(request.toPath[0]);
    const fromUri = new URI(request.fromPath[0]);
    if (!toUri || !fromUri) {
      // If To-Path or From-Path is malformed return 400 BAD REQUEST
      console.warn('[MSRP SocketHandler] Error while handling incoming request: 400 BAD REQUEST');
      this.sendResponse(request, socket, request.toPath[0], Status.BAD_REQUEST);
      return;
    }
    const session = this.sessionController.getSession(toUri.sessionId);

    // Check if the session exists
    if (!session) {
      // If session doesn't exists, return 481 SESSION DOES NOT EXIST
      console.warn('[MSRP SocketHandler] Error while handling incoming request: 481 SESSION DOES NOT EXISTS');
      this.sendResponse(request, socket, toUri.uri, Status.SESSION_DOES_NOT_EXIST);
      return;
    }

/*    
    // Set session socket if there is no current socket set
    if (!session.socket || session.socket.destroyed) {
      session.setsetSocket(socket);
    }

    // If there is a socket in use, but a new socket is connected, add a listener so the new socket is used as soon as the current socket is closed
    if (socket.remoteAddress !== session.socket.remoteAddress || socket.remotePort !== session.socket.remotePort) {
      session.socket.on('close', function(hadError) {
        session.setSocket(socket);
      });
    }
*/

    // Check if remote endpoint shouldn't be sending messages because of the recvonly attribute
    if (session.remoteSdp.attributes.recvonly) {
      console.warn('[MSRP SocketHandler] MSRP data is not allowed when session requested "a=recvonly" in SDP. Not forwarding this message to the endpoint until "a=sendonly" or "a=sendrecv" is requested.');
      // If remote endpoint is "recvonly", return 403 FORBIDDEN
      this.sendResponse(request, socket, toUri.uri, Status.FORBIDDEN);
      return;
    }

    // Handle MSRP REPORT requests
    if (request.method === 'REPORT') {
      this.incomingReport(request);
      return;
    }

    // Handle MSRP SEND requests
    if (request.method === 'SEND') {

      // Non-chunked messages
      if (request.byteRange.start === 1 && request.continuationFlag === Message.flags.end) {
        // Emit 'message' event. Do not emit it for heartbeat messages or bodiless messages.
        const isHeartbeatMessage = (request.contentType === 'text/x-msrp-heartbeat');
        const isBodilessMessage = (!request.body && !request.contentType);
        if (!isHeartbeatMessage && !isBodilessMessage) {
          session.emit('message', request, session);
        }
        // Return successful response: 200 OK
        this.sendResponse(request, socket, toUri.uri, Status.OK);
        return;
      }

      // Chunked messages
      const messageId = request.messageId;
      if (!messageId) {
        // Without message ID we are unable to piece the chunked message back together, return 400 BAD REQUEST
        this.sendResponse(request, socket, toUri.uri, Status.BAD_REQUEST);
        return;
      }

      // First chunk
      if (request.byteRange.start === 1) {
        // Instanciate Chunk Receiver and start Chunk Receiver poll if needed
        this.chunkReceivers[messageId] = new ChunkReceiver(request, 1024 * 1024);
        this.startChunkReceiverPoll();
        // Return successful response: 200 OK
        this.sendResponse(request, socket, toUri.uri, Status.OK);
        return;
      }

      // Subsequent chunks
      // We assume we receive chunk one first, so Chunk Receiver must already exist
      // TODO: Add support for chunk one arriving out of order. Ticket: https://github.com/cwysong85/msrp-node-lib/issues/15
      if (!this.chunkReceivers[messageId]) {
        this.sendResponse(request, socket, toUri.uri, this.Status.STOP_SENDING);
        return;
      }

      // Process received chunk and check if any error ocurrs
      if (!this.chunkReceivers[messageId].processChunk(request)) {
        if (this.chunkReceivers[messageId].remoteAbort) {
          console.warn('[MSRP SocketHandler] Message transmission aborted by remote endpoint');
        } else {
          console.error('[MSRP SocketHandler] An error occurred while processing message chunk. Message transmission aborted.');
        }
        // Clean up
        delete this.chunkReceivers[messageId];
        // If something fails while processing the chunk, return 413 STOP SENDING MESSAGE
        this.sendResponse(request, socket, toUri.uri, Status.STOP_SENDING);
        return;
      }

      // If this is not the last chunk, wait for additional chunks
      if (!this.chunkReceivers[messageId].isComplete()) {
        console.debug(`[MSRP SocketHandler] Receiving additional chunks for messageId: ${messageId}. Received bytes: ${msrp.chunkReceivers[messageId].receivedBytes}`);
        // Return successful response: 200 OK
        this.sendResponse(request, socket, toUri.uri, Status.OK);
        return;
      }

      // If it is the last chunk, parse the message body and clean up the receiver
      const buffer = this.chunkReceivers[messageId].buffer;
      delete this.chunkReceivers[messageId];
      request.body = buffer.toString('utf-8');
      // Emit 'message' event including the complete message
      session.emit('message', request, session);
      // Return successful response: 200 OK
      this.sendResponse(request, socket, toUri.uri, Status.OK);
      return;
    }

    // If the request method is not understood, return 501 NOT IMPLEMENTED
    this.sendResponse(request, socket, toUri.uri, Status.NOT_IMPLEMENTED);
    return;
  };

  /**
   * Helper function for handling incoming responses
   * Only responses to heartbeats are being handled. The rest responses are ignored.
   * @param  {Object} response Response
   */
  handleIncomingResponse(response) {
    const msrp = this.msrp;

    // Retrieve Session
    const toUri = new URI(response.toPath[0]);
    const session = this.sessionController.getSession(toUri.sessionId);

    // Check if it is a heartbeat response and handle it as needed
    const isHeartbeatResponse = response.tid && session && session.heartbeatsTransIds[response.tid];
    if (isHeartbeatResponse) {
      if (response.status === 200) {
        // If the response is 200OK, clear all the stored heartbeats
        console.debug(`[MSRP SocketHandler] MSRP heartbeat response received from ${response.fromPath} (tid: ${response.tid})`);
        session.heartbeatsTransIds = {};
      } else if (response.status >= 400) {
        // If not okay, emit 'heartbeatFailure'
        console.debug(`[MSRP SocketHandler] MSRP heartbeat error received from ${response.fromPath} (tid: ${response.tid})`);
        session.emit('heartbeatFailure', session);
      }
    }

    // TODO: Handle other incoming responses. Ticket: https://github.com/cwysong85/msrp-node-lib/issues/16
  }

  /**
   * Helper function for handling incoming reports
   * @param  {Object} report Report
   */
  incomingReport(report) {
    const msrp = this.msrp;

    // Retrieve message ID
    const messageId = report.messageId;
    if (!messageId) {
      console.error('[MSRP SocketHandler] Invalid REPORT: No message ID');
      return;
    }

    // Check whether this is for a chunk sender first
    const sender = this.chunkSenders[messageId];
    if (!sender) {
      console.error('[MSRP SocketHandler] Invalid REPORT: Unknown message ID');
      // Silently ignore, as suggested in 4975 section 7.1.2
      return;
    }

    // Let the chunk sender handle the report
    sender.processReport(report);
    if (!sender.isComplete()) {
      // Still expecting more reports, no notification yet
      return;
    }

    // All chunks have been acknowledged. Clean up.
    delete this.chunkSenders[messageId];

    // Don't notify for locally aborted messages
    if (sender.aborted && !sender.remoteAbort) {
      return;
    }

    // TODO: Pass incoming reports to the application. Ticket: https://github.com/cwysong85/msrp-node-lib/issues/17
  }

  /**
   * Helper function for sending reports
   * @param  {Object} socket  Socket to be used for sending the report
   * @param  {Object} session Session
   * @param  {Object} req     Request asking for the report
   * @param  {Number} status  Status to be included in the report
   */
  sendReport(socket, session, req, status) {
    const msrp = this.msrp;
    const statusHeader = ['000', status, StatusComment[status]].join(' ');
    const report = new Message.OutgoingRequest(session, 'REPORT');
    report.addHeader('message-id', req.messageId);
    report.addHeader('status', statusHeader);

    if (req.byteRange || req.continuationFlag === Message.flags.continued) {
      // A REPORT Byte-Range will be required
      let start = 1;
      let end = -1;
      let total = -1;

      if (req.byteRange) {
        // Don't trust the range end
        start = req.byteRange.start;
        total = req.byteRange.total;
      }

      if (!req.body) {
        end = 0;
      } else {
        if (req.byteRange.end === req.byteRange.total) {
          end = req.byteRange.end;
        } else {
          end = start + req.body.length - 1;
        }
      }

      if (end !== req.byteRange.end) {
        console.error('[MSRP SocketHandler] Report Byte-Range end does not match request');
      }

      report.byteRange = {
        'start': start,
        'end': end,
        'total': total
      };
    }

    const encodeMsg = report.encode();
    socket.send(encodeMsg);

    // Trace MSRP message
    if (this.traceMessages)
      console.log('%c%s[sendReport]: MSRP report:\n%s', 'color:blue', this.constructor.name, encodeMsg);
  }

  /**
   * Helper function for sending request
   */
  sendRequests() {
    const msrp = this.msrp;
    while (this.activeSenders.length > 0) {
      // Use first sender in list
      const sender = this.activeSenders[0].sender;
      const socket = this.activeSenders[0].socket;
      const cb = this.activeSenders[0].cb;

      // Abort sending?
      if (sender.aborted && sender.remoteAbort) {
        // Don't send any more chunks; remove sender from list
        this.activeSenders.shift();
      }

      // Retrieve and encode next chunk
      const msg = sender.getNextChunk();
      const encodeMsg = msg.encode();
      // Check socket availability before writing
      if (!socket || socket.destroyed) {
        console.error('[MSRP WebSocketHandler] Cannot send message. Socket unavailable.');
        this.activeSenders.shift();
        continue;
      }
      this.socket.send(encodeMsg);
      
      // Check whether this sender has now completed
      if (sender.isSendComplete()) {
        if (this.traceMessages)
          console.log('%c%s[sendRequests]: MSRP request sent successfully:\n%s', 'color:blue', this.constructor.name, encodeMsg);

        // Remove this sender from the active list
        this.activeSenders.shift();
        if (cb) {
          cb();
        }
      } else if (this.activeSenders.length > 1) {
        if (this.traceMessages)
          console.warn('%c%s[sendRequests]: MSRP request PARTIAL message sent:\n%s', 'color:blue', this.constructor.name, encodeMsg);
        // For fairness, move this sender to the end of the queue
        this.activeSenders.push(this.activeSenders.shift());
      }
    }
  }

  /**
   * Helper function for sending responses
   * @param  {Object} req    Request generating the response
   * @param  {Object} socket Socket to be used for sending the response
   * @param  {String} toUri  Destination URI
   * @param  {Number} status Response status
   */
  sendResponse(req, socket, toUri, status) {
    const msrp = this.msrp;

    // Check socket availability
    if (socket.destroyed) {
      console.error('[MSRP SocketHandler] Unable to send message. Socket is destroyed.');
      return;
    }

    // Write message to socket
    const msg = new Message.OutgoingResponse(req, toUri, status);
    const encodeMsg = msg.encode();
    socket.send(encodeMsg, function() {
      // After sending the message, if request has header 'success-report', send back a report
      if (req.getHeader('failure-report') === 'yes') {
        msrp.sendReport(socket, {
          toPath: req.fromPath,
          localUri: toUri
        }, req, status);
      }
    });

    // Trace MSRP message
    if (this.traceMessages)
      console.log('%c%s[sendResponse]: MSRP response:\n%s', 'color:blue', this.constructor.name, encodeMsg);
  }

  /**
   * Helper function for starting the chunk receiver poll if it's not already running.
   * This function also takes care of stopping the chunk receiver poll when it is done receiving.
   */
  startChunkReceiverPoll() {
    const msrp = this.msrp;
    if (!this.receiverCheckInterval) {
      this.receiverCheckInterval = setInterval(function() {
        const now = new Date().getTime();
        const timeout = 30 * 1000; // 30 seconds
        for (const messageId in this.chunkReceivers) {
          if (this.chunkReceivers.hasOwnProperty(messageId)) {
            const receiver = msrp.chunkReceivers[messageId];
            if (now - receiver.lastReceive > timeout) {
              // Clean up the receiver
              receiver.abort();
              delete this.chunkReceivers[messageId];
            }
          }
        }
        // Stop the receiver poll when done receiving
        if (msrp.Util.isEmpty(this.chunkReceivers)) {
          clearInterval(this.receiverCheckInterval);
          this.receiverCheckInterval = null;
        }
      });
    }
  }
};


// Class Timer for websocket reconnection
class Timer {
  constructor(callback, timerCalc){
    this.callback  = callback;
    this.timerCalc = timerCalc;
    this.timer     = null;
    this.tries     = 0;
  }

  reset(){
    this.tries = 0
    clearTimeout(this.timer)
  }

  scheduleTimeout(){
    clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.tries = this.tries + 1
      this.callback()
    }, this.timerCalc(this.tries + 1))
  }
}


// Promise callbacks function
var myCallbacks = {
  onSuccess: function( data, message) {
    console.log('%c%s: Taks Successfull !', 'color:blue', this.constructor.name);
  },
  onFail: function( data, message, errorCode) {
    console.log('%c%s: Task Failure !', 'color:blue', this.constructor.name);
  }
};
