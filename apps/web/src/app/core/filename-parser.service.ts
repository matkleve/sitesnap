/**
 * FilenameParserService — extracts address hints from image filenames.
 *
 * Simplified version of the planned FilenameLocationParser
 * (see folder-import.md §4.1). Rejects camera-generated filenames
 * and timestamps, then looks for European street-type suffixes.
 */

import { Injectable } from '@angular/core';

/** Camera-generated filename prefixes that carry no address information. */
const CAMERA_PREFIXES = /^(IMG|DSC|DCIM|P|PXL|MVIMG|PANO|VID|MOV|Screenshot)[\s_-]/i;

/** Timestamps like 20260311, 2026-03-11, 20260311_143022, etc. */
const TIMESTAMP_PATTERN = /^\d{4}[-_]?\d{2}[-_]?\d{2}([-_T]\d{2}[-_]?\d{2}[-_]?\d{2})?$/;

/**
 * European street type suffixes recognised for address extraction.
 * Matches in the middle or end of a token sequence.
 */
const STREET_SUFFIXES =
  /(?:stra(?:ß|ss)e|strasse|str\.?|gasse|weg|allee|platz|gässli|ring|damm|ufer|road|street|st\.?|avenue|ave\.?|drive|dr\.?|lane|ln\.?|boulevard|blvd\.?|court|ct\.?|way)\b/i;

@Injectable({ providedIn: 'root' })
export class FilenameParserService {
  /**
   * Attempts to extract an address hint from a filename.
   * Returns undefined for camera-generated filenames and timestamps.
   */
  extractAddress(filename: string): string | undefined {
    // Strip extension
    const base = filename.replace(/\.[^.]+$/, '');

    // Reject obvious camera-generated filenames
    if (CAMERA_PREFIXES.test(base)) return undefined;

    // Reject pure timestamps
    if (TIMESTAMP_PATTERN.test(base)) return undefined;

    // Normalise separators to spaces
    const normalised = base.replace(/[_-]+/g, ' ').trim();

    // Look for a street suffix pattern
    if (!STREET_SUFFIXES.test(normalised)) return undefined;

    // Clean up: collapse multiple spaces, trim
    const cleaned = normalised.replace(/\s+/g, ' ').trim();
    return cleaned || undefined;
  }
}
