import { Util } from './Util';
import { Diag } from '../../common/diagClient';

// Global variable
const lineEnd = '\r\n';

const diag = new Diag('rtt.Sdp');

export class Sdp {
  // private members
  version: number;
  origin: Origin;
  sessionName: string;
  sessionInfo?: string;
  uri?: string;
  email?: string;
  phone?: string;
  connection: Connection;
  bandwidth: string[];
  timing: Timing[];
  timezone?: string;
  key?: string;
  media: Media[];
  attributes: any;
  attributeNameOrder: any;

  constructor(sdp?: string) {
    this.version = 0;
    this.origin = new Origin();
    this.sessionName = ' ';
    this.sessionInfo = undefined;
    this.uri = undefined;
    //this.email = undefined;
    this.phone = undefined;
    this.connection = new Connection();
    this.bandwidth = [];
    this.timing = [new Timing()];
    this.timezone = undefined;
    this.key = undefined;
    this.resetAttributes();
    this.media = [];
    this.attributes = [];
    if (sdp) {
      // Parse the provided SDP
      if (!this.parse(sdp)) {
        return;
      }
    } else {
      // Set some sensible defaults
      this.reset();
    }
  }

  reset() {
    this.version = 0;
    this.origin = new Origin();
    this.sessionName = ' ';
    this.sessionInfo = undefined;
    this.uri = undefined;
    this.email = undefined;
    this.phone = undefined;
    this.connection = new Connection();
    this.bandwidth = [];
    this.timing = [new Timing()];
    this.timezone = undefined;
    this.key = undefined;
    this.resetAttributes();
    this.media = [];
  }

  addAttribute(name: string, value: string) {
    if (!this.attributes[name]) {
      this.attributes[name] = [];
      this.attributeNameOrder.push(name);
    }
    if (value && typeof value === 'string') {
      this.attributes[name] = this.attributes[name].concat(value.split(' '));
    }
  }

  removeAttribute(name: string) {
    if (this.attributes[name]) {
      delete this.attributes[name];
      this.attributeNameOrder.splice(this.attributeNameOrder.indexOf(name), 1);
    }
  }

  replaceAttribute(oldName: string, newName: string, newValue: any) {
    if (this.attributes[oldName]) {
      delete this.attributes[oldName];
      this.addAttribute(newName, newValue);
      this.attributeNameOrder.splice(this.attributeNameOrder.lastIndexOf(newName), 1);
      this.attributeNameOrder.splice(this.attributeNameOrder.indexOf(oldName), 1, newName);
    }
  }

  resetAttributes() {
    this.attributeNameOrder = [];
    this.attributes = {};
  }

