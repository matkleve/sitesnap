import { describe, it, expect } from 'vitest';
import { computeContentHash, readFileHead, ContentHashInput } from './content-hash.util';

/** Helper: create a minimal File from bytes. */
function makeFile(bytes: Uint8Array, name = 'photo.jpg'): File {
  return new File([bytes as BlobPart], name, { type: 'image/jpeg' });
}

describe('readFileHead', () => {
  it('returns the full file when smaller than 64 KB', async () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    const file = makeFile(data);
    const head = await readFileHead(file);
    expect(new Uint8Array(head)).toEqual(data);
  });

  it('returns only the first 64 KB of a larger file', async () => {
    const data = new Uint8Array(128 * 1024).fill(0xab);
    const file = makeFile(data);
    const head = await readFileHead(file);
    expect(head.byteLength).toBe(64 * 1024);
  });
});

describe('computeContentHash', () => {
  const baseInput: ContentHashInput = {
    fileHeadBytes: new Uint8Array([10, 20, 30]).buffer,
    fileSize: 1024,
  };

  it('returns a 64-character hex string (SHA-256)', async () => {
    const hash = await computeContentHash(baseInput);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces identical hashes for identical inputs', async () => {
    const a = await computeContentHash(baseInput);
    const b = await computeContentHash({ ...baseInput });
    expect(a).toBe(b);
  });

  it('produces different hashes when file size differs', async () => {
    const a = await computeContentHash(baseInput);
    const b = await computeContentHash({ ...baseInput, fileSize: 2048 });
    expect(a).not.toBe(b);
  });

  it('produces different hashes when GPS coords differ', async () => {
    const a = await computeContentHash({
      ...baseInput,
      gpsCoords: { lat: 48.1, lng: 11.5 },
    });
    const b = await computeContentHash({
      ...baseInput,
      gpsCoords: { lat: 48.2, lng: 11.6 },
    });
    expect(a).not.toBe(b);
  });

  it('produces different hashes when capturedAt differs', async () => {
    const a = await computeContentHash({
      ...baseInput,
      capturedAt: '2026-01-01T12:00:00Z',
    });
    const b = await computeContentHash({
      ...baseInput,
      capturedAt: '2026-06-15T08:30:00Z',
    });
    expect(a).not.toBe(b);
  });

  it('produces different hashes when direction differs', async () => {
    const a = await computeContentHash({ ...baseInput, direction: 90 });
    const b = await computeContentHash({ ...baseInput, direction: 270 });
    expect(a).not.toBe(b);
  });

  it('handles missing optional fields gracefully', async () => {
    const hash = await computeContentHash({
      fileHeadBytes: new Uint8Array([1]).buffer,
      fileSize: 100,
    });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hashes differ between no-GPS and zero-GPS', async () => {
    const noGps = await computeContentHash(baseInput);
    const zeroGps = await computeContentHash({
      ...baseInput,
      gpsCoords: { lat: 0, lng: 0 },
    });
    expect(noGps).not.toBe(zeroGps);
  });
});
