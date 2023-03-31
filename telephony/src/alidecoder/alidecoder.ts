import { Diag } from '../common/diagClient';
const diag = new Diag('alidecoder');

export enum AliDecoderSupport {
  NONE = 0,
  ANI = 1,
  PSEUDO_ANI = 2,
  CLASS_OF_SERVICE = 4,
  NPA_NXX = 8,
  PROVIDER = 16,
}

export enum AliDecoderType {
  NORMAL,
  WIRELESS,
  UNKNOWN,
}

export class AliDecoderFormat {
  type: AliDecoderType;
  aliSupport: AliDecoderSupport;
  aniOffset: number;
  aniLength: number;
  pseudoAniOffset: number;
  pseudoAniLength: number;
  cosTagOffset: number;
  cosTagLength: number;
  cosTag: string;
  rangeStart: string;
  rangeEnd: string;
  providerOffset: number;
  providerLength: number;
  providerTag: string;
  rtxDebounceDelay: number;
  wirelessPhase1: boolean;

  constructor() {
    this.type = AliDecoderType.UNKNOWN;
    this.aliSupport = AliDecoderSupport.NONE;
    this.aniOffset = 0;
    this.aniLength = 0;
    this.pseudoAniOffset = 0;
    this.pseudoAniLength = 0;
    this.cosTagOffset = 0;
    this.cosTagLength = 0;
    this.cosTag = '';
    this.rangeStart = '';
    this.rangeEnd = '';
    this.providerOffset = 0;
    this.providerLength = 0;
    this.providerTag = '';
    this.rtxDebounceDelay = 0;
    this.wirelessPhase1 = false;
  }

  public toString(): string {
    const header: string = 'Format(';
    let formatText: string = header;
    if (this.aliSupport & AliDecoderSupport.ANI) {
      formatText += 'ANI';
    }
    if (this.aliSupport & AliDecoderSupport.PSEUDO_ANI) {
      if (formatText.length > header.length) {
        formatText += '|';
      }
      formatText += 'P-ANI';
    }
    if (this.aliSupport & AliDecoderSupport.CLASS_OF_SERVICE) {
      if (formatText.length > header.length) {
        formatText += '|';
      }
      formatText += 'COS';
    }
    if (this.aliSupport & AliDecoderSupport.PROVIDER) {
      if (formatText.length > header.length) {
        formatText += '|';
      }
      formatText += 'PROVIDER';
    }
    if (this.aliSupport & AliDecoderSupport.NPA_NXX) {
      if (formatText.length > header.length) {
        formatText += '|';
      }
      formatText += 'NPANXX';
    }
    if (formatText === header) {
      formatText = 'None';
    }

    formatText += ') [';
    formatText +=
      this.cosTagLength > 0 ? ' COS: "' + this.cosTag + '" @ ' + offsetBase1(this.cosTagOffset).toString() : '';
    formatText +=
      this.providerLength > 0
        ? ' PROVIDER: "' + this.providerTag + '" @ ' + offsetBase1(this.providerOffset).toString()
        : '';
    formatText += this.rangeStart !== '' ? ' NPANXX: (' + this.rangeStart + '-' + this.rangeEnd + ')' : '';
    formatText +=
      this.aniOffset > 0
        ? ' ANI: @ ' + offsetBase1(this.aniOffset).toString() + ' for ' + this.aniLength.toString()
        : '';
    formatText +=
      this.pseudoAniOffset > 0
        ? ' P-ANI: @ ' + offsetBase1(this.pseudoAniOffset).toString() + ' for ' + this.pseudoAniLength.toString()
        : '';
    formatText += this.rtxDebounceDelay > 0 ? ' RTXDebounceDelay: ' + this.rtxDebounceDelay.toString() : '';
    formatText += this.wirelessPhase1 ? ' WirelessPhase1' : '';
    formatText += ']';
    return formatText;
  }

