#!/usr/bin/env node
/**
 * The gate. One command, so that "did you run the checks?" has one answer.
 *
 * Before this existed the answer depended on knowing which of `lint:specs`,
 * `design-system:check`, `i18n:check`, `ng build` and `ng test` applied to the
 * files you touched. That mapping is written down in AGENTS.md per change
 * class, and it still got skipped — not out of laziness, but because nobody can
 * hold the list. CI runs this same command (.github/workflows/verify.yml), so
 * local and CI cannot drift.
 *
 * Everything runs even after a failure, so one run tells you everything that is
 * wrong rather than the first thing.
 *
 * `soft: true` marks a check that is known-red for reasons predating this gate.
 * It reports loudly and does not fail the run. Three checks start soft, each
 * with the count measured on 2026-09-08; the counts are the ratchet — they may
 * only go down. A soft check is a debt with a name and a number, not an
 * exemption, and making a check soft to get a green run is the one thing this
 * file must never be used for.
 *
 * Why soft rather than red: `Build & Test` had been failing on `main` for
 * months without anyone acting on it. A gate that is red on a clean tree from
 * day one teaches people to ignore it, which is the failure this gate exists to
 * end. Everything genuinely green today (doc-links, design-system, i18n, build)
 * fails hard. See docs/audits/2026-09-08-grundriss-adoption.md § A5.
 *
 * `clean` removes paths before a check runs. The unit suite needs it: with a
 * warm `apps/web/node_modules/.vite` the failure count is 34 or 39 depending on
 * run history, because the cached dependency metadata changes the order Vitest
 * assigns spec files to workers, and the suite has cross-file pollution that
 * only bites in some orders. CI always starts cold, so cold is the honest
 * measurement — five consecutive cold runs give 39 across 14 files, and it
 * costs nothing (52 s cold vs 54 s warm). Clearing the cache makes the number
 * reproducible; it does not fix the pollution, which is still open.
 * @see docs/study/005-upload-pipeline-trace-findings.md F-12
 *
 * `evidence` closes the hole that softness opened. A soft check reports a
 * non-zero exit as "known debt" — which is right for "the suite ran and 34
 * tests failed" and catastrophically wrong for "the suite did not run at all".
 * Those are the same exit code. The `test` bundle stopped compiling and the
 * gate reported known debt for it while executing **zero** specs; the debt note
 * even asserted the bundle compiled cleanly, and nothing could contradict it
 * because no count was ever printed. So a check may declare `resultFile` plus
 * `evidence(result)`: the runner deletes the file, runs the check, and asks
 * `evidence` whether the run produced a result at all. No result is a **hard**
 * failure regardless of `soft`, and the measured counts are printed on every
 * run, so the number in the summary is observed rather than remembered.
 * @see docs/study/005-upload-pipeline-trace-findings.md F-09, F-10
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const resultDir = mkdtempSync(join(tmpdir(), "feldpost-verify-"));
const testResultFile = join(resultDir, "test-results.json");

/**
 * Did the unit-test run produce results? A bundle that fails to compile exits
 * non-zero with no report, which must not be absorbed as known debt.
 */
function readTestEvidence() {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(testResultFile, "utf8"));
  } catch {
    return { ran: false, summary: "no test report was written — the suite did not run" };
  }
  const total = Number(parsed.numTotalTests ?? 0);
  if (!Number.isFinite(total) || total === 0) {
    return { ran: false, summary: "the test report contains no tests — the suite did not run" };
  }
  const failed = Number(parsed.numFailedTests ?? 0);
  // numFailedTestSuites counts describe blocks, not files — count the files ourselves.
  const results = Array.isArray(parsed.testResults) ? parsed.testResults : [];
  const files = new Set(
    results.filter((entry) => entry?.status === "failed").map((entry) => entry?.name),
  ).size;
  return {
    ran: true,
    summary: `measured this run: ${failed} failing of ${total} tests across ${files} failing file(s)`,
  };
}

