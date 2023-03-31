/*  eslint-disable class-methods-use-this */
import { WebCall, DialError } from '../webcall/webcall';
import * as ExtInterface from '../telephonyexternalinterfacedef';
import * as IntInterface from '../telephonyinternalinterfacedef';
import { LineConfig } from '../config/lineConfig';
import { WebLineDev } from '../weblinedev/weblinedev';
import WebNode from '../weblinedev/webnode';
import { CallHeader } from '../telephonyutil';
import ActiveCalls from '../webcall/activecalls';
import { IDialingPrefixFound } from '../outboundDialPlan/outboundDialPlan';
import { ForceConnectSync } from '../weblinedev/forceconnect/forceconnect';
import CallOp from '../webcall/callop';
import { webCfg } from '../config/webcfg';
import { outboundDialPlanManager } from '../outboundDialPlan/outboundDialPlan';
import { Line } from 'client-web-api/src/config/model/Line';
import { Diag } from '../common/diagClient';

const diag = new Diag('webline');

const MaxAddressLenght: number = 128;

interface SortingNode {
  node: WebNode;
  isPreferred: boolean;
  isLocal?: boolean;
  isLastWorking?: boolean;
}

export class WebLine extends EventTarget {
  lineDev: WebLineDev;
  self: this;
  lineCfgEx: LineConfig;
  webNodes: Array<WebNode>;
  preferedNode: WebNode | undefined;
  addressv: string;
  status: ExtInterface.Status;
  lastWorkingNode: WebNode | null;
  cancelOutgoing: boolean = false;
  private aimTacPrefix: string = '*01';
  private admTacPrefix: string = '*00';
  private sipTacPrefix: string = '*08';
  private TAC: string = '';
  private _config: Line;
  constructor(webLineDev: WebLineDev, lineCfgEx: LineConfig) {
    super();
    this.self = this;
    //this.lineType = lineType; //  LTIntercom, LTADM, LT911, LTACD, LTSIP, LTUnknown
    this.lineDev = webLineDev;
    this.lineCfgEx = lineCfgEx;
    this.addressv = this.lineCfgEx.address;
    this.status = ExtInterface.Status.Idle;
    this.lastWorkingNode = null;
    this._config = lineCfgEx.extra;

    // Extract WebNode(s) from configuration
    this.webNodes = [];
    this.preferedNode = undefined;

    if (
      this.lineCfgEx.lineType === ExtInterface.LineType.LTIntercom ||
      this.lineCfgEx.lineType === ExtInterface.LineType.LTACD
    ) {
      for (let node of this.lineDev.webNodes) {
        // Intercom and ACD line have a knowledge of all configured nodes
        this.webNodes.push(node);

        // TODO Implement a mecanism to select the prefered node for the Intercom or ACD
      }
    } else {
      this.preferedNode = this.lineDev.webNodes.find(
        (node) => node.nodeCfgEx.proxyName === this.lineCfgEx.preferredNode
      );
      if (this.preferedNode) {
        this.webNodes.push(this.preferedNode);
      }
      for (let nodeAlt of this.lineCfgEx.alternateNodes) {
        let alternateNode = this.lineDev.webNodes.find((node) => node.nodeCfgEx.proxyName === nodeAlt);
        if (alternateNode) {
          this.webNodes.push(alternateNode);
        }
      }

      if (this.lineCfgEx.lineType === ExtInterface.LineType.LTSIP) {
        this.TAC = this.sipTacPrefix + this.addressv.substring(this.addressv.length - 3);
      } else if (this.lineCfgEx.lineType === ExtInterface.LineType.LTADM) {
        this.TAC = this.admTacPrefix + this.addressv.substring(this.addressv.length - 3);
        if (this.addressv.includes('AIM'))
          this.TAC = this.aimTacPrefix + this.addressv.substring(this.addressv.length - 3);
      }
    }
  }

  get config(): Line {
    return this._config;
  }

  // TODO: remove the setter in future build. No longer needed as we now call configHandler.collectionLine.cloneFromLine()
  set config(lineObj: Line) {
    this._config = lineObj;
  }

