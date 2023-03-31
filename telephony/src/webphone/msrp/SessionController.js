// Dependencies
import { EventEmitter } from 'events';
import { Session } from './Session.js';


export class SessionController extends EventEmitter {
  
  constructor(msrp, incMsrpMsgCb) {
    super();
    this.msrp = msrp;
    this.sessions = [];
    this.incMsrpMsgCb = incMsrpMsgCb;
  }

  /**
   * Creates a session
   * @return {Session} Session
   */
  createSession = function(sipCallID) {
    var sessionController = this;
    var session = new Session(this.msrp, sipCallID);
    forwardSessionEvents(session, sessionController, this.incMsrpMsgCb);
    this.sessions.push(session);
    return session;
  };

  /**
   * Gets a session by session ID
   * @param  {String} sessionId Session ID
   * @return {Session}          Session
   */
  getSession = function(sessionId) {
    var sessionController = this;
    return sessionController.sessions.find(function(session) {
      return session.sid === sessionId;
    });
  };

  /**
   * Gets a session by SIP Call-ID
   * @param  {String} callID SIP Call-ID
   * @return {Session} Session
   */
  getSessionByCallID = function(callID) {
    var sessionController = this;
    return sessionController.sessions.find(function(session) {
      return session.sipCallID === callID;
    });
  };

  /**
   * Removes a session
   * @param  {Session} session Session
   */
  removeSession = function(msrpSession) {
    if (this.sessions.includes(msrpSession)) {
      this.sessions.splice(this.sessions.indexOf(msrpSession), 1);
    }
  };
};


/**
 * Helper function for forwarding a session's events to the session controller
 * @param  {Session} session Session
 * @param  {SessionController} sessionController Session controller
 */
function forwardSessionEvents(session, sessionController, incomingMsgCb) {

  // Session events
  session.on('end', function(session) {
    sessionController.removeSession(session);
    sessionController.emit('end', session);
  });

  session.on('message', function(message, session) {
    sessionController.emit('message', message, session);
    // Report MSRP message
    incomingMsgCb(session, message);
  });

  // TODO: Deprecated
  session.on('reinvite', function(session) {
    sessionController.emit('reinvite', session);
  });

  session.on('update', function(session) {
    sessionController.emit('update', session);
  });


  // Socket events
  session.on('socketClose', function(hadError, session) {
    sessionController.emit('socketClose', hadError, session);
  });

  // TODO: Deprecated
  session.on('socketConnect', function(session) {
    sessionController.emit('socketConnect', session);
  });

  session.on('socketError', function(session) {
    sessionController.emit('socketError', session);
  });

  session.on('socketSet', function(session) {
    sessionController.emit('socketSet', session);
  });

  session.on('socketTimeout', function(session) {
    sessionController.emit('socketTimeout', session);
  });


  // Heartbeats events
  session.on('heartbeatFailure', function(session) {
    sessionController.emit('heartbeatFailure', session);
  });

  session.on('heartbeatTimeout', function(session) {
    sessionController.emit('heartbeatTimeout', session);
  });
}
