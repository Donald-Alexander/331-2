import { WebViperDriver } from '@src/webviperdriver/webviperdriver';
import { WS } from 'jest-websocket-mock';
import * as ExtInterface from '../../../../telephony/src/telephonyexternalinterfacedef';

const server = new WS('ws://localhost:1234', { jsonProtocol: true });
const webViperDriver = new WebViperDriver();
const ctiHwListener = jest.fn();
const hcoListener = jest.fn();
const vcoListener = jest.fn();
const muteListener = jest.fn();
const handsetListener = jest.fn();
const radioModeListener = jest.fn();
const radioTransmitListener = jest.fn();
const agcListener = jest.fn();
const callTakerAgcListener = jest.fn();
const callTakerNRListener = jest.fn();

beforeAll(async (done) => {
  webViperDriver.addEventListener('CtiHardwareUpdate', ctiHwListener);
  webViperDriver.addEventListener('HcoModeChange', hcoListener);
  webViperDriver.addEventListener('VcoModeChange', vcoListener);
  webViperDriver.addEventListener('MuteChange', muteListener);
  webViperDriver.addEventListener('HandsetDetectChange', handsetListener);
  webViperDriver.addEventListener('RadioModeChange', radioModeListener);
  webViperDriver.addEventListener('RadioTransmitMode', radioTransmitListener);
  webViperDriver.addEventListener('AGCStatus', agcListener);
  webViperDriver.addEventListener('CallTakerAGCStatus', callTakerAgcListener);
  webViperDriver.addEventListener('CallTakerNRStatus', callTakerNRListener);
  webViperDriver.initialize('ws://localhost:1234', { WorkstationType: 'JestTest' });

  await server.connected;

  server.send({ __MESSAGE__: 'Socket is connected' });

  await expect(server).toReceiveMessage({ __CMD__: 'SetConfiguration', WorkstationType: 'JestTest' });

  server.send({ FromCmd: 'SetConfiguration', __MESSAGE__: '__RESPONSE__', cfgChange: 0, errCode: 0 });

  // Test reception of initial CtiHardwareUpdate Down
  expect(ctiHwListener).toBeCalledTimes(1);
  expect(ctiHwListener.mock.calls[0][0]).toBeInstanceOf(ExtInterface.CtiHardwareUpdate);
  const evtA = ctiHwListener.mock.calls[0][0] as ExtInterface.CtiHardwareUpdate;
  expect(evtA.status).toEqual(ExtInterface.CtiHardwareStatus.Down);

  await expect(server).toReceiveMessage({ __CMD__: 'ViperStartApplication' });
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 12, Dummy: 'H' });
  server.send({ __MESSAGE__: '__EVENT__', errCode: 0, msgID: 12 });
  await expect(server).toReceiveMessage({ __CMD__: 'ViperGetSystemInfo2' });
  server.send({
    AlarmCritical: 0,
    AlarmMajor: 0,
    AlarmMinor: 0,
    FromCmd: 'ViperGetSystemInfo2',
    NormalMode: 1,
    SwStarted: 1,
    __MESSAGE__: '__RESPONSE__',
  });

  await expect(server).toReceiveMessage({ __CMD__: 'ViperRtrvIOControl', IOControl: 5, Contact: 'T' });
  server.send({ Active: 0, Contact: 'T', FromCmd: 'ViperRtrvIOControl', IOControl: 5, __MESSAGE__: '__RESPONSE__' });

  await expect(server).toReceiveMessage({ __CMD__: 'ViperRtrvIOControl', IOControl: 49, Contact: 0 });
  server.send({ Active: 0, Contact: 0, FromCmd: 'ViperRtrvIOControl', IOControl: 49, __MESSAGE__: '__RESPONSE__' });

  await expect(server).toReceiveMessage({ __CMD__: 'ViperRtrvIOControl', IOControl: 50, Contact: 0 });
  server.send({ Active: 0, Contact: 0, FromCmd: 'ViperRtrvIOControl', IOControl: 50, __MESSAGE__: '__RESPONSE__' });

  await expect(server).toReceiveMessage({ __CMD__: 'ViperRtrvIOControl', IOControl: 3, Contact: 'M' });
  server.send({ Active: 0, Contact: 'M', FromCmd: 'ViperRtrvIOControl', IOControl: 3, __MESSAGE__: '__RESPONSE__' });

  await expect(server).toReceiveMessage({ __CMD__: 'ViperRtrvIOControl', IOControl: 4, Contact: 'M' });
  server.send({ Active: 0, Contact: 'M', FromCmd: 'ViperRtrvIOControl', IOControl: 4, __MESSAGE__: '__RESPONSE__' });

  await expect(server).toReceiveMessage({ __CMD__: 'ViperRtrvIOControl', IOControl: 8, Contact: 0 });
  server.send({ Active: 1, Contact: 0, FromCmd: 'ViperRtrvIOControl', IOControl: 8, __MESSAGE__: '__RESPONSE__' });

  await expect(server).toReceiveMessage({ __CMD__: 'ViperRtrvIOControl', IOControl: 41, Contact: 0 });
  server.send({ Active: 0, Contact: 0, FromCmd: 'ViperRtrvIOControl', IOControl: 41, __MESSAGE__: '__RESPONSE__' });

  await expect(server).toReceiveMessage({ __CMD__: 'ViperRtrvIOControl', IOControl: 45, Contact: 0 });
  server.send({ Active: 1, Contact: 0, FromCmd: 'ViperRtrvIOControl', IOControl: 45, __MESSAGE__: '__RESPONSE__' });

  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 24, Fnc: 3, EnaDis: 'd' });
  server.send({ MessageID: 4, RdCtrl: 1, __MESSAGE__: '__EVENT__', errCode: 0, msgID: 35 });

  await expect(server).toReceiveMessage({ __CMD__: 'ViperRtrvIOControl', IOControl: 51, Contact: 0 });
  server.send({ Active: 1, Contact: 0, FromCmd: 'ViperRtrvIOControl', IOControl: 51, __MESSAGE__: '__RESPONSE__' });

  done();
});

