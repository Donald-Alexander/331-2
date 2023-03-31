import { Position } from 'client-web-api/src/config/model/Position';
import { Line } from 'client-web-api/src/config/model/Line';
import { WorkstationOperation } from 'client-web-api/src/config/model/WorkstationOperation';
import { WorkstationCADRecord } from 'client-web-api/src/config/model/WorkstationCADRecord';
import { WorkstationCTI } from 'client-web-api/src/config/model/WorkstationCTI';
import { WorkstationVolume } from 'client-web-api/src/config/model/WorkstationVolume';
import { cloneLineConfig, LineConfig } from './lineConfig';
import { CtiHardwareType } from '../telephonyexternalinterfacedef';
import { webCfg } from './webcfg';
import { Diag } from '../common/diagClient';
const diag = new Diag('Config');

// This enum must match the same order that is defined in
// ConfigurationModel.xsd
enum WorkstationType {
  Sonic = 0,
  A9C,
  A9C_CCI,
  Power_Station_Gen3,
  Power_Station_Gen3_CCI,
  USB_Handset,
  CCI_Text_Start,
  Reserved,
  WebClient,
  WebClient_Sonic,
  WebClient_PSG3,
  Sonic_Gen3,
  WebClient_Sonic_Gen3,
}

function workStationTypeToText(workstationType: number): string {
  switch (workstationType) {
    case WorkstationType.Sonic:
      return 'Sonic';
      break;
    case WorkstationType.Sonic_Gen3:
      return 'Sonic';
      break;
    case WorkstationType.A9C:
      return 'A9C';
      break;
    case WorkstationType.A9C_CCI:
      return 'A9C_CCI';
      break;
    case WorkstationType.Power_Station_Gen3:
      return 'Power_Station_Gen3';
      break;
    case WorkstationType.Power_Station_Gen3_CCI:
      return 'Power_Station_Gen3_CCI';
      break;
    case WorkstationType.USB_Handset:
      return 'USB_Handset';
      break;
    case WorkstationType.CCI_Text_Start:
      return 'CCI_Text_Start';
      break;
    case WorkstationType.Reserved:
      return 'Reserved';
      break;
    case WorkstationType.WebClient:
      return 'WebClient';
      break;
    case WorkstationType.WebClient_Sonic:
      return 'WebClient_Sonic';
      break;
    case WorkstationType.WebClient_PSG3:
      return 'WebClient_PSG3';
      break;
    default:
      return 'Unknown';
  }
}

export enum RingerDestination {
  Handset = 'Handset',
  Speaker = 'Speaker',
  HandsetSpeaker = 'HandsetSpeaker',
}

export interface IPositionCfg {
  id: number;
  name: string;
  dn: string;

  // Operations
  isTTYArbitrator: boolean;
  isTenDigitDialing: boolean;
  itrrSupport: boolean;

  // CAD Record
  isCadEnabled: boolean;
  isRefreshOnNewALI: boolean;
  isRefreshOnHold: boolean;
  isCadoutOnSMS: boolean;
  cadPositionNumber: number;

  // CTI HW Type
  ctiHardwareType: CtiHardwareType;

  // Radio volume
  radioInVolCurGain: number;
  radioOutVolCurGain: number;
  defaultRingerVolume: number;
  ringerDestination: RingerDestination;
  defaultConversationVolume: number;
  //audioSwitchoverSpeakerVolume: number;
}

export class PositionCfg {
  private readonly _positionCfg: IPositionCfg;
  private _lineDataMap: Array<LineConfig> = [];
  private _ctiConfig: any | undefined;
  private nbIntercoms: number = 1; // has 1 static Intercom