  get lineType(): ExtInterface.LineType {
    return this.lineCfgEx.lineType;
  }

  get lineSharedType(): ExtInterface.LineSharedType {
    return this.lineCfgEx.shareType;
  }

  addCall(webCall: WebCall) {
    ActiveCalls.add(webCall);
    this.setStatus(ExtInterface.Status.Busy);
  }

  /* Advised to always use webLine.removeCall to remove a webCall from activeCalls list
   * because removeCall will update webLine status if necessary.
   * @param webCall
   */
  removeCall(webCall: WebCall) {
    ActiveCalls.remove(webCall);
    let calls = ActiveCalls.activeCallsOnWebLine(this);
    if (calls.length === 0) {
      //Free webLine
      this.setStatus(ExtInterface.Status.Idle);
    }
  }

  setStatus(status: ExtInterface.Status) {
    diag.trace?.('setStatus', `Set line status to: --> <${status}>`);
    let oldStatus = this.status;
    this.status = status;
    const lineStateUpdate = new ExtInterface.LineStateUpdate('LineStateUpdate', this.self, status);
    this.lineDev.report(lineStateUpdate);
  }

  async makeCall(
    dialAddr: string,
    prefix: ExtInterface.DialingPrefix | null,
    subject: string,
    rttMediaEnable: boolean
  ): Promise<WebCall> {
    diag.trace?.(
      'makeCall',
      `Line ${this.addressv}: Dialing <${dialAddr}> ${prefix ? `with prefix: ${JSON.stringify(prefix)}` : ''}`
    );

    if (dialAddr.includes('sip:') || dialAddr.includes('sips:') || dialAddr.includes('tel:')) {
      diag.trace?.('makeCall', `Dialing SIP URI`);
    } else if (dialAddr.indexOf('H') !== -1 || dialAddr.indexOf('h') !== -1) {
      diag.trace?.('makeCall', `Line ${this.addressv}: Hookflash is not allowed; abort`);
      throw new Error('Hookflash is not allowed; abort');
    }

    // Make call with prefered prefix
    await ActiveCalls.holdCurrentConnected();

    try {
      return await this.makeCallByNodes(dialAddr, prefix, false, subject, rttMediaEnable);
    } catch (e) {
      if (e instanceof DialError && e.hasAlternatePrefix) {
        // Make call with alternate prefix
        return await this.makeCallByNodes(dialAddr, prefix, true, subject, rttMediaEnable);
      }
      throw e;
    }
  }

  private sortForIntercom(a: SortingNode, b: SortingNode): number {
    // Priority is Local Address for Node + Prefered Node > Local Address for Node > Preferred Node > others node
    if (a.isPreferred && a.isLocal) {
      return -1; // a is sorted before b
    } else if (b.isPreferred && b.isLocal) {
      return 1; // b is sorted before a
    } else if (a.isLocal) {
      return -1; // a is sorted before b
    } else if (b.isLocal) {
      return 1; // b is sorted before a
    } else if (a.isPreferred) {
      return -1; // a is sorted before b
    } else if (b.isPreferred) {
      return 1; // b is sorted before a
    } else {
      return 0; // No changes are done with the sort order of the two values.
    }
  }

  private sortForLine(a: SortingNode, b: SortingNode): number {
    // Priority is Last working Node > Preferred Node > others node
    if (a.isLastWorking) {
      return -1; // a is sorted before b
    } else if (b.isLastWorking) {
      return 1; // b is sorted before a
    } else if (a.isPreferred) {
      return -1; // a is sorted before b
    } else if (b.isPreferred) {
      return 1; // b is sorted before a
    } else {
      return 0; // No changes are done with the sort order of the two values.
    }
  }

