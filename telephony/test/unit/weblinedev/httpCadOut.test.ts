import { CallState, CSSEventType, StateUpdate, InformationUpdate } from '@src/telephonyexternalinterfacedef';
import { WebLineDev } from '@src/weblinedev/weblinedev';
import { webCfg } from '@src/config/webcfg';
import { HttpCadOut } from '@src/weblinedev/httpCadOut';
import https from 'https';
import { IncomingMessage, ServerResponse } from 'http';
import { SecureContextOptions } from 'tls';
import WebCall from '@src/webcall/webcall';
import { WebLine } from '@src/webline/webline';
import { WebNode } from '@src/weblinedev/webnode';
import { CallHeader } from '@src/telephonyutil';
import { LineConfig } from '@src/config/lineConfig';
import * as utils from '@src/common/utils';

jest.mock('@src/config/webcfg');

const secureContextOptions: SecureContextOptions = {
  key:
    '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEAsUuCwcp9RAXR7WY8fPves1eNM3UKCP6CMQ6D1S03J+DxCsopQ/HlpMmK7r41BvjO5HqaSQiq0iBHuMk6E7tn8IoIXG/TOdzXbcwIZzUSdnLT4TAPMd+h5FH2zIci2cg3B45QpcIZSIhSFArSuQuBjoiKmdeUlvIqalCMO5ANleU20gLh/fBzUOeSEUQQ403eIeUWB2vpOxMjabrMjx9atRsNmnzguKgog2KSjTVBuB9JWOjuYZ2bk04EzDB73Vx0fgGVcU6Dd6NN4tFldtaYP4YsJU2MnvVbG1EQ2Bfk4qU3aXCPVN82gEvROBO992OPR7p861768J3Sii5g/yXlLwIDAQABAoIBAHfkVlHyOm9reCCPyEvEjz677/JiLR0T7rp51FCuOOQwyw++0dTumZqr59W2rmk+i7oZ5oeI4ushhR7ChRGe45TX4vuPa0lvvAa1uOECFLAgyoM3Wq8hSXr6qmh44epf6EalyIevECXqeYawIvubeksGrqOGEydYL7KhMZN9wJIhw3upJ3H2uZwhhBgU958XLxchPLr6pXpRg9Qzb577MLvYvtHTzksjzzceSiY1DLS+SPXSOVpjGgDCHqUrju6kGULExVdIzhVqxS6geGJQeksSE6BhSpPs1gvGZ+XklFDqLmD44C+LvMvocshUMfvKpaBHGkj4T4dHFaWIxUs347ECgYEA6QByKWd/cAmDrV8Qlc1Q1QkGXiLlyTyhiKxFlK8sQ0t0Ci0PGGUDFxwUKu4G+VMWwbHMRoM5ymcLYOTksEbs98cap4bwUuM74hz02XYm+Uhr2A58354BOdQ1sCmvOSS2HGmn50J1udSB08ukNehEki7v2o/wDBuHASK424QE6jUCgYEAwstzPkhU31smkcWdhrsY7FEwNoumvG/x6OWYx22nAYOXcqTDckOS/FZZegXMST09URCbG00q8Ke/irAMkNoJc+rvndGzo2/hZIhhEGHo9E8TZ37MFXI4qWnJOiOiEHZ3EE5b8uunEseOD6wwt3vRftGTUNnsGAVOqMHwT+Mk3lMCgYA2ZF9CISITwnTVzSJvBf3/rVqqMRVZU+kVobmgiwAXOY7+LSSf+jytcWWX2/cOzwG598qLD2k3QbTbSrPEHtqEwRsMzqhdgSRilYXnGfjhKrHaPw+RmC4LFOnvlNuNyG8m1NdYWiBnYB9qlNhhqTYQthpR+FX+TZLHhhaHUBthnQKBgQCRmbToRvR5hw5LQ2S9gjfc28qn2rakfyBYrtUFq+Z68TtQi+szC2NgjcKPvKm3zLh6UWk+fO2tuBUpuvGJjBAovuCgHFCjx0q39GBo+GZBxqGAaHxvQ1Mq/lFUzbGjkIjqfUepSY82MEb1XAWGAFzU6B2u/1TDl6P17BCOBgBW1QKBgQDA32Nd7JhvauQmzlWB5S4xiD6vsSUSuCLm0HtQxITmMDtr6XiQSLBH9ZLr7ijJsv9Pw2gtKzEcXsB4rycNhNWJ2I0G4mC62hmr/olKPjfNzVrtzyFeC0xOLLaWTzhKv0TvyD7ANK9kE8LC6dGkmrrjBOnmcbHzlyZprdAjV/pw+g==\n-----END RSA PRIVATE KEY-----',
  cert:
    '-----BEGIN CERTIFICATE-----\nMIIDUTCCAjkCFFRL0VKbSelfoMwud0Nr8GP68/EqMA0GCSqGSIb3DQEBCwUAMGUxCzAJBgNVBAYTAkNBMQ8wDQYDVQQIDAZRdWViZWMxETAPBgNVBAcMCE1vbnRyZWFsMRAwDgYDVQQKDAdJbnRyYWRvMQ0wCwYDVQQLDARQOTExMREwDwYDVQQDDAhQOTExU2FhUzAeFw0yMDA5MDMwMjI2MDBaFw00ODAxMTkwMjI2MDBaMGUxCzAJBgNVBAYTAkNBMQ8wDQYDVQQIDAZRdWViZWMxETAPBgNVBAcMCE1vbnRyZWFsMRAwDgYDVQQKDAdJbnRyYWRvMQ0wCwYDVQQLDARQOTExMREwDwYDVQQDDAhQOTExU2FhUzCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBALFLgsHKfUQF0e1mPHz73rNXjTN1Cgj+gjEOg9UtNyfg8QrKKUPx5aTJiu6+NQb4zuR6mkkIqtIgR7jJOhO7Z/CKCFxv0znc123MCGc1EnZy0+EwDzHfoeRR9syHItnINweOUKXCGUiIUhQK0rkLgY6IipnXlJbyKmpQjDuQDZXlNtIC4f3wc1DnkhFEEONN3iHlFgdr6TsTI2m6zI8fWrUbDZp84LioKINiko01QbgfSVjo7mGdm5NOBMwwe91cdH4BlXFOg3ejTeLRZXbWmD+GLCVNjJ71WxtRENgX5OKlN2lwj1TfNoBL0TgTvfdjj0e6fOte+vCd0oouYP8l5S8CAwEAATANBgkqhkiG9w0BAQsFAAOCAQEAQ4IFTiAbey8RgM71e8EMqMaHgO4vDAiYj2hyjxo1Kk1QNEDfDUtuFR4SokcucGq1W9pm4QmAZJpeSksHFxy9mYsz9pa7bFSxST2xYDLDzNH1uLweOLrKXDvey0/kZ0hpjH9dVj4CJTWjNlKnXATsevbQKzmD0iOgQ22rKSR8w1hEGsYBfhEaTP+QxVnZ5S8HWKdVjeVxmDpDWjkp+fmlnKzCFdmGHrkukwwQB1R9Yag6ThB6yl+8BirYupm2swlbo7P5Qr+ss196+vAg1OL+WkPO3Y9rH/FI1PsRQRaFgITE6FbeU97nHjvXPwqgNbcqAzKbjihqWpqAH4qcT7lhSw==\n-----END CERTIFICATE-----',
};

