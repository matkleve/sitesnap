/**
 * FolderScanService — recursive directory scanning via File System Access API.
 *
 * Scans a FileSystemDirectoryHandle for supported image files and
 * reports progress as files are discovered.
 */

import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class FolderScanService {
  private static readonly SUPPORTED_IMAGE_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'image/tiff',
  ]);

  private static readonly SUPPORTED_EXTENSIONS = new Set([
    '.jpg',
    '.jpeg',
    '.png',
    '.webp',
    '.heic',
    '.heif',
    '.tiff',
    '.tif',
  ]);

  /** Whether the File System Access API is available (Chromium only). */
  readonly isSupported = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

  /**
   * Recursively scan a directory for image files.
   * Calls `onFileFound` for each discovered file so the caller can track progress.
   */
  async scanDirectory(
    dirHandle: FileSystemDirectoryHandle,
    onFileFound?: (file: File, count: number) => void,
  ): Promise<File[]> {
    const files: File[] = [];
    await this.walkDirectory(dirHandle, files, onFileFound);
    return files;
  }

  private async walkDirectory(
    dirHandle: FileSystemDirectoryHandle,
    files: File[],
    onFileFound?: (file: File, count: number) => void,
  ): Promise<void> {
    for await (const entry of (dirHandle as any).values()) {
      if (entry.kind === 'file') {
        const fileHandle = entry as FileSystemFileHandle;
        const file = await fileHandle.getFile();
        const ext = '.' + file.name.split('.').pop()?.toLowerCase();
        if (
          FolderScanService.SUPPORTED_IMAGE_TYPES.has(file.type) ||
          FolderScanService.SUPPORTED_EXTENSIONS.has(ext)
        ) {
          files.push(file);
          onFileFound?.(file, files.length);
        }
      } else if (entry.kind === 'directory') {
        await this.walkDirectory(entry as FileSystemDirectoryHandle, files, onFileFound);
      }
    }
  }
}
