import { VccMsg } from '@src/vcc/VccMsg';

describe('VccMsg tests', () => {
  describe('Constructor tests', () => {
    test('Constructs empty object when no param given', () => {
      const msg = new VccMsg();

      expect(msg).toBeInstanceOf(VccMsg);
      expect(typeof msg).toBe('object');
      expect(msg).toEqual({});
    });

    test('Constructs copy object when param given', () => {
      const myObj: VccMsg = {
        req: {
          id: '123',
          method: 'POST',
          path: '/foo/bar',
          query: { this: 'that' },
          body: { here: 'there' },
        },
        node: 1,
      };
      const msg = new VccMsg(myObj);

      expect(msg).toBeInstanceOf(VccMsg);
      expect(typeof msg).toBe('object');
      expect(msg).toEqual(myObj);
    });
  });

  describe('Serialize tests', () => {
    test('serializes request with no query and no body', () => {
      const msg = new VccMsg({
        req: {
          id: '5678',
          method: 'POST',
          path: '/my/request/uri',
        },
      });
      const ser = msg.toString();

      expect(ser).toEqual('{"req":["5678","POST","/my/request/uri",{},{}]}');
    });

    test('serializes request with query and body', () => {
      const query = { hello: 'world', good: 'better' };
      const body = { this: 'that', foo: 'bar' };
      const msg = new VccMsg({
        req: {
          id: '5678',
          method: 'POST',
          path: '/my/request/uri',
          query,
          body,
        },
      });
      const ser = msg.toString();
      const des = JSON.parse(ser);

      expect(des.req).toEqual(['5678', 'POST', '/my/request/uri', query, body]);
    });

    test('serializes response with no body', () => {
      const msg = new VccMsg({
        res: {
          id: '5678',
          status: '404',
          reason: 'go away',
        },
      });
      const ser = msg.toString();

      expect(ser).toEqual('{"res":["5678","404","go away",{}]}');
    });

    test('serializes response with body', () => {
      const body = { this: 'that', foo: 'bar' };
      const msg = new VccMsg({
        res: {
          id: '5678',
          status: '404',
          reason: 'go away',
          body,
        },
      });
      const ser = msg.toString();
      const des = JSON.parse(ser);

      expect(des.res).toEqual(['5678', '404', 'go away', body]);
    });

    test('serializes event with no body', () => {
      const msg = new VccMsg({
        evt: {
          path: '/my/event/uri',
        },
      });
      const ser = msg.toString();

      expect(ser).toEqual('{"evt":["/my/event/uri",{},{}]}');
    });

    test('serializes event with query and body', () => {
      const query = { hello: 'world', param: '2' };
      const body = { this: 'that', foo: 'bar' };
      const msg = new VccMsg({
        evt: {
          path: '/my/event/uri',
          query,
          body,
        },
      });
      const ser = msg.toString();
      const des = JSON.parse(ser);

      expect(des.evt).toEqual(['/my/event/uri', query, body]);
    });

    test('serializes event with no query', () => {
      const body = { this: 'that', foo: 'bar' };
      const msg = new VccMsg({
        evt: {
          path: '/my/event/uri',
          body,
        },
      });
      const ser = msg.toString();
      const des = JSON.parse(ser);

      expect(des.evt).toEqual(['/my/event/uri', {}, body]);
    });

    test('serializes control with no body', () => {
      const msg = new VccMsg({
        ctl: {
          path: '/my/control/uri',
        },
      });
      const ser = msg.toString();

      expect(ser).toEqual('{"ctl":["/my/control/uri",{},{}]}');
    });

    test('serializes control with query and body', () => {
      const query = { hello: 'world', param: '2' };
      const body = { this: 'that', foo: 'bar' };
      const msg = new VccMsg({
        ctl: {
          path: '/my/control/uri',
          query,
          body,
        },
      });
      const ser = msg.toString();
      const des = JSON.parse(ser);

      expect(des.ctl).toEqual(['/my/control/uri', query, body]);
    });

    test('serializes event with no query', () => {
      const body = { this: 'that', foo: 'bar' };
      const msg = new VccMsg({
        ctl: {
          path: '/my/control/uri',
          body,
        },
      });
      const ser = msg.toString();
      const des = JSON.parse(ser);

      expect(des.ctl).toEqual(['/my/control/uri', {}, body]);
    });
  });

  describe('Deserialize tests', () => {
    test('deserializes request with no query and no body', () => {
      const ser = '{"req":["5678","POST","/my/request/uri",{},{}]}';
      const msg = VccMsg.parse(ser);

      expect(msg).toBeInstanceOf(VccMsg);
      expect(typeof msg.req).toBe('object');
      expect(msg.req?.id).toEqual('5678');
      expect(msg.req?.method).toEqual('POST');
      expect(msg.req?.path).toEqual('/my/request/uri');
      expect(msg.req?.query).toEqual({});
      expect(msg.req?.body).toEqual({});
    });

    test('deserializes request with query and body', () => {
      const ser = '{"req":["5678","POST","/my/request/uri",{"q1":"v1","q2":"v2"},{"this":"that","foo":"bar"}]}';
      const msg = VccMsg.parse(ser);

      expect(typeof msg.req).toBe('object');
      expect(msg.req?.id).toEqual('5678');
      expect(msg.req?.method).toEqual('POST');
      expect(msg.req?.path).toEqual('/my/request/uri');
      expect(msg.req?.query).toEqual({ q1: 'v1', q2: 'v2' });
      expect(msg.req?.body).toEqual({ this: 'that', foo: 'bar' });
    });

    test('deserializes response with no headers and no body', () => {
      const ser = '{"res":["234567","404","Not Found",{}]}';
      const msg = VccMsg.parse(ser);

      expect(msg).toBeInstanceOf(VccMsg);
      expect(typeof msg.res).toBe('object');
      expect(msg.res?.id).toEqual('234567');
      expect(msg.res?.status).toEqual('404');
      expect(msg.res?.reason).toEqual('Not Found');
      expect(msg.res?.body).toEqual({});
    });

    test('deserializes response with body', () => {
      const ser = '{"res":["234567","404","Go away",{"q1":"v1","q2":"v2"}]}';
      const msg = VccMsg.parse(ser);

      expect(msg).toBeInstanceOf(VccMsg);
      expect(typeof msg.res).toBe('object');
      expect(msg.res?.id).toEqual('234567');
      expect(msg.res?.status).toEqual('404');
      expect(msg.res?.reason).toEqual('Go away');
      expect(msg.res?.body).toEqual({ q1: 'v1', q2: 'v2' });
    });

    test('deserializes event with no query and no body', () => {
      const ser = '{"evt":["/my/event/uri",{},{}]}';
      const msg = VccMsg.parse(ser);

      expect(msg).toBeInstanceOf(VccMsg);
      expect(typeof msg.evt).toBe('object');
      expect(msg.evt?.path).toEqual('/my/event/uri');
      expect(msg.evt?.query).toEqual({});
      expect(msg.evt?.body).toEqual({});
    });

    test('deserializes event with query and body', () => {
      const ser = '{"evt":["/my/event/uri",{"src":"from","dst":"to"},{"this":"that","foo":"bar"}]}';
      const msg = VccMsg.parse(ser);

      expect(msg).toBeInstanceOf(VccMsg);
      expect(typeof msg.evt).toBe('object');
      expect(msg.evt?.path).toEqual('/my/event/uri');
      expect(msg.evt?.query).toEqual({ src: 'from', dst: 'to' });
      expect(msg.evt?.body).toEqual({ this: 'that', foo: 'bar' });
    });

    test('deserializes control with no query and no body', () => {
      const ser = '{"ctl":["/my/control/uri",{},{}]}';
      const msg = VccMsg.parse(ser);

      expect(msg).toBeInstanceOf(VccMsg);
      expect(typeof msg.ctl).toBe('object');
      expect(msg.ctl?.path).toEqual('/my/control/uri');
      expect(msg.ctl?.query).toEqual({});
      expect(msg.ctl?.body).toEqual({});
    });

    test('deserializes control with query and body', () => {
      const ser = '{"ctl":["/my/control/uri",{"src":"from","dst":"to"},{"this":"that","foo":"bar"}]}';
      const msg = VccMsg.parse(ser);

      expect(msg).toBeInstanceOf(VccMsg);
      expect(typeof msg.ctl).toBe('object');
      expect(msg.ctl?.path).toEqual('/my/control/uri');
      expect(msg.ctl?.query).toEqual({ src: 'from', dst: 'to' });
      expect(msg.ctl?.body).toEqual({ this: 'that', foo: 'bar' });
    });
  });
});
