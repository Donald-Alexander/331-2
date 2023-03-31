import { URI } from './URI'


export async function User(msrp) {
  var User = function(uri, socket, sipSession, path) {
    this.uri = new URI(uri);
    this.fullPath = path;
    this.sipSession = sipSession;
    this.socket = socket;
  };

  User.prototype.getSocket = function() {
    return this.socket;
  };

  User.prototype.getUri = function() {
    return this.uri;
  };

  User.prototype.getFullPath = function() {
    return this.fullPath;
  };

  User.prototype.getSipSession = function() {
    return this.sipSession;
  };

  User.prototype.supportsMessageCPIM = function() {
    if (!this.sipSession) return false;
    return this.sipSession.hasMessageCpimAcceptType();
  };
};
