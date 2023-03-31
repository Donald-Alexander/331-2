/* eslint-disable import/first */
import { CallState, ListenJoinMonitoringMode } from '@src/telephonyexternalinterfacedef';
import ActiveCalls from '@src/webcall/activecalls';
import { CallOp } from '@src/webcall/callop';
import { WebCall } from '@src/webcall/webcall';
import { initiateForceConnect } from '@src/weblinedev/forceconnect/initiateForceConnect';
import { WebLineDev } from '@src/weblinedev/weblinedev';
import { INotifyInfos } from '@src/webphone/sip/client';

jest.mock('@src/webphone/sip/audio-context', () => {
  return jest.fn(() => {});
});
jest.mock('@src/webphone/interfaces/media', () => {
  return jest.fn(() => {});
});
jest.mock('@src/webphone/sip/session-media', () => {
  return jest.fn(() => {});
});
jest.mock('@src/webphone/interfaces/sip-msrp', () => {
  return jest.fn(() => {});
});
jest.mock('@src/config/webcfg');

describe('WebLineDev tests', () => {
  describe('ListenJoin API tests', () => {
    beforeEach(() => {
      // cleanup ActiveCalls array
      Array.from(ActiveCalls.get()).forEach((c) => ActiveCalls.remove(c));
    });

    test('listenJoin() allowed when no CallOp in progress', async () => {
      const lineDev = new WebLineDev({
        providedQlistTest: [],
        vccGwAddr: [],
        appSrvGwAddr: [],
        webRtcConfigData: [],
        configHandler: {},
      });
      const mockMonitor = jest.fn(() => {
        return Promise.resolve('test');
      });

      lineDev.ljMonitoring.monitor = mockMonitor;

      await lineDev.listenJoin(ListenJoinMonitoringMode.Listen, '2001');
      expect(mockMonitor.mock.calls.length).toBe(1);
    });

    test('listenJoin() blocked when restricted CallOps in progress', async () => {
      const lineDev = new WebLineDev({
        providedQlistTest: [],
        vccGwAddr: [],
        appSrvGwAddr: [],
        webRtcConfigData: [],
        configHandler: {},
      });
      const call = {} as WebCall;

      const blockedCallOps = Object.values(CallOp).filter(
        (v) => typeof v === 'string' && v !== CallOp.Cancelled
      ) as Array<CallOp>;

      const mockMonitor = jest.fn(() => {
        return Promise.resolve('test');
      });
      lineDev.ljMonitoring.monitor = mockMonitor;

      await blockedCallOps.reduce(async (promise, op) => {
        await promise;
        CallOp.start(call, op);
        await lineDev.listenJoin(ListenJoinMonitoringMode.Listen, '2001');
        CallOp.end(call);
      }, Promise.resolve());

      expect(mockMonitor.mock.calls.length).toBe(0);
    });

    test('listenJoin() allowed when allowed CallOps in progress', async () => {
      const lineDev = new WebLineDev({
        providedQlistTest: [],
        vccGwAddr: [],
        appSrvGwAddr: [],
        webRtcConfigData: [],
        configHandler: {},
      });
      const call = {} as WebCall;

      const blockedCallOps = [CallOp.Cancelled];

      const mockMonitor = jest.fn(() => {
        return Promise.resolve('test');
      });
      lineDev.ljMonitoring.monitor = mockMonitor;

      await blockedCallOps.reduce(async (promise, op) => {
        await promise;
        CallOp.start(call, op);
        await lineDev.listenJoin(ListenJoinMonitoringMode.Listen, '2001');
        CallOp.end(call);
      }, Promise.resolve());

      expect(mockMonitor.mock.calls.length).toBe(1);
    });

    test('listenJoin() allowed with other calls not in restricted state', async () => {
      const lineDev = new WebLineDev({
        providedQlistTest: [],
        vccGwAddr: [],
        appSrvGwAddr: [],
        webRtcConfigData: [],
        configHandler: {},
      });

      const allowedStates = Object.values(CallState).filter(
        (v) => typeof v === 'string' && !CallState.connected(v) && v !== CallState.IHold
      );

      const calls = allowedStates.map((state, index) => {
        return { state, webCallId: index } as WebCall;
      });
      const mockMonitor = jest.fn(() => {
        return Promise.resolve('test');
      });

      lineDev.ljMonitoring.monitor = mockMonitor;

      calls.forEach((call) => ActiveCalls.add(call));
      await lineDev.listenJoin(ListenJoinMonitoringMode.Listen, '2001');
      calls.forEach((call) => ActiveCalls.remove(call));

      expect(mockMonitor.mock.calls.length).toBe(1);
    });

    test('listenJoin() blocked with other calls in restricted state', async () => {
      const lineDev = new WebLineDev({
        providedQlistTest: [],
        vccGwAddr: [],
        appSrvGwAddr: [],
        webRtcConfigData: [],
        configHandler: {},
      });

      const blockedStates = Object.values(CallState).filter(
        (v) => typeof v === 'string' && (CallState.connected(v) || v === CallState.IHold)
      );

      await blockedStates
        .map((state, index) => {
          return { state, index };
        })
        .reduce(async (promise, { state, index }) => {
          await promise;
          const call = { state, webCallId: index } as WebCall;
          const mockMonitor = jest.fn(() => {
            return Promise.resolve('test');
          });
          lineDev.ljMonitoring.monitor = mockMonitor;
          ActiveCalls.add(call);
          await lineDev.listenJoin(ListenJoinMonitoringMode.Listen, '2001');
          ActiveCalls.remove(call);
          expect(mockMonitor.mock.calls.length).toBe(0);
        }, Promise.resolve());
    });

    test('listenJoin() blocks forceConnect', () => {
      const lineDev = new WebLineDev({
        providedQlistTest: [],
        vccGwAddr: [],
        appSrvGwAddr: [],
        webRtcConfigData: [],
        configHandler: {},
      });
      const call = {} as WebCall;
      let res = true;

      const mockMonitor = jest.fn(() => {
        res = initiateForceConnect.bind(lineDev)(call);
        return Promise.resolve('test');
      });

      lineDev.ljMonitoring.monitor = mockMonitor;
      lineDev.listenJoin(ListenJoinMonitoringMode.Listen, '2001');

      expect(mockMonitor.mock.calls.length).toBe(1);
      expect(res).toBe(false);
    });

    test('listenJoin() blocked when forceConnect in progress', () => {
      const lineDev = new WebLineDev({
        providedQlistTest: [],
        vccGwAddr: [],
        appSrvGwAddr: [],
        webRtcConfigData: [],
        configHandler: {},
      });
      const call = { webCallId: 1 } as WebCall;
      const mockMonitor = jest.fn(() => {
        return Promise.resolve('test');
      });

      lineDev.ljMonitoring.monitor = mockMonitor;

      const res = initiateForceConnect.bind(lineDev)(call);
      lineDev.listenJoin(ListenJoinMonitoringMode.Listen, '2001');

      expect(res).toBe(true);
      expect(mockMonitor.mock.calls.length).toBe(0);
    });

    test('listenJoinCancel() allowed when no CallOp in progress', async () => {
      const lineDev = new WebLineDev({
        providedQlistTest: [],
        vccGwAddr: [],
        appSrvGwAddr: [],
        webRtcConfigData: [],
        configHandler: {},
      });
      const mockCancel = jest.fn(() => {
        return Promise.resolve('test');
      });

      lineDev.ljMonitoring.cancel = mockCancel;

      await lineDev.listenJoinCancel();
      expect(mockCancel.mock.calls.length).toBe(1);
    });

    test('listenJoinCancel() blocked when CallOp in progress', async () => {
      const lineDev = new WebLineDev({
        providedQlistTest: [],
        vccGwAddr: [],
        appSrvGwAddr: [],
        webRtcConfigData: [],
        configHandler: {},
      });
      const call = {} as WebCall;
      const mockCancel = jest.fn(() => {
        return Promise.resolve('test');
      });

      lineDev.ljMonitoring.cancel = mockCancel;

      CallOp.start(call, CallOp.Answer);
      await lineDev.listenJoinCancel();
      CallOp.end(call);

      expect(mockCancel.mock.calls.length).toBe(0);
    });

    test('listenJoinCancel() blocks forceConnect', () => {
      const lineDev = new WebLineDev({
        providedQlistTest: [],
        vccGwAddr: [],
        appSrvGwAddr: [],
        webRtcConfigData: [],
        configHandler: {},
      });
      const call = {} as WebCall;
      let res = true;

      const mockCancel = jest.fn(() => {
        res = initiateForceConnect.bind(lineDev)(call);
        return Promise.resolve('test');
      });

      lineDev.ljMonitoring.cancel = mockCancel;
      lineDev.listenJoinCancel();

      expect(mockCancel.mock.calls.length).toBe(1);
      expect(res).toBe(false);
    });

    test('listenJoinCancel() blocked when forceConnect in progress', () => {
      const lineDev = new WebLineDev({
        providedQlistTest: [],
        vccGwAddr: [],
        appSrvGwAddr: [],
        webRtcConfigData: [],
        configHandler: {},
      });
      const call = { webCallId: 1 } as WebCall;
      const mockCancel = jest.fn(() => {
        return Promise.resolve('test');
      });

      lineDev.ljMonitoring.cancel = mockCancel;

      const res = initiateForceConnect.bind(lineDev)(call);
      lineDev.listenJoinCancel();

      expect(res).toBe(true);
      expect(mockCancel.mock.calls.length).toBe(0);
    });

    test('processSubsNotifyMessage x-viper-monitor connect() allowed when no CallOp in progress', async () => {
      const lineDev = new WebLineDev({
        providedQlistTest: [],
        vccGwAddr: [],
        appSrvGwAddr: [],
        webRtcConfigData: [],
        configHandler: {},
      });
      const infos: INotifyInfos = {
        event: 'x-viper-monitor',
        subscriptionState: 'active',
        body: '<?xml version = \'1.0\'?><div id="chanspy"><node>10.1.2.3</node><ListenJoinChannel>SIP/2001-abcd</ListenJoinChannel></div>',
        status: '200',
      };
      const mockConnect = jest.fn(() => {
        return Promise.resolve('test');
      });

      lineDev.ljMonitoring.connect = mockConnect;
      lineDev.webNodes.push({ nodeCfgEx: { proxyAddress: '10.1.2.3' } } as any);
      (lineDev as any).processSubsNotifyMessage(new CustomEvent('incSubsNotifyMsg', { detail: infos }));

      expect(mockConnect.mock.calls.length).toBe(1);
    });

    test('processSubsNotifyMessage x-viper-monitor connect() blocked when CallOp in progress', async () => {
      const lineDev = new WebLineDev({
        providedQlistTest: [],
        vccGwAddr: [],
        appSrvGwAddr: [],
        webRtcConfigData: [],
        configHandler: {},
      });
      const infos: INotifyInfos = {
        event: 'x-viper-monitor',
        subscriptionState: 'active',
        body: '<?xml version = \'1.0\'?><div id="chanspy"><node>10.1.2.3</node><ListenJoinChannel>SIP/2001-abcd</ListenJoinChannel></div>',
        status: '200',
      };
      const call = {} as WebCall;
      const mockConnect = jest.fn(() => {
        return Promise.resolve('test');
      });

      lineDev.ljMonitoring.connect = mockConnect;
      lineDev.webNodes.push({ nodeCfgEx: { proxyAddress: '10.1.2.3' } } as any);
      CallOp.start(call, CallOp.Answer);
      (lineDev as any).processSubsNotifyMessage(new CustomEvent('incSubsNotifyMsg', { detail: infos }));
      CallOp.end(call);

      expect(mockConnect.mock.calls.length).toBe(0);
    });

    test('processSubsNotifyMessage x-viper-monitor blocks forceConnect', () => {
      const lineDev = new WebLineDev({
        providedQlistTest: [],
        vccGwAddr: [],
        appSrvGwAddr: [],
        webRtcConfigData: [],
        configHandler: {},
      });
      const infos: INotifyInfos = {
        event: 'x-viper-monitor',
        subscriptionState: 'active',
        body: '<?xml version = \'1.0\'?><div id="chanspy"><node>10.1.2.3</node><ListenJoinChannel>SIP/2001-abcd</ListenJoinChannel></div>',
        status: '200',
      };
      const call = {} as WebCall;
      let res = true;

      const mockConnect = jest.fn(() => {
        res = initiateForceConnect.bind(lineDev)(call);
        return Promise.resolve('test');
      });

      lineDev.ljMonitoring.connect = mockConnect;
      lineDev.webNodes.push({ nodeCfgEx: { proxyAddress: '10.1.2.3' } } as any);
      (lineDev as any).processSubsNotifyMessage(new CustomEvent('incSubsNotifyMsg', { detail: infos }));

      expect(mockConnect.mock.calls.length).toBe(1);
      expect(res).toBe(false);
    });

    test('processSubsNotifyMessage x-viper-monitor blocked when forceConnect in progress', () => {
      const lineDev = new WebLineDev({
        providedQlistTest: [],
        vccGwAddr: [],
        appSrvGwAddr: [],
        webRtcConfigData: [],
        configHandler: {},
      });
      const infos: INotifyInfos = {
        event: 'x-viper-monitor',
        subscriptionState: 'active',
        body: '<?xml version = \'1.0\'?><div id="chanspy"><node>10.1.2.3</node><ListenJoinChannel>SIP/2001-abcd</ListenJoinChannel></div>',
        status: '200',
      };
      const call = { webCallId: 1 } as WebCall;
      const mockConnect = jest.fn(() => {
        return Promise.resolve('test');
      });

      lineDev.ljMonitoring.connect = mockConnect;

      const res = initiateForceConnect.bind(lineDev)(call);
      lineDev.webNodes.push({ nodeCfgEx: { proxyAddress: '10.1.2.3' } } as any);
      (lineDev as any).processSubsNotifyMessage(new CustomEvent('incSubsNotifyMsg', { detail: infos }));

      expect(res).toBe(true);
      expect(mockConnect.mock.calls.length).toBe(0);
    });
  });
});
