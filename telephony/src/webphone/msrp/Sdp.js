import { Util } from './Util.js'

// Global variable
const lineEnd = '\r\n';


export class Sdp {

  constructor(sdp) {
    if (sdp) {
      // Parse the provided SDP
      if (!this.parse(sdp)) {
        return null;
      }
    } else {
      // Set some sensible defaults
      this.reset();
    }
  }

  reset = function() {
    this.version = 0;
    this.origin = new Origin();
    this.sessionName = ' ';
    this.sessionInfo = null;
    this.uri = null;
    this.email = null;
    this.phone = null;
    this.connection = new Connection();
    this.bandwidth = [];
    this.timing = [new Timing()];
    this.timezone = null;
    this.key = null;
    this.resetAttributes();
    this.media = [];
  };

  addAttribute = function(name, value) {
    if (!this.attributes[name]) {
      this.attributes[name] = [];
      this.attributeNameOrder.push(name);
    }
    if (value && typeof value === 'string') {
      this.attributes[name] = this.attributes[name].concat(value.split(' '));
    }
  };

  removeAttribute = function(name) {
    if (this.attributes[name]) {
      delete this.attributes[name];
      this.attributeNameOrder.splice(
        this.attributeNameOrder.indexOf(name), 1);
    }
  };

  replaceAttribute = function(oldName, newName, newValue) {
    if (this.attributes[oldName]) {
      delete this.attributes[oldName];
      this.addAttribute(newName, newValue);
      this.attributeNameOrder.splice(this.attributeNameOrder.lastIndexOf(newName), 1);
      this.attributeNameOrder.splice(
        this.attributeNameOrder.indexOf(oldName), 1, newName);
    }
  };

  resetAttributes = function() {
    this.attributeNameOrder = [];
    this.attributes = {};
  };

  parse = function(sdp) {
    var line, lines = sdp.split(lineEnd),
      value, colonIndex, aName;

    this.reset();

    if (lines[lines.length - 1] === '') {
      // SDP ends in CRLF; remove final array index
      lines.pop();
    }

    if (lines.length < 4) {
      console.warn('Unexpected SDP length: ' + lines.length);
      return false;
    }

    line = lines.shift();
    if (line !== 'v=0') {
      console.warn('Unexpected SDP version: ' + line);
      return false;
    }

    line = lines.shift();
    if (line.substr(0, 2) !== 'o=' ||
      !(this.origin = new Origin(line.substr(2)))) {
      console.warn('Unexpected SDP origin: ' + line);
      return false;
    }

    line = lines.shift();
    if (line.substr(0, 2) === 's=') {
      this.sessionName = line.substr(2);
    } else {
      console.warn('Unexpected SDP session name: ' + line);
      return false;
    }

    // Process any other optional pre-timing lines
    while (lines.length > 0 && lines[0].charAt(0) !== 't') {
      line = lines.shift();
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
          console.warn('Unexpected SDP line (pre-timing): ' + line);
          return false;
      }
    }

    if (lines.length === 0) {
      console.warn('Unexpected end of SDP (pre-timing)');
      return false;
    }

    this.timing = [];
    while (lines.length > 0 && lines[0].charAt(0) === 't') {
      line = lines.shift().substr(2);
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
      console.warn('No timing line found');
      return false;
    }

    // Process any optional pre-media lines
    while (lines.length > 0 && lines[0].charAt(0) !== 'm') {
      line = lines.shift();
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
          }
          this.addAttribute(aName, value);
          break;
        default:
          console.warn('Unexpected SDP line (pre-media): ' + line);
          return false;
      }
    }

    while (lines.length > 0 && lines[0].charAt(0) === 'm') {
      line = lines.shift().substr(2);
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
  };

  toString = function() {
    var sdp = '',
      index, aName, aValues;

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
  };

  toStringLimited = function() {
    var sdp = '', index, aName, aValues;

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
  };

};




class Origin {

