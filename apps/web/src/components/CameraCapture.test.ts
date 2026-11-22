import { describe, expect, it } from 'vitest';
import { evidenceTargetSize } from './CameraCapture.js';

describe('evidenceTargetSize', () => {
  it('menurunkan foto besar ke sisi terpanjang 1280px dengan rasio tetap', () => {
    expect(evidenceTargetSize(3000, 2000)).toEqual({ width: 1280, height: 853 });
    expect(evidenceTargetSize(2000, 3000)).toEqual({ width: 853, height: 1280 });
    expect(evidenceTargetSize(500, 2000)).toEqual({ width: 320, height: 1280 });
  });

  it('tidak memperbesar frame yang sudah di bawah batas', () => {
    expect(evidenceTargetSize(640, 480)).toEqual({ width: 640, height: 480 });
    expect(evidenceTargetSize(1280, 720)).toEqual({ width: 1280, height: 720 });
  });
});
