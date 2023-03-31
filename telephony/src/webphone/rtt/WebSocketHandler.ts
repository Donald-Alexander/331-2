import { SipRtt } from '../interfaces/sip-rtt';
import { SessionController } from './SessionController';
import { Diag } from '../../common/diagClient';

const diag = new Diag('rtt.WebSocketHandler');

export class WebSocketHandler {
  rtt: SipRtt;
  sessionController: SessionController;
  socket!: WebSocket;
  traceMessages: boolean;
  reconnectTimer: Timer;
  url: string;

  constructor(rtt: SipRtt) {
    this.rtt = rtt;
    this.sessionController = rtt.sessionController;
    this.traceMessages = this.rtt.rttConfig.traceMessages;
    this.url = '';

    this.reconnectTimer = new Timer(() => {
      diag.warn(this.constructor.name, `RTT socket reconnection --> ${this.url}`);
      this.disconnect();
      this.connect(this.url);
    }, this.reconnectAfterMs);
  }

  connect(url: string) {
    diag.out('connect', `RTT socket try to connect --> ${url}`);

    try {
      this.url = url;
      this.socket = new WebSocket(url, 't140'); // t140 subprotocol for RTT
    } catch (e) {
      diag.err('connect', `Failed creating websocket(${e})`);
      throw e;
    }

    // Socket events
    this.socket.onopen = (event: Event) => {
      var msg = {
        id: 'NoSessionIdYet',
        txt: 'RTT/T140 websocket was just opened successfully',
      };
      this.socket.send(JSON.stringify(msg));
      //this.socket.send('First text message !');
      diag.out('onopen', `RTT WebSocket established "onopen" EVENT to "${this.url}". send msg: ${JSON.stringify(msg)}`);
    };

    this.socket.onclose = (event: any) => {
      if (event.wasClean)
        diag.out('onclose', `RTT socket connection closed cleanly: code=${event.code}, reason=${event.reason}`);
      else {
        // e.g. server process killed or network down
        // event.code is usually 1006 in this case
        diag.out('onclose', `RTT socket connection died: code=${event.code}, reason=${event.reason}`);
        this.reconnectTimer.scheduleTimeout();
      }
    };

    this.socket.onerror = (error: any) => {
      diag.err('onerror', `RTT socket "onerror" EVENT: ${error.message}`);
    };

    this.socket.onmessage = (event: any) => {
      const rtt = this.rtt;
      //const data = event.data;
      try {
        var data = event.data;
        diag.trace?.('onmessage', `RTT socket "onmessage" received DATA:\n${data}`);
        var parsedObj = JSON.parse(data);
        diag.trace?.('onmessage', parsedObj);
        diag.trace?.('onmessage', `RTT socket "onmessage" parsed DATA:\n msg = ${parsedObj.msg}`);
        const session = this.sessionController.getSessionByRttID(parsedObj.id);
        if (session) {
          diag.trace?.(
            'onmessage',
            `RTT socket "onmessage" successfully got session matching id=${session.rttID}, sid = ${session.sid}, CallID = ${session.sipCallID}`
          );
          rtt.incRttMsgCb(session, { body: parsedObj.msg });
        }
      } catch (e) {
        diag.warn('onmesssage', `Received connection message invalid: ${e}`);
      }
    };
  } // END OF CONNECT

  reconnectAfterMs(tries: number) {
    return [500, 1000, 2000][tries - 1] || 3000;
  }

  disconnect() {
    diag.out('disconnect', `RTT socket disconnect from "${this.url}"`);
    this.socket.onclose = function () {};
    this.socket.close();
  }

  /**
   * Helper function for sending messages via a specific socket
   * @param  {Object}   session    Session
   * @param  {Object}   message    Message
   * @param  {Object}   routePaths Route paths
   * @param  {Function} cb         Callback function
   */
  sendMessage(session: any, message: any, routePaths: any, cb: Function) {
    // Sanity checks
    diag.trace?.('sendMessage', `RTT socket about to send "${message.body}"`);
    if (!session || !message || !routePaths) {
      diag.err('sendMessage', `[RTT SocketHandler] Unable to send message. Missing arguments.`);
      return;
    }

    const rtt = this.rtt;
    var msg = {
      sessid: session.sid,
      id: session.rttID,
      src: 151, // to change to something else
      msg: message.body,
    };
    let msgString = JSON.stringify(msg);
    diag.trace?.('sendMessage', `RTT socket sending "${msgString}"`);
    this.socket.send(msgString);
    this.rtt.outRttMsgCb(session, message);
    if (cb) {
      cb();
    }
  }
}

// Class Timer for websocket reconnection
class Timer {
  callback: Function;
  timerCalc: Function;
  timer: any;
  tries: any;

  constructor(callback: Function, timerCalc: Function) {
    this.callback = callback;
    this.timerCalc = timerCalc;
    this.timer = null;
    this.tries = 0;
  }

  reset() {
    this.tries = 0;
    clearTimeout(this.timer);
  }

  scheduleTimeout() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.tries = this.tries + 1;
      this.callback();
    }, this.timerCalc(this.tries + 1));
  }
}

// Promise callbacks function
var myCallbacks = {
  onSuccess: function (data: any, message: any) {
    diag.trace?.('onSuccess', `myCallbacks: Taks Successfull !`);
  },
  onFail: function (data: any, message: any, errorCode: any) {
    diag.trace?.('onFail', `myCallbacks: Task Failure !`);
  },
};