  constructor(origin) {
    this.util = Util();
    if (origin) {
      // Parse the provided origin line
      if (!this.parse(origin)) {
        return null;
      }
    } else {
      // Set some sensible defaults
      this.reset();
    }
  };

  reset = function() {
    this.username = '-';
    this.id = this.util.dateToNtpTime(new Date());
    this.version = this.sessId;
    this.netType = 'IN';
    this.addrType = 'IP4';
    this.address = 'address.invalid';
  };

  parse = function(origin) {
    var split;

    split = origin.split(' ');
    if (split.length !== 6) {
      console.warn('Unexpected origin line: ' + origin);
      return false;
    }

    this.username = split[0];
    this.id = split[1];
    this.version = split[2];
    this.netType = split[3];
    this.addrType = split[4];
    this.address = split[5];

    return true;
  };

  toString = function() {
    var o = '';

    o += this.username + ' ';
    o += this.id + ' ';
    o += this.version + ' ';
    o += this.netType + ' ';
    o += this.addrType + ' ';
    o += this.address;

    return o;
  };
}



class Connection {

  constructor(con) {
    if (con) {
      // Parse the provided connection line
      if (!this.parse(con)) {
        return null;
      }
    } else {
      // Set some sensible defaults
      this.reset();
    }
  }

  reset = function() {
    this.netType = 'IN';
    this.addrType = 'IP4';
    this.address = 'address.invalid';
  };

  parse = function(con) {
    var split;

    split = con.split(' ');
    if (split.length !== 3) {
      console.warn('Unexpected connection line: ' + con);
      return false;
    }

    this.netType = split[0];
    this.addrType = split[1];
    this.address = split[2];

    return true;
  };

  toString = function() {
    var c = '';

    c += this.netType + ' ';
    c += this.addrType + ' ';
    c += this.address;

    return c;
  };
};

      

class Timing {

  constructor(timing) {
    this.util = Util();
    if (timing) {
      // Parse the provided timing line
      if (!this.parse(timing)) {
        return null;
      }
    } else {
      // Set some sensible defaults
      this.reset();
    }
  };

  reset = function() {
    this.start = null;
    this.stop = null;
    this.repeat = [];
  };

  // Parse expects to be passed the full t-line, plus any following r-lines
  parse = function(timing) {
    const util = this.util;
    var lines, tLine, tokens;

    lines = timing.split(lineEnd);
    tLine = lines.shift();

    tokens = tLine.split(' ');
    if (tokens.length !== 2) {
      console.warn('Unexpected timing line: ' + tLine);
      return false;
    }

    if (tokens[0] === '0') {
      this.start = null;
    } else {
      this.start = util.ntpTimeToDate(tokens[0]);
    }

    if (tokens[1] === '0') {
      this.stop = null;
    } else {
      this.stop = util.ntpTimeToDate(tokens[1]);
    }

    // Don't care about repeat lines at the moment
    this.repeat = lines;

    return true;
  };

  toString = function() {
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
  };
};



class Media {

  constructor(media) {
    if (media) {
      // Parse the provided connection line
      if (!this.parse(media)) {
        return null;
      }
    } else {
      // Set some sensible defaults
      this.reset();
    }
  };

  reset = function() {
    this.media = 'message';
    this.port = 2855;
    this.proto = 'TCP/MSRP';
    this.format = '*';
    this.title = null;
    this.connection = null;
    this.bandwidth = [];
    this.key = null;
    this.resetAttributes();
  };

  addAttribute = function(name, value) {
    if (!this.attributes[name]) {
      this.attributes[name] = [];
      this.attributeNameOrder.push(name);
    }
    if (value && typeof value === 'string') {
      this.attributes[name] = this.attributes[name].concat(value.split(' '));
    }
  };

  removeAttribute = function(name) {
    if (this.attributes[name]) {
      delete this.attributes[name];
      this.attributeNameOrder.splice(
        this.attributeNameOrder.indexOf(name), 1);
    }
  };

