/**
 * UploadQueueService — FIFO concurrency control for uploads.
 *
 * Manages the concurrency cap (max 3 parallel) and tracks which
 * jobs are currently running through the pipeline.
 */

import { Injectable } from '@angular/core';

const MAX_CONCURRENT = 3;

@Injectable({ providedIn: 'root' })
export class UploadQueueService {
  /** IDs of jobs currently running through the pipeline. */
  private readonly runningIds = new Set<string>();

  /** How many slots are available for new jobs. */
  get availableSlots(): number {
    return Math.max(0, MAX_CONCURRENT - this.runningIds.size);
  }

  get runningCount(): number {
    return this.runningIds.size;
  }

  hasRunning(): boolean {
    return this.runningIds.size > 0;
  }

  isRunning(jobId: string): boolean {
    return this.runningIds.has(jobId);
  }

  markRunning(jobId: string): void {
    this.runningIds.add(jobId);
  }

  markDone(jobId: string): void {
    this.runningIds.delete(jobId);
  }

  clearAll(): void {
    this.runningIds.clear();
  }
}