afterAll(async (done) => {
  webViperDriver.removeEventListener('CtiHardwareUpdate', ctiHwListener);
  webViperDriver.removeEventListener('HcoModeChange', hcoListener);
  webViperDriver.removeEventListener('VcoModeChange', vcoListener);
  webViperDriver.removeEventListener('MuteChange', muteListener);
  webViperDriver.removeEventListener('HandsetDetectChange', handsetListener);
  webViperDriver.removeEventListener('RadioModeChange', radioModeListener);
  webViperDriver.removeEventListener('RadioTransmitMode', radioTransmitListener);
  webViperDriver.removeEventListener('AGCStatus', agcListener);
  webViperDriver.removeEventListener('CallTakerAGCStatus', callTakerAgcListener);
  webViperDriver.removeEventListener('CallTakerNRStatus', callTakerNRListener);
  webViperDriver.terminate();
  server.close();

  // The WS class also has a static "clean" method to gracefully close all open connections,
  // particularly useful to reset the environment between test runs.
  WS.clean();

  done();
});

test('Test_WVD_Init', async (done) => {
  // Test reception of initial VCO Mode
  expect(vcoListener).toBeCalledTimes(1);
  expect(vcoListener.mock.calls[0][0]).toBeInstanceOf(ExtInterface.VcoModeChange);
  const evtA = hcoListener.mock.calls[0][0] as ExtInterface.VcoModeChange;
  expect(evtA.mode).toEqual(ExtInterface.VCOMode.VCOOn);

  // Test reception of initial HCO Mode
  expect(hcoListener).toBeCalledTimes(1);
  expect(hcoListener.mock.calls[0][0]).toBeInstanceOf(ExtInterface.HcoModeChange);
  const evtB = hcoListener.mock.calls[0][0] as ExtInterface.HcoModeChange;
  expect(evtB.mode).toEqual(ExtInterface.HCOMode.HCOOn);

  // Test reception of MuteChange
  expect(muteListener).toBeCalledTimes(2);
  expect(muteListener.mock.calls[0][0]).toBeInstanceOf(ExtInterface.MuteChange);
  const evtC = muteListener.mock.calls[0][0] as ExtInterface.MuteChange;
  expect(evtC.state).toEqual(ExtInterface.MuteState.MuteOff);
  expect(evtC.handset).toEqual(ExtInterface.HandsetType.HandsetAgent);
  const evtD = muteListener.mock.calls[1][0] as ExtInterface.MuteChange;
  expect(evtD.state).toEqual(ExtInterface.MuteState.MuteOff);
  expect(evtD.handset).toEqual(ExtInterface.HandsetType.HandsetTrainer);

  // Test reception of initial Handset Detect
  expect(handsetListener).toBeCalledTimes(1);
  expect(handsetListener.mock.calls[0][0]).toBeInstanceOf(ExtInterface.HandsetDetectChange);
  const evtE = handsetListener.mock.calls[0][0] as ExtInterface.HandsetDetectChange;
  expect(evtE.state).toEqual(ExtInterface.HandsetDetectType.AtLeastOneConnected);

  // Test reception of initial Radio Mode
  expect(radioModeListener).toBeCalledTimes(2);
  expect(radioModeListener.mock.calls[0][0]).toBeInstanceOf(ExtInterface.RadioModeChange);
  const evtF = radioModeListener.mock.calls[0][0] as ExtInterface.RadioModeChange;
  expect(evtF.mode).toEqual(ExtInterface.RadioMode.Split);
  expect(radioModeListener.mock.calls[1][0]).toBeInstanceOf(ExtInterface.RadioModeChange);
  const evtG = radioModeListener.mock.calls[1][0] as ExtInterface.RadioModeChange;
  expect(evtG.mode).toEqual(ExtInterface.RadioMode.Combine);

  // Test reception of initial AGC status
  expect(agcListener).toBeCalledTimes(1);
  expect(agcListener.mock.calls[0][0]).toBeInstanceOf(ExtInterface.AGCStatus);
  const evtH = agcListener.mock.calls[0][0] as ExtInterface.AGCStatus;
  expect(evtH.status).toEqual(ExtInterface.AGCState.Enable);

  // Test reception of CtiHardwareUpdate Up
  expect(ctiHwListener).toBeCalledTimes(2);
  expect(ctiHwListener.mock.calls[1][0]).toBeInstanceOf(ExtInterface.CtiHardwareUpdate);
  const evtZ = ctiHwListener.mock.calls[1][0] as ExtInterface.CtiHardwareUpdate;
  expect(evtZ.status).toEqual(ExtInterface.CtiHardwareStatus.Up);

  done();
});