class MockWebLineDev extends EventTarget {}
const mockedLineDev = new MockWebLineDev();
const mockedHttpServers: https.Server[] = [];

let spyConnect: jest.SpyInstance;
let spyDisconnect: jest.SpyInstance;

const httpCadOut = new HttpCadOut(mockedLineDev as WebLineDev);
beforeAll(() => {
  // create and start all https servers
  webCfg.psapConfig.cadrouters.forEach((item) => {
    const server: https.Server = https.createServer(
      secureContextOptions,
      (req: IncomingMessage, res: ServerResponse) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.write('Success');
        res.end();
      }
    );

    server.listen(item.port);

    mockedHttpServers.push(server);
  });
});

afterAll(() => {
  mockedHttpServers.forEach((server) => server.close());
});

beforeEach(() => {
  spyConnect = jest.spyOn(httpCadOut, 'sendCadConnect');
  spyDisconnect = jest.spyOn(httpCadOut, 'sendCadDisconnect');
});

afterEach(() => {
  spyConnect.mockClear();
  spyDisconnect.mockClear();
});

describe('test with remote CadRouter servers', () => {
  test('sendCadConnect', async () => {
    const uniqueCallId = '911032-20201108093000-0567';
    const trunk = '911002';
    const ali = 'blablabla';

    return expect(httpCadOut.sendCadConnect(uniqueCallId, trunk, ali)).resolves.not.toThrow();
  });

  test('sendCadDisconnect', async () => {
    const uniqueCallId = '911032-20201108093000-0567';
    const trunk = '911002';

    return expect(httpCadOut.sendCadDisconnect(uniqueCallId, trunk)).resolves.not.toThrow();
  });

  test('manualAliDump', async () => {
    const rawAli = '<----------RAW ALI------------>';
    await httpCadOut.manualAliDump(rawAli);

    expect(spyConnect).toHaveBeenCalled();
  });
});

