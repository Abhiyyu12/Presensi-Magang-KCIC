import { describe, expect, it } from 'vitest';
import { generateObjectKey } from '../src/modules/files/service.js';

describe('generateObjectKey', () => {
  it('meletakkan bukti di folder username dengan nama file uuid', () => {
    const key = generateObjectKey('peserta1');
    expect(key).toMatch(/^peserta1\/[0-9a-f-]{36}\.jpg$/);
  });

  it('menerima semua bentuk username yang sah (titik, garis bawah, hubung)', () => {
    for (const username of ['abhi', 'dev-admin', 'bayu.pratama', 'uji_01']) {
      expect(generateObjectKey(username)).toMatch(new RegExp(`^${username}/[0-9a-f-]{36}\\.jpg$`));
    }
  });

  it('menolak username yang tidak aman sebagai folder (slash, spasi, titik di awal)', () => {
    for (const bad of ['ab/cd', 'ab cd', '.abc', '-abc', '']) {
      expect(() => generateObjectKey(bad)).toThrow();
    }
  });
});
