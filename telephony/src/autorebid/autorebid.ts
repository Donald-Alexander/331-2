import { DecodedAli } from '../alidecoder/alidecoder';
import { Diag } from '../common/diagClient';
const diag = new Diag('autorebid');

export const MinRebidDelay: number = 5;

export class AutoRebidRule {
  repetitions: number; // 0 for infinite
  initialDelay: number; // in seconds
  subsequentDelay: number; // in seconds

  // Criterions for enabling Automatic Rebid
  provider: string;
  classOfService: string;
  npaNxxStart: string;
  npaNxxEnd: string;
  i3Pidflo: boolean;

  constructor() {
    this.repetitions = -1;
    this.initialDelay = 0;
    this.subsequentDelay = 0;
    this.provider = '';
    this.classOfService = '';
    this.npaNxxStart = '';
    this.npaNxxEnd = '';
    this.i3Pidflo = false;
  }

  public match(decodedAli: DecodedAli, pidflo: string, addData: string, wireless: boolean): boolean {
    let match: boolean = true;

    if (pidflo !== '' || addData !== '') {
      if (!this.i3Pidflo || !wireless) {
        match = false;
      }
    } else {
      if (this.provider === '' && this.classOfService === '' && this.npaNxxStart === '') {
        match = false;
      }
      let provider: string = decodedAli.provider.substr(0, this.provider.length);
      if (!(this.provider === '' || this.provider === provider)) {
        match = false;
      }

      let classOfService: string = decodedAli.classOfService.substr(0, this.classOfService.length);
      if (!(this.classOfService === '' || this.classOfService === classOfService)) {
        match = false;
      }

      let npaNxx: string = decodedAli.pseudoAni.substr(0, this.npaNxxStart.length);
      if (!(this.npaNxxStart === '' || (npaNxx >= this.npaNxxStart && npaNxx <= this.npaNxxEnd))) {
        match = false;
      }
    }

    return match;
  }
}

export class AutoRebidRuleManager {
  private static instance: AutoRebidRuleManager;
  private rules: Array<AutoRebidRule>;
  private rebidOnPhase1Wireless: boolean;

  constructor() {
    this.rules = [];
    this.rebidOnPhase1Wireless = false;
  }

  public addRule(rule: AutoRebidRule) {
    if (rule.npaNxxStart !== '' && rule.npaNxxEnd === '') {
      rule.npaNxxEnd = rule.npaNxxStart;
    }

    if (rule.npaNxxEnd !== '' && rule.npaNxxStart === '') {
      rule.npaNxxStart = rule.npaNxxEnd;
    }

    diag.out(
      'addRule',
      `Repetitions: ${rule.repetitions.toString()} Initial Delay: ${rule.initialDelay.toString()} Delay: ${rule.subsequentDelay.toString()}${
        rule.provider.length !== 0 ? ' Provider "' + rule.provider + '"' : ''
      }${rule.classOfService.length !== 0 ? ' CoS "' + rule.classOfService + '"' : ''}${
        rule.npaNxxStart ? ' NpaNxx Range: (' + rule.npaNxxStart + '-' + rule.npaNxxEnd + ')' : ''
      }${rule.i3Pidflo ? ' for I3 PIDF-LO' : ''}`
    );

    this.rules.push(rule);
  }

  public clearRules() {
    while (this.rules.length > 0) {
      this.rules.pop();
    }

    diag.trace?.('clearRules', `Removing all rules`);
  }

  public setRebidOnPhase1Wireless(rebid: boolean) {
    this.rebidOnPhase1Wireless = rebid;
    diag.out('setRebidOnPhase1Wireless', `Set RebidOnPhase1Wireless ${rebid ? 'active' : 'inactive'}`);
  }

  public getRebidOnPhase1Wireless() {
    return this.rebidOnPhase1Wireless;
  }

  public submitForAutoRebid(
    decodedAli: DecodedAli,
    pidflo: string,
    additionalData: string,
    wireless: boolean,
    locationBy: string
  ): AutoRebidRule | undefined {
    let rule: AutoRebidRule | undefined = this.rules.find(function (rule: AutoRebidRule) {
      if (rule.match(decodedAli, pidflo, additionalData, wireless)) {
        if (!(rule.i3Pidflo && locationBy !== 'reference')) {
          return true;
        }
      }
      return false;
    });

    return rule;
  }

  public static getInstance(): AutoRebidRuleManager {
    return this.instance || (this.instance = new this());
  }
}

// export singleton object
export const autoRebidRuleManager = AutoRebidRuleManager.getInstance();
