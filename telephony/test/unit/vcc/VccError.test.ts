import { VccError } from '@src/vcc/VccError';

describe('VccError tests', () => {
  test('Constructs object correctly', () => {
    const err = new VccError();
    expect(err).toBeInstanceOf(VccError);
    expect(err).toBeInstanceOf(Error);
    expect(err.err).toEqual('');
    expect(err.message).toEqual('');

    const err2 = new VccError('MyCustomErrCode', 'This is the message field');
    expect(err2).toBeInstanceOf(VccError);
    expect(err2).toBeInstanceOf(Error);
    expect(err2.err).toEqual('MyCustomErrCode');
    expect(err2.message).toEqual('This is the message field');
  });
});