  constructor(pos: Position) {
    const jsonObj: any = pos.json;

    let ctiHwType: CtiHardwareType = CtiHardwareType.None;
    switch (jsonObj.WorkstationType) {
      case WorkstationType.WebClient:
        ctiHwType = CtiHardwareType.None;
        break;
      case WorkstationType.WebClient_PSG3:
        ctiHwType = CtiHardwareType.PowerStationG3;
        break;
      case WorkstationType.WebClient_Sonic:
        ctiHwType = CtiHardwareType.Sonic;
        break;
      case WorkstationType.WebClient_Sonic_Gen3:
        ctiHwType = CtiHardwareType.SonicG3;
        break;
      default:
        diag.warn(          
          'PositionCfg.constructor',
          `Unexpected WorkstationType in configuration: ${jsonObj.WorkstationType}`
        );
        break;
    }

    this._positionCfg = {
      id: (+jsonObj.Extension || 0) - 2000,
      name: jsonObj.Name || '',
      dn: jsonObj.Extension || '',
      isTTYArbitrator: false,
      isTenDigitDialing: false, // aka. ForceNpaOnLocalCalls
      itrrSupport: false,
      isCadEnabled: false,
      isRefreshOnNewALI: false,
      isRefreshOnHold: false,
      isCadoutOnSMS: false,
      cadPositionNumber: 0,
      ctiHardwareType: ctiHwType,
      radioInVolCurGain: -19.0,
      radioOutVolCurGain: -2.0,
      defaultRingerVolume: 30,
      ringerDestination: RingerDestination.HandsetSpeaker,
      defaultConversationVolume: 45,
    };

    if (this._positionCfg.id > 2000 || this._positionCfg.name === '' || this._positionCfg.dn === '') {
      throw new Error('Invalid Position configuration');
    }

    this.fetchPositionAcdLine();
    this.fetchPositionIntercomLines();
    this.fetchPositionAssignedLines(jsonObj.AssignedLines);
    this.fetchPositionOperationCfg(jsonObj.WorkstationOperationCfg);
    this.fetchPositionCadRecordCfg(jsonObj.WorkstationCADRecordCfg);
    this.fetchPositionVolumeCfg(jsonObj.WorkstationVolumeCfg);
    this.fetchPositionCTICfg(jsonObj.WorkstationCTICfg);
  }

  private fetchPositionAcdLine() {
    let address = this.dn + '_ACD';
    let line: Line = webCfg.configHandler.collectionLine.getByAddress(address);
    this._lineDataMap.push(new LineConfig(line));
  }

  private fetchPositionIntercomLines() {
    let address = this.dn + 'A';
    let line: Line = webCfg.configHandler.collectionLine.getByAddress(address);
    this._lineDataMap.push(new LineConfig(line));
  }

  private fetchPositionAssignedLines(objectIds: Array<number>) {
    if (objectIds) {
      objectIds.forEach((objectId) => {
        let line: Line = webCfg.configHandler.collectionLine.get(objectId);

        let lineCfg: LineConfig = new LineConfig(line);
        this._lineDataMap.push(lineCfg);
      });
    }
  }

  private fetchPositionOperationCfg(objectId: number) {
    let workstationOperation: WorkstationOperation = webCfg.configHandler.collectionWorkstationOperation.get(objectId);

    this._positionCfg.isTTYArbitrator = workstationOperation.json.TTYArbitrator || false;
    this._positionCfg.isTenDigitDialing = workstationOperation.json.TenDigitDialing || false;
    this._positionCfg.itrrSupport = workstationOperation.json.ITRRSupport || false;
  }

  private fetchPositionCadRecordCfg(objectId: number) {
    let workstationCadRecord: WorkstationCADRecord = webCfg.configHandler.collectionWorkstationCADRecord.get(objectId);

    this._positionCfg.isCadEnabled = workstationCadRecord.json.CADRecordEnable || false;
    this._positionCfg.isRefreshOnNewALI = workstationCadRecord.json.RefreshOnNewALI || false;
    this._positionCfg.isRefreshOnHold = workstationCadRecord.json.RefreshOnReconnect || false;
    this._positionCfg.isCadoutOnSMS = workstationCadRecord.json.CADOutOnSMS || false;
    this._positionCfg.cadPositionNumber = workstationCadRecord.json.CADPositionNumber || 0;
  }

