import { webCfg } from './webcfg';
import { WirelessService } from 'client-web-api/src/config/model/WirelessService';
import { aliDecoder, AliDecoderFormat, AliDecoderSupport, AliDecoderType } from '../alidecoder/alidecoder';
import { AutoRebidRule, autoRebidRuleManager, MinRebidDelay } from '../autorebid/autorebid';
import { Diag } from '../common/diagClient';
const diag = new Diag('Config');

export class WirelessServiceConfig {
  //Configuration for WirelessServiceConfig will be kept in the aliDecoder and autoRebidRuleManager since it is these subcomponents
  // that really use it.

  constructor() {
    let normalAliLoaded: boolean = false;
    webCfg.configHandler.collectionWirelessService.getAll().forEach((wirelessService: WirelessService) => {
      let jsonObj = wirelessService.json;

      let format: AliDecoderFormat = new AliDecoderFormat();

      if (jsonObj.Name === 'Normal ALI') {
        format.type = AliDecoderType.NORMAL;
      } else {
        format.type = AliDecoderType.WIRELESS;
      }

      // NPA_NXX
      if (jsonObj.WirelessCallDetectionViaPseudoAni === true) {
        format.aliSupport |= AliDecoderSupport.NPA_NXX;
        let pseudoAniNpaNnxLow: string = jsonObj.PseudoAniNpaNnxLow;
        if (pseudoAniNpaNnxLow && pseudoAniNpaNnxLow !== '') {
          format.rangeStart = pseudoAniNpaNnxLow;
        }
        let pseudoAniNpaNnxHigh: string = jsonObj.PseudoAniNpaNnxHigh;
        if (pseudoAniNpaNnxHigh && pseudoAniNpaNnxHigh !== '') {
          format.rangeEnd = pseudoAniNpaNnxHigh;
        }
      }

      // PROVIDER
      let providerName: string = jsonObj.ProviderName;
      if (providerName && providerName !== '') {
        format.aliSupport |= AliDecoderSupport.PROVIDER;
        format.providerTag = providerName;
        format.providerLength = providerName.length;

        let providerOffset: number = jsonObj.ProviderOffset;
        if (!isNaN(providerOffset)) {
          format.providerOffset = providerOffset;
        }
      }

      // CLASS_OF_SERVICE
      let cosName: string = jsonObj.ClassOfService;
      if (cosName && cosName !== '') {
        format.aliSupport |= AliDecoderSupport.CLASS_OF_SERVICE;
        format.cosTag = cosName;
        format.cosTagLength = cosName.length;

        let cosOffset: number = jsonObj.ClassOfServiceOffset;
        if (!isNaN(cosOffset)) {
          format.cosTagOffset = cosOffset;
        }
      }

      // PSEUDO_ANI
      if (jsonObj.PseudoAniInAli === true) {
        format.aliSupport |= AliDecoderSupport.PSEUDO_ANI;
        let pseudoAniOffset: number = jsonObj.PseudoAniOffset;
        if (!isNaN(pseudoAniOffset)) {
          format.pseudoAniOffset = pseudoAniOffset;
        }
        let pseudoAniLength: number = jsonObj.PseudoAniLength;
        if (!isNaN(pseudoAniLength)) {
          format.pseudoAniLength = pseudoAniLength;
        }
      }

      // ANI
      if (jsonObj.CallbackNumberInAli === true || format.type === AliDecoderType.NORMAL) {
        format.aliSupport |= AliDecoderSupport.ANI;
        let callbackNumberOffset: number = jsonObj.CallbackNumberOffset;
        if (!isNaN(callbackNumberOffset)) {
          format.aniOffset = callbackNumberOffset;
        }
        let callbackNumberLength: number = jsonObj.CallbackNumberLength;
        if (!isNaN(callbackNumberLength)) {
          format.aniLength = callbackNumberLength;
        }
      }

      // RtxDebounceDelay
      let rtxDebounceDelay: number = jsonObj.RtxDebounceDelay;
      if (!isNaN(rtxDebounceDelay)) {
        format.rtxDebounceDelay = rtxDebounceDelay;
      }

      // WirelessPhase1
      if (jsonObj.WirelessPhase1 === true) {
        format.wirelessPhase1 = true;
      }

      if (format.type === AliDecoderType.NORMAL) {
        if (format.aniOffset !== 0 && format.aniLength !== 0) {
          aliDecoder.addFormat(format);
          normalAliLoaded = true;
        } else {
          diag.warn('WirelessServiceConfig.constructor', `Normal ALI configuration received without offset/lenght`);
        }
      } else {
        aliDecoder.addFormat(format);
      }

      // AutomaticAliRebid
      if (jsonObj.AutomaticAliRebid === true) {
        let rule: AutoRebidRule = new AutoRebidRule();

        rule.provider = format.providerTag;
        rule.classOfService = format.cosTag;
        rule.npaNxxStart = format.rangeStart;
        rule.npaNxxEnd = format.rangeEnd;

        // NumberOfRebids
        let numberOfRebids: number = jsonObj.NumberOfRebids;
        if (!isNaN(numberOfRebids)) {
          rule.repetitions = numberOfRebids;
        }

        // FirstRebidDelay
        let firstRebidDelay: number = jsonObj.FirstRebidDelay;
        if (!isNaN(firstRebidDelay) && firstRebidDelay >= MinRebidDelay) {
          rule.initialDelay = firstRebidDelay;
        } else {
          rule.initialDelay = MinRebidDelay;
        }

        // SubsequentRebidDelay
        let subsequentRebidDelay: number = jsonObj.SubsequentRebidDelay;
        if (!isNaN(subsequentRebidDelay) && subsequentRebidDelay >= MinRebidDelay) {
          rule.subsequentDelay = subsequentRebidDelay;
        } else {
          rule.subsequentDelay = MinRebidDelay;
        }

        autoRebidRuleManager.addRule(rule);
      }
    });

    if (!normalAliLoaded) {
      let format: AliDecoderFormat = new AliDecoderFormat();
      format.type = AliDecoderType.NORMAL;
      format.aliSupport = AliDecoderSupport.ANI;
      format.aniOffset = 2;
      format.aniLength = 14;
      aliDecoder.addFormat(format);
      diag.warn('WirelessServiceConfig.constructor', `No Normal ALI configuration use default configuration`);
    }
  }
}