test('Test_WVD_Mute', async (done) => {
  // Test Agent Mute On
  let mockCount = muteListener.mock.calls.length;
  webViperDriver.muteHandset(ExtInterface.HandsetType.HandsetAgent, ExtInterface.MuteState.MuteOn);
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 20, Ctrl: 'M', EnaDis: 'e', Hd: 'A' });
  server.send({ Ctrl: 'M', EnaDis: 'e', Hd: 'A', __MESSAGE__: '__EVENT__', errCode: 0, msgID: 20 });

  expect(muteListener).toBeCalledTimes(mockCount + 1);
  expect(muteListener.mock.calls[mockCount][0]).toBeInstanceOf(ExtInterface.MuteChange);
  const evtA = muteListener.mock.calls[mockCount][0] as ExtInterface.MuteChange;
  expect(evtA.state).toEqual(ExtInterface.MuteState.MuteOn);
  expect(evtA.handset).toEqual(ExtInterface.HandsetType.HandsetAgent);

  // Test Agent Mute Off
  webViperDriver.muteHandset(ExtInterface.HandsetType.HandsetAgent, ExtInterface.MuteState.MuteOff);
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 20, Ctrl: 'M', EnaDis: 'd', Hd: 'A' });
  server.send({ Ctrl: 'M', EnaDis: 'd', Hd: 'A', __MESSAGE__: '__EVENT__', errCode: 0, msgID: 20 });

  expect(muteListener).toBeCalledTimes(mockCount + 2);
  expect(muteListener.mock.calls[mockCount + 1][0]).toBeInstanceOf(ExtInterface.MuteChange);
  const evtB = muteListener.mock.calls[mockCount + 1][0] as ExtInterface.MuteChange;
  expect(evtB.state).toEqual(ExtInterface.MuteState.MuteOff);
  expect(evtB.handset).toEqual(ExtInterface.HandsetType.HandsetAgent);

  // Test Trainer Mute On
  webViperDriver.muteHandset(ExtInterface.HandsetType.HandsetTrainer, ExtInterface.MuteState.MuteOn);
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 20, Ctrl: 'M', EnaDis: 'e', Hd: 'T' });
  server.send({ Ctrl: 'M', EnaDis: 'e', Hd: 'T', __MESSAGE__: '__EVENT__', errCode: 0, msgID: 20 });

  expect(muteListener).toBeCalledTimes(mockCount + 3);
  expect(muteListener.mock.calls[mockCount + 2][0]).toBeInstanceOf(ExtInterface.MuteChange);
  const evtC = muteListener.mock.calls[mockCount + 2][0] as ExtInterface.MuteChange;
  expect(evtC.state).toEqual(ExtInterface.MuteState.MuteOn);
  expect(evtC.handset).toEqual(ExtInterface.HandsetType.HandsetTrainer);

  // Test Trainer Mute Off
  webViperDriver.muteHandset(ExtInterface.HandsetType.HandsetTrainer, ExtInterface.MuteState.MuteOff);
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 20, Ctrl: 'M', EnaDis: 'd', Hd: 'T' });
  server.send({ Ctrl: 'M', EnaDis: 'd', Hd: 'T', __MESSAGE__: '__EVENT__', errCode: 0, msgID: 20 });

  expect(muteListener).toBeCalledTimes(mockCount + 4);
  expect(muteListener.mock.calls[mockCount + 3][0]).toBeInstanceOf(ExtInterface.MuteChange);
  const evtD = muteListener.mock.calls[mockCount + 3][0] as ExtInterface.MuteChange;
  expect(evtD.state).toEqual(ExtInterface.MuteState.MuteOff);
  expect(evtD.handset).toEqual(ExtInterface.HandsetType.HandsetTrainer);

  done();
});