  public isWireless(ali: string): boolean {
    if (this.type !== AliDecoderType.WIRELESS) {
      return false;
    }

    let isWireless: boolean = true;

    if (this.aliSupport & AliDecoderSupport.CLASS_OF_SERVICE) {
      if (this.cosTag.length > 0) {
        if (this.cosTagOffset + this.cosTag.length > ali.length) {
          isWireless = false;
        } else {
          let cosTag: string = ali.substr(this.cosTagOffset, this.cosTag.length);
          if (cosTag !== this.cosTag) {
            diag.trace?.('isWireless', `Defined COS [${this.cosTag}] does not match [${cosTag}]`);
            isWireless = false;
          }
        }
      }
    }

    if (isWireless && this.aliSupport & AliDecoderSupport.PROVIDER) {
      if (this.providerTag.length > 0) {
        if (this.providerOffset + this.providerTag.length > ali.length) {
          isWireless = false;
        } else {
          let providerTag: string = ali.substr(this.providerOffset, this.providerTag.length);

          if (providerTag !== this.providerTag) {
            diag.trace?.(
              'isWireless',
              `Defined Provider [${this.providerTag}] does not match [${providerTag}]`
            );
            isWireless = false;
          }
        }
      }
    }

    if (isWireless && this.aliSupport & AliDecoderSupport.NPA_NXX) {
      if (!(this.aliSupport & AliDecoderSupport.PSEUDO_ANI)) {
        diag.trace?.('isWireless', `No ALI Decoder support for Pseudo-ANI`);
        isWireless = false;
      } else if (this.pseudoAniOffset + this.pseudoAniLength > ali.length) {
        diag.trace?.('isWireless', `ALI shorter that Pseudo-ANI definition`);
        isWireless = false;
      } else {
        let npaNxx: string = getNumber(ali, this.pseudoAniOffset, this.pseudoAniLength);

        if (npaNxx.length >= this.rangeStart.length) {
          npaNxx = npaNxx.substr(0, this.rangeStart.length);
          if (!(npaNxx >= this.rangeStart && npaNxx <= this.rangeEnd)) {
            diag.trace?.('isWireless', `Pseudo-ANI not within range`);
            isWireless = false;
          }
        } else {
          diag.trace?.('isWireless', `Pseudo-ANI not within range`);
          isWireless = false;
        }
      }
    }

    diag.out('isWireless', `ALI is ${isWireless ? '' : 'not '}wireless`);
    return isWireless;
  }
}

export class DecodedAli {
  ali: string;
  ani: string;
  pseudoAni: string;
  provider: string;
  classOfService: string;

  format: AliDecoderFormat;

  constructor() {
    this.ali = '';
    this.ani = '';
    this.pseudoAni = '';
    this.provider = '';
    this.classOfService = '';
    this.format = new AliDecoderFormat();
  }
}

export enum GoodAliTypes {
  NotUsed, // 0
  GoodAliWithoutXY, // 1
  NoAliFound, // 2
  ANIFailure, // 3
  Not911Call, // 4
  NoAliBadNXX, // 5
  GoodAliWithXYandESN, // 6
  ANI0009110000, // 7
  GoodAliPlusCarrierCompanyInfo, // 8
  GoodAliWithWireless, // 9
  GoodAliESCO, // A
  GoodAliWithWirelessPhase2, // B
  Reserved4, // C
  Reserved5, // D
  Reserved6, // E
  NoAliOtherReason, // F
}

export class AliDecoder {
  private static instance: AliDecoder;

  private aliFormats: Array<AliDecoderFormat> = [];
  private defaultFormatDefined: boolean;
  private formatSorted: boolean;
  private goodAliTypes: Set<GoodAliTypes> = new Set<GoodAliTypes>();
  private allowModifyAli: boolean;

  constructor(allowModifyAli: boolean = true) {
    this.defaultFormatDefined = false;
    this.formatSorted = false;
    this.goodAliTypes.add(GoodAliTypes.GoodAliWithoutXY);
    this.goodAliTypes.add(GoodAliTypes.GoodAliWithXYandESN);
    this.goodAliTypes.add(GoodAliTypes.GoodAliPlusCarrierCompanyInfo);
    this.goodAliTypes.add(GoodAliTypes.GoodAliWithWireless);
    this.goodAliTypes.add(GoodAliTypes.GoodAliESCO);
    this.goodAliTypes.add(GoodAliTypes.GoodAliWithWirelessPhase2);
    this.allowModifyAli = allowModifyAli;
  }

