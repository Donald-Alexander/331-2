// Dependencies
import { EventEmitter } from 'events';
import { SipRtt } from '../interfaces/sip-rtt';
import { RTTSession, RTTSession as Session } from './Session';


export class SessionController extends EventEmitter {
  
  sessions: RTTSession[];
  rtt: SipRtt;
  incRttMsgCb: Function;

  constructor(rtt: SipRtt, incRttMsgCb: Function) {
    super();
    this.rtt = rtt;
    this.sessions = [];
    this.incRttMsgCb = incRttMsgCb;
  }

  /**
   * Creates a session
   * @return {Session} Session
   */
  createSession(sipCallID: string) {
    var sessionController = this;
    var session = new Session(this.rtt, sipCallID);
    forwardSessionEvents(session, sessionController, this.incRttMsgCb);
    this.sessions.push(session);
    return session;
  };

  /**
   * Gets a session by session ID
   * @param  {String} sessionId Session ID
   * @return {Session}          Session
   */
  getSession(sessionId: string) {
    var sessionController = this;
    return sessionController.sessions.find(function(session: Session) {
      return session.sid === sessionId;
    });
  };

  /**
   * Gets a session by SIP Call-ID
   * @param  {String} callID SIP Call-ID
   * @return {Session} Session
   */
  getSessionByCallID(callID: string) {
    var sessionController = this;
    return sessionController.sessions.find(function(session: Session) {
      return session.sipCallID === callID;
    });
  };

  /**
   * Gets a session by RTT connection ID
   * @param  {String} rttID RTT session remote udp port
   * @return {Session} Session
   */
   getSessionByRttID(rttID: number) {
    var sessionController = this;
    return sessionController.sessions.find(function(session: Session) {
      return session.rttID === rttID;
    });
  };

  /**
   * Removes a session
   * @param  {Session} session Session
   */
  removeSession(rttSession: Session) {
    if (this.sessions.includes(rttSession)) {
      this.sessions.splice(this.sessions.indexOf(rttSession), 1);
    }
  };
};


/**
 * Helper function for forwarding a session's events to the session controller
 * @param  {Session} session Session
 * @param  {SessionController} sessionController Session controller
 */
function forwardSessionEvents(session: Session, sessionController: SessionController, incomingMsgCb: Function) {

  // Session events
  session.on('end', function(session) {
    sessionController.removeSession(session);
    sessionController.emit('end', session);
  });

  session.on('message', function(message, session) {
    sessionController.emit('message', message, session);
    // Report RTT message
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
