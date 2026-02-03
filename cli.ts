#!/usr/bin/env bun
import * as p from "@clack/prompts";
import { existsSync } from "fs";
import { basename, join } from "path";
import { homedir } from "os";
import { sync } from "./sync.ts";

const args = process.argv.slice(2);

const isDryRun = args.includes("--dry-run");

const sourceIdx = args.indexOf("--source");
const sourceDir =
  sourceIdx !== -1 && args[sourceIdx + 1]
    ? args[sourceIdx + 1]
    : join(homedir(), ".claude");

const outputDir = join(homedir(), ".codex", "skills");

const banner = [
  " _____ _____ _      _    ",
  "|_   _| ____| |    / \\   ",
  "  | | |  _| | |   / _ \\  ",
  "  | | | |___| |__/ ___ \\ ",
  "  |_| |_____|____/_/  \\_\\",
  "                         ",
  "      SYNC AGENTS        ",
].join("\n");

const formatBar = (count: number, total: number, width = 18) => {
  if (total <= 0) return `[${"-".repeat(width)}]`;
  const clamped = Math.max(0, Math.min(count, total));
  const filled = Math.round((clamped / total) * width);
  return `[${"#".repeat(filled)}${"-".repeat(width - filled)}]`;
};

const formatSummaryLine = (label: string, count: number, total: number) =>
  `${label.padEnd(16, " ")} ${formatBar(count, total)} ${count}`;

p.intro("Tela Sync Agents");
p.note(banner);

const configSummary = [
  `Mode:       ${isDryRun ? "Dry run (no writes)" : "Sync (writes enabled)"}`,
  `Claude dir: ${sourceDir}`,
  `Codex dir:  ${outputDir}`,
  `Project:    ${process.cwd()}`,
].join("\n");

p.note(configSummary, "Configuration");

let preflight: { claudeExists: boolean; codexExists: boolean } | null = null;
let result: Awaited<ReturnType<typeof sync>> | null = null;

try {
  await p.tasks([
    {
      title: "Preflight checks",
      task: (message) => {
        const claudeExists = existsSync(sourceDir);
        const codexExists = existsSync(outputDir);
        preflight = { claudeExists, codexExists };
        message(
          `${claudeExists ? "Claude OK" : "Claude missing"} | ${codexExists ? "Codex OK" : "Codex missing"}`
        );
      },
    },
    {
      title: isDryRun ? "Calculating changes" : "Syncing skills, agents & docs",
      task: async (message) => {
        message("Transforming and merging items");
        result = await sync({
          claudeDir: sourceDir,
          codexSkillsDir: outputDir,
          dryRun: isDryRun,
          cwd: process.cwd(),
        });
        return isDryRun ? "Preview ready" : "Sync complete";
      },
    },
    {
      title: "Rendering summary",
      task: (message) => {
        message("Preparing report output");
        return "Report ready";
      },
    },
  ]);

  if (!result) {
    throw new Error("Sync failed to produce a result.");
  }

  const toCodexTotal =
    result.toCodex.skills.length + result.toCodex.agents.length;
  const toClaudeTotal =
    result.toClaude.skills.length + result.toClaude.agents.length;
  const syncTotal = toCodexTotal + toClaudeTotal;
  const docTotal = result.docs.length;

  if (preflight && (!preflight.claudeExists || !preflight.codexExists)) {
    p.log.warn("One or more source directories are missing.");
  }

  if (syncTotal === 0 && docTotal === 0) {
    p.log.warn(
      `No new items to sync between ${sourceDir} and ${outputDir}`
    );
  } else {
    const vizTotal = Math.max(syncTotal + docTotal, syncTotal, docTotal, 1);
    const summaryViz = [
      formatSummaryLine("Claude -> Codex", toCodexTotal, vizTotal),
      formatSummaryLine("Codex -> Claude", toClaudeTotal, vizTotal),
      formatSummaryLine("Project docs", docTotal, vizTotal),
      formatSummaryLine("Total changes", syncTotal + docTotal, vizTotal),
    ].join("\n");

    p.note(summaryViz, "Sync Summary");

    if (toCodexTotal > 0) {
      const plural = (n: number) => (n === 1 ? "file" : "files");
      const skillLines = result.toCodex.skills.map(
        (s) => `  ${s.name.padEnd(20)} ${s.files.length} ${plural(s.files.length)}`
      );
      const agentLines = result.toCodex.agents.map(
        (a) => `  ${a.name.padEnd(20)} ${a.files.length} ${plural(a.files.length)}`
      );
      const lines = [
        ...(skillLines.length > 0
          ? [`Skills (${skillLines.length}):`, ...skillLines]
          : []),
        ...(agentLines.length > 0
          ? [`Agents (${agentLines.length}):`, ...agentLines]
          : []),
      ];
      p.note(lines.join("\n"), "Claude → Codex");
    }

    if (toClaudeTotal > 0) {
      const plural = (n: number) => (n === 1 ? "file" : "files");
      const skillLines = result.toClaude.skills.map(
        (s) => `  ${s.name.padEnd(20)} ${s.files.length} ${plural(s.files.length)}`
      );
      const agentLines = result.toClaude.agents.map(
        (a) => `  ${a.name.padEnd(20)} ${a.files.length} ${plural(a.files.length)}`
      );
      const lines = [
        ...(skillLines.length > 0
          ? [`Skills (${skillLines.length}):`, ...skillLines]
          : []),
        ...(agentLines.length > 0
          ? [`Agents (${agentLines.length}):`, ...agentLines]
          : []),
      ];
      p.note(lines.join("\n"), "Codex → Claude");
    }

    if (docTotal > 0) {
      const docLines = result.docs.map((doc) => {
        const sourceName = basename(doc.sourcePath);
        const destName = basename(doc.outputPath);
        return `  ${sourceName.padEnd(20)} → ${destName} (${doc.action})`;
      });
      p.note(docLines.join("\n"), "Project Docs");
    }
  }
} catch (err) {
  p.log.error(String(err));
  process.exit(1);
}

p.outro(isDryRun ? "Dry run complete" : "Sync complete");
