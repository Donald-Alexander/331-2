import * as utils from '@src/common/utils';

describe('string utils', () => {
  test('replaceNonAscii', () => {
    const s1 = 'Welcome to 加拿大, welcome to Canada';
    const s2 = utils.replaceNonAscii(s1);

    expect(utils.hasNonAscii(s1)).toBe(true);
    expect(utils.hasNonAscii(s2)).toBe(false);
    expect(s1.length === s2.length).toBe(true);
  });
});

describe('other utils', () => {
  test('sleep', async () => {
    const ms = 1500;

    const t1 = Date.now();
    await utils.sleep(ms);
    const t2 = Date.now();

    // the real sleep time is around ms
    expect(t2 - t1).toBeGreaterThanOrEqual(ms - 2);
    expect(t2 - t1).toBeLessThanOrEqual(ms + 2);
  }, 5000);
});
