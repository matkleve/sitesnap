/**
 * Content hash utility for upload deduplication.
 *
 * Computes a SHA-256 hash from stable, content-intrinsic properties
 * of a photo file. The hash uniquely identifies a photo regardless of
 * filename changes or re-exports.
 *
 * Uses the Web Crypto API — no external dependencies.
 */

/** Size of the file head read for hashing (64 KB). */
const FILE_HEAD_SIZE = 64 * 1024;

export interface ContentHashInput {
  /** First 64 KB of raw file bytes (fast, avoids reading entire file). */
  fileHeadBytes: ArrayBuffer;
  /** File size in bytes (cheap discriminator). */
  fileSize: number;
  /** EXIF GPS coordinates if available. */
  gpsCoords?: { lat: number; lng: number };
  /** EXIF capture timestamp if available. */
  capturedAt?: string;
  /** Camera bearing / direction from EXIF (degrees). */
  direction?: number;
}

/**
 * Read the first 64 KB of a File as an ArrayBuffer.
 */
export async function readFileHead(file: File): Promise<ArrayBuffer> {
  const slice = file.slice(0, FILE_HEAD_SIZE);
  return slice.arrayBuffer();
}

/**
 * Concatenate multiple Uint8Arrays into a single ArrayBuffer.
 */
function concatBuffers(parts: Uint8Array[]): ArrayBuffer {
  let totalLength = 0;
  for (const part of parts) {
    totalLength += part.byteLength;
  }
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result.buffer;
}

/**
 * Compute a SHA-256 content hash from file head + metadata.
 *
 * The hash combines:
 * - First 64 KB of file bytes (captures JPEG header + EXIF + image start)
 * - File size (cheap discriminator)
 * - GPS coords, capture date, direction (EXIF metadata)
 *
 * Two genuinely different photos will almost certainly produce different hashes.
 * Uses the Web Crypto API (crypto.subtle.digest) — no dependencies.
 */
export async function computeContentHash(input: ContentHashInput): Promise<string> {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [
    new Uint8Array(input.fileHeadBytes),
    encoder.encode(`|size=${input.fileSize}`),
    encoder.encode(`|gps=${input.gpsCoords?.lat ?? ''},${input.gpsCoords?.lng ?? ''}`),
    encoder.encode(`|date=${input.capturedAt ?? ''}`),
    encoder.encode(`|dir=${input.direction ?? ''}`),
  ];
  const combined = concatBuffers(parts);
  const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