  private async makeCallByNodes(
    dialAddr: string,
    prefix: ExtInterface.DialingPrefix | null,
    useAlternatePrefix: boolean,
    subject: string,
    rttMediaEnable: boolean
  ): Promise<WebCall> {
    return new Promise<WebCall>(async (resolve, reject) => {
      // Determine which node(s) to dial and the order to use
      let availableNodes: Array<SortingNode> = [];
      for (let webNode of this.webNodes) {
        if (webNode.isNodeUp()) {
          let sortingNode: SortingNode;
          let isPreferredNode: boolean = webNode === this.preferedNode;

          if (this.lineType === ExtInterface.LineType.LTIntercom) {
            let isLocalAddr: boolean =
              webNode.nodeCfgEx.nodePrefix !== null &&
              this.isLocalAddress(dialAddr, webNode.nodeCfgEx.nodePrefix.npa, webNode.nodeCfgEx.nodePrefix.nxx, true);
            sortingNode = { node: webNode, isPreferred: isPreferredNode, isLocal: isLocalAddr };
            availableNodes.push(sortingNode);
          } else {
            let isLastWorkingNode: boolean = webNode === this.lastWorkingNode;
            sortingNode = { node: webNode, isPreferred: isPreferredNode, isLastWorking: isLastWorkingNode };
            availableNodes.push(sortingNode);
          }
        }
      }

      // Sort node depending on type of line
      if (this.lineType === ExtInterface.LineType.LTIntercom) {
        availableNodes.sort(this.sortForIntercom);
      } else {
        availableNodes.sort(this.sortForLine);
      }

      // Try to dial on Nodes
      let anyNodeHasAlternate: boolean = false;

      this.cancelOutgoing = false;
      for await (let node of availableNodes) {
        if (this.cancelOutgoing) {
          diag.out('makeCallByNodes', `Got signal of cancelOutgoing call`);
          reject(new IntInterface.CancelOutgoing(''));
          return;
        }
        diag.trace?.(
          'makeCallByNodes',
          `Line ${this.addressv}: Attempting to make call on node:${node.node.nodeCfgEx.proxyName} using ${
            useAlternatePrefix ? 'alternate' : 'primary'
          } prefixes`
        );
        try {
          let call: WebCall = await this.makeCallOnNode(
            node.node,
            dialAddr,
            prefix,
            useAlternatePrefix,
            subject,
            rttMediaEnable
          );
          diag.trace?.(
            'makeCallByNodes',
            `Line ${this.addressv}: Successfully called make call on node:${node.node.nodeCfgEx.proxyName} using ${
              useAlternatePrefix ? 'alternate' : 'primary'
            } prefixes`
          );

          this.lastWorkingNode = node.node;
          call.enableBeepInjection(); // Check if Beep must be enabled
          resolve(call);
          return;
        } catch (e) {
          if (e instanceof DialError) {
            anyNodeHasAlternate = anyNodeHasAlternate || e.hasAlternatePrefix;
            diag.trace?.(
              'makeCallByNodes',
              `Line ${this.addressv}: Failed called make call on node:${node.node.nodeCfgEx.proxyName} using ${
                useAlternatePrefix ? 'alternate' : 'primary'
              } prefixes`
            );
          }
        }
      }

      this.lastWorkingNode = null;
      let failureText: string = 'Failed making call on all nodes of line: ' + this.lineCfgEx.address;
      diag.warn('makeCallByNodes', failureText);
      reject(new DialError(anyNodeHasAlternate, failureText));
    });
  }

  private async makeCallOnNode(
    node: WebNode,
    dialAddr: string,
    prefix: ExtInterface.DialingPrefix | null,
    useAlternatePrefix: boolean,
    subject: string,
    rttMediaEnable: boolean
  ): Promise<WebCall> {
    return new Promise<WebCall>(async (resolve, reject) => {
      let trace: string;
      const call = new WebCall(this, node, {
        cfg: new IntInterface.DirectionCfg(ExtInterface.Direction.Outgoing),
        initialState: ExtInterface.CallState.Idle,
      });

      call.callHeader.phoneNumber = dialAddr;

      // If MSRP, set call type to Text
      if (subject.length > 0) call.callType = ExtInterface.CallType.Text;

      this.addCall(call);

      let fcs = new ForceConnectSync(call, this.lineDev, CallOp.MakeCall);
      if (!fcs.getGoAhead()) {
        this.removeCall(call);
        trace = `A Force connect operation has been initiated on call <${fcs.getForceConnectCall()?.webCallId}>`;
        diag.trace?.('makeCallOnNode', trace);
        reject(new Error('A Force connect operation has been initiated on call'));
        return;
      }

      try {
        await call.internalDial(dialAddr, prefix, useAlternatePrefix, subject, rttMediaEnable);
        trace = `dialing <${dialAddr}> succeeded on node <${node.nodeCfgEx.proxyName}>`;
        diag.trace?.('makeCallOnNode', trace);
        resolve(call);
      } catch (e) {
        trace = `dialing <${dialAddr}> failed on node <${node.nodeCfgEx.proxyName}> message<${e}>`;
        diag.trace?.('makeCallOnNode', trace);
        this.removeCall(call);
        reject(e);
      } finally {
        ForceConnectSync.erase(fcs);
      }
    });
  }