  parse(sdp: string) {
    var line,
      lines = sdp.split(lineEnd),
      value,
      colonIndex,
      aName;

    this.reset();

    if (lines[lines.length - 1] === '') {
      // SDP ends in CRLF; remove final array index
      lines.pop();
    }

    if (lines.length < 4) {
      diag.warn('parse', 'Unexpected SDP length: ' + lines.length);
      return false;
    }

    line = lines.shift();
    if (line !== 'v=0') {
      diag.warn('parse', 'Unexpected SDP version: ' + line);
      return false;
    }

    line = lines.shift();
    if (line && (line.substr(0, 2) !== 'o=' || !(this.origin = new Origin(line.substr(2))))) {
      diag.warn('parse', 'Unexpected SDP origin: ' + line);
      return false;
    }

    line = lines.shift();
    if (line && line.substr(0, 2) === 's=') {
      this.sessionName = line.substr(2);
    } else {
      diag.warn('parse', 'Unexpected SDP session name: ' + line);
      return false;
    }

    // Process any other optional pre-timing lines
    while (lines.length > 0 && lines[0].charAt(0) !== 't') {
      line = lines.shift();
      if (line) {
        value = line.substr(2);

        switch (line.substr(0, 2)) {
          case 'i=':
            this.sessionInfo = value;
            break;
          case 'u=':
            this.uri = value;
            break;
          case 'e=':
            this.email = value;
            break;
          case 'p=':
            this.phone = value;
            break;
          case 'c=':
            value = new Connection(value);
            if (!value) {
              return false;
            }
            this.connection = value;
            break;
          case 'b=':
            this.bandwidth.push(value);
            break;
          default:
            diag.warn('parse', 'Unexpected SDP line (pre-timing): ' + line);
            return false;
        }
      }
    }

    if (lines.length === 0) {
      diag.warn('parse', 'Unexpected end of SDP (pre-timing)');
      return false;
    }

    this.timing = [];
    while (lines.length > 0 && lines[0].charAt(0) === 't') {
      line = lines.shift();
      if (line) {
        line = line.substr(2);
      }

      // Append any following r-lines
      while (lines.length > 0 && lines[0].charAt(0) === 'r') {
        line += lineEnd + lines.shift();
      }

      value = new Timing(line);
      if (!value) {
        return false;
      }
      this.timing.push(value);
    }

    if (this.timing.length === 0) {
      diag.warn('parse', 'No timing line found');
      return false;
    }

    // Process any optional pre-media lines
    while (lines.length > 0 && lines[0].charAt(0) !== 'm') {
      line = lines.shift();
      if (line) {
        value = line.substr(2);

        switch (line.substr(0, 2)) {
          case 'z=':
            this.timezone = value;
            break;
          case 'k=':
            this.key = value;
            break;
          case 'a=':
            colonIndex = value.indexOf(':');
            if (colonIndex === -1) {
              aName = value;
              value = null;
            } else {
              aName = value.substr(0, colonIndex);
              value = value.substr(colonIndex + 1);
              diag.trace?.('parse', 'Found attribute a=' + aName + ' ' + value);
            }
            if (value) {
              this.addAttribute(aName, value);
            }
            break;
          default:
            diag.warn('parse', 'Unexpected SDP line (pre-media): ' + line);
            return false;
        }
      }
    }

    while (lines.length > 0 && lines[0].charAt(0) === 'm') {
      line = lines.shift();
      if (line) {
        line.substr(2);
      }
      // Append any following lines up to the next m-line
      while (lines.length > 0 && lines[0].charAt(0) !== 'm') {
        line += lineEnd + lines.shift();
      }

      value = new Media(line);
      if (!value) {
        return false;
      }
      this.media.push(value);
    }

    return true;
  }

  toString() {
    var sdp = '',
      index,
      aName,
      aValues;

    sdp += 'v=' + this.version + lineEnd;
    sdp += 'o=' + this.origin + lineEnd;
    sdp += 's=' + this.sessionName + lineEnd;
    if (this.sessionInfo) {
      sdp += 'i=' + this.sessionInfo + lineEnd;
    }
    if (this.uri) {
      sdp += 'u=' + this.uri + lineEnd;
    }
    if (this.email) {
      sdp += 'e=' + this.email + lineEnd;
    }
    if (this.phone) {
      sdp += 'p=' + this.phone + lineEnd;
    }
    if (this.connection) {
      sdp += 'c=' + this.connection + lineEnd;
    }
    for (index in this.bandwidth) {
      sdp += 'b=' + this.bandwidth[index] + lineEnd;
    }
    for (index in this.timing) {
      sdp += 't=' + this.timing[index] + lineEnd;
    }
    if (this.timezone) {
      sdp += 'z=' + this.timezone + lineEnd;
    }
    if (this.key) {
      sdp += 'k=' + this.key + lineEnd;
    }
    for (index in this.media) {
      sdp += 'm=' + this.media[index] + lineEnd;
    }
    for (var i = 0, len = this.attributeNameOrder.length; i < len; i++) {
      aName = this.attributeNameOrder[i];
      aValues = this.attributes[aName];

      for (index in aValues) {
        sdp += 'a=' + aName;
        if (aValues[index]) {
          sdp += ':' + aValues[index];
        }
        sdp += lineEnd;
      }
    }

    return sdp;
  }

  toStringLimited() {
    var sdp = '',
      index,
      aName,
      aValues;

    for (index in this.media) {
      sdp += 'm=' + this.media[index] + lineEnd;
    }
    if (this.connection) {
      sdp += 'c=' + this.connection + lineEnd;
    }
    for (var i = 0, len = this.attributeNameOrder.length; i < len; i++) {
      aName = this.attributeNameOrder[i];
      aValues = this.attributes[aName];

      for (index in aValues) {
        sdp += 'a=' + aName;
        if (aValues[index]) {
          sdp += ':' + aValues[index];
        }
        sdp += lineEnd;
      }
    }

    return sdp;
  }
}