test('Test_WVD_RadioModeAndPTT', async (done) => {
  // Set to combine
  if (!webViperDriver.radioCombined()) {
    let modeMockCount = radioModeListener.mock.calls.length;
    // Force to combine
    webViperDriver.setRadioMode(ExtInterface.RadioMode.Combine);
    await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 24, Fnc: 3, EnaDis: 'd' });
    server.send({ MessageID: 4, RdCtrl: 1, __MESSAGE__: '__EVENT__', errCode: 0, msgID: 35 });

    expect(radioModeListener).toBeCalledTimes(modeMockCount + 1);
    expect(radioModeListener.mock.calls[modeMockCount][0]).toBeInstanceOf(ExtInterface.RadioModeChange);
    const evtA = radioModeListener.mock.calls[modeMockCount][0] as ExtInterface.RadioModeChange;
    expect(evtA.mode).toEqual(ExtInterface.RadioMode.Combine);
  }

  // Test PTT On
  let txMockCount = radioTransmitListener.mock.calls.length;
  webViperDriver.pttHandset(ExtInterface.PttState.PttOn);
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 20, Ctrl: 'P', EnaDis: 'e', Hd: 'B' });
  server.send({ MessageID: 1, RdCtrl: 1, __MESSAGE__: '__EVENT__', errCode: 0, msgID: 35 });

  expect(radioTransmitListener).toBeCalledTimes(txMockCount + 1);
  expect(radioTransmitListener.mock.calls[txMockCount][0]).toBeInstanceOf(ExtInterface.RadioTransmitMode);
  const evtB = radioTransmitListener.mock.calls[txMockCount][0] as ExtInterface.RadioTransmitMode;
  expect(evtB.status).toEqual(ExtInterface.RadioStatus.Enable);

  // Test PTT Off
  txMockCount = radioTransmitListener.mock.calls.length;
  webViperDriver.pttHandset(ExtInterface.PttState.PttOff);
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 20, Ctrl: 'P', EnaDis: 'd', Hd: 'B' });
  server.send({ MessageID: 1, RdCtrl: 2, __MESSAGE__: '__EVENT__', errCode: 0, msgID: 35 });

  expect(radioTransmitListener).toBeCalledTimes(txMockCount + 1);
  expect(radioTransmitListener.mock.calls[txMockCount][0]).toBeInstanceOf(ExtInterface.RadioTransmitMode);
  const evtC = radioTransmitListener.mock.calls[txMockCount][0] as ExtInterface.RadioTransmitMode;
  expect(evtC.status).toEqual(ExtInterface.RadioStatus.Disable);

  // Test PTT On
  txMockCount = radioTransmitListener.mock.calls.length;
  webViperDriver.pttHandset(ExtInterface.PttState.PttOn);
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 20, Ctrl: 'P', EnaDis: 'e', Hd: 'B' });
  server.send({ MessageID: 1, RdCtrl: 1, __MESSAGE__: '__EVENT__', errCode: 0, msgID: 35 });

  expect(radioTransmitListener).toBeCalledTimes(txMockCount + 1);
  expect(radioTransmitListener.mock.calls[txMockCount][0]).toBeInstanceOf(ExtInterface.RadioTransmitMode);
  const evtD = radioTransmitListener.mock.calls[txMockCount][0] as ExtInterface.RadioTransmitMode;
  expect(evtD.status).toEqual(ExtInterface.RadioStatus.Enable);

  // Test Split with forced PTT Off
  let modeMockCount = radioModeListener.mock.calls.length;
  txMockCount = radioTransmitListener.mock.calls.length;
  webViperDriver.setRadioMode(ExtInterface.RadioMode.Split);
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 24, Fnc: 3, EnaDis: 'e' });
  server.send({ MessageID: 4, RdCtrl: 2, __MESSAGE__: '__EVENT__', errCode: 0, msgID: 35 });

  expect(radioModeListener).toBeCalledTimes(modeMockCount + 1);
  expect(radioModeListener.mock.calls[modeMockCount][0]).toBeInstanceOf(ExtInterface.RadioModeChange);
  const evtF = radioModeListener.mock.calls[modeMockCount][0] as ExtInterface.RadioModeChange;
  expect(evtF.mode).toEqual(ExtInterface.RadioMode.Split);

  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 20, Ctrl: 'P', EnaDis: 'd', Hd: 'B' });
  server.send({ MessageID: 1, RdCtrl: 2, __MESSAGE__: '__EVENT__', errCode: 0, msgID: 35 });

  expect(radioTransmitListener).toBeCalledTimes(txMockCount + 1);
  expect(radioTransmitListener.mock.calls[txMockCount][0]).toBeInstanceOf(ExtInterface.RadioTransmitMode);
  const evtG = radioTransmitListener.mock.calls[txMockCount][0] as ExtInterface.RadioTransmitMode;
  expect(evtG.status).toEqual(ExtInterface.RadioStatus.Disable);

  // Test Combine
  modeMockCount = radioModeListener.mock.calls.length;
  webViperDriver.setRadioMode(ExtInterface.RadioMode.Combine);
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 24, Fnc: 3, EnaDis: 'd' });
  server.send({ MessageID: 4, RdCtrl: 1, __MESSAGE__: '__EVENT__', errCode: 0, msgID: 35 });

  expect(radioModeListener).toBeCalledTimes(modeMockCount + 1);
  expect(radioModeListener.mock.calls[modeMockCount][0]).toBeInstanceOf(ExtInterface.RadioModeChange);
  const evtE = radioModeListener.mock.calls[modeMockCount][0] as ExtInterface.RadioModeChange;
  expect(evtE.mode).toEqual(ExtInterface.RadioMode.Combine);

  done();
});