const CHECKS = [
  { name: "doc-links", cmd: "node", args: ["scripts/check-doc-links.mjs"] },
  { name: "skills-source", cmd: "node", args: ["scripts/check-skills-source.mjs"] },
  {
    name: "spec-code-paths",
    cmd: "node",
    args: ["scripts/check-spec-code-paths.mjs"],
    soft: true,
    debt:
      "146 broken code paths in 320 spec files (re-measured 2026-09-13, and identical with all local changes stashed). The note said 204 from 2026-09-10; the count fell as specs were repointed and nobody re-measured, so this is a correction to a stale note rather than new debt. History: 263 → 262 when the component registry became generated, → 204 after clearing component/filters, service/filename-parser and service/media-download-service. Clean: the upload folders (media-upload-service, component/upload, ui/upload), filters, filename-parser, media-download-service. Roughly 58% are moved files needing a repoint and 42% describe code that no longer exists. Tracked in issue #189.",
  },
  {
    name: "component-registry",
    cmd: "node",
    args: ["scripts/check-component-registry.mjs"],
  },
  { name: "spec-coverage", cmd: "node", args: ["scripts/check-spec-coverage.mjs"] },
  {
    name: "rpc-param-contract",
    cmd: "node",
    args: ["scripts/check-rpc-param-contract.mjs"],
  },
  {
    name: "specs",
    cmd: "npm",
    args: ["run", "--silent", "lint:specs"],
    soft: true,
    debt: "198 errors predating this gate (spec size caps + missing sections; down from 201 on 2026-09-08 after the upload-process-analysis merge). Tracked in docs/specs/SPEC-SIZE-BACKLOG.md.",
  },
  { name: "design-system", cmd: "npm", args: ["run", "--silent", "design-system:check"] },
  { name: "i18n", cmd: "npm", args: ["run", "--silent", "i18n:check"] },
  {
    name: "lint",
    cmd: "npm",
    args: ["run", "--silent", "lint"],
    soft: true,
    debt: "147 errors + 1064 warnings (re-measured 2026-09-12 on `main` at 568b44b with all local changes stashed; the previous note said 145 + 1038 on 2026-09-10, which had drifted — this is a correction to a stale note, not new debt). `--max-warnings 0` means warnings fail too, so the warning figure is the one that blocks.",
  },
  {
    name: "test",
    // Cold dependency cache, so the count matches CI and does not move run to run.
    clean: ["apps/web/node_modules/.vite"],
    resultFile: testResultFile,
    evidence: readTestEvidence,
    cmd: "npm",
    args: [
      "run",
      "--silent",
      "test",
      "--",
      "--reporters=json",
      "--reporters=default",
      `--output-file=${testResultFile}`,
    ],
    soft: true,
    debt: "39 failing tests across 14 files, none of them product bugs (measured 2026-09-13 over five consecutive cold runs — identical every time). All 14 pass in isolation; they fail only in a full run, i.e. cross-file pollution: auth, projects, media-detail, nav, settings-overlay, plus core/upload/upload.service.spec.ts (5 EXIF assertions) and core/supabase/supabase-runtime-config.spec.ts. With a warm dependency cache the count drops to 34 because the file-to-worker order changes — hence the `clean` above. The earlier note claimed 34 and that the bundle compiled cleanly; between 2026-09-10 and 2026-09-12 it did not compile at all and this gate ran ZERO specs. Fixing the pollution is STUDY-006 Phase 0.4b. See docs/study/005-upload-pipeline-trace-findings.md F-12, F-13."
  },
  { name: "build", cmd: "npm", args: ["run", "--silent", "build"] },
];

// `--list` exists so documentation can point at a command instead of copying
// the check names into prose. The copy in docs/agent-workflows/gates-and-commands.md
// had already lost `component-registry` by the time `spec-coverage` was added.
if (process.argv.includes("--list")) {
  for (const check of CHECKS) {
    console.log(`${check.name}\t${check.soft ? "soft (known debt)" : "hard"}`);
  }
  process.exit(0);
}

const only = process.argv.slice(2);
const selected = only.length ? CHECKS.filter((c) => only.includes(c.name)) : CHECKS;

if (only.length && selected.length === 0) {
  console.error(`Unknown check(s): ${only.join(", ")}`);
  console.error(`Available: ${CHECKS.map((c) => c.name).join(", ")}`);
  process.exit(2);
}

const failed = new Set();
const softFailed = new Set();
/** Per-check measurement printed in the summary, so counts are observed not remembered. */
const measured = new Map();
/** Checks whose softness was revoked because the run produced no result. */
const didNotRun = new Map();

for (const check of selected) {
  process.stdout.write(`\n\x1b[1m▸ ${check.name}\x1b[0m\n`);
  for (const path of check.clean ?? []) rmSync(path, { recursive: true, force: true });
  if (check.resultFile) rmSync(check.resultFile, { force: true });
  const { status } = spawnSync(check.cmd, check.args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (check.evidence) {
    const evidence = check.evidence();
    measured.set(check.name, evidence.summary);
    if (!evidence.ran) {
      // No result at all. Softness covers a known count of failures, never a
      // check that never ran — that is how zero executed specs read as green.
      didNotRun.set(check.name, evidence.summary);
      failed.add(check.name);
      continue;
    }
  }

  if (status === 0) continue;
  if (check.soft) softFailed.add(check.name);
  else failed.add(check.name);
}

rmSync(resultDir, { recursive: true, force: true });

console.log("\n" + "─".repeat(60));

for (const check of selected) {
  const mark = failed.has(check.name)
    ? "\x1b[31m✗"
    : softFailed.has(check.name)
      ? "\x1b[33m!"
      : "\x1b[32m✓";
  const note = softFailed.has(check.name) ? `  \x1b[33m(known debt: ${check.debt})` : "";
  console.log(`  ${mark} ${check.name}\x1b[0m${note}\x1b[0m`);
  const measurement = measured.get(check.name);
  if (measurement) console.log(`      \x1b[2m${measurement}\x1b[0m`);
}

if (failed.size) {
  const first = [...failed][0];
  const neverRan = [...didNotRun.entries()]
    .map(([name, why]) => `  \x1b[31m${name} produced no result: ${why}\x1b[0m\n`)
    .join("");
  console.error(
    `\n\x1b[31m✗ verify failed: ${[...failed].join(", ")}\x1b[0m\n` +
      neverRan +
      `  Re-run one at a time with: node scripts/verify.mjs ${first}\n`,
  );
  process.exit(1);
}

if (softFailed.size) {
  console.log(
    `\n\x1b[33m✓ verify passed, with known debt in: ${[...softFailed].join(", ")}\x1b[0m\n` +
      `  Do not add to it. Paste this output when you report the work done.\n`,
  );
} else {
  console.log("\n\x1b[32m✓ verify passed\x1b[0m — paste this output when you report the work done.\n");
}
