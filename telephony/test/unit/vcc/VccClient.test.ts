import { VccClient } from '@src/vcc/VccClient';
import { VccMsg } from '@src/vcc/VccMsg';
import VccWebSocket from '@src/vcc/VccWebSocket';

describe('VccClient tests', () => {
  describe('Constructor tests', () => {
    test('Constructed object has correct default values', () => {
      const ws = new VccWebSocket({ send: () => {}, close: () => {} });
      const client = new VccClient(ws);

      expect(client).toBeInstanceOf(VccClient);
      expect(client.reqTimeout).toEqual(2000);
      expect(typeof client.reqIdBase).toBe('string');
      expect(client.reqIdSeq).toEqual(0);
    });

    test('Constructor registers callbacks with websocket', () => {
      const ws = new VccWebSocket({ send: () => {}, close: () => {} });
      const client = new VccClient(ws);

      expect(client).toBeInstanceOf(VccClient);
      expect(typeof ws.onmessage).toBe('function');
      expect(typeof ws.onclose).toBe('function');
    });
  });

  describe('nextReqId() tests', () => {
    test('produces a string', () => {
      const client = new VccClient(new VccWebSocket({ send: () => {}, close: () => {} }));
      const reqId1 = client.nextReqId();

      expect(typeof reqId1).toBe('string');
    });

    test('increases sequence number', () => {
      const client = new VccClient(new VccWebSocket({ send: () => {}, close: () => {} }));
      const seq1 = client.reqIdSeq;

      client.nextReqId();
      const seq2 = client.reqIdSeq;

      client.nextReqId();
      const seq3 = client.reqIdSeq;

      expect(seq2).toEqual(seq1 + 1);
      expect(seq3).toEqual(seq2 + 1);
    });

    test('produces a different string each time', () => {
      const client = new VccClient(new VccWebSocket({ send: () => {}, close: () => {} }));
      const reqId1 = client.nextReqId();
      const reqId2 = client.nextReqId();
      const reqId3 = client.nextReqId();

      expect(reqId1).not.toEqual(reqId2);
      expect(reqId1).not.toEqual(reqId3);
      expect(reqId2).not.toEqual(reqId3);
    });
  });

  describe('request() tests', () => {
    test('Rejects resource with no req property', () => {
      const client = new VccClient(new VccWebSocket({ send: () => {}, close: () => {} }));

      try {
        client.request(
          new VccMsg({ res: { id: '1', status: 'foo', reason: 'bar' }, evt: { path: 'a/b' }, node: 1 }),
          100
        );
        expect(false);
      } catch (e) {
        expect(true);
      }
    });

    test('Rejects resource with no req.path property', () => {
      const client = new VccClient(new VccWebSocket({ send: () => {}, close: () => {} }));

      try {
        const msg = new VccMsg({
          req: {
            path: 'oops',
            id: '123',
            method: 'GET',
            query: { this: 'that' },
            body: { hello: 'world' },
          },
          node: 1,
        });
        delete (msg.req as any).path;

        client.request(msg, 100);
        expect(false);
      } catch (e) {
        expect(true);
      }
    });

    test('Resolves promise on response from websocket', async () => {
      const ws = new VccWebSocket({ send: () => {}, close: () => {} });
      const client = new VccClient(ws);

      ws.send = (msg) => {
        setTimeout(() => {
          if (!ws.onmessage) {
            expect(false);
          } else {
            ws.onmessage(
              new VccMsg({
                res: {
                  id: msg.req?.id || 'bad',
                  status: '200',
                  reason: 'OK',
                  body: { foo: 'this is the response' },
                },
                node: msg.node,
              })
            );
          }
        }, 0);
      };

      await client.request(
        {
          req: {
            id: '1',
            method: 'GET',
            path: '/someApiPath',
            query: {},
            body: {},
          },
        },
        2000
      );
    });

    test('Fills in request ID when not provided', async () => {
      const ws = new VccWebSocket({ send: () => {}, close: () => {} });
      const tmp: any = {};
      const client = new VccClient(ws);

      ws.send = (msg) => {
        tmp.reqId = msg.req?.id;
        setTimeout(() => {
          if (!ws.onmessage) {
            expect(false);
          } else {
            ws.onmessage(
              new VccMsg({
                res: {
                  id: msg.req?.id || 'bad',
                  status: '200',
                  reason: 'OK',
                  body: { foo: 'this is the response' },
                },
                node: msg.node,
              })
            );
          }
        }, 0);
      };

      await client
        .request(
          {
            req: {
              path: '/someApiPath',
            },
          },
          2000
        )
        .then(() => expect(typeof tmp.reqId).toBe('string'));
    });

    test('Fills in method GET when not provided', async () => {
      const ws = new VccWebSocket({ send: () => {}, close: () => {} });
      const client = new VccClient(ws);
      const tmp: any = {};

      ws.send = (msg) => {
        tmp.reqMethod = msg.req?.method;
        setTimeout(() => {
          if (ws.onmessage) {
            ws.onmessage(
              new VccMsg({
                res: {
                  id: msg.req?.id || 'bad',
                  status: '200',
                  reason: 'OK',
                  body: { foo: 'this is the response' },
                },
                node: msg.node,
              })
            );
          }
        }, 0);
      };

      await client
        .request(
          {
            req: {
              id: '1',
              path: '/someApiPath',
            },
          },
          2000
        )
        .then(() => expect(tmp.reqMethod).toEqual('GET'));
    });

    test('Fills in method POST when not provided', async () => {
      const ws = new VccWebSocket({ send: () => {}, close: () => {} });
      const client = new VccClient(ws);
      const tmp: any = {};

      ws.send = (msg) => {
        tmp.reqMethod = msg.req?.method;
        setTimeout(() => {
          if (ws.onmessage) {
            ws.onmessage(
              new VccMsg({
                res: {
                  id: msg.req?.id || 'bad',
                  status: '200',
                  reason: 'OK',
                  body: { foo: 'this is the response' },
                },
                node: msg.node,
              })
            );
          }
        }, 0);
      };

      await client
        .request(
          {
            req: {
              id: '1',
              path: '/someApiPath',
              body: {},
            },
          },
          2000
        )
        .then(() => expect(tmp.reqMethod).toEqual('POST'));
    });

    test('Rejects promise at timeout when no response', async () => {
      const ws = new VccWebSocket({ send: () => {}, close: () => {} });
      const client = new VccClient(ws);

      await client
        .request(
          {
            req: {
              id: '1',
              path: '/someApiPath',
              body: {},
            },
          },
          1
        )
        .then(() => expect(false))
        .catch(() => expect(true));
    });
  });

  describe('event dispatch tests', () => {
    test('dispatches event to listener', async () => {
      const ws = new VccWebSocket({ send: () => {}, close: () => {} });
      const client = new VccClient(ws);

      const listener = jest.fn();
      client.addEventListener('my/test/event', listener);

      if (ws.onmessage) {
        ws.onmessage(
          new VccMsg({
            evt: {
              path: 'my/test/event',
              query: { this: 'that' },
              body: { hello: 'world' },
            },
          })
        );
      }

      expect(listener.mock.calls.length).toBe(1);
      expect(listener.mock.calls[0][0]).toBeInstanceOf(CustomEvent);
      const evt = listener.mock.calls[0][0] as CustomEvent;
      expect(evt.detail).toBeInstanceOf(VccMsg);
      expect(evt.detail).toEqual({
        evt: {
          path: 'my/test/event',
          query: { this: 'that' },
          body: { hello: 'world' },
        },
      });
    });
  });

  describe('control dispatch tests', () => {
    test('dispatches control message to control handler', async () => {
      const ws = new VccWebSocket({ send: () => {}, close: () => {} });
      const client = new VccClient(ws);

      const handler = jest.fn();
      client.oncontrol = handler;

      if (ws.onmessage) {
        ws.onmessage(
          new VccMsg({
            ctl: {
              path: 'my/test/control',
              query: { this: 'that' },
              body: { hello: 'world' },
            },
          })
        );
      }

      expect(handler.mock.calls.length).toBe(1);
      expect(handler.mock.calls[0][0]).toBeInstanceOf(VccMsg);
      const ctl = handler.mock.calls[0][0] as VccMsg;
      expect(ctl).toEqual({
        ctl: {
          path: 'my/test/control',
          query: { this: 'that' },
          body: { hello: 'world' },
        },
      });
    });
  });
});