test('Test_WVD_HandsetDetect', async (done) => {
  // Handsets and Radio detects OFF
  let handsetMockCount = handsetListener.mock.calls.length;
  server.send({ InputCtrl: 7, CtrlID: 1, OnOff: 2, __MESSAGE__: '__EVENT__', errCode: 0, msgID: 31 });
  server.send({ MessageID: 3, RdCtrl: 2, __MESSAGE__: '__EVENT__', errCode: 0, msgID: 35 });

  expect(handsetListener).toBeCalledTimes(handsetMockCount + 2);
  expect(handsetListener.mock.calls[handsetMockCount][0]).toBeInstanceOf(ExtInterface.HandsetDetectChange);
  const evtA = handsetListener.mock.calls[handsetMockCount][0] as ExtInterface.HandsetDetectChange;
  expect(evtA.state).toEqual(ExtInterface.HandsetDetectType.NoneConnected);

  // Handsets On and Radio detects OFF
  handsetMockCount = handsetListener.mock.calls.length;
  server.send({ InputCtrl: 7, CtrlID: 1, OnOff: 1, __MESSAGE__: '__EVENT__', errCode: 0, msgID: 31 });
  expect(handsetListener).toBeCalledTimes(handsetMockCount + 1);
  expect(handsetListener.mock.calls[handsetMockCount][0]).toBeInstanceOf(ExtInterface.HandsetDetectChange);
  const evtB = handsetListener.mock.calls[handsetMockCount][0] as ExtInterface.HandsetDetectChange;
  expect(evtB.state).toEqual(ExtInterface.HandsetDetectType.AtLeastOneConnected);
  server.send({ MessageID: 3, RdCtrl: 2, __MESSAGE__: '__EVENT__', errCode: 0, msgID: 35 });

  // Handsets and Radio detects OFF
  handsetMockCount = handsetListener.mock.calls.length;
  server.send({ InputCtrl: 7, CtrlID: 1, OnOff: 2, __MESSAGE__: '__EVENT__', errCode: 0, msgID: 31 });
  server.send({ MessageID: 3, RdCtrl: 2, __MESSAGE__: '__EVENT__', errCode: 0, msgID: 35 });

  expect(handsetListener).toBeCalledTimes(handsetMockCount + 2);
  expect(handsetListener.mock.calls[handsetMockCount][0]).toBeInstanceOf(ExtInterface.HandsetDetectChange);
  const evtC = handsetListener.mock.calls[handsetMockCount][0] as ExtInterface.HandsetDetectChange;
  expect(evtC.state).toEqual(ExtInterface.HandsetDetectType.NoneConnected);

  // Handsets Off and Radio detects On
  handsetMockCount = handsetListener.mock.calls.length;
  server.send({ InputCtrl: 7, CtrlID: 1, OnOff: 2, __MESSAGE__: '__EVENT__', errCode: 0, msgID: 31 });
  expect(handsetListener).toBeCalledTimes(handsetMockCount + 1);
  expect(handsetListener.mock.calls[handsetMockCount][0]).toBeInstanceOf(ExtInterface.HandsetDetectChange);
  const evtD = handsetListener.mock.calls[handsetMockCount][0] as ExtInterface.HandsetDetectChange;
  expect(evtD.state).toEqual(ExtInterface.HandsetDetectType.NoneConnected);
  handsetMockCount = handsetListener.mock.calls.length;
  server.send({ MessageID: 3, RdCtrl: 1, __MESSAGE__: '__EVENT__', errCode: 0, msgID: 35 });
  expect(handsetListener).toBeCalledTimes(handsetMockCount + 1);
  expect(handsetListener.mock.calls[handsetMockCount][0]).toBeInstanceOf(ExtInterface.HandsetDetectChange);
  const evtE = handsetListener.mock.calls[handsetMockCount][0] as ExtInterface.HandsetDetectChange;
  expect(evtE.state).toEqual(ExtInterface.HandsetDetectType.AtLeastOneConnected);

  // Handsets On and Radio detects On
  handsetMockCount = handsetListener.mock.calls.length;
  server.send({ InputCtrl: 7, CtrlID: 1, OnOff: 1, __MESSAGE__: '__EVENT__', errCode: 0, msgID: 31 });

  expect(handsetListener).toBeCalledTimes(handsetMockCount + 1);
  expect(handsetListener.mock.calls[handsetMockCount][0]).toBeInstanceOf(ExtInterface.HandsetDetectChange);
  const evtF = handsetListener.mock.calls[handsetMockCount][0] as ExtInterface.HandsetDetectChange;
  expect(evtF.state).toEqual(ExtInterface.HandsetDetectType.AtLeastOneConnected);

  done();
});

