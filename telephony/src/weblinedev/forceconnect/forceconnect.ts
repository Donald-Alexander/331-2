import WebLineDev from '../weblinedev';
import WebCall from '../../webcall/webcall';
import CallOp from '../../webcall/callop';

export class ForceConnectSync {
  _callOpName?: CallOp;
  goAhead: boolean;
  lineDev: WebLineDev;
  call: WebCall | null;
  forceConnectCall: WebCall | null = null;
  constructor(call: WebCall | null, lineDev: WebLineDev, callOpName: CallOp) {
    this.call = null;
    this.lineDev = lineDev;
    this.forceConnectCall = this.lineDev.forceConnectInProgress;

    this.goAhead = !this.forceConnectCall;
    if (!this.goAhead) {
      if (call) {
        // We might be doing a connect on the call we are currently "force connecting".
        this.goAhead = this.forceConnectCall === call;
      }
    }

    if (this.goAhead) {
      this._callOpName = callOpName;
      if (call) {
        this.call = call;
      }
      this.lineDev.currentForceConnectSync.push(this);
    }
  }

  static erase(fcs: ForceConnectSync): boolean {
    fcs.forceConnectCall = null;
    fcs.call = null;
    fcs.goAhead = false;
    let n = fcs.lineDev.currentForceConnectSync.findIndex((f) => f.callOpName === fcs.callOpName);
    if (n !== -1) {
      fcs.lineDev.currentForceConnectSync.splice(n, 1);
      return true;
    } else {
      return false;
    }
  }

  get callOpName(): string {
    return this._callOpName ? this._callOpName : '';
  }
  getCall() {
    return this.call;
  }
  getForceConnectCall() {
    return this.forceConnectCall;
  }
  getGoAhead() {
    return this.goAhead;
  }
}
