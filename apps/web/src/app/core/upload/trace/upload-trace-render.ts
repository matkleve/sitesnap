/**
 * Renders the trace buffer as plain text for the console.
 *
 * Printing is opt-in (`UPLOAD_TRACE=1`) so the harness stays a quiet regression test in CI.
 *
 * @see docs/playbooks/upload-pipeline-trace.md
 */

import type { UploadJob } from '../upload-manager.types';
import type { UploadSearchObject } from '../address-resolution/upload-address-resolution.types';
import type { UploadTraceScenario } from './upload-trace-fixtures';
import type { UploadTraceRecorder } from './upload-trace-recorder';

const RULE_WIDTH = 96;
const RULE = '─'.repeat(RULE_WIDTH);
const KEY_PREVIEW_LEN = 44;
const HASH_PREVIEW_LEN = 16;
const SEQ_COL = 4;
const KEY_COL = 52;
const KEY_COL_PAD = 54;
const STATUS_COL = 28;
const BRANCH_COL = 14;
const COUNT_COL = 3;
const SHORT_ID_LEN = 8;
const STEP_COL = 13;
const FIELD_COL = 12;
const VALUE_COL = 24;

function short(value: string | undefined | null, length = KEY_PREVIEW_LEN): string {
  if (!value) {
    return '—';
  }
  return value.length > length ? `${value.slice(0, length)}…` : value;
}

function fieldsOf(so: UploadSearchObject): string {
  const parts = [
    so.country && `country=${so.country}`,
    so.state && `state=${so.state}`,
    so.postcode && `plz=${so.postcode}`,
    so.city && `city=${so.city}`,
    so.street && `street=${so.street}`,
    so.houseNumber && `hn=${so.houseNumber}`,
    so.staircase && `stiege=${so.staircase}`,
    so.door && `tür=${so.door}`,
    so.project && `project=${so.project}`,
  ].filter(Boolean);
  return parts.length ? parts.join(' ') : '(empty)';
}

/** Per-field provenance: which path level wrote the value and with what confidence. */
function sourcesOf(so: UploadSearchObject): string {
  if (!so.sources.length) {
    return '    sources: (none)';
  }
  return so.sources
    .map((s) => `    ${s.field.padEnd(FIELD_COL)} = ${String(s.value).padEnd(VALUE_COL)} ← ${s.source} (conf ${s.confidence}${s.uncertain ? ', uncertain' : ''})`)
    .join('\n');
}

export function renderSearchObject(scenario: UploadTraceScenario, so: UploadSearchObject | undefined): string {
  if (!so) {
    return `  search object: none — classifyBatch skipped this file (no address signal)`;
  }
  const lines = [
    `  search object fields: ${fieldsOf(so)}`,
    sourcesOf(so),
    `    groupingKey: ${so.groupingKey || '(empty)'}`,
  ];
  if (so.postcodeCandidates.length) {
    lines.push(`    postcodeCandidates: ${so.postcodeCandidates.join(', ')}`);
  }
  if (so.uncertainFields.length) {
    lines.push(`    uncertainFields: ${so.uncertainFields.join(', ')}`);
  }
  if (so.sourceDeviations.length) {
    lines.push(`    sourceDeviations: ${so.sourceDeviations.map((d) => `${d.field} folder=${d.folderValue} filename=${d.filenameValue}`).join('; ')}`);
  }
  if (so.areaConflicts?.length) {
    lines.push(`    areaConflicts: ${so.areaConflicts.map((c) => c.field).join(', ')}`);
  }
  if (so.areaEvidence) {
    const levels = Object.entries(so.areaEvidence)
      .map(([field, entries]) => `${field}@[${(entries ?? []).map((e) => `L${e.level}:${e.value}`).join(' ')}]`)
      .join(' ');
    lines.push(`    areaEvidence: ${levels || '(empty)'}`);
  }
  void scenario;
  return lines.join('\n');
}

export function renderScenarioTimeline(
  scenario: UploadTraceScenario,
  recorder: UploadTraceRecorder,
  job: UploadJob | undefined,
): string {
  const header = [
    RULE,
    `${scenario.id}  ${scenario.relativePath}`,
    `  intent: ${scenario.intent}`,
    `  mime: ${scenario.mimeType}  bytes: ${scenario.sizeBytes}  injected EXIF: ${scenario.exifCoords ? `${scenario.exifCoords.lat}, ${scenario.exifCoords.lng}` : 'none'}`,
  ];
  const steps = recorder
    .eventsForScenario(scenario.id)
    .map((event) => `  [${String(event.seq).padStart(SEQ_COL)}] ${event.step.padEnd(STEP_COL)} ${event.label}${event.detail ? ` ${JSON.stringify(event.detail)}` : ''}`);
  const outcome = job
    ? [
        `  outcome: phase=${job.phase} issueKind=${job.issueKind ?? '—'} lane=${laneOf(job)}`,
        // A failed job without its message is a dead end for whoever reads this report.
        ...(job.error ? [`           error=${job.error}`] : []),
        `           titleAddress=${job.titleAddress ?? '—'} (source=${job.titleAddressSource ?? '—'})`,
        `           coords=${job.coords ? `${job.coords.lat}, ${job.coords.lng}` : '—'} via ${job.locationSourceUsed ?? '—'}  mismatch=${job.locationMismatchMeters ?? '—'}m`,
        `           groupingKey=${short(job.groupingKey)}  hash=${short(job.contentHash, HASH_PREVIEW_LEN)} (${job.contentHashAlgo ?? '—'})`,
        `           mediaId=${job.mediaId ?? '—'} storagePath=${job.storagePath ?? '—'}`,
      ]
    : ['  outcome: no job — file never entered the queue'];

  return [...header, ...steps, ...outcome].join('\n');
}