test('Test_WVD_DtmfDialingPart1', async (done) => {
  webViperDriver.autoDial('0');
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 25, CtrlID: 8, Action: 'w', Ch: 1, DTMF: '0' });
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 25, CtrlID: 8, Action: 'a', Ch: 1 });
  webViperDriver.autoDial('1');
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 25, CtrlID: 8, Action: 'w', Ch: 1, DTMF: '1' });
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 25, CtrlID: 8, Action: 'a', Ch: 1 });
  webViperDriver.autoDial('2');
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 25, CtrlID: 8, Action: 'w', Ch: 1, DTMF: '2' });
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 25, CtrlID: 8, Action: 'a', Ch: 1 });
  webViperDriver.autoDial('3');
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 25, CtrlID: 8, Action: 'w', Ch: 1, DTMF: '3' });
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 25, CtrlID: 8, Action: 'a', Ch: 1 });
  webViperDriver.autoDial('4');
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 25, CtrlID: 8, Action: 'w', Ch: 1, DTMF: '4' });
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 25, CtrlID: 8, Action: 'a', Ch: 1 });
  webViperDriver.autoDial('5');
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 25, CtrlID: 8, Action: 'w', Ch: 1, DTMF: '5' });
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 25, CtrlID: 8, Action: 'a', Ch: 1 });
  webViperDriver.autoDial('6');
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 25, CtrlID: 8, Action: 'w', Ch: 1, DTMF: '6' });
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 25, CtrlID: 8, Action: 'a', Ch: 1 });
  webViperDriver.autoDial('7');
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 25, CtrlID: 8, Action: 'w', Ch: 1, DTMF: '7' });
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 25, CtrlID: 8, Action: 'a', Ch: 1 });
  webViperDriver.autoDial('8');
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 25, CtrlID: 8, Action: 'w', Ch: 1, DTMF: '8' });
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 25, CtrlID: 8, Action: 'a', Ch: 1 });
  webViperDriver.autoDial('9');
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 25, CtrlID: 8, Action: 'w', Ch: 1, DTMF: '9' });
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 25, CtrlID: 8, Action: 'a', Ch: 1 });

  done();
});