  receiveCall(webNode: WebNode, callHeader: CallHeader): WebCall {
    const call = new WebCall(this, webNode, {
      callHeader,
      cfg: new IntInterface.DirectionCfg(ExtInterface.Direction.Incoming),
      initialState: ExtInterface.CallState.Offered,
      sipId: callHeader.id,
      uniqueCallId: callHeader.uCI,
    });
    this.addCall(call);
    call.setCallState(ExtInterface.CallState.Offered);

    return call;
  }

  isTAC(addr: string): boolean {
    const tACPrefixSize = 3; // It is assumed and required that all TAC prefixes have the same length.
    const prefix = addr.substring(0, tACPrefixSize);
    return prefix == this.admTacPrefix || prefix == this.aimTacPrefix;
  }

  isLocalAddress(address: string, srcNpa: string, srcNxx: string, onlyWellFormed: boolean = true): boolean {
    let islocal: boolean = false;
    let wellFormed: boolean = false;
    let npa: string;
    let nxx: string;

    if (srcNpa.length === 0 && srcNxx.length === 0) {
      srcNpa = this.lineCfgEx.npa;
      srcNxx = this.lineCfgEx.nxx;
    }

    if (address.length === 0) {
      diag.trace?.('isLocalAddress', `address parameter is empty`);
      islocal = true;
    } else {
      // Trim all special character from begining
      address = address.replace(/^[HhRr,]*/, '');

      let firstSeparator: number = address.indexOf('-');
      if (firstSeparator !== -1) {
        let secondSeparator: number = address.indexOf('-', firstSeparator + 1);

        if (secondSeparator !== -1) {
          npa = address.substr(0, firstSeparator);
          nxx = address.substr(firstSeparator + 1, secondSeparator - firstSeparator - 1);
          //  we have 2 separators or more - check table to distinguish local/ld calls
          //  obtain NPA/NXX values for searching the table

          if (npa.match(/^[0-9]+$/) === null || nxx.match(/^[0-9]+$/) === null) {
            // NPA or NXX does not contains only digit
            islocal = true;
            diag.trace?.('isLocalAddress', `NPA or NXX does not contains only digit: ${npa} ${nxx}`);
          } else {
            wellFormed = true;
            if (
              webCfg.longDistanceConfig &&
              webCfg.longDistanceConfig.findLocalAddress(srcNpa, srcNxx, npa, nxx, nxx)
            ) {
              islocal = true;
              diag.trace?.('isLocalAddress', `Found local address: ${npa} ${nxx}`);
            }
          }
        } else {
          //We have 1 separator - thus this is a local call */
          islocal = true;
        }
      } else {
        //No separator - thus this is a local call */
        islocal = true;
      }
    }

    if (onlyWellFormed) {
      islocal = wellFormed && islocal;
    }

    return islocal;
  }

  /*  Note: GetDialableAddr returns the full address, after searching the local
  calls list in order to determine if the call is a local or ld one.
  In order for this procedure to do something, the adr parameter must contain
  two predefined separators, isolating the NPA and NXX fields of the address.
  (i.e. XXX-XXX-XXXX)
  Otherwise, the address will remain unchanged.
  If only one separator is found, the call will be dialed as a local one. */