class Origin {
  util: any;
  username: string;
  id: number;
  version: number;
  netType: string;
  addrType: string;
  address: string;

  constructor(origin?: string) {
    this.util = Util();
    this.username = '-';
    this.id = this.util.dateToNtpTime(new Date());
    this.version = 0; //this.sessId;
    this.netType = 'IN';
    this.addrType = 'IP4';
    this.address = 'address.invalid';
    if (origin) {
      // Parse the provided origin line
      if (!this.parse(origin)) {
        return; // INVALID!
      }
    } else {
      // Set some sensible defaults
      this.reset();
    }
  }

  reset() {
    this.username = '-';
    this.id = this.util.dateToNtpTime(new Date());
    this.version = 0; //this.sessId;
    this.netType = 'IN';
    this.addrType = 'IP4';
    this.address = 'address.invalid';
  }

  parse(origin: string) {
    var split: string[];

    split = origin.split(' ');
    if (split.length !== 6) {
      diag.warn('parse', 'Unexpected origin line: ' + origin);
      return false;
    }

    this.username = split[0];
    this.id = +split[1];
    this.version = +split[2];
    this.netType = split[3];
    this.addrType = split[4];
    this.address = split[5];

    return true;
  }

  toString() {
    var o = '';

    o += this.username + ' ';
    o += this.id + ' ';
    o += this.version + ' ';
    o += this.netType + ' ';
    o += this.addrType + ' ';
    o += this.address;

    return o;
  }
}

class Connection {
  netType: string;
  addrType: string;
  address: string;

  constructor(con?: string) {
    this.netType = 'IN';
    this.addrType = 'IP4';
    this.address = 'address.invalid';
    if (con) {
      // Parse the provided connection line
      if (!this.parse(con)) {
        return;
      }
    } else {
      // Set some sensible defaults
      this.reset();
    }
  }

  reset() {
    this.netType = 'IN';
    this.addrType = 'IP4';
    this.address = 'address.invalid';
  }

  parse(con: string) {
    var split: string[];

    split = con.split(' ');
    if (split.length !== 3) {
      diag.warn('parse', 'Unexpected connection line: ' + con);
      return false;
    }

    this.netType = split[0];
    this.addrType = split[1];
    this.address = split[2];

    return true;
  }

  toString() {
    var c = '';

    c += this.netType + ' ';
    c += this.addrType + ' ';
    c += this.address;

    return c;
  }
}

class Timing {
  util: any;
  start?: Date;
  stop?: Date;
  repeat: string[];

  constructor(timing?: string) {
    this.repeat = [];
    this.util = Util();
    if (timing) {
      // Parse the provided timing line
      if (!this.parse(timing)) {
        return;
      }
    } else {
      // Set some sensible defaults
      this.reset();
    }
  }

  reset() {
    this.start = undefined;
    this.stop = undefined;
    this.repeat = [];
  }

  // Parse expects to be passed the full t-line, plus any following r-lines
  parse(timing: string) {
    const util = this.util;
    var lines: string[];
    var tLine: string | undefined;
    var tokens: string[];

    lines = timing.split(lineEnd);
    tLine = lines.shift();

    if (tLine) {
      tokens = tLine.split(' ');
      if (tokens.length !== 2) {
        diag.warn('parse', 'Unexpected timing line: ' + tLine);
        return false;
      }

      if (tokens[0] === '0') {
        this.start = undefined;
      } else {
        this.start = util.ntpTimeToDate(tokens[0]);
      }

      if (tokens[1] === '0') {
        this.stop = undefined;
      } else {
        this.stop = util.ntpTimeToDate(tokens[1]);
      }
    }
    // Don't care about repeat lines at the moment
    this.repeat = lines;

    return true;
  }

  toString() {
    const util = this.util;
    var t = '',
      index;

    if (this.start) {
      t += util.dateToNtpTime(this.start);
    } else {
      t += '0';
    }
    t += ' ';
    if (this.stop) {
      t += util.dateToNtpTime(this.stop);
    } else {
      t += '0';
    }

    for (index in this.repeat) {
      t += lineEnd + this.repeat[index];
    }

    return t;
  }
}

