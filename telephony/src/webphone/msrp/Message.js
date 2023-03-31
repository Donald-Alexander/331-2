import { Util } from './Util.js';
import { Status, StatusComment } from './Status.js';

// Globals
export const flags = {
  continued: '+',
  end: '$',
  abort: '#'
};
const lineEnd = '\r\n';
let messages = {};


/**
 * Parent class for all MSRP messages
 * @class
 * @private
 */
export class Message {
  constructor() {
    this.util = Util();
  };

  initMessage = function() {
    this.tid = null;
    this.toPath = [];
    this.fromPath = "";
    this.headers = {};
    this.continuationFlag = flags.end;
  };

  addHeader = function(name, value) {
    name = this.util.normaliseHeader(name);

    // Standard headers are stored in their own properties
    switch (name) {
      case 'To-Path':
        this.toPath = value.split(' ');
        return;
      case 'From-Path':
        this.fromPath = value.split(' ');
        return;
      case 'Content-Type':
        this.contentType = value;
        return;
      default:
        break;
    }

    if (this.headers[name]) {
      this.headers[name].push(value);
    } else {
      this.headers[name] = [value];
    }
  };

  getHeader = function(name) {
    name = this.util.normaliseHeader(name);
    if (name in this.headers) {
      if (this.headers[name].length > 1) {
        return this.headers[name];
      }
      return this.headers[name][0];
    }
    return null;
  };

  getEndLineNoFlag = function() {
    return '-------' + this.tid;
  };

  getEndLine = function() {
    return this.getEndLineNoFlag().concat(this.continuationFlag, lineEnd);
  };
};



/**
 * Creates a new Request object.
 * @class Parent class for all MSRP requests.
 * @extends Message
 * @private
*/
export class Request extends Message {
  constructor() {
    super();
  };

  initRequest = function() {
    this.initMessage();
    this.method = null;
    this.contentType = null;
    this.body = null;
  };

  addBody = function(type, body) {
    this.contentType = type;
    this.body = body;
  };

  addTextBody = function(text) {
    this.addBody('text/plain', text);
  };
}



/**
 * Creates a new Response object.
 * @class Parent class for all MSRP responses.
 * @extends Message
 * @private
 */
export class Response extends Message {
  constructor() {
    super();
  };

  initResponse = function() {
    this.initMessage();
    this.status = null;
    this.comment = null;
  };
};



/**
 * Creates a new outgoing MSRP request.
 * @class Class representing an outgoing MSRP request.
 * @extends Request
 * @private
 */
export class OutgoingRequest extends Request {
  constructor(session, method) {
    super();
    this.util = Util();

    if (!session || !method) {
      throw new TypeError('Required parameter is missing');
    }

    this.initRequest();
    
    this.tid = this.tid === null ? this.util.newTID() : this.tid; 
    this.method = method;

    this.toPath = session.toPath;
    this.fromPath = session.localUri;
    this.session = session;

    this.byteRange = null;
  };

  encode = function() {
    var msg = '',
      name, type = this.contentType,
      end = this.getEndLine();

    if (this.body && (this.body instanceof String || typeof this.body === 'string')) {
      // If the body contains the end-line, change the transaction ID
      while (this.body.indexOf(end) !== -1) {
        this.tid = this.util.newTID();
        end = this.getEndLine();
      }
    }

    msg = msg.concat('MSRP ', this.tid, ' ', this.method, lineEnd);
    msg = msg.concat('To-Path: ', this.toPath.join(' '), lineEnd);
    msg = msg.concat('From-Path: ', this.fromPath, lineEnd);

    if (this.byteRange) {
      var r = this.byteRange,
        total = (r.total < 0 ? '*' : r.total);
      this.addHeader('byte-range', r.start + '-' + r.end + '/' + total);
    }

    for (name in this.headers) {
      msg = msg.concat(name, ': ', this.headers[name].join(' '), lineEnd);
    }

    if (type && this.body) {
      // Content-Type is the last header, and a blank line separates the
      // headers from the message body.
      // if (type instanceof msrp.ContentType) {
      //   type = type.toContentTypeHeader();
      // }
      msg = msg.concat('Content-Type: ', type, lineEnd, lineEnd);

      if (this.body instanceof String || typeof this.body === 'string') {
        msg = msg.concat(this.body, lineEnd, end);
      } else {
        // Turn the entire message into a blob, encapsulating the body
        msg = new Blob([msg, this.body, lineEnd, end]);
      }
    } else {
      msg += end;
    }

    return msg;
  };
};



/**
 * Creates a new incoming MSRP request.
 * @class Class representing an incoming MSRP request.
 * @extends Request
 * @private
 */
export class IncomingRequest extends Request {
  constructor(tid, method) {
    super();
    if (!tid || !method) {
      return null;
    }

    this.initRequest();
    this.tid = tid;
    this.method = method;

    switch (method) {
      case 'SEND':
        // Start by assuming responses are required
        // Can be overriden by request headers
        this.responseOn = {
          success: true,
          failure: true
        };
        break;
      case 'REPORT':
        // Never send responses
        this.responseOn = {
          success: false,
          failure: false
        };
        break;
    }

    this.byteRange = {
      start: 1,
      end: -1,
      total: -1
    };
  };
};



/**
 * Creates a new outgoing MSRP response.
 * @class Class representing an outgoing MSRP response.
 * @extends Response
 * @private
 */
export class OutgoingResponse extends Response {
  constructor(request, localUri, status) {
    super();
    if (!request || !localUri) {
      return null;
    }

    this.initResponse();
    this.tid = request.tid;
    this.status = status || Status.OK;
    this.comment = StatusComment[this.status];

    if (request.method === 'SEND') {
      // Response is only sent to the previous hop
      this.toPath = request.fromPath.slice(0, 1);
    } else {
      this.toPath = request.fromPath;
    }
    this.fromPath = localUri.toString();
  };

  encode = function() {
    var msg = '',
      name;

    msg = msg.concat('MSRP ', this.tid, ' ', this.status);
    if (this.comment) {
      msg = msg.concat(' ', this.comment);
    }
    msg += lineEnd;

    msg = msg.concat('To-Path: ', this.toPath.join(' '), lineEnd);
    msg = msg.concat('From-Path: ', this.fromPath, lineEnd);

    for (name in this.headers) {
      msg = msg.concat(name, ': ', this.headers[name].join(' '), lineEnd);
    }

    return msg + this.getEndLine();
  };
};



/**
 * Creates a new incoming MSRP response.
 * @class Class representing an incoming MSRP response.
 * @extends Response
 * @private
 */
export class IncomingResponse extends Response {
  constructor(tid, status, comment) {
    super();
    if (!tid || !status) {
      return null;
    }

    this.initResponse();
    this.tid = tid;
    this.status = status;
    this.comment = comment;
    this.request = null;
    this.authenticate = [];
  };
};


