export function hasNonAscii(s: string): boolean {
  return /[^\u0000-\u007F]/.test(s);
}

export function replaceNonAscii(s: string): string {
  var result = '';
  for (let i = 0; i < s.length; i++) {
    result += s.charCodeAt(i) <= 127 ? s.charAt(i) : '?';
  }
  return result;
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function until(fn: { (): any; (): any; (): any }) {
  while (!fn()) {
    await sleep(0);
  }
}

export function getUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    var r = (Math.random() * 16) | 0,
      v = c == 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

  // return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) =>
  //   (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)
  // );
}
