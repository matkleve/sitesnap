import { describe, expect, it } from 'vitest';
import {
  buildAwaitingDisambiguationJobPatch,
  mergeDisambiguationGroupPatch,
} from './upload-location-disambiguation-registration.helpers';
import type { UploadAddressCandidate, UploadDisambiguationGroup } from '../upload-manager.types';

const adminConflicts = [
  {
    field: 'city' as const,
    entries: [
      { level: 2, value: 'Wien', source: 'folder' as const, field: 'state' as const },
      { level: 1, value: 'Innsbruck', source: 'folder' as const, field: 'city' as const },
    ],
  },
];

function baseGroup(overrides: Partial<UploadDisambiguationGroup> = {}): UploadDisambiguationGroup {
  return {
    id: 'group-1',
    batchId: 'batch-1',
    queryKey: 'adminConflict|city|innsbruck,wien',
    folderDisplayPath: 'Innsbruck',
    titleAddress: 'Innsbruck',
    jobIds: ['job-a'],
    candidates: [{ id: 'c-1', addressLabel: 'Level 1: Innsbruck (city)', lat: 0, lng: 0 }],
    collapseStage: 'per_file',
    resolutionStatus: 'pending',
    resolutionGateOpen: true,
    disambiguationKind: 'admin_level_conflict',
    areaConflicts: adminConflicts,
    ...overrides,
  };
}

describe('mergeDisambiguationGroupPatch', () => {
  it('merges jobIds when a second job registers with the same admin conflict queryKey', () => {
    const merged = mergeDisambiguationGroupPatch(baseGroup(), {
      batchId: 'batch-1',
      queryKey: 'adminConflict|city|innsbruck,wien',
      folderDisplayPath: 'Innsbruck',
      titleAddress: 'Innsbruck',
      jobIds: ['job-b'],
      candidates: [],
      disambiguationKind: 'admin_level_conflict',
      areaConflicts: adminConflicts,
    });

    expect(merged.jobIds.sort()).toEqual(['job-a', 'job-b']);
    expect(merged.disambiguationKind).toBe('admin_level_conflict');
    expect(merged.areaConflicts).toEqual(adminConflicts);
  });

  it('deduplicates jobIds when the same job registers twice', () => {
    const merged = mergeDisambiguationGroupPatch(baseGroup(), {
      batchId: 'batch-1',
      queryKey: baseGroup().queryKey,
      folderDisplayPath: 'Innsbruck',
      titleAddress: 'Innsbruck',
      jobIds: ['job-a', 'job-b'],
      candidates: [],
    });

    expect(merged.jobIds.sort()).toEqual(['job-a', 'job-b']);
  });

  it('keeps existing candidates when the patch supplies an empty candidate list', () => {
    const merged = mergeDisambiguationGroupPatch(baseGroup(), {
      batchId: 'batch-1',
      queryKey: baseGroup().queryKey,
      folderDisplayPath: 'Innsbruck',
      titleAddress: 'Innsbruck',
      jobIds: ['job-b'],
      candidates: [],
    });

    expect(merged.candidates).toHaveLength(1);
    expect(merged.candidates[0]!.id).toBe('c-1');
  });

  it('preserves areaConflicts when the patch omits them', () => {
    const merged = mergeDisambiguationGroupPatch(baseGroup(), {
      batchId: 'batch-1',
      queryKey: baseGroup().queryKey,
      folderDisplayPath: 'Innsbruck',
      titleAddress: 'Innsbruck',
      jobIds: ['job-b'],
      candidates: [],
    });

    expect(merged.areaConflicts).toEqual(adminConflicts);
  });
});

// @see docs/audits/upload-process-analysis-2026-09-08/10-findings.md UP-07
describe('buildAwaitingDisambiguationJobPatch', () => {
  it('does not set issueKind — awaiting_disambiguation is a paused phase, not an issue', () => {
    const candidates: UploadAddressCandidate[] = [
      { id: 'c-1', addressLabel: 'Innsbruck', lat: 0, lng: 0 },
    ];

    const patch = buildAwaitingDisambiguationJobPatch(
      {
        batchId: 'batch-1',
        queryKey: 'geocode|innsbruck',
        folderDisplayPath: 'Innsbruck',
        titleAddress: 'Innsbruck',
        jobIds: ['job-a'],
        candidates,
      },
      'group-1',
    );

    expect(patch.issueKind).toBeUndefined();
    expect(patch.addressCandidates).toBe(candidates);
    expect(patch.disambiguationGroupId).toBe('group-1');
  });
});
