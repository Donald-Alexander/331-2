import * as ExtInterface from '../telephonyexternalinterfacedef';
import { Diag } from '../common/diagClient';
const diag = new Diag('outboundDialPlan');

export class DialPlanEntry {
  private rangeLow: string;
  private rangeHigh: string;
  private preferredPrefix: ExtInterface.DialingPrefix;
  private alternatePrefix: ExtInterface.DialingPrefix;

  constructor(
    rangeLow: string,
    rangeHigh: string,
    preferredLocalPrefix: string,
    preferredLongDPrefix: string,
    preferredNpa: string,
    preferredNxx: string,
    preferredForceNpaOnLocalCalls: ExtInterface.ForceNpaOnLocalCalls,
    alternateLocalPrefix: string,
    alternateLongDPrefix: string,
    alternateNpa: string,
    alternateNxx: string,
    alternateForceNpaOnLocalCalls: ExtInterface.ForceNpaOnLocalCalls
  ) {
    this.rangeLow = rangeLow;
    this.rangeHigh = rangeHigh;
    this.preferredPrefix = new ExtInterface.DialingPrefix(
      preferredLocalPrefix,
      preferredLongDPrefix,
      preferredNpa,
      preferredNxx,
      preferredForceNpaOnLocalCalls
    );
    this.alternatePrefix = new ExtInterface.DialingPrefix(
      alternateLocalPrefix,
      alternateLongDPrefix,
      alternateNpa,
      alternateNxx,
      alternateForceNpaOnLocalCalls
    );
  }
  public matchEntry(entryToTest: DialPlanEntry): boolean {
    if (this.rangeLow === entryToTest.rangeLow && this.rangeHigh === entryToTest.rangeHigh) {
      return true;
    }
    return false;
  }
  public matchAddress(address: string): boolean {
    if (
      this.rangeLow <= address &&
      address <= this.rangeHigh &&
      address.length === this.rangeLow.length &&
      address.length === this.rangeHigh.length
    ) {
      return true;
    }
    return false;
  }

  public getPreferredPrefix(): ExtInterface.DialingPrefix {
    return this.preferredPrefix;
  }
  public getAlternatePrefix(): ExtInterface.DialingPrefix {
    return this.alternatePrefix;
  }

  public getRangeLow(): string {
    return this.rangeLow;
  }

  public getRangeHigh(): string {
    return this.rangeHigh;
  }
}

export interface IDialingPrefixFound {
  prefix: ExtInterface.DialingPrefix;
  isNextAlternateAvailableLocal: boolean;
  isNextAlternateAvailableLongD: boolean;
}

export class OutboundDialPlanManager {
  private static instance: OutboundDialPlanManager;
  private outboundDialPlan: Array<DialPlanEntry>;

  constructor() {
    this.outboundDialPlan = [];
  }

  public addOutboundDialPlan(dialPlanEntry: DialPlanEntry): boolean {
    if (dialPlanEntry.getRangeLow() > dialPlanEntry.getRangeHigh()) {
      diag.warn(
        'addOutboundDialPlan',
        `Max number must be equal or higher: min= ${dialPlanEntry.getRangeLow()}, max= ${dialPlanEntry.getRangeHigh()}`
      );
      return false;
    }

    if (dialPlanEntry.getRangeLow().length !== dialPlanEntry.getRangeHigh().length) {
      diag.warn(
        'addOutboundDialPlan',
        `Range value must have the same length: min= ${dialPlanEntry.getRangeLow()}, max= ${dialPlanEntry.getRangeHigh()}`
      );
      return false;
    }

    let index: number = this.outboundDialPlan.findIndex((entry: DialPlanEntry) => entry.matchEntry(dialPlanEntry));

    if (index === -1) {
      this.outboundDialPlan.push(dialPlanEntry);
      diag.out(
        'addOutboundDialPlan',
        `New dialplan has been added for: min= ${dialPlanEntry.getRangeLow()}, max= ${dialPlanEntry.getRangeHigh()}`
      );
    } else {
      // Already an entry for this range replace it
      this.outboundDialPlan.splice(index, 1, dialPlanEntry);
      diag.out(
        'addOutboundDialPlan',
        `Existing dialplan has been changed for: min= ${dialPlanEntry.getRangeLow()}, max= ${dialPlanEntry.getRangeHigh()}`
      );
    }

    return true;
  }

  public removeAllOutboundDialPlan() {
    while (this.outboundDialPlan.length > 0) {
      this.outboundDialPlan.pop();
    }
    diag.trace?.('removeAllOutboundDialPlan', `Removing all outbound dial plans`);
  }

  public getDialingPrefix(address: string, alternate: boolean): IDialingPrefixFound | null {
    let dialPlanEntry: DialPlanEntry | undefined = this.outboundDialPlan.find((entry: DialPlanEntry) =>
      entry.matchAddress(address)
    );

    if (dialPlanEntry) {
      if (alternate) {
        diag.trace?.(
          'getDialingPrefix',
          `Alternate prefix found for ${address} : ${JSON.stringify(dialPlanEntry.getAlternatePrefix())}`
        );
        let prefixFound: IDialingPrefixFound = {
          prefix: dialPlanEntry.getAlternatePrefix(),
          isNextAlternateAvailableLocal: false,
          isNextAlternateAvailableLongD: false,
        };
        return prefixFound;
      } else {
        diag.trace?.(
          'getDialingPrefix',
          `Preferred prefix found for ${address} : ${JSON.stringify(dialPlanEntry.getPreferredPrefix())}`
        );
        let prefixFound: IDialingPrefixFound = {
          prefix: dialPlanEntry.getPreferredPrefix(),
          isNextAlternateAvailableLocal: dialPlanEntry.getAlternatePrefix().localPrefix !== '',
          isNextAlternateAvailableLongD: dialPlanEntry.getAlternatePrefix().longDPrefix !== '',
        };
        return prefixFound;
      }
    } else {
      return null;
    }
  }

  public static getInstance(): OutboundDialPlanManager {
    return this.instance || (this.instance = new this());
  }
}

// export singleton object
export const outboundDialPlanManager = OutboundDialPlanManager.getInstance();