  getDialableAddress(
    address: string,
    prefix: ExtInterface.DialingPrefix | null,
    call: WebCall,
    alternate: boolean,
    forTandem: boolean
  ): {
    address: string;
    hasAlternate: boolean;
    isLongDistance: boolean;
    isHFTokenized: boolean;
    isFirstDial: boolean;
  } {
    let isHFTokenized: boolean = false;
    let isFirstDial: boolean = true;
    let useLocalPrefix: boolean = false;
    let useLongDistancePrefix: boolean = false;
    let localAlternate: boolean = false;
    let longDistanceAlternate: boolean = false;
    let prefixToUse: ExtInterface.DialingPrefix | null = prefix;
    let outboundPrefix: IDialingPrefixFound | null = null;

    if (address.length > 0) {
      if (call) {
        isFirstDial = call.firstDial;
        isHFTokenized = call.hookFlashJustTokenized;
        if (call.originalOutgoingNumber.length === 0) {
          call.setOriginalOutgoingNumber(address);
        }
      }

      if (forTandem) {
        isHFTokenized = true;
      }

      if (isHFTokenized) {
        diag.trace?.('getDialableAddress', `Formatting for hookflash / tandem`);
      } else {
        diag.trace?.('getDialableAddress', `Formatting for regular dialing`);
      }

      if (address.length > 0 && isFirstDial) {
        diag.trace?.('getDialableAddress', `Address is NOT Empty and (firstDial or H readed)`);

        // Determine which prefix to use based on following priority
        // 1- Prefix provided by application
        // 2- Outbound Dial Plan prefix (or Trunk Hookflash prefix if hookflash)
        // 3- Node prefix (or Node Hookflash prefix if hookflash)
        // 4- Line prefix (or Line Hookflash prefix if hookflash)
        if (prefixToUse === null || (!prefixToUse.localPrefix && !prefixToUse.longDPrefix)) {
          if (isHFTokenized) {
            prefixToUse = this.getHookflashPrefix(call);
          } else {
            outboundPrefix = outboundDialPlanManager.getDialingPrefix(address.replace(/-/g, ''), alternate);
            if (outboundPrefix) {
              diag.trace?.('getDialableAddress', `Using prefixes provided by outbound dial plan`);
              prefixToUse = outboundPrefix.prefix;
              localAlternate = outboundPrefix.isNextAlternateAvailableLocal;
              longDistanceAlternate = outboundPrefix.isNextAlternateAvailableLongD;
            } else {
              prefixToUse = this.getPrefix(call);
            }
          }
        } else {
          diag.trace?.(
            'getDialableAddress',
            `Using ${isHFTokenized ? 'hookflash ' : ''}prefix provided by application`
          );
        }

        // empty NPA and NXX, this will allow to default to node or line prefix NPA and NXX.{
        if (prefixToUse?.npa === '') {
          prefixToUse.npa = this.getNpa(call);
        }
        if (prefixToUse?.nxx === '') {
          prefixToUse.nxx = this.getNxx(call);
        }

        // Check format of address
        let firstSeparator: number = address.indexOf('-');
        if (firstSeparator !== -1) {
          let secondSeparator: number = address.indexOf('-', firstSeparator + 1);
          if (secondSeparator !== -1) {
            let npa: string = address.substr(0, firstSeparator);
            let nxx: string = address.substr(firstSeparator + 1, secondSeparator - firstSeparator - 1);
            if (npa.match(/^[0-9]+$/) === null || nxx.match(/^[0-9]+$/) === null) {
              // NPA or NXX does not contains only digit
              useLocalPrefix = true;
            } else {
              if (
                prefixToUse !== null &&
                webCfg.longDistanceConfig &&
                webCfg.longDistanceConfig.findLocalAddress(prefixToUse.npa, prefixToUse.nxx, npa, nxx, nxx)
              ) {
                useLocalPrefix = true;
                // Check if we need to trim NPA from Address
                if (npa === prefixToUse.npa) {
                  if (prefixToUse.forceNPAOnLocalCalls === ExtInterface.ForceNpaOnLocalCalls.False) {
                    address = address.substr(firstSeparator + 1);
                    diag.trace?.('getDialableAddress', `Removed NPA on local call: ${address}`);
                  }
                }
              } else {
                useLongDistancePrefix = true;
              }
            }
          } else {
            // Only one separator found (i.e. no NPA) consider has local
            useLocalPrefix = true;
          }
        } else {
          // Number not formatted
          if (address.length > this.lineDev.maxDNLenght && this.lineDev.addLocalPrefixOnUnformatted) {
            useLocalPrefix = true;
            diag.trace?.(
              'getDialableAddress',
              `Not formated, addLocalPrefixOnUnformatted is true and greater than maxDNLenght; use Local Prefix`
            );
          } else if (prefix !== null && (prefix.localPrefix || prefix.longDPrefix)) {
            // Prefix provided by application => Add local prefix
            useLocalPrefix = true;
            diag.trace?.('getDialableAddress', `Not formated, with prefixes provided by application; use Local Prefix`);
          } else if (!isHFTokenized && this.lineDev.addLocalPrefixOnUnformatted && outboundPrefix !== null) {
            // Apply outboundTable prefix even if not reach maxDNLength
            useLocalPrefix = true;
            diag.trace?.(
              'getDialableAddress',
              `Not formated, shorter than MaxDnLength and within dial plan; use Local Prefix`
            );
          } else {
            diag.trace?.(
              'getDialableAddress',
              `Not formated, shorter than MaxDnLength or addLocalPrefixOnUnformatted is false => Do not add ${
                isHFTokenized ? 'hookflash ' : ''
              }local prefix`
            );
          }
        }
      } else {
        diag.trace?.('getDialableAddress', `Address is empty or Not first dialing, do not add prefix`);
      }

      isHFTokenized = false;
      isFirstDial = false;
    } else {
      diag.trace?.('getDialableAddress', `Address parameter is empty`);
    }

    let isLongDistance: boolean = false;
    let hasAlternate: boolean = false;
    let adrPrefix: string = '';

    if (prefixToUse !== null) {
      if (useLongDistancePrefix) {
        adrPrefix = prefixToUse.longDPrefix;
        isLongDistance = true;
        hasAlternate = longDistanceAlternate;
      } else if (useLocalPrefix) {
        adrPrefix = prefixToUse.localPrefix;
        hasAlternate = localAlternate;
      }
    } else {
      diag.trace?.('getDialableAddress', `No ${isHFTokenized ? 'hookflash ' : ''}prefix found`);
    }

    let tmpAddr: string = adrPrefix + address;

    if (this.lineType === ExtInterface.LineType.LTADM) {
      //Dialing on Trunk line
      if (this.addressv.includes('AIM') && !tmpAddr.startsWith(',')) {
        // make it a two-step dialable address
        tmpAddr = this.TAC + ',' + tmpAddr;
      } else if (this.lineCfgEx.isOneStepDialing) {
        tmpAddr = this.TAC + tmpAddr;
      }
    }

    tmpAddr = tmpAddr.replace(/-/g, ''); // remove dash
    if (tmpAddr.length > MaxAddressLenght) {
      diag.trace?.('getDialableAddress', `Dialable address longer than ${MaxAddressLenght.toString()} : truncate it`);
      tmpAddr = tmpAddr.substr(0, MaxAddressLenght);
    }

    return {
      address: tmpAddr,
      hasAlternate: hasAlternate,
      isLongDistance: isLongDistance,
      isHFTokenized: isHFTokenized,
      isFirstDial: isFirstDial,
    };
  }