  public getGoodAliTypes(): Set<GoodAliTypes> {
    return this.goodAliTypes;
  }

  private setAt(str: string, index: number, strToSet: string): string {
    if (index > str.length - 1) {
      return str;
    }
    return str.substr(0, index) + strToSet + str.substr(index + strToSet.length);
  }

  public addFormat(format: AliDecoderFormat) {
    let newFormat: AliDecoderFormat = new AliDecoderFormat();
    let tag: string = 'Added';
    newFormat = format;

    newFormat.aniOffset = offsetBase0(format.aniOffset);
    newFormat.pseudoAniOffset = offsetBase0(format.pseudoAniOffset);
    newFormat.cosTagOffset = offsetBase0(format.cosTagOffset);
    newFormat.providerOffset = offsetBase0(format.providerOffset);

    if (format.type === AliDecoderType.NORMAL) {
      if (!this.defaultFormatDefined) {
        // Add NORMAL Decoder at the end
        this.aliFormats.push(newFormat);
        this.defaultFormatDefined = true;
        tag = 'Added (Default)';
      } else {
        // Support for only one NORMAL format discard this one
        tag = 'Rejected (Default)';
      }
    } else {
      this.aliFormats.unshift(newFormat);
    }

    diag.out('addFormat', `${tag} ${newFormat.toString()}`);
  }

  public removeFormats() {
    while (this.aliFormats.length > 0) {
      this.aliFormats.pop();
      this.formatSorted = false;
      this.defaultFormatDefined = false;
    }

    diag.trace?.('removeFormats', `remove all formats`);
  }

  public setNormalCallback(ali: string, callback: string): string {
    if (!this.allowModifyAli) {
      diag.trace?.('setNormalCallback', `ALI modification not permitted`);
      return ali;
    }

    if (this.aliFormats.length > 0) {
      // Normal format shall always be the last one
      let normalAliFormat: AliDecoderFormat = this.aliFormats[this.aliFormats.length - 1];
      if (normalAliFormat.type === AliDecoderType.NORMAL) {
        if (normalAliFormat.aliSupport & AliDecoderSupport.ANI) {
          let offsetDst: number = normalAliFormat.aniLength;
          let offsetOrig: number = callback.length - 1;

          if (ali.length >= normalAliFormat.aniOffset + normalAliFormat.aniLength) {
            let aniInAli: string = ali.substr(normalAliFormat.aniOffset, normalAliFormat.aniLength);

            diag.trace?.(
              'setNormalCallback',
              `Replacing (${offsetBase1(normalAliFormat.aniOffset)}), ${
                normalAliFormat.aniLength
              }, "${aniInAli}" with "${callback}"`
            );

            while (offsetOrig >= 0 && offsetDst >= 0) {
              if (!isNaN(parseInt(callback[offsetOrig], 10))) {
                if (!isNaN(parseInt(aniInAli[offsetDst], 10))) {
                  aniInAli = this.setAt(aniInAli, offsetDst, callback[offsetOrig]);
                  --offsetOrig;
                }
                --offsetDst;
              } else {
                --offsetOrig;
              }
            }

            ali = this.setAt(ali, normalAliFormat.aniOffset, aniInAli);
          }
        } else {
          diag.trace?.(
            'setNormalCallback',
            `Normal Format does not define ANI offset, ALI modification impossible`
          );
        }
      } else {
        diag.trace?.('setNormalCallback', `No Normal Format defined, ALI modification impossible`);
      }
    }

    return ali;
  }