test('Test_WVD_DtmfDialingPart2', async (done) => {
  webViperDriver.autoDial('A');
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 25, CtrlID: 8, Action: 'w', Ch: 1, DTMF: 'A' });
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 25, CtrlID: 8, Action: 'a', Ch: 1 });
  webViperDriver.autoDial('B');
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 25, CtrlID: 8, Action: 'w', Ch: 1, DTMF: 'B' });
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 25, CtrlID: 8, Action: 'a', Ch: 1 });
  webViperDriver.autoDial('C');
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 25, CtrlID: 8, Action: 'w', Ch: 1, DTMF: 'C' });
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 25, CtrlID: 8, Action: 'a', Ch: 1 });
  webViperDriver.autoDial('D');
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 25, CtrlID: 8, Action: 'w', Ch: 1, DTMF: 'D' });
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 25, CtrlID: 8, Action: 'a', Ch: 1 });
  webViperDriver.autoDial('#');
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 25, CtrlID: 8, Action: 'w', Ch: 1, DTMF: '#' });
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 25, CtrlID: 8, Action: 'a', Ch: 1 });
  webViperDriver.autoDial('*');
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 25, CtrlID: 8, Action: 'w', Ch: 1, DTMF: '*' });
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 25, CtrlID: 8, Action: 'a', Ch: 1 });

  webViperDriver.autoDial('12345');
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 25, CtrlID: 8, Action: 'w', Ch: 1, DTMF: '1' });
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 25, CtrlID: 8, Action: 'a', Ch: 1 });
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 25, CtrlID: 8, Action: 'w', Ch: 1, DTMF: '2' });
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 25, CtrlID: 8, Action: 'a', Ch: 1 });
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 25, CtrlID: 8, Action: 'w', Ch: 1, DTMF: '3' });
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 25, CtrlID: 8, Action: 'a', Ch: 1 });
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 25, CtrlID: 8, Action: 'w', Ch: 1, DTMF: '4' });
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 25, CtrlID: 8, Action: 'a', Ch: 1 });
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 25, CtrlID: 8, Action: 'w', Ch: 1, DTMF: '5' });
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 25, CtrlID: 8, Action: 'a', Ch: 1 });

  done();
});

test('Test_WVD_AGC', async (done) => {
  // Test AGC Off
  let agcMockCount = agcListener.mock.calls.length;
  webViperDriver.setAgc(ExtInterface.AGCState.Disable);
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 25, CtrlID: 11, Action: 'd', Ch: 1 });
  await expect(server).toReceiveMessage({ __CMD__: 'ViperRtrvIOControl', IOControl: 51, Contact: 0 });
  server.send({ Active: 0, Contact: 0, FromCmd: 'ViperRtrvIOControl', IOControl: 51, __MESSAGE__: '__RESPONSE__' });
  await new Promise((r) => setTimeout(r, 1));

  expect(agcListener).toBeCalledTimes(agcMockCount + 1);
  expect(agcListener.mock.calls[agcMockCount][0]).toBeInstanceOf(ExtInterface.AGCStatus);
  const evtA = agcListener.mock.calls[agcMockCount][0] as ExtInterface.AGCStatus;
  expect(evtA.status).toEqual(ExtInterface.AGCState.Disable);

  // Test AGC ON
  agcMockCount = agcListener.mock.calls.length;
  webViperDriver.setAgc(ExtInterface.AGCState.Enable);
  await expect(server).toReceiveMessage({ __CMD__: 'SendMsg', msgID: 25, CtrlID: 11, Action: 'e', Ch: 1 });
  await expect(server).toReceiveMessage({ __CMD__: 'ViperRtrvIOControl', IOControl: 51, Contact: 0 });
  server.send({ Active: 1, Contact: 0, FromCmd: 'ViperRtrvIOControl', IOControl: 51, __MESSAGE__: '__RESPONSE__' });
  await new Promise((r) => setTimeout(r, 1));

  expect(agcListener).toBeCalledTimes(agcMockCount + 1);
  expect(agcListener.mock.calls[agcMockCount][0]).toBeInstanceOf(ExtInterface.AGCStatus);
  const evtB = agcListener.mock.calls[agcMockCount][0] as ExtInterface.AGCStatus;
  expect(evtB.status).toEqual(ExtInterface.AGCState.Enable);

  done();
});

