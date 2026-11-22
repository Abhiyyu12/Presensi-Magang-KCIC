import { describe, expect, it } from 'vitest';
import { generateObjectKey } from '../src/modules/files/service.js';

describe('generateObjectKey', () => {
  it('meletakkan bukti di folder username/kategori dengan nama file uuid', () => {
    expect(generateObjectKey('peserta1', 'datang')).toMatch(/^peserta1\/datang\/[0-9a-f-]{36}\.jpg$/);
    expect(generateObjectKey('peserta1', 'pulang')).toMatch(/^peserta1\/pulang\/[0-9a-f-]{36}\.jpg$/);
    expect(generateObjectKey('abhi', 'izin')).toMatch(/^abhi\/izin\/[0-9a-f-]{36}\.jpg$/);
  });

  it('menerima semua bentuk username yang sah (titik, garis bawah, hubung)', () => {
    for (const username of ['abhi', 'dev-admin', 'bayu.pratama', 'uji_01']) {
      expect(generateObjectKey(username, 'datang')).toMatch(new RegExp(`^${username}/datang/[0-9a-f-]{36}\\.jpg$`));
    }
  });

  it('menolak username yang tidak aman sebagai folder (slash, spasi, titik di awal)', () => {
    for (const bad of ['ab/cd', 'ab cd', '.abc', '-abc', '']) {
      expect(() => generateObjectKey(bad, 'datang')).toThrow();
    }
  });
});