describe('test StateUpdate event', () => {
  const callHeader: CallHeader = new CallHeader();
  callHeader.id = 'sdfjlsdkjflsdjflsdajfsa';
  callHeader.trunkAddress = '911032';
  callHeader.phoneNumber = '5143452200';
  callHeader.localChannel = 'SIP/2010-007d';
  callHeader.remoteChannel = 'SIP/911032-007c';
  callHeader.potsSrvToConnect = 'pots-srv';
  const call: WebCall = new WebCall({} as WebLine, {} as WebNode, { callHeader });
  call.infoRec.trunkAddress = '911032';
  call.infoRec.uniqueCallId = '911032-00201-2020112123456';

  test('ALI was set', async () => {
    call.infoRec.callingPartyData = '1<---------ali--------->';

    // Connected
    const stateUpdate1: StateUpdate = new StateUpdate(CSSEventType.StateUpdate, call, CallState.Connected);
    stateUpdate1.oldState = CallState.Offered;
    stateUpdate1.newState = CallState.Connected;
    mockedLineDev.dispatchEvent(stateUpdate1);

    // wait for event processing
    await utils.sleep(1000);
    expect(spyConnect).toHaveBeenCalled();

    // Finished
    const stateUpdate2: StateUpdate = new StateUpdate(CSSEventType.StateUpdate, call, CallState.Disconnected);
    stateUpdate2.oldState = CallState.Unknown;
    stateUpdate2.newState = CallState.Finished;
    mockedLineDev.dispatchEvent(stateUpdate2);

    // wait for event processing
    await utils.sleep(1000);
    expect(spyDisconnect).toHaveBeenCalled();
  });

  test('ALI was not set', () => {
    call.infoRec.callingPartyData = '';

    // Connected
    const stateUpdate1: StateUpdate = new StateUpdate(CSSEventType.StateUpdate, call, CallState.Connected);
    stateUpdate1.oldState = CallState.Offered;
    stateUpdate1.newState = CallState.Connected;
    mockedLineDev.dispatchEvent(stateUpdate1);
    expect(spyConnect).not.toHaveBeenCalled();

    // Finished
    const stateUpdate2: StateUpdate = new StateUpdate(CSSEventType.StateUpdate, call, CallState.Disconnected);
    stateUpdate2.oldState = CallState.Unknown;
    stateUpdate2.newState = CallState.Finished;
    mockedLineDev.dispatchEvent(stateUpdate2);
    expect(spyDisconnect).not.toHaveBeenCalled();
  });
});