  resetAttributes = function() {
    this.attributeNameOrder = [];
    this.attributes = {};
  };

  replaceAttribute = function(oldName, newName, newValue) {
    if (this.attributes[oldName]) {
      delete this.attributes[oldName];
      this.addAttribute(newName, newValue);
      this.attributeNameOrder.splice(this.attributeNameOrder.lastIndexOf(newName), 1);
      this.attributeNameOrder.splice(
        this.attributeNameOrder.indexOf(oldName), 1, newName);
    }
  };

  parse = function(media) {
    var lines, mLine, tokens, index, aName;

    this.reset();

    lines = media.split(lineEnd);
    mLine = lines.shift();

    tokens = mLine.split(' ');
    if (tokens.length < 4) {
      console.warn('Unexpected media line: ' + mLine);
      return false;
    }

    this.media = tokens.shift();
    this.port = parseInt(tokens.shift(), 10);
    this.proto = tokens.shift();
    this.format = tokens.join(' ');

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
            value = null;
          } else {
            aName = value.substr(0, colonIndex);
            value = value.substr(colonIndex + 1);
          }
          this.addAttribute(aName, value);
          break;
        default:
          console.warn('Unexpected type (within media): ' + lines[index]);
          return false;
      }
    }
    return true;
  };

  toString = function() {
    var m = '',
      index, aName, aValues;

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
  };
};


class parseFileAttributes {

  constructor({msrp, media}) {
    const util = this.util;
    var fileParams = {},
      position = 0,
      selector = {},
      colonIndex, name, value, endIndex,
      fileSelectorString = media.attributes['file-selector'][0];

    // Separate the file-selector components
    while (position < fileSelectorString.length) {
      if (fileSelectorString.charAt(position) === ' ') {
        position++;
        continue;
      }

      colonIndex = fileSelectorString.indexOf(':', position);
      if (colonIndex === -1) {
        break;
      }

      name = fileSelectorString.slice(position, colonIndex);
      position = colonIndex + 1;

      if (fileSelectorString.charAt(position) === '"') {
        // Grab everything within the quotes (possibly including spaces)
        position++;
        endIndex = fileSelectorString.indexOf('"', position);
        if (endIndex === -1) {
          break;
        }
        value = fileSelectorString.slice(position, endIndex);
        position = endIndex + 1;
      } else if (name === 'type') {
        var quoted = false;
        // Further parsing needed; find the next unquoted space
        endIndex = position;
        while (endIndex < fileSelectorString.length &&
          (quoted || fileSelectorString.charAt(endIndex) !== ' ')) {
          if (fileSelectorString.charAt(endIndex) === '"') {
            quoted = !quoted;
          }
          endIndex++;
        }
        value = new msrp.ContentType();
        value.parseSdpTypeSelector(fileSelectorString.slice(position, endIndex));
        position = endIndex + 1;
      } else {
        // Grab everything until the next space
        endIndex = fileSelectorString.indexOf(' ', position);
        if (endIndex === -1) {
          endIndex = fileSelectorString.length;
        }
        value = fileSelectorString.slice(position, endIndex);
        position = endIndex + 1;
      }

      switch (name) {
        case 'name':
          selector.name = util.decodeSdpFileName(value);
          break;
        case 'size':
          selector.size = parseInt(value, 10);
          break;
        case 'type':
          selector.type = value;
          break;
        case 'hash':
          if (!selector.hash) {
            selector.hash = {};
          }
          colonIndex = value.indexOf(':');
          selector.hash[value.substring(0, colonIndex)] =
            value.substring(colonIndex + 1);
          break;
        default:
          continue;
      }
    }

    fileParams.selector = selector;

    fileParams.id = media.attributes['file-transfer-id'][0];
    fileParams.disposition = media.attributes['file-disposition'][0] || 'render';
    if (media.title) {
      fileParams.description = media.title;
    }
    if (media.attributes['file-icon']) {
      fileParams.icon = media.attributes['file-icon'][0];
    }

    return fileParams;
  };
};
