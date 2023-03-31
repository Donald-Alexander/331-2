export class URI {
  secure: boolean;
  user?: string;
  authority: string;
  port?: string;
  sessionId: string;
  transport: string;
  uri?: string | String;

  constructor(uri?: string) {
    this.secure = false;
    this.user = undefined;
    this.authority = '';
    this.port = undefined;
    this.sessionId = '';
    this.transport = 'tcp';
    if (uri) {
      this.uri = uri;
      this.parse(uri);
    }
  };

  parse(uri: string) {
    var colonIndex = uri.indexOf('://'),
      scheme, atIndex, portSepIndex, pathIndex, semicolonIndex;
    if (colonIndex === -1) {
      throw new TypeError('Invalid RTT URI: ' + uri);
    }
    // Extract the scheme first
    scheme = uri.substring(0, colonIndex);
    switch (scheme.toLowerCase()) {
      case 'rtt':
        this.secure = false;
        break;
      case 'rtts':
        this.secure = true;
        break;
      default:
        throw new TypeError('Invalid RTT URI (unknown scheme): ' + uri);
    }
    // Start by assuming that the authority is everything between "://" and "/"
    pathIndex = uri.indexOf('/', colonIndex + 3);
    if (pathIndex === -1) {
      throw new TypeError('Invalid RTT URI (no session ID): ' + uri);
    }
    this.authority = uri.substring(colonIndex + 3, pathIndex);
    // If there's an "@" symbol in the authority, extract the user
    atIndex = this.authority.indexOf('@');
    if (atIndex !== -1) {
      this.user = this.authority.substr(0, atIndex);
      this.authority = this.authority.substr(atIndex + 1);
    }
    // If there's an ":" symbol in the authority, extract the port
    portSepIndex = this.authority.indexOf(':');
    if (portSepIndex !== -1) {
      this.port = this.authority.substr(portSepIndex + 1);
      this.authority = this.authority.substr(0, portSepIndex);
    }
    // Finally, separate the session ID from the transport
    semicolonIndex = uri.indexOf(';', colonIndex + 3);
    if (semicolonIndex === -1) {
      throw new TypeError('Invalid RTT URI (no transport): ' + uri);
    }
    this.sessionId = uri.substring(pathIndex + 1, semicolonIndex);
    this.transport = uri.substring(semicolonIndex + 1);
    return true;
  };
  toString() {
    var uri = 'rtt';
    if (this.uri) {
      // Return the cached URI
      return this.uri;
    }
    if (this.secure) {
      uri += 's';
    }
    uri += '://';
    if (this.user) {
      uri += this.user + '@';
    }
    uri += this.authority;
    if (this.port) {
      uri += ':' + this.port;
    }
    uri += '/' + this.sessionId + ';' + this.transport;
    this.uri = uri;
    return uri;
  };
};
