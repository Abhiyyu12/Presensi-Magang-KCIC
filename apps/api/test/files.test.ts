import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { generateObjectKey, validateAndProcessImage } from '../src/modules/files/service.js';

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

describe('validateAndProcessImage — kompresi', () => {
  it('menurunkan resolusi foto besar ke sisi terpanjang 1280px dan hasilnya lebih kecil', async () => {
    const big = await sharp({
      create: { width: 3000, height: 2000, channels: 3, background: { r: 120, g: 140, b: 160 } },
    })
      .jpeg({ quality: 95 })
      .toBuffer();
    const processed = await validateAndProcessImage(big, 'image/jpeg');
    expect(processed.width).toBe(1280);
    expect(processed.height).toBe(853);
    expect(processed.mimeType).toBe('image/jpeg');
    expect(processed.sizeBytes).toBeLessThan(big.length);
  });

  it('tidak memperbesar foto yang sudah kecil', async () => {
    const small = await sharp({
      create: { width: 100, height: 80, channels: 3, background: { r: 40, g: 60, b: 80 } },
    })
      .jpeg()
      .toBuffer();
    const processed = await validateAndProcessImage(small, 'image/jpeg');
    expect(processed.width).toBe(100);
    expect(processed.height).toBe(80);
  });
});
