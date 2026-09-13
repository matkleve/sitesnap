/**
 * Pure helpers for disambiguation group registration merge/patch.
 * @see upload-location-disambiguation-registration.service.ts
 */

import { pickCollapseStage } from './upload-location-resolution.helpers';
import type {
  UploadAddressCandidate,
  UploadDisambiguationGroup,
  UploadJob,
} from '../upload-manager.types';

export interface DisambiguationRegistrationInput {
  batchId: string;
  queryKey: string;
  folderDisplayPath: string;
  titleAddress: string;
  jobIds: string[];
  candidates: UploadAddressCandidate[];
  localityHint?: string;
  disambiguationKind?: UploadDisambiguationGroup['disambiguationKind'];
  trayStep?: UploadDisambiguationGroup['trayStep'];
  confirmedCity?: string | null;
  step1bGate?: UploadDisambiguationGroup['step1bGate'];
  projectCentroid?: UploadDisambiguationGroup['projectCentroid'];
  citySuggestions?: string[];
  houseNumberCandidates?: UploadAddressCandidate[];
  discriminatingField?: UploadDisambiguationGroup['discriminatingField'];
  collapseStage?: UploadDisambiguationGroup['collapseStage'];
  areaConflicts?: UploadDisambiguationGroup['areaConflicts'];
}

export function mergeDisambiguationGroupPatch(
  group: UploadDisambiguationGroup,
  input: DisambiguationRegistrationInput,
): UploadDisambiguationGroup {
  const jobIds = [...new Set([...group.jobIds, ...input.jobIds])];
  return {
    ...group,
    jobIds,
    candidates: input.candidates.length ? input.candidates : group.candidates,
    collapseStage:
      input.collapseStage ??
      pickCollapseStage(
        input.candidates.length ? input.candidates : group.candidates,
        jobIds.length,
      ),
    discriminatingField: input.discriminatingField ?? group.discriminatingField,
    disambiguationKind: input.disambiguationKind ?? group.disambiguationKind ?? 'geocode',
    trayStep: input.trayStep ?? group.trayStep,
    confirmedCity: input.confirmedCity ?? group.confirmedCity,
    step1bGate: input.step1bGate ?? group.step1bGate,
    projectCentroid: input.projectCentroid ?? group.projectCentroid,
    citySuggestions: input.citySuggestions ?? group.citySuggestions,
    houseNumberCandidates: input.houseNumberCandidates ?? group.houseNumberCandidates,
    areaConflicts: input.areaConflicts ?? group.areaConflicts,
  };
}

/**
 * Per-job patch when a job is parked waiting for the user to resolve a
 * disambiguation tray. Deliberately does not set `issueKind` —
 * `awaiting_disambiguation` is a paused phase, not an Issues-lane state
 * (`upload-phase.helpers.ts` `getLaneForJob`); the job only becomes an issue
 * if the tray flow later defers it into `missing_data` (a separate,
 * explicit `issueKind` write — see `upload-location-candidate-apply.service.ts`).
 * @see docs/audits/upload-process-analysis-2026-09-08/10-findings.md UP-07
 */
export function buildAwaitingDisambiguationJobPatch(
  input: DisambiguationRegistrationInput,
  groupId: string,
): Pick<
  UploadJob,
  | 'disambiguationGroupId'
  | 'resolutionStatus'
  | 'issueKind'
  | 'addressCandidates'
  | 'folderDisplayPath'
  | 'statusLabel'
> {
  return {
    disambiguationGroupId: groupId,
    resolutionStatus: 'pending',
    issueKind: undefined,
    addressCandidates: input.candidates,
    folderDisplayPath: input.folderDisplayPath,
    statusLabel: 'Choose address',
  };
}
