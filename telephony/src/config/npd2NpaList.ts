import { webCfg } from './webcfg';
import { NpdToNpa } from 'client-web-api/src/config/model/NpdToNpa';
import { Diag } from '../common/diagClient';
const diag = new Diag('Config');

class NpdToNpaEntry {
  npd: number;
  npa: string;
  trunk: string;
  default: boolean;

  constructor(npd: number, npa: string, trunk: string, isDefault: boolean) {
    this.npd = npd;
    this.npa = npa;
    this.trunk = trunk;
    this.default = isDefault;
  }

  public isDefault(): boolean {
    return this.default;
  }

  public match(npd: number, trunk: string) {
    return npd === this.npd && trunk === this.trunk;
  }
}

export class NpdToNpaList {
  private npaToNpds: Array<NpdToNpaEntry> = [];

  constructor() {
    webCfg.configHandler.collectionNpdToNpa.getAll().forEach((npd2npa: NpdToNpa) => {
      this.add(npd2npa.json.Npd, npd2npa.json.Npa, npd2npa.json.TrunkNumber, false);
    });
  }

  public add(npd: number, npa: string, trunk: string = '', isDefault: boolean = false) {
    if (npd >= 0 && 9 >= npd) {
      if (npa.length === 3 && npa.match(/^[0-9]+$/) !== null) {
        let npdNpaEntry: NpdToNpaEntry = new NpdToNpaEntry(npd, npa, trunk, isDefault);
        diag.out('NpdToNpaList.add', `Adding NpdToNpa  ${JSON.stringify(npdNpaEntry)}`);
        this.npaToNpds.push(npdNpaEntry);
      } else {
        diag.warn('NpdToNpaList.add', `Invalid NPA ${npa}, cannot add`);
      }
    } else {
      diag.warn('NpdToNpaList.add', `Invalid NPD ${npd}, cannot add`);
    }

    return true;
  }

  public removeAll() {
    while (this.npaToNpds.length > 0) {
      this.npaToNpds.pop();
    }
    diag.trace?.('NpdToNpaList.removeAll', `Removing all NpaToNpd`);
  }

  public getNpaByNpd(npd: number, trunk: string = ''): string {
    let npdToNpa: NpdToNpaEntry | undefined = this.npaToNpds.find((entry: NpdToNpaEntry) => entry.match(npd, trunk));

    if (npdToNpa === undefined) {
      diag.trace?.('NpdToNpaList.getNpaByNpd', `No match found try use default`);
      npdToNpa = this.npaToNpds.find((entry: NpdToNpaEntry) => entry.isDefault());
    }

    if (npdToNpa === undefined) {
      diag.trace?.('NpdToNpaList.getNpaByNpd', `NPD ${npd} not found and no default set`);
      return '';
    } else {
      diag.trace?.('NpdToNpaList.getNpaByNpd', `Found NPA: ${npdToNpa.npa}`);
      return npdToNpa.npa;
    }
  }
}
