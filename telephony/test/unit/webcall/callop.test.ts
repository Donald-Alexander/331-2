import { CallOp } from '@src/webcall/callop';

describe('CallOp tests', () => {
  test('returns undefined when key not found', () => {
    expect(CallOp.inProgress({ this: 'that' })).toBeUndefined();
  });

  test('returns op when set', () => {
    const key = { this: 'that' };
    CallOp.start(key, CallOp.Unhold);

    expect(CallOp.inProgress(key)).toBe(CallOp.Unhold);
    expect(CallOp.inProgress(key)).not.toBe(CallOp.Park);
  });

  test('finds op when many set', () => {
    const pairs = [
      { key: { this: 'that' }, op: CallOp.Answer },
      { key: { foo: 'bar' }, op: CallOp.Barge },
      { key: { hey: 'there' }, op: CallOp.Cancelled },
      { key: { hello: 'world' }, op: CallOp.Hold },
      { key: { a: 1234 }, op: CallOp.NextAcdCall },
      { key: { a: 1234 }, op: CallOp.Reject },
    ];

    pairs.forEach((p) => {
      CallOp.start(p.key, p.op);
    });
    expect(CallOp.inProgress(pairs[3].key)).toBe(pairs[3].op);
    pairs.forEach((p) => {
      expect(CallOp.inProgress(p.key)).toBe(p.op);
    });
  });

  test('removes op', () => {
    const pairs = [
      { key: { this: 'that' }, op: CallOp.Answer },
      { key: { foo: 'bar' }, op: CallOp.Barge },
      { key: { hey: 'there' }, op: CallOp.Cancelled },
      { key: { hello: 'world' }, op: CallOp.Hold },
      { key: { a: 1234 }, op: CallOp.NextAcdCall },
      { key: { a: 1234 }, op: CallOp.Reject },
    ];

    pairs.forEach((p) => {
      CallOp.start(p.key, p.op);
    });
    CallOp.end(pairs[1].key);
    CallOp.end(pairs[3].key);

    for (let indx = 0; indx < pairs.length; indx += 1) {
      if (indx === 1 || indx === 3) {
        expect(CallOp.inProgress(pairs[indx].key)).toBeUndefined();
      } else {
        expect(CallOp.inProgress(pairs[indx].key)).toBe(pairs[indx].op);
      }
    }
  });
});