describe('test InformationUpdate event', () => {
  const line = new WebLine(mockedLineDev as WebLineDev, {} as LineConfig);
  const call: WebCall = new WebCall(line, {} as WebNode, {});
  call.infoRec.trunkAddress = '911032';
  call.infoRec.uniqueCallId = '911032-00201-2020112123456';

  test('ALI and Rebid', async () => {
    // simulate CallConnect (no ALI)
    call.infoRec.callingPartyData = '';
    const stateUpdate1: StateUpdate = new StateUpdate(CSSEventType.StateUpdate, call, CallState.Connected);
    stateUpdate1.oldState = CallState.Offered;
    stateUpdate1.newState = CallState.Connected;
    mockedLineDev.dispatchEvent(stateUpdate1);
    // not called because no ALI
    expect(spyConnect).not.toHaveBeenCalled();

    // 1st ALI
    call.infoRec.callingPartyData = '1<------1st--ali--------->';
    const informationUpdate1: InformationUpdate = new InformationUpdate(call);
    informationUpdate1.callingPartyData = true;
    mockedLineDev.dispatchEvent(informationUpdate1);

    await utils.sleep(100);
    expect(spyConnect).toHaveBeenCalled();

    // 2nd ALI
    call.infoRec.callingPartyData = '1<-------2nd--ali--------->';
    const informationUpdate2: InformationUpdate = new InformationUpdate(call);
    informationUpdate2.callingPartyData = true;
    mockedLineDev.dispatchEvent(informationUpdate2);

    await utils.sleep(100);
    expect(spyConnect).toHaveBeenCalledTimes(2);

    // same ALI
    call.infoRec.callingPartyData = '1<-------2nd--ali--------->';
    const informationUpdate3: InformationUpdate = new InformationUpdate(call);
    informationUpdate3.callingPartyData = true;
    mockedLineDev.dispatchEvent(informationUpdate3);

    await utils.sleep(100);
    // should not being invoked because ALI is same
    expect(spyConnect).toHaveBeenCalledTimes(2);

    // 3rd ALI
    call.infoRec.callingPartyData = '1<-------3rd--ali--------->';
    const informationUpdate4: InformationUpdate = new InformationUpdate(call);
    informationUpdate4.callingPartyData = true;
    informationUpdate4.cadSkipAliPhase1 = true;
    mockedLineDev.dispatchEvent(informationUpdate4);

    await utils.sleep(100);
    // should not being invoked because cadSkipAliPhase1 is set
    expect(spyConnect).toHaveBeenCalledTimes(2);

    // simulate CallFinished
    const stateUpdate2: StateUpdate = new StateUpdate(CSSEventType.StateUpdate, call, CallState.Disconnected);
    stateUpdate2.oldState = CallState.Unknown;
    stateUpdate2.newState = CallState.Finished;
    mockedLineDev.dispatchEvent(stateUpdate2);
    // called because ALI was set by PositionConnect
    await utils.sleep(100);
    expect(spyDisconnect).toHaveBeenCalled();
  }, 5000);

  test('2nd ALI', async () => {});
});

describe('automatic Ali Dump', () => {
  const line = new WebLine(mockedLineDev as WebLineDev, {} as LineConfig);
  const call: WebCall = new WebCall(line, {} as WebNode, {});
  call.infoRec.trunkAddress = '911032';
  call.infoRec.uniqueCallId = '911032-00201-2020112123456';

  test('automaticAliDump', async () => {
    // simulate outbound call
    call.infoRec.trunkAddress = 'SIP003';
    call.infoRec.uniqueCallId = 'SIP003-00201-2020112123456';

    const stateUpdate1: StateUpdate = new StateUpdate(CSSEventType.StateUpdate, call, CallState.Connected);
    stateUpdate1.oldState = CallState.Offered;
    stateUpdate1.newState = CallState.Connected;
    mockedLineDev.dispatchEvent(stateUpdate1);

    // set ali on the outbound call
    call.setCallInformation('2<-----automatic ali dump------->');
    await utils.sleep(1000);
    expect(spyConnect).toHaveBeenCalled();
  });
});