  getNpa(call: WebCall): string {
    if (call) {
      if (this.lineType === ExtInterface.LineType.LTIntercom && call.webNode.nodeCfgEx.npa !== '') {
        diag.trace?.('getNpa', `Using NPA from node ${call.webNode.nodeCfgEx.proxyName}`);
        return call.webNode.nodeCfgEx.npa;
      } else if (call.infoRec.trunkAddress !== '') {
        let trunkConfig = this.getTrunkConfig(call.infoRec.trunkAddress);
        if (trunkConfig && trunkConfig.npa) {
          diag.trace?.('getNpa', `Using NPA from trunk ${call.infoRec.trunkAddress}`);
          return trunkConfig.npa;
        } else {
          // default to line
          diag.trace?.('getNpa', `Using NPA from line ${this.addressv}`);
          return this.lineCfgEx.npa;
        }
      } else {
        // default to line
        diag.trace?.('getNpa', `Using NPA from line ${this.addressv}`);
        return this.lineCfgEx.npa;
      }
    }
    return '';
  }

  getNxx(call: WebCall): string {
    if (call) {
      if (this.lineType === ExtInterface.LineType.LTIntercom && call.webNode.nodeCfgEx.nxx !== '') {
        diag.trace?.('getNxx', `Using NXX from node ${call.webNode.nodeCfgEx.proxyName}`);
        return call.webNode.nodeCfgEx.nxx;
      } else if (call.infoRec.trunkAddress !== '') {
        let trunkConfig = this.getTrunkConfig(call.infoRec.trunkAddress);
        if (trunkConfig && trunkConfig.nxx) {
          diag.trace?.('getNxx', `Using NXX from trunk ${call.infoRec.trunkAddress}`);
          return trunkConfig.nxx;
        } else {
          // default to line
          diag.trace?.('getNxx', `Using NXX from line ${this.addressv}`);
          return this.lineCfgEx.nxx;
        }
      } else {
        // default to line
        diag.trace?.('getNxx', `Using NXX from line ${this.addressv}`);
        return this.lineCfgEx.nxx;
      }
    }
    return '';
  }

