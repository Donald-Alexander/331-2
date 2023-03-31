import { LongDistance } from 'client-web-api/src/config/model/LongDistance';
import { webCfg } from './webcfg';
import { Diag } from '../common/diagClient';
const diag = new Diag('Config');

class LocalNpaNxxEntry {
  private srcNpa: number;
  private srcNxx: number;
  private destNpa: number;
  private destNxxStart: number;
  private destNxxEnd: number;

  constructor(srcNpa: string, srcNxx: string, destNpa: string, destNxxStart: string, destNxxEnd: string) {
    this.srcNpa = parseInt(srcNpa);
    this.srcNxx = parseInt(srcNxx);
    this.destNpa = parseInt(destNpa);
    this.destNxxStart = parseInt(destNxxStart);
    this.destNxxEnd = parseInt(destNxxEnd);
  }

  matchEntry(entryToTest: LocalNpaNxxEntry, wildcard: boolean = false): boolean {
    if (wildcard) {
      if (
        this.srcNpa === entryToTest.srcNpa &&
        this.srcNxx === entryToTest.srcNxx &&
        this.destNpa === entryToTest.destNpa &&
        this.destNxxStart <= entryToTest.destNxxStart &&
        this.destNxxEnd >= entryToTest.destNxxEnd
      ) {
        return true;
      }
    } else {
      if (
        this.srcNpa === entryToTest.srcNpa &&
        this.srcNxx === entryToTest.srcNxx &&
        this.destNpa === entryToTest.destNpa &&
        this.destNxxStart === entryToTest.destNxxStart &&
        this.destNxxEnd === entryToTest.destNxxEnd
      ) {
        return true;
      }
    }
    return false;
  }

  toString(): string {
    return (
      'srcNpa: ' +
      this.srcNpa.toString().padStart(3, '0') +
      ' srcNxx: ' +
      this.srcNxx.toString().padStart(3, '0') +
      ' destNpa: ' +
      this.destNpa.toString().padStart(3, '0') +
      ' destNxxStart: ' +
      this.destNxxStart.toString().padStart(3, '0') +
      ' destNxxEnd: ' +
      this.destNxxEnd.toString().padStart(3, '0')
    );
  }
}

export class LongDistanceConfig {
  private localNpaNxxs: Array<LocalNpaNxxEntry> = [];

  constructor() {
    webCfg.configHandler.collectionLongDistance.getAll().forEach((entry: LongDistance) => {
      let jsonObj = entry.json;
      this.addLocalAddress(
        jsonObj.SourceNPA || 0,
        jsonObj.SourceNXX || 0,
        jsonObj.DestinationNPA || 0,
        jsonObj.DestinationNXXLow || 0,
        jsonObj.DestinationNXXHigh || 0
      );
    });
  }

  private addLocalAddress(
    srcNpa: string,
    srcNxx: string,
    destNpa: string,
    destNxxStart: string,
    destNxxEnd: string
  ): boolean {
    if (srcNpa.length === 0 || srcNxx.length === 0) {
      return false;
    }

    if (destNxxStart > destNxxEnd) {
      diag.warn(
        'LongDistanceConfig.addLocalAddress',
        `destNxxStart ${destNxxStart} is higher that destNxxEnd ${destNxxEnd}`
      );
      return false;
    }

    let newNpaNxxEntry = new LocalNpaNxxEntry(srcNpa, srcNxx, destNpa, destNxxStart, destNxxEnd);
    diag.out('LongDistanceConfig.addLocalAddress', `Adding localNpaNxx: ${newNpaNxxEntry.toString()}`);
    this.localNpaNxxs.push(newNpaNxxEntry);

    return true;
  }

  public findLocalAddress(
    srcNpa: string,
    srcNxx: string,
    destNpa: string,
    destNxxStart: string,
    destNxxEnd: string
  ): boolean {
    if (this.localNpaNxxs.length === 0) return true;
    let localNpaNxx: LocalNpaNxxEntry = new LocalNpaNxxEntry(srcNpa, srcNxx, destNpa, destNxxStart, destNxxEnd);
    if (this.localNpaNxxs.find((entry: LocalNpaNxxEntry) => entry.matchEntry(localNpaNxx, true))) {
      diag.trace?.('LongDistanceConfig.findLocalAddress', `Found match in local addresses for: ${localNpaNxx.toString()}`);
      return true;
    } else {
      diag.trace?.(
        'LongDistanceConfig.findLocalAddress',
        `Did not found match in local addresses for: ${localNpaNxx.toString()}`
      );
      return false;
    }
  }
}
