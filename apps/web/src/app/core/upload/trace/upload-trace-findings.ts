/**
 * Findings computed from a trace run — patterns worth a human's attention, derived from what
 * the pipeline actually did rather than from what the corpus intended.
 *
 * These are observations, not assertions. The harness prints them; it does not fail on them,
 * because some are correct-by-spec behaviour that is still surprising in the field.
 *
 * @see docs/playbooks/upload-pipeline-trace.md § Findings
 */

import type { UploadSearchObject } from '../address-resolution/upload-address-resolution.types';
import type { AreaFieldKey } from '../address-resolution/upload-area-evidence.types';
import type { UploadJob } from '../upload-manager.types';
import type { UploadTraceScenario } from './upload-trace-fixtures';

export interface TraceFinding {
  code: string;
  severity: 'high' | 'medium' | 'info';
  message: string;
  examples: string[];
}

const MAX_EXAMPLES = 6;
const FILENAME_LEVEL = 0;

function folderOf(relativePath: string): string {
  return relativePath.split('/').slice(0, -1).join('/');
}

const COMBINING_MARKS = /[\u0300-\u036f]/g;

function fold(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(COMBINING_MARKS, '');
}

export interface FindingInput {
  scenario: UploadTraceScenario;
  searchObject: UploadSearchObject;
  job: UploadJob | undefined;
}

/**
 * A file-name value outranked a folder value for the same admin field (level 0 wins) **and nobody
 * was asked**. A field listed in `areaConflicts` is excluded: there the contradiction is
 * recorded and a tray resolves it before geocode, which is the level map working as specified.
 * Only a silent override is a finding.
 */
function findFilenameOverrides(inputs: readonly FindingInput[]): TraceFinding | null {
  const hits: string[] = [];
  for (const { scenario, searchObject } of inputs) {
    const asked = new Set((searchObject.areaConflicts ?? []).map((conflict) => conflict.field));
    for (const [field, entries] of Object.entries(searchObject.areaEvidence ?? {})) {
      if (asked.has(field as AreaFieldKey)) {
        continue;
      }
      const list = entries ?? [];
      const fromFilename = list.find((entry) => entry.level === FILENAME_LEVEL);
      const fromFolder = list.find((entry) => entry.level > FILENAME_LEVEL);
      if (fromFilename && fromFolder && fromFilename.value !== fromFolder.value) {
        hits.push(`${scenario.id} ${field}: filename "${fromFilename.value}" won over folder "${fromFolder.value}"`);
      }
    }
  }
  return hits.length
    ? {
        code: 'SO-FILENAME-OVERRIDES-FOLDER',
        severity: 'high',
        message:
          'A file-name value was classified as an admin field and, being at level 0, replaced the ' +
          'folder value in the flat Search Object and the groupingKey — with no conflict recorded, ' +
          'so no tray asks.',
        examples: hits.slice(0, MAX_EXAMPLES),
      }
    : null;
}

/** Files in one folder that did not end up in one group — one geocode per file instead of per building. */
function findFolderSplits(inputs: readonly FindingInput[]): TraceFinding | null {
  const byFolder = new Map<string, Set<string>>();
  const sampleByFolder = new Map<string, string[]>();
  for (const { scenario, job } of inputs) {
    const folder = folderOf(scenario.relativePath);
    if (!folder || !job) {
      continue;
    }
    const keys = byFolder.get(folder) ?? new Set<string>();
    keys.add(job.groupingKey ?? '(none)');
    byFolder.set(folder, keys);
    sampleByFolder.set(folder, [...(sampleByFolder.get(folder) ?? []), scenario.id]);
  }
  const hits = [...byFolder.entries()]
    .filter(([, keys]) => keys.size > 1)
    .map(([folder, keys]) => `${folder} → ${keys.size} groups (${(sampleByFolder.get(folder) ?? []).join(',')})`);
  return hits.length
    ? {
        code: 'GROUP-SPLIT-WITHIN-FOLDER',
        severity: 'high',
        message:
          'Files sharing one folder landed in different groups, so the batch geocodes per file ' +
          'instead of once per building.',
        examples: hits.slice(0, MAX_EXAMPLES),
      }
    : null;
}

/** A city value that does not literally occur in the path — a fuzzy gazetteer substitution. */
function findFuzzyCities(inputs: readonly FindingInput[]): TraceFinding | null {
  const hits: string[] = [];
  for (const { scenario, searchObject } of inputs) {
    const city = searchObject.city?.trim();
    if (!city) {
      continue;
    }
    // A city looked up from a postcode is not a fuzzy match — the message says so, and until now
    // the check did not, which reported every PLZ expansion as a finding.
    const fromPostcodeExpansion = searchObject.sources.some(
      (entry) => entry.field === 'city' && searchObject.postcode != null && entry.value === city,
    );
    if (fromPostcodeExpansion && !fold(scenario.relativePath).includes(fold(city))) {
      continue;
    }
    if (!fold(scenario.relativePath).includes(fold(city))) {
      hits.push(`${scenario.id} city="${city}" is not a token in ${scenario.relativePath}`);
    }
  }
  return hits.length
    ? {
        code: 'SO-CITY-NOT-IN-PATH',
        severity: 'high',
        message:
          'The Search Object city was produced by a fuzzy gazetteer match, not by a token in the ' +
          'path (postcode expansion excluded — those cities are looked up, not matched).',
        examples: hits.slice(0, MAX_EXAMPLES),
      }
    : null;
}

/** A path with folder segments that produced no address field at all. */
function findEmptySearchObjects(inputs: readonly FindingInput[]): TraceFinding | null {
  const hits = inputs
    .filter(({ searchObject }) =>
      !searchObject.country && !searchObject.city && !searchObject.postcode && !searchObject.street,
    )
    .map(({ scenario }) => `${scenario.id} ${scenario.relativePath}`);
  return hits.length
    ? {
        code: 'SO-EMPTY',
        severity: 'info',
        message: 'No address field survived classification for these paths.',
        examples: hits.slice(0, MAX_EXAMPLES),
      }
    : null;
}

export function computeTraceFindings(
  inputs: readonly FindingInput[],
  trayCount: number,
  geocodeCallCount: number,
): TraceFinding[] {
  const findings: (TraceFinding | null)[] = [
    findFilenameOverrides(inputs),
    findFuzzyCities(inputs),
    findFolderSplits(inputs),
    findEmptySearchObjects(inputs),
    {
      code: 'RATE',
      severity: 'info',
      message: `${trayCount} tray question(s) and ${geocodeCallCount} geocoder call(s) for ${inputs.length} file(s).`,
      examples: [],
    },
  ];
  return findings.filter((finding): finding is TraceFinding => finding !== null);
}

export function renderFindings(findings: readonly TraceFinding[]): string {
  if (!findings.length) {
    return '  (none)';
  }
  return findings
    .map((finding) =>
      [
        `  [${finding.severity.toUpperCase()}] ${finding.code} — ${finding.message}`,
        ...finding.examples.map((example) => `      · ${example}`),
      ].join('\n'),
    )
    .join('\n');
}
