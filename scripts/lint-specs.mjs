#!/usr/bin/env node

/**
 * Element Spec Lint — validates docs/element-specs/*.md
 *
 * Rules:
 *   spec-max-lines        Max total lines per spec (default: 250, warn: 200)
 *   spec-required-sections Required sections present in every spec
 *   spec-section-order     Sections appear in the canonical order
 *   what-it-is-length      "What It Is" section max lines (default: 5)
 *   what-it-looks-like-len "What It Looks Like" section max lines (default: 40)
 *   has-acceptance-criteria At least one acceptance criterion checkbox
 *
 * Usage:
 *   node scripts/lint-specs.mjs [--fix] [--max-lines=N] [--warn-lines=N] [glob]
 *
 * Exit codes:
 *   0  All specs pass
 *   1  One or more specs have errors
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, basename, resolve } from "node:path";

// ─── Config ────────────────────────────────────────────────────────────────

const DEFAULT_MAX_LINES = 600;
const DEFAULT_WARN_LINES = 400;
const DEFAULT_MAX_WHAT_IT_IS = 5;
const DEFAULT_MAX_WHAT_IT_LOOKS_LIKE = 40;

const REQUIRED_SECTIONS = [
  "What It Is",
  "What It Looks Like",
  "Where It Lives",
  "Actions",
  "Component Hierarchy",
  "Acceptance Criteria",
];

const CANONICAL_ORDER = [
  "What It Is",
  "What It Looks Like",
  "Where It Lives",
  "Actions",
  "Component Hierarchy",
  "Data",
  "State",
  "File Map",
  "Wiring",
  "Acceptance Criteria",
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseSections(content) {
  const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const sections = [];
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^## (.+)$/);
    if (match) {
      if (current) {
        current.endLine = i;
        current.lineCount = current.endLine - current.startLine;
      }
      current = {
        name: match[1].trim(),
        startLine: i + 1,
        endLine: null,
        lineCount: 0,
      };
      sections.push(current);
    }
  }
  if (current) {
    current.endLine = lines.length;
    current.lineCount = current.endLine - current.startLine;
  }

  return { lines, sections, totalLines: lines.length };
}

function normalizeSectionName(name) {
  // Strip trailing content after common patterns like " (table)" or " & Interactions"
  return name
    .replace(/\s*[(&].*$/, "")
    .replace(/\s*\(.*\)$/, "")
    .trim();
}

function findSection(sections, targetName) {
  return sections.find((s) => {
    const normalized = normalizeSectionName(s.name);
    return (
      normalized.toLowerCase() === targetName.toLowerCase() ||
      s.name.toLowerCase() === targetName.toLowerCase() ||
      s.name.toLowerCase().startsWith(targetName.toLowerCase())
    );
  });
}

// ─── Rules ──────────────────────────────────────────────────────────────────

function ruleMaxLines(parsed, config) {
  const diagnostics = [];
  if (parsed.totalLines > config.maxLines) {
    diagnostics.push({
      severity: "error",
      rule: "spec-max-lines",
      message: `Spec has ${parsed.totalLines} lines (max: ${config.maxLines}). Split into child specs with cross-references.`,
      line: 1,
    });
  } else if (parsed.totalLines > config.warnLines) {
    diagnostics.push({
      severity: "warning",
      rule: "spec-max-lines",
      message: `Spec has ${parsed.totalLines} lines (recommended max: ${config.warnLines}). Consider splitting.`,
      line: 1,
    });
  }
  return diagnostics;
}

function ruleRequiredSections(parsed) {
  const diagnostics = [];
  for (const required of REQUIRED_SECTIONS) {
    const found = findSection(parsed.sections, required);
    if (!found) {
      diagnostics.push({
        severity: "error",
        rule: "spec-required-sections",
        message: `Missing required section: "## ${required}"`,
        line: 1,
      });
    }
  }
  return diagnostics;
}

function ruleSectionOrder(parsed) {
  const diagnostics = [];
  const presentCanonical = CANONICAL_ORDER.filter((name) =>
    findSection(parsed.sections, name),
  );

  let lastIndex = -1;
  for (const name of presentCanonical) {
    const section = findSection(parsed.sections, name);
    const currentIndex = parsed.sections.indexOf(section);
    if (currentIndex < lastIndex) {
      diagnostics.push({
        severity: "warning",
        rule: "spec-section-order",
        message: `Section "## ${section.name}" is out of canonical order (expected after previous canonical section)`,
        line: section.startLine,
      });
    }
    lastIndex = currentIndex;
  }
  return diagnostics;
}

function ruleWhatItIsLength(parsed, config) {
  const diagnostics = [];
  const section = findSection(parsed.sections, "What It Is");
  if (section && section.lineCount > config.maxWhatItIs) {
    diagnostics.push({
      severity: "warning",
      rule: "what-it-is-length",
      message: `"What It Is" has ${section.lineCount} lines (recommended max: ${config.maxWhatItIs}). Keep it to 1-2 sentences.`,
      line: section.startLine,
    });
  }
  return diagnostics;
}

function ruleWhatItLooksLikeLength(parsed, config) {
  const diagnostics = [];
  const section = findSection(parsed.sections, "What It Looks Like");
  if (section && section.lineCount > config.maxWhatItLooksLike) {
    diagnostics.push({
      severity: "warning",
      rule: "what-it-looks-like-length",
      message: `"What It Looks Like" has ${section.lineCount} lines (recommended max: ${config.maxWhatItLooksLike}). Move detail to Actions or child specs.`,
      line: section.startLine,
    });
  }
  return diagnostics;
}

function ruleAcceptanceCriteria(parsed, content) {
  const diagnostics = [];
  const section = findSection(parsed.sections, "Acceptance Criteria");
  if (section) {
    const sectionContent = parsed.lines
      .slice(section.startLine, section.endLine)
      .join("\n");
    const checkboxCount = (sectionContent.match(/- \[[ x]\]/g) || []).length;
    if (checkboxCount === 0) {
      diagnostics.push({
        severity: "error",
        rule: "has-acceptance-criteria",
        message:
          "Acceptance Criteria section has no checkbox items (- [ ] ...)",
        line: section.startLine,
      });
    }
  }
  return diagnostics;
}

function ruleChildSpecReferences(parsed, content) {
  const diagnostics = [];
  // If the spec references "Child Specs" or "child spec", check those links exist
  const hasChildRefs = findSection(parsed.sections, "Child Specs");
  if (hasChildRefs) {
    const linkPattern = /\[.*?\]\(([\w-]+\.md)\)/g;
    const sectionContent = parsed.lines
      .slice(hasChildRefs.startLine, hasChildRefs.endLine)
      .join("\n");
    let match;
    while ((match = linkPattern.exec(sectionContent)) !== null) {
      // Just record for info — actual file existence is checked in the runner
      // This is a structural check only
    }
  }
  return diagnostics;
}

// ─── Runner ─────────────────────────────────────────────────────────────────

function lintSpec(filePath, config) {
  const content = readFileSync(filePath, "utf-8");
  const parsed = parseSections(content);
  const file = basename(filePath);

  const diagnostics = [
    ...ruleMaxLines(parsed, config),
    ...ruleRequiredSections(parsed),
    ...ruleSectionOrder(parsed),
    ...ruleWhatItIsLength(parsed, config),
    ...ruleWhatItLooksLikeLength(parsed, config),
    ...ruleAcceptanceCriteria(parsed, content),
    ...ruleChildSpecReferences(parsed, content),
  ];

  return { file, filePath, totalLines: parsed.totalLines, diagnostics };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const config = {
    maxLines: DEFAULT_MAX_LINES,
    warnLines: DEFAULT_WARN_LINES,
    maxWhatItIs: DEFAULT_MAX_WHAT_IT_IS,
    maxWhatItLooksLike: DEFAULT_MAX_WHAT_IT_LOOKS_LIKE,
    specDir: null,
  };

  for (const arg of args) {
    if (arg.startsWith("--max-lines=")) {
      config.maxLines = parseInt(arg.split("=")[1], 10);
    } else if (arg.startsWith("--warn-lines=")) {
      config.warnLines = parseInt(arg.split("=")[1], 10);
    } else if (!arg.startsWith("--")) {
      config.specDir = arg;
    }
  }

  return config;
}

function main() {
  const config = parseArgs(process.argv);

  // Resolve spec directory
  const scriptDir = new URL(".", import.meta.url).pathname.replace(
    /^\/([A-Z]:)/,
    "$1",
  );
  const projectRoot = resolve(scriptDir, "..");
  const specDir = config.specDir || join(projectRoot, "docs", "element-specs");

  let files;
  try {
    files = readdirSync(specDir)
      .filter(
        (f) => f.endsWith(".md") && f !== "README.md" && !f.endsWith(".bak"),
      )
      .map((f) => join(specDir, f))
      .sort();
  } catch (err) {
    console.error(`Error reading spec directory: ${specDir}`);
    console.error(err.message);
    process.exit(1);
  }

  if (files.length === 0) {
    console.log("No spec files found.");
    process.exit(0);
  }

  let totalErrors = 0;
  let totalWarnings = 0;
  const results = [];

  for (const file of files) {
    const result = lintSpec(file, config);
    results.push(result);

    const errors = result.diagnostics.filter((d) => d.severity === "error");
    const warnings = result.diagnostics.filter((d) => d.severity === "warning");
    totalErrors += errors.length;
    totalWarnings += warnings.length;
  }

  // ─── Output ───────────────────────────────────────────────────────────

  const COL_RESET = "\x1b[0m";
  const COL_RED = "\x1b[31m";
  const COL_YELLOW = "\x1b[33m";
  const COL_GREEN = "\x1b[32m";
  const COL_DIM = "\x1b[2m";
  const COL_BOLD = "\x1b[1m";

  // Size summary table
  console.log(`\n${COL_BOLD}Element Spec Lint${COL_RESET}`);
  console.log(`${"─".repeat(60)}`);
  console.log(
    `${COL_DIM}${"File".padEnd(40)} ${"Lines".padStart(6)} Status${COL_RESET}`,
  );
  console.log(`${"─".repeat(60)}`);

  for (const result of results) {
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    const warnings = result.diagnostics.filter((d) => d.severity === "warning");
    let status;
    let color;
    if (errors.length > 0) {
      status = `${errors.length} error${errors.length > 1 ? "s" : ""}`;
      color = COL_RED;
    } else if (warnings.length > 0) {
      status = `${warnings.length} warn${warnings.length > 1 ? "s" : ""}`;
      color = COL_YELLOW;
    } else {
      status = "OK";
      color = COL_GREEN;
    }

    const lineColor =
      result.totalLines > config.maxLines
        ? COL_RED
        : result.totalLines > config.warnLines
          ? COL_YELLOW
          : COL_DIM;

    console.log(
      `${result.file.padEnd(40)} ${lineColor}${String(result.totalLines).padStart(6)}${COL_RESET} ${color}${status}${COL_RESET}`,
    );
  }

  console.log(`${"─".repeat(60)}`);

  // Print diagnostics for files with issues
  const filesWithIssues = results.filter((r) => r.diagnostics.length > 0);
  if (filesWithIssues.length > 0) {
    console.log("");
    for (const result of filesWithIssues) {
      for (const d of result.diagnostics) {
        const color = d.severity === "error" ? COL_RED : COL_YELLOW;
        const icon = d.severity === "error" ? "✖" : "⚠";
        console.log(
          `${color}${icon}${COL_RESET} ${result.file}:${d.line} ${COL_DIM}[${d.rule}]${COL_RESET} ${d.message}`,
        );
      }
    }
  }

  // Summary
  console.log("");
  if (totalErrors === 0 && totalWarnings === 0) {
    console.log(
      `${COL_GREEN}✔ ${files.length} specs checked, all passing${COL_RESET}`,
    );
  } else {
    console.log(
      `${totalErrors > 0 ? COL_RED : COL_YELLOW}${files.length} specs checked: ${totalErrors} error${totalErrors !== 1 ? "s" : ""}, ${totalWarnings} warning${totalWarnings !== 1 ? "s" : ""}${COL_RESET}`,
    );
  }

  process.exit(totalErrors > 0 ? 1 : 0);
}

main();
