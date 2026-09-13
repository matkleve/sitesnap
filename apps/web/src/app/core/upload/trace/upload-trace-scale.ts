/**
 * Database-scale measurement for the upload pipeline.
 *
 * A full end-to-end run does not scale past a few thousand files (see the playbook for the
 * measured ceiling), so this tier measures the two costs that actually dominate a
 * company-sized upload, each against the real production code:
 *
 *  1. **Classification** — `resolveLayersForJob` + the local gate, i.e. exactly the work
 *     `classifyBatch` does synchronously, on the main thread, before a single byte is uploaded.
 *  2. **The job store** — `UploadJobStateService.updateJob` / `findJob`, whose cost depends on how
 *     many jobs the batch is holding.
 *
 * Paths are streamed by index, never materialised, so a million files cost bounded memory here
 * even though they would not in the app.
 *
 * @see docs/playbooks/upload-pipeline-trace.md § Database scale
 */

import { TestBed } from '@angular/core/testing';
import { resolveLayersForJob } from '../../location-path-parser/upload-search-object.layer-map';
import {
  deriveFolderDisplayPath,
  evaluateLocalResolution,
  type LocalResolutionGate,
} from '../location/upload-location-resolution.helpers';
import { UploadJobStateService } from '../support/upload-job-state.service';
import type { UploadJob } from '../upload-manager.types';
import { buildGeneratedScenario, type GeneratedNaming } from './upload-trace-generator';
import type { RealGeoData } from './upload-trace-harness';

const BYTES_PER_MB = 1024 * 1024;
const MS_PER_S = 1000;
const TOP_GROUPS = 8;

export type ClassifyOutcome = LocalResolutionGate | 'layer_conflict' | 'admin_conflict';

export interface ClassifyScaleResult {
  naming: GeneratedNaming;
  files: number;
  totalMs: number;
  msPerFile: number;
  /** Distinct grouping keys — one geocode per group, so this is the geocoder call ceiling. */
  distinctGroups: number;
  /** Groups that would open a resolver tray before any upload can start. */
  trayGroups: number;
  outcomes: Map<ClassifyOutcome, number>;
  /** Largest groups, biggest first — how much one geocode result covers. */
  largestGroups: { key: string; files: number }[];
  heapUsedMb: number;
}

function classifyKey(
  outcome: ClassifyOutcome,
  groupingKey: string,
  conflictKey: string | undefined,
): string {
  if (outcome === 'layer_conflict' || outcome === 'admin_conflict') {
    return `${outcome}|${conflictKey ?? groupingKey}`;
  }
  return groupingKey;
}

/**
 * Stream `files` generated paths through the real Search Object builder and local gate.
 *
 * Only counters are kept, so memory stays flat; the app itself keeps one `UploadJob` plus one
 * `File` handle per file, which is measured separately.
 */
export function measureClassifyAtScale(
  files: number,
  seed: number,
  geo: RealGeoData,
  naming: GeneratedNaming = 'camera',
): ClassifyScaleResult {
  const groupSizes = new Map<string, number>();
  const outcomes = new Map<ClassifyOutcome, number>();
  const trayKeys = new Set<string>();

  const started = performance.now();
  for (let index = 0; index < files; index += 1) {
    const scenario = buildGeneratedScenario(index, seed, naming);
    const leaf = scenario.relativePath.split('/').pop() ?? '';
    const layers = resolveLayersForJob(
      scenario.relativePath,
      leaf,
      geo,
      deriveFolderDisplayPath(scenario.relativePath),
    );
    const so = layers.searchObject;

    let outcome: ClassifyOutcome;
    let conflictKey: string | undefined;
    if (so.areaConflicts?.length) {
      outcome = 'admin_conflict';
      conflictKey = so.areaConflicts.map((conflict) => conflict.field).join(',');
    } else if (layers.packageConflict) {
      outcome = 'layer_conflict';
      conflictKey = layers.packageConflict.layerConflictQueryKey;
    } else {
      outcome = evaluateLocalResolution(so, null);
    }

    const key = classifyKey(outcome, so.groupingKey, conflictKey);
    groupSizes.set(key, (groupSizes.get(key) ?? 0) + 1);
    outcomes.set(outcome, (outcomes.get(outcome) ?? 0) + 1);
    if (outcome === 'layer_conflict' || outcome === 'admin_conflict' || outcome === 'branch_c') {
      trayKeys.add(key);
    }
  }
  const totalMs = performance.now() - started;

  const largestGroups = [...groupSizes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_GROUPS)
    .map(([key, count]) => ({ key, files: count }));

  return {
    naming,
    files,
    totalMs,
    msPerFile: totalMs / files,
    distinctGroups: groupSizes.size,
    trayGroups: trayKeys.size,
    outcomes,
    largestGroups,
    heapUsedMb: process.memoryUsage().heapUsed / BYTES_PER_MB,
  };
}

export interface JobStoreScaleSample {
  jobs: number;
  updateMs: number;
  findMs: number;
  /** Projected job-store time for a whole batch of this size, at `writesPerJob` writes each. */
  projectedSeconds: number;
}

/** Writes a job receives across one new-upload run (phase changes plus field patches). */
export const JOB_STORE_WRITES_PER_JOB = 15;
const JOB_STORE_SAMPLES = 200;

function buildSyntheticJobs(count: number): UploadJob[] {
  return Array.from({ length: count }, (_unused, index) => ({
    id: `scale-job-${index}`,
    batchId: 'scale-batch',
    file: new File([new Uint8Array(8)], `IMG_${index}.jpg`, { type: 'image/jpeg' }),
    phase: 'queued' as const,
    progress: 0,
    statusLabel: 'Queued',
    submittedAt: new Date(),
    mode: 'new' as const,
    relativePath: `AT/Wien/1090/Teststraße 1/IMG_${index}.jpg`,
  }));
}

/** Measure the real `UploadJobStateService` write/read cost as the batch grows. */
export function measureJobStoreAtScale(sizes: readonly number[]): JobStoreScaleSample[] {
  return sizes.map((jobs) => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [UploadJobStateService] });
    const jobState = TestBed.inject(UploadJobStateService);
    jobState.addJobs(buildSyntheticJobs(jobs));

    let started = performance.now();
    for (let sample = 0; sample < JOB_STORE_SAMPLES; sample += 1) {
      jobState.updateJob(`scale-job-${sample % jobs}`, { progress: sample });
    }
    const updateMs = (performance.now() - started) / JOB_STORE_SAMPLES;

    started = performance.now();
    for (let sample = 0; sample < JOB_STORE_SAMPLES; sample += 1) {
      jobState.findJob(`scale-job-${jobs - 1}`);
    }
    const findMs = (performance.now() - started) / JOB_STORE_SAMPLES;

    return {
      jobs,
      updateMs,
      findMs,
      projectedSeconds: (updateMs * jobs * JOB_STORE_WRITES_PER_JOB) / MS_PER_S,
    };
  });
}
