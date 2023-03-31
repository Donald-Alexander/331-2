import { IWebSocket, VccWebSocket } from '@src/vcc/VccWebSocket';
import { VccMsg } from '@src/vcc/VccMsg';

describe('VccWebSocket tests', () => {
  test('Constructor registers callbacks with websocket', () => {
    const ws: IWebSocket = { send: () => {}, close: () => {} };
    const vccWS = new VccWebSocket(ws);

    expect(vccWS).toBeInstanceOf(VccWebSocket);
    expect(typeof ws.onmessage).toBe('function');
    expect(typeof ws.onclose).toBe('function');
    expect(typeof ws.onerror).toBe('function');
  });

  test('Serializes and sends Vcc message', () => {
    const ws: IWebSocket = { send: () => {}, close: () => {} };
    const vccWS = new VccWebSocket(ws);
    const reqMsg = {
      req: {
        id: '12334',
        method: 'GET',
        path: '/my/path',
        query: { p1: 'p1', p2: 'p2' },
        body: { b1: 'b1', b2: 'b2' },
      },
      node: 1,
    };

    ws.send = (msg) => {
      const parsed = VccMsg.parse(msg);

      expect(typeof msg).toBe('string');
      expect(parsed).toEqual(reqMsg);
    };

    vccWS.send(new VccMsg(reqMsg));
  });

  test('Deserializes and notifies on received Vcc message', () => {
    const ws: IWebSocket = { send: () => {}, close: () => {}, onmessage: () => {} };
    const vccWS = new VccWebSocket(ws);
    const resStr = '{"res":["12345","404","Not Found",{"foo":"bar"}],"node"="2"}';
    const resMsg = {
      res: {
        id: '12345',
        status: '404',
        reason: 'Not Found',
        body: { foo: 'bar' },
      },
      node: '2',
    };

    vccWS.onmessage = (msg) => {
      expect(msg).toBeInstanceOf(VccMsg);
      expect(msg).toEqual(resMsg);
    };

    expect(ws.onmessage).toBeDefined();
    if (ws.onmessage) {
      ws.onmessage(new MessageEvent('', { data: resStr }));
    }
  });
});