  public isAniWireless(ani: string): boolean {
    if (ani.length === 10) {
      for (let aliFormat of this.aliFormats) {
        if (aliFormat.type === AliDecoderType.WIRELESS && aliFormat.aliSupport & AliDecoderSupport.NPA_NXX) {
          if (ani.length >= aliFormat.rangeStart.length) {
            let npaNxx: string = ani.substr(0, aliFormat.rangeStart.length);
            if (npaNxx >= aliFormat.rangeStart && npaNxx <= aliFormat.rangeEnd) {
              return true;
            }
          } else {
            diag.trace?.('isAniWireless', `ANI length is smaller than mRangeStart. Cannot match format`);
          }
        }
      }
    }

    return false;
  }

  private outputAli(ali: string) {
    //Print ALI with delimiter
    let delimAli: string = '0001:';
    for (let i = 0; i < ali.length; i++) {
      delimAli += "'" + ali[i];
      if ((i + 1) % 25 === 0) {
        delimAli += "'INSERT_NEW_LINE" + (i + 2).toString().padStart(4, '0') + ':';
      }
    }
    delimAli += "'";
    diag.trace?.(
      'decodeAli',
      `ALI to Decode: \n----------------------------------------------------------\n${delimAli
        .replaceAll('\r', '[CR]')
        .replaceAll('\n', '[LF]')
        .replaceAll('INSERT_NEW_LINE', '\n')}\n----------------------------------------------------------'`
    );
  }

  public decodeAli(decodedAli: DecodedAli, replaceAniWithCallBack: boolean) {
    if (this.aliFormats.length === 0) {
      diag.trace?.('decodeAli', `No ALI format configured`);
      return;
    }

    if (!this.formatSorted) {
      // we keep the formats ordered so that more precise formats are tried first
      this.aliFormats.sort((a, b) => (a.aliSupport > b.aliSupport ? -1 : 1));
      this.formatSorted = true;

      let log: string = '';
      for (let aliFormat of this.aliFormats) {
        log += '\n';
        log += aliFormat.toString();
      }

      diag.trace?.('decodeAli', `Sorted Format: ${log}`);
    }

    this.outputAli(decodedAli.ali);

    let aliFormatFound: boolean = false;

    for (let aliFormat of this.aliFormats) {
      if (aliFormat.isWireless(decodedAli.ali)) {
        decodedAli.format = aliFormat;
        aliFormatFound = true;
        break;
      }
    }

    if (!aliFormatFound) {
      // use the default format since this should not be a Wireless call
      decodedAli.format = this.aliFormats[this.aliFormats.length - 1];
    }
    diag.trace?.('decodeAli', `Decode using:\n${decodedAli.format.toString()}`);

    // we get the ANI
    if (decodedAli.format.aliSupport & AliDecoderSupport.ANI) {
      decodedAli.ani = getNumber(decodedAli.ali, decodedAli.format.aniOffset, decodedAli.format.aniLength);
      diag.trace?.('decodeAli', `Decoded ANI: ${decodedAli.ani}`);
    }

    // we get the PANI
    if (decodedAli.format.aliSupport & AliDecoderSupport.PSEUDO_ANI) {
      decodedAli.pseudoAni = getNumber(
        decodedAli.ali,
        decodedAli.format.pseudoAniOffset,
        decodedAli.format.pseudoAniLength
      );
      diag.trace?.('decodeAli', `Decoded PSEUDO-ANI: ${decodedAli.pseudoAni}`);
    }

    // we get the CoS
    if (decodedAli.format.aliSupport & AliDecoderSupport.CLASS_OF_SERVICE && decodedAli.format.cosTagLength > 0) {
      if (decodedAli.ali.length >= decodedAli.format.cosTagOffset + decodedAli.format.cosTagLength) {
        decodedAli.classOfService = decodedAli.ali.substr(
          decodedAli.format.cosTagOffset,
          decodedAli.format.cosTagLength
        );

        diag.trace?.('decodeAli', `Decoded COS: ${decodedAli.classOfService}`);
      }
    }

    // we get the Provider
    if (decodedAli.format.aliSupport & AliDecoderSupport.PROVIDER && decodedAli.format.providerLength > 0) {
      if (decodedAli.ali.length >= decodedAli.format.providerOffset + decodedAli.format.providerLength) {
        decodedAli.provider = decodedAli.ali.substr(decodedAli.format.providerOffset, decodedAli.format.providerLength);

        diag.trace?.('decodeAli', `Decoded Provider: ${decodedAli.provider}`);
      }
    }

    // The objective is to make sure that the Ani position in a normal ali is
    // filled with the callback even if the ali is wireless
    if (replaceAniWithCallBack) {
      if (decodedAli.format.type === AliDecoderType.WIRELESS) {
        if (this.aliFormats.length > 0) {
          let normalAli: AliDecoderFormat;
          normalAli = this.aliFormats[this.aliFormats.length - 1];
          if (normalAli.type !== AliDecoderType.NORMAL) {
            diag.trace?.('decodeAli', `No Normal Format defined, ALI modification impossible`);
          } else if (!(normalAli.aliSupport & AliDecoderSupport.ANI)) {
            diag.trace?.(
              'decodeAli',
              `Normal Format does not define ANI offset, ALI modification impossible`
            );
          } else if (!(decodedAli.format.aliSupport & AliDecoderSupport.ANI)) {
            diag.trace?.(
              'decodeAli',
              `Wireless Format does not define ANI offset, ALI modification impossible`
            );
          } else {
            if (decodedAli.ali.length >= decodedAli.format.aniOffset + decodedAli.format.aniLength) {
              let callback: string = decodedAli.ali.substr(decodedAli.format.aniOffset, decodedAli.format.aniLength);
              decodedAli.ali = this.setNormalCallback(decodedAli.ali, callback);
            }
          }
        }
      } else {
        diag.trace?.('decodeAli', `Not a Wireless Format, NO ALI modification`);
      }
    }
  }