  private fetchPositionCTICfg(objectId: number) {
    let workstationCTI: WorkstationCTI = webCfg.configHandler.collectionWorkstationCTI.get(objectId);

    if (workstationCTI) {
      this._ctiConfig = workstationCTI.json;
    }
  }

  private fetchPositionVolumeCfg(objectId: number) {
    let workstationVolume: WorkstationVolume = webCfg.configHandler.collectionWorkstationVolume.get(objectId);

    if (workstationVolume) {
      this._positionCfg.radioInVolCurGain = workstationVolume.json.CtiInVolCurGain || 0;
      this._positionCfg.radioOutVolCurGain = workstationVolume.json.CtiOutVolCurGain || 0;
      this._positionCfg.defaultRingerVolume = workstationVolume.json.DefaultRingerVolume || 20;
      if (workstationVolume.json.DestinationType === 'Handset') {
        this._positionCfg.ringerDestination = RingerDestination.Handset;
      } else if (workstationVolume.json.DestinationType === 'Speaker') {
        this._positionCfg.ringerDestination = RingerDestination.Speaker;
      }
      this._positionCfg.defaultConversationVolume = workstationVolume.json.DefaultConversationVolume || 33;
    }
  }

  // public accessors:

  get id(): number {
    return this._positionCfg.id;
  }

  get name(): string {
    return this._positionCfg.name;
  }

  get dn(): string {
    return this._positionCfg.dn;
  }

  get lineDataMap(): Array<LineConfig> {
    return this._lineDataMap;
  }

  get ctiHardwareType(): string {
    return this._positionCfg.ctiHardwareType;
  }

  get isCadEnabled(): boolean {
    return this._positionCfg.isCadEnabled;
  }

  get cadPosId(): number {
    return this._positionCfg.cadPositionNumber;
  }

  get isCadRefreshOnNewALI(): boolean {
    return this._positionCfg.isRefreshOnNewALI;
  }

  get isCadRefreshOnHold(): boolean {
    return this._positionCfg.isRefreshOnHold;
  }

  get defaultRingerVolume(): number {
    return this._positionCfg.defaultRingerVolume;
  }

  get defaultConversationVolume(): number {
    return this._positionCfg.defaultConversationVolume;
  }

  get ringerDestination(): RingerDestination {
    return this._positionCfg.ringerDestination;
  }

  get itrrSupport(): boolean {
    return this._positionCfg.itrrSupport;
  }

  get json(): IPositionCfg {
    return this._positionCfg;
  }

  get ctiCfg(): any | undefined {
    if (this._positionCfg.ctiHardwareType !== CtiHardwareType.None) {
      if (this._ctiConfig) {
        let ctiCfg = this._ctiConfig;
        ctiCfg.WorkstationType = this._positionCfg.ctiHardwareType;
        ctiCfg.RadioInVolCurGain = this._positionCfg.radioInVolCurGain;
        ctiCfg.RadioOutVolCurGain = this._positionCfg.radioOutVolCurGain;
        return ctiCfg;
      } else {
        return undefined;
      }
    } else {
      return undefined;
    }
  }

  get radioSplitCombineSupport(): boolean {
    if (this._positionCfg.ctiHardwareType !== CtiHardwareType.None) {
      if (this._ctiConfig) {
        if (this._ctiConfig.RadioMode === 1) {
          //Console Master
          return true;
        } else {
          return false;
        }
      } else {
        return false;
      }
    } else {
      return false;
    }
  }

  public getNextIntercomLineConfig(): LineConfig | undefined {
    // only support max 26 Intercom lines
    const newAddress = this.dn + String.fromCharCode(65 + this.nbIntercoms++); // start from 65 ('A')
    if (this.nbIntercoms > 26) {
      diag.err('PositionCfg.getNextIntercomLineConfig', `Unable to get Intercom: ${this.nbIntercoms}`);
      return undefined;
    }

    return cloneLineConfig(this.dn + 'A', newAddress);
  }
}