/** Upload-panel lane a job renders in, per the status-label contract. */
export function laneOf(job: UploadJob): string {
  if (job.phase === 'complete') {
    return 'Uploaded';
  }
  if (job.phase === 'awaiting_disambiguation' || job.phase === 'awaiting_conflict_resolution') {
    return 'Waiting for user';
  }
  if (job.phase === 'missing_data') {
    return 'Issues';
  }
  if (job.phase === 'skipped') {
    return 'Skipped';
  }
  if (job.phase === 'error') {
    return job.wasCancelled ? 'Cancelled' : 'Failed';
  }
  return 'Active';
}

export function renderGroupTable(recorder: UploadTraceRecorder): string {
  const rows = recorder.groups().map((group) => {
    const scenarios = group.jobIds
      .map((id) => recorder.scenarioFor(id) ?? id.slice(0, SHORT_ID_LEN))
      .join(',');
    return `  ${short(group.groupingKey, KEY_COL).padEnd(KEY_COL_PAD)} ${group.status.padEnd(STATUS_COL)} ${(group.geocodeBranch ?? '—').padEnd(BRANCH_COL)} ${String(group.jobIds.length).padStart(COUNT_COL)}  ${scenarios}`;
  });
  return [
    `  ${'groupingKey'.padEnd(KEY_COL_PAD)} ${'status'.padEnd(STATUS_COL)} ${'branch'.padEnd(BRANCH_COL)} ${'#'.padStart(COUNT_COL)}  files`,
    ...rows,
  ].join('\n');
}

export function renderGeocodeLog(recorder: UploadTraceRecorder): string {
  const calls = recorder.geocodeCalls();
  if (!calls.length) {
    return '  (no geocoder call — every group resolved locally or stopped before geocode)';
  }
  return calls
    .map((call) => `  [${String(call.seq).padStart(SEQ_COL)}] ${call.method} ${JSON.stringify(call.params)} → ${call.hitCount} hit(s)${call.topLabel ? ` top="${call.topLabel}" score=${call.topScore}` : ''}`)
    .join('\n');
}

export function renderSupabaseSummary(recorder: UploadTraceRecorder): string {
  const counts = [...recorder.supabaseCallCounts().entries()].sort((a, b) => b[1] - a[1]);
  if (!counts.length) {
    return '  (no Supabase call)';
  }
  return counts.map(([name, count]) => `  ${String(count).padStart(SEQ_COL)} × ${name}`).join('\n');
}

export function renderLaneSummary(jobs: readonly UploadJob[]): string {
  const lanes = new Map<string, number>();
  const issues = new Map<string, number>();
  const phases = new Map<string, number>();
  for (const job of jobs) {
    lanes.set(laneOf(job), (lanes.get(laneOf(job)) ?? 0) + 1);
    phases.set(job.phase, (phases.get(job.phase) ?? 0) + 1);
    if (job.issueKind) {
      issues.set(job.issueKind, (issues.get(job.issueKind) ?? 0) + 1);
    }
  }
  const fmt = (map: Map<string, number>): string =>
    [...map.entries()].sort().map(([key, value]) => `${key}=${value}`).join('  ') || '(none)';
  return [
    `  lanes:      ${fmt(lanes)}`,
    `  phases:     ${fmt(phases)}`,
    `  issueKinds: ${fmt(issues)}`,
  ].join('\n');
}

export function renderHeading(text: string): string {
  return `\n${RULE}\n${text}\n${RULE}`;
}

const PAYLOAD_SAMPLE_LIMIT = 2;

/** One example of each write payload — the columns and RPC parameters the pipeline produced. */
export function renderPayloadSamples(recorder: UploadTraceRecorder): string {
  const interesting = new Set(['insert media_items', 'insert dedup_hashes', 'rpc resolve_media_location', 'storage-upload media/']);
  const seen = new Map<string, number>();
  const lines: string[] = [];
  for (const call of recorder.supabaseCalls()) {
    const key = `${call.kind} ${call.kind === 'storage-upload' ? 'media/' : call.name}`;
    if (!interesting.has(key)) {
      continue;
    }
    const count = seen.get(key) ?? 0;
    if (count >= PAYLOAD_SAMPLE_LIMIT) {
      continue;
    }
    seen.set(key, count + 1);
    lines.push(`  ${key}: ${call.payload ? JSON.stringify(call.payload) : call.name}`);
  }
  return lines.length ? ['  sample payloads:', ...lines].join('\n') : '  (no write payload captured)';
}