  public modifyAli(decodedAli: DecodedAli) {
    if (decodedAli.ali.length === 0) {
      diag.trace?.('modifyAli', `ALI is empty`);
    } else {
      if (this.goodAliTypes.has(parseInt('0x' + decodedAli.ali[0]))) {
        // Extract ALI type from ALI and remember it.
        let aliType: string = decodedAli.ali.substr(0, 1);
        decodedAli.ali = decodedAli.ali.substr(1);
        this.decodeAli(decodedAli, this.allowModifyAli);
        decodedAli.ali = aliType + decodedAli.ali;
      } else {
        diag.trace?.('modifyAli', `ALI type not supported, no modify`);
      }
    }
  }

  public static getInstance(): AliDecoder {
    return this.instance || (this.instance = new this());
  }
}

// export singleton object
export const aliDecoder = AliDecoder.getInstance();

function getNumber(ali: string, offset: number, length: number): string {
  if (offset + length > ali.length) {
    return '';
  }

  let nb: string = ali.substr(offset, length);
  // Remove non digit characters
  nb = nb.replace(/\D/g, '');
  return nb;
}

export function aniCompare(ani1: string, ani2: string): boolean {
  let res: boolean = false;
  if (ani1.length < ani2.length) {
    return aniCompare(ani2, ani1);
  }

  if (ani1 === ani2) {
    res = true;
  } else if (ani1.length >= 10 && ani2.length >= 10) {
    // if not we have a weird ani
    res = ani1.substr(ani1.length - 10, 10) === ani2.substr(ani2.length - 10, 10);
  } else if (ani1.length >= 8 && ani2.length >= 7) {
    // if not we have a weird ani
    res = ani1.substr(ani1.length - 7, 7) === ani2.substr(ani2.length - 7, 7);
  }

  if (res) {
    diag.trace?.('aniCompare', `Ani match ${ani1} == ${ani2}`);
  } else {
    diag.trace?.('aniCompare', `Ani mismatch ${ani1} != ${ani2}`);
  }
  return res;
}

// Compute offset as if the first character is 0 not 1
// This is required to be the same as the ali format
function offsetBase0(offsetBase1: number): number {
  let offsetBase0: number = 0;
  if (offsetBase1 > 1) {
    offsetBase0 = offsetBase1 - 1;
  }
  return offsetBase0;
}
// Compute offset as if the first character is 1 not 0
// This is required to be the same as the ali format
function offsetBase1(offsetBase0: number) {
  return offsetBase0 + 1;
}
