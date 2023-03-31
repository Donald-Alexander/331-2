import { DialPlan } from 'client-web-api/src/config/model/DialPlan';
import { DialPlanEntry, outboundDialPlanManager } from '../outboundDialPlan/outboundDialPlan';
import * as ExtInterface from '../telephonyexternalinterfacedef';

export class DialPlanConfig {
  constructor(dialPlan: DialPlan) {
    outboundDialPlanManager.removeAllOutboundDialPlan();

    for (const item of dialPlan.dialPlanItems) {
      const jsonObj = item.json;

      let entry: DialPlanEntry = new DialPlanEntry(
        jsonObj.RangeLow || '',
        jsonObj.RangeHigh || '',
        jsonObj.PreferredLinePoolAndLocalPrefix || '',
        jsonObj.PreferredLinePoolAndLongDistancePrefix || '',
        jsonObj.PreferredLinePoolNpa || '',
        jsonObj.PreferredLinePoolNxx || '',
        this.getForceNpaOnLocalCalls(jsonObj.PreferredForceNpaOnLocalCalls),
        jsonObj.AlternateLinePoolAndLocalPrefix || '',
        jsonObj.AlternateLinePoolAndLongDistancePrefix || '',
        jsonObj.AlternateLinePoolNpa || '',
        jsonObj.AlternateLinePoolNxx || '',
        this.getForceNpaOnLocalCalls(jsonObj.AlternateForceNpaOnLocalCalls)
      );

      outboundDialPlanManager.addOutboundDialPlan(entry);
    }
  }

  private getForceNpaOnLocalCalls(jsonObj: any): ExtInterface.ForceNpaOnLocalCalls {
    let forceNpa: ExtInterface.ForceNpaOnLocalCalls = ExtInterface.ForceNpaOnLocalCalls.Default;

    switch (jsonObj.PreferredForceNpaOnLocalCalls) {
      case 1:
        forceNpa = ExtInterface.ForceNpaOnLocalCalls.True;
        break;
      case 2:
        forceNpa = ExtInterface.ForceNpaOnLocalCalls.False;
        break;
      default:
    }

    switch (jsonObj.AlternateForceNpaOnLocalCalls) {
      case 1:
        forceNpa = ExtInterface.ForceNpaOnLocalCalls.True;
        break;
      case 2:
        forceNpa = ExtInterface.ForceNpaOnLocalCalls.False;
        break;
      default:
    }

    return forceNpa;
  }
}