export class Media {
  media: string;
  port: number;
  proto: string;
  format: string;
  title?: string;
  connection?: Connection;
  bandwidth: string[];
  key?: string;
  attributes: any;
  attributeNameOrder: any;

  constructor(media?: string) {
    this.media = 'text'; //TBD - !eapril
    this.port = 2855; //TBD - !eapril
    this.proto = 'TCP/RTT';
    this.format = '*';
    this.bandwidth = [];
    if (media) {
      // Parse the provided connection line
      if (!this.parse(media)) {
        return;
      }
    } else {
      // Set some sensible defaults
      this.reset();
    }
  }

  reset() {
    this.media = 'text'; //TBD - !eapril
    this.port = 2855; //TBD - !eapril
    this.proto = 'TCP/RTT';
    this.format = '*';
    this.title = undefined;
    this.connection = undefined;
    this.bandwidth = [];
    this.key = undefined;
    this.resetAttributes();
  }

  addAttribute(name: string, value: string) {
    if (!this.attributes[name]) {
      this.attributes[name] = [];
      this.attributeNameOrder.push(name);
    }
    if (value && typeof value === 'string') {
      this.attributes[name] = this.attributes[name].concat(value.split(' '));
    }
  }

  removeAttribute(name: string) {
    if (this.attributes[name]) {
      delete this.attributes[name];
      this.attributeNameOrder.splice(this.attributeNameOrder.indexOf(name), 1);
    }
  }

  resetAttributes() {
    this.attributeNameOrder = [];
    this.attributes = {};
  }

  replaceAttribute(oldName: string, newName: string, newValue: string) {
    if (this.attributes[oldName]) {
      delete this.attributes[oldName];
      this.addAttribute(newName, newValue);
      this.attributeNameOrder.splice(this.attributeNameOrder.lastIndexOf(newName), 1);
      this.attributeNameOrder.splice(this.attributeNameOrder.indexOf(oldName), 1, newName);
    }
  }

  parse(media: string) {
    var lines, mLine, tokens, index, aName, token;

    this.reset();

    lines = media.split(lineEnd);
    mLine = lines.shift();

    if (!mLine) return false;

    tokens = mLine.split(' ');
    if (tokens.length < 4) {
      diag.warn('parse', 'Unexpected media line: ' + mLine);
      return false;
    }

    this.media = tokens[0];
    this.port = parseInt(tokens[1], 10);
    this.proto = tokens[2];
    this.format = tokens[3];

    for (index in lines) {
      var value = lines[index].substr(2),
        colonIndex;

      switch (lines[index].substr(0, 2)) {
        case 'i=':
          this.title = value;
          break;
        case 'c=':
          this.connection = new Connection(value);
          if (!this.connection) {
            return false;
          }
          break;
        case 'b=':
          this.bandwidth.push(value);
          break;
        case 'k=':
          this.key = value;
          break;
        case 'a=':
          colonIndex = value.indexOf(':');
          if (colonIndex === -1) {
            aName = value;
            value = '';
          } else {
            aName = value.substr(0, colonIndex);
            value = value.substr(colonIndex + 1);
          }
          this.addAttribute(aName, value);
          break;
        default:
          diag.warn('parse', 'Unexpected type (within media): ' + lines[index]);
          return false;
      }
    }
    return true;
  }

  toString() {
    var m = '',
      index,
      aName,
      aValues;

    m += this.media + ' ';
    m += this.port + ' ';
    m += this.proto + ' ';
    m += this.format;

    if (this.title) {
      m += lineEnd + 'i=' + this.title;
    }
    if (this.connection) {
      m += lineEnd + 'c=' + this.connection;
    }
    for (index in this.bandwidth) {
      m += lineEnd + 'b=' + this.bandwidth[index];
    }
    if (this.key) {
      m += lineEnd + 'k=' + this.key;
    }
    for (var i = 0, len = this.attributeNameOrder.length; i < len; i++) {
      aName = this.attributeNameOrder[i];
      aValues = this.attributes[aName];

      for (index in aValues) {
        m += lineEnd + 'a=' + aName;
        if (aValues[index]) {
          m += ':' + aValues[index];
        }
      }
    }

    return m;
  }
}