test('Test_WVD_CallTakerAGC', async (done) => {
  // Test CallTaker AGC Off
  let agcMockCount = callTakerAgcListener.mock.calls.length;
  webViperDriver.setCallTakerAgc(ExtInterface.AGCState.Disable);
  await expect(server).toReceiveMessage({
    __CMD__: 'SendMsg',
    msgID: 25,
    CtrlID: 12,
    DeviceDestination: 2,
    Action: 'd',
    Ch: 1,
  });
  server.send({ DSPDeviceID: 2, DSPMsgID: 1, DSPStatus: 2, __MESSAGE__: '__EVENT__', errCode: 0, msgID: 23 });

  expect(callTakerAgcListener).toBeCalledTimes(agcMockCount + 1);
  expect(callTakerAgcListener.mock.calls[agcMockCount][0]).toBeInstanceOf(ExtInterface.CallTakerAGCStatus);
  const evtA = callTakerAgcListener.mock.calls[agcMockCount][0] as ExtInterface.CallTakerAGCStatus;
  expect(evtA.status).toEqual(ExtInterface.AGCState.Disable);

  // Test CallTaker AGC ON
  agcMockCount = callTakerAgcListener.mock.calls.length;
  webViperDriver.setCallTakerAgc(ExtInterface.AGCState.Enable);
  await expect(server).toReceiveMessage({
    __CMD__: 'SendMsg',
    msgID: 25,
    CtrlID: 12,
    DeviceDestination: 2,
    Action: 'e',
    Ch: 1,
  });
  server.send({ DSPDeviceID: 2, DSPMsgID: 1, DSPStatus: 1, __MESSAGE__: '__EVENT__', errCode: 0, msgID: 23 });

  expect(callTakerAgcListener).toBeCalledTimes(agcMockCount + 1);
  expect(callTakerAgcListener.mock.calls[agcMockCount][0]).toBeInstanceOf(ExtInterface.CallTakerAGCStatus);
  const evtB = callTakerAgcListener.mock.calls[agcMockCount][0] as ExtInterface.CallTakerAGCStatus;
  expect(evtB.status).toEqual(ExtInterface.AGCState.Enable);

  // Test async CallTaker AGC Off
  agcMockCount = callTakerAgcListener.mock.calls.length;
  server.send({ DSPDeviceID: 2, DSPMsgID: 1, DSPStatus: 2, __MESSAGE__: '__EVENT__', errCode: 0, msgID: 23 });

  expect(callTakerAgcListener).toBeCalledTimes(agcMockCount + 1);
  expect(callTakerAgcListener.mock.calls[agcMockCount][0]).toBeInstanceOf(ExtInterface.CallTakerAGCStatus);
  const evtC = callTakerAgcListener.mock.calls[agcMockCount][0] as ExtInterface.CallTakerAGCStatus;
  expect(evtC.status).toEqual(ExtInterface.AGCState.Disable);

  done();
});

test('Test_WVD_CallTakerNR', async (done) => {
  // Test CallTaker NR Off
  let nrMockCount = callTakerNRListener.mock.calls.length;
  webViperDriver.setCallTakerNr(ExtInterface.NRState.Disable);
  await expect(server).toReceiveMessage({
    __CMD__: 'SendMsg',
    msgID: 25,
    CtrlID: 13,
    DeviceDestination: 2,
    Action: 'd',
    Ch: 1,
  });
  server.send({ DSPDeviceID: 2, DSPMsgID: 2, DSPStatus: 2, __MESSAGE__: '__EVENT__', errCode: 0, msgID: 23 });

  expect(callTakerNRListener).toBeCalledTimes(nrMockCount + 1);
  expect(callTakerNRListener.mock.calls[nrMockCount][0]).toBeInstanceOf(ExtInterface.CallTakerNRStatus);
  const evtA = callTakerNRListener.mock.calls[nrMockCount][0] as ExtInterface.CallTakerNRStatus;
  expect(evtA.status).toEqual(ExtInterface.NRState.Disable);

  // Test CallTaker AGC ON
  nrMockCount = callTakerNRListener.mock.calls.length;
  webViperDriver.setCallTakerNr(ExtInterface.NRState.Enable);
  await expect(server).toReceiveMessage({
    __CMD__: 'SendMsg',
    msgID: 25,
    CtrlID: 13,
    DeviceDestination: 2,
    Action: 'e',
    Ch: 1,
  });
  server.send({ DSPDeviceID: 2, DSPMsgID: 2, DSPStatus: 1, __MESSAGE__: '__EVENT__', errCode: 0, msgID: 23 });

  expect(callTakerNRListener).toBeCalledTimes(nrMockCount + 1);
  expect(callTakerNRListener.mock.calls[nrMockCount][0]).toBeInstanceOf(ExtInterface.CallTakerNRStatus);
  const evtB = callTakerNRListener.mock.calls[nrMockCount][0] as ExtInterface.CallTakerNRStatus;
  expect(evtB.status).toEqual(ExtInterface.NRState.Enable);

  // Test async CallTaker AGC Off
  nrMockCount = callTakerNRListener.mock.calls.length;
  server.send({ DSPDeviceID: 2, DSPMsgID: 2, DSPStatus: 2, __MESSAGE__: '__EVENT__', errCode: 0, msgID: 23 });

  expect(callTakerNRListener).toBeCalledTimes(nrMockCount + 1);
  expect(callTakerNRListener.mock.calls[nrMockCount][0]).toBeInstanceOf(ExtInterface.CallTakerNRStatus);
  const evtC = callTakerNRListener.mock.calls[nrMockCount][0] as ExtInterface.CallTakerNRStatus;
  expect(evtC.status).toEqual(ExtInterface.NRState.Disable);
  done();
});