  getPrefix(call: WebCall): ExtInterface.DialingPrefix | null {
    if (call) {
      // Check for hookflash prefixes on node
      if (this.lineType === ExtInterface.LineType.LTIntercom && call.webNode.nodeCfgEx.nodePrefix) {
        diag.trace?.('getPrefix', `Using prefix from node ${call.webNode.nodeCfgEx.proxyName}`);
        return call.webNode.nodeCfgEx.nodePrefix;
      } else if (call.infoRec.trunkAddress !== '') {
        // Check for hookflash prefixes on trunk or line
        let trunkConfig = this.getTrunkConfig(call.infoRec.trunkAddress);
        if (trunkConfig && trunkConfig.linePrefix) {
          diag.trace?.('getPrefix', `Using prefix from trunk ${call.infoRec.trunkAddress}`);
          return trunkConfig.linePrefix;
        } else {
          // default to line
          diag.trace?.('getPrefix', `Using prefix from line ${this.addressv}`);
          return this.lineCfgEx.linePrefix;
        }
      } else if (this.lineCfgEx.linePrefix) {
        // default to line
        diag.trace?.('getPrefix', `Using prefix from line ${this.addressv}`);
        return this.lineCfgEx.linePrefix;
      }
    }
    return null;
  }

  getHookflashPrefix(call: WebCall): ExtInterface.DialingPrefix | null {
    if (call) {
      // Check for hookflash prefixes on trunk
      if (call.infoRec.trunkAddress !== '') {
        let trunkConfig = this.getTrunkConfig(call.infoRec.trunkAddress);
        if (trunkConfig && trunkConfig.lineHfPrefix && trunkConfig.lineType !== ExtInterface.LineType.LTIntercom) {
          diag.trace?.('getHookflashPrefix', `Using hookflash prefix from trunk ${call.infoRec.trunkAddress}`);
          return trunkConfig.lineHfPrefix;
        }
      }
      // Check for hookflash prefixes on node or line
      if (this.lineType === ExtInterface.LineType.LTIntercom && call.webNode.nodeCfgEx.nodeHfPrefix) {
        diag.trace?.('getHookflashPrefix', `Using hookflash prefix from node ${call.webNode.nodeCfgEx.proxyName}`);
        return call.webNode.nodeCfgEx.nodeHfPrefix;
      } else if (this.lineCfgEx.lineHfPrefix) {
        // default to line
        diag.trace?.('getHookflashPrefix', `Using hookflash prefix from line ${this.addressv}`);
        return this.lineCfgEx.lineHfPrefix;
      }
    }
    return null;
  }

  public getTrunkConfig(trunkAddress: string): LineConfig | undefined {
    if (trunkAddress.length === 0 || this.addressv === trunkAddress) {
      return this.lineCfgEx;
    } else {
      return this.lineDev.getTrunkConfig(trunkAddress);
    }
  }
}

export default WebLine;
