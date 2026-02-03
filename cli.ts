#!/usr/bin/env bun
import * as p from "@clack/prompts";
import { existsSync } from "fs";
import { basename, join } from "path";
import { homedir } from "os";
import { sync } from "./sync.ts";

const args = process.argv.slice(2);

const isDryRun = args.includes("--dry-run");
const isGlobalOnly = args.includes("--global");
const isLocalOnly = args.includes("--local");
const noCleanup = args.includes("--no-cleanup");

const syncGlobal = !isLocalOnly;
const syncLocal = !isGlobalOnly;
const cleanupCodex = !noCleanup;

const sourceIdx = args.indexOf("--source");
const sourceDir =
  sourceIdx !== -1 && args[sourceIdx + 1]
    ? args[sourceIdx + 1]
    : join(homedir(), ".claude");

const agentsDir = join(homedir(), ".agents", "skills");
const codexDir = join(homedir(), ".codex", "skills");

const getScopeLabel = () => {
  if (isGlobalOnly) return "Global only (~/.claude <-> ~/.agents)";
  if (isLocalOnly) return "Local only (current folder)";
  return "Global + Local";
};

const banner = [
  " ____  __   __ _   _  ____      _    ____ _____ _   _ _____ ____  ",
  "/ ___| \\ \\ / /| \\ | |/ ___|    / \\  / ___| ____| \\ | |_   _/ ___| ",
  "\\___ \\  \\ V / |  \\| | |       / _ \\| |  _|  _| |  \\| | | | \\___ \\ ",
  " ___) |  | |  | |\\  | |___   / ___ \\ |_| | |___| |\\  | | |  ___) |",
  "|____/   |_|  |_| \\_|\\____| /_/   \\_\\____|_____|_| \\_| |_| |____/ ",
].join("\n");

const formatBar = (count: number, total: number, width = 18) => {
  if (total <= 0) return `[${"-".repeat(width)}]`;
  const clamped = Math.max(0, Math.min(count, total));
  const filled = Math.round((clamped / total) * width);
  return `[${"#".repeat(filled)}${"-".repeat(width - filled)}]`;
};

const formatSummaryLine = (label: string, count: number, total: number) =>
  `${label.padEnd(16, " ")} ${formatBar(count, total)} ${count}`;

p.intro("Sync Agents");
p.note(banner);

const configSummary = [
  `Mode:       ${isDryRun ? "Dry run (no writes)" : "Sync (writes enabled)"}`,
  `Scope:      ${getScopeLabel()}`,
  ...(syncGlobal
    ? [
        `Claude dir:  ${sourceDir}`,
        `Agents dir:  ${agentsDir}`,
        `Codex dir:   ${codexDir}${cleanupCodex ? " (cleanup enabled)" : ""}`,
      ]
    : []),
  ...(syncLocal ? [`Project:     ${process.cwd()}`] : []),
].join("\n");

p.note(configSummary, "Configuration");

let preflight: {
  claudeExists: boolean;
  agentsExists: boolean;
  codexExists: boolean;
} | null = null;
let result: Awaited<ReturnType<typeof sync>> | null = null;

try {
  await p.tasks([
    {
      title: "Preflight checks",
      task: (message) => {
        const claudeExists = syncGlobal ? existsSync(sourceDir) : true;
        const agentsExists = syncGlobal ? existsSync(agentsDir) : true;
        const codexExists = syncGlobal ? existsSync(codexDir) : true;
        preflight = { claudeExists, agentsExists, codexExists };
        if (syncGlobal) {
          const parts = [
            claudeExists ? "Claude OK" : "Claude missing",
            agentsExists ? "Agents OK" : "Agents new",
            codexExists ? "Codex migrate" : "Codex empty",
          ];
          message(parts.join(" | "));
        } else {
          message("Local sync only");
        }
      },
    },
    {
      title: isDryRun ? "Calculating changes" : "Syncing skills, agents & docs",
      task: async (message) => {
        message("Transforming and merging items");
        result = await sync({
          claudeDir: sourceDir,
          agentsSkillsDir: agentsDir,
          codexSkillsDir: codexDir,
          dryRun: isDryRun,
          cwd: process.cwd(),
          syncGlobal,
          syncLocal,
          cleanupCodex,
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

  const toAgentsTotal =
    result.toAgents.skills.length + result.toAgents.agents.length;
  const toClaudeTotal =
    result.toClaude.skills.length + result.toClaude.agents.length;
  const migratedTotal = result.migratedFromCodex.skills.length;
  const deletedTotal = result.deletedFromCodex.length;
  const syncTotal = toAgentsTotal + toClaudeTotal + migratedTotal;
  const docTotal = result.docs.length;

  if (preflight && !preflight.claudeExists) {
    p.log.warn("Claude directory is missing.");
  }

  if (syncTotal === 0 && docTotal === 0) {
    const scopeMsg = isLocalOnly
      ? "No project docs to sync"
      : isGlobalOnly
        ? `No new items to sync between ${sourceDir} and ${agentsDir}`
        : `No new items to sync`;
    p.log.warn(scopeMsg);
  } else {
    const vizTotal = Math.max(syncTotal + docTotal, syncTotal, docTotal, 1);
    const summaryLines = [
      ...(syncGlobal
        ? [
            formatSummaryLine("Claude -> Agents", toAgentsTotal, vizTotal),
            formatSummaryLine("Codex -> Agents", migratedTotal, vizTotal),
            formatSummaryLine("Agents -> Claude", toClaudeTotal, vizTotal),
            ...(deletedTotal > 0
              ? [formatSummaryLine("Codex cleanup", deletedTotal, vizTotal)]
              : []),
          ]
        : []),
      ...(syncLocal
        ? [formatSummaryLine("Project docs", docTotal, vizTotal)]
        : []),
      formatSummaryLine("Total changes", syncTotal + docTotal, vizTotal),
    ];

    p.note(summaryLines.join("\n"), "Sync Summary");

    if (toAgentsTotal > 0) {
      const plural = (n: number) => (n === 1 ? "file" : "files");
      const skillLines = result.toAgents.skills.map(
        (s) => `  ${s.name.padEnd(20)} ${s.files.length} ${plural(s.files.length)}`
      );
      const agentLines = result.toAgents.agents.map(
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
      p.note(lines.join("\n"), "Claude → Agents");
    }

    if (migratedTotal > 0) {
      const plural = (n: number) => (n === 1 ? "file" : "files");
      const skillLines = result.migratedFromCodex.skills.map(
        (s) => `  ${s.name.padEnd(20)} ${s.files.length} ${plural(s.files.length)}`
      );
      p.note(skillLines.join("\n"), "Codex → Agents (migrated)");
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
      p.note(lines.join("\n"), "Agents → Claude");
    }

    if (deletedTotal > 0) {
      const deletedLines = result.deletedFromCodex.map(
        (name) => `  ${name}`
      );
      p.note(deletedLines.join("\n"), "Cleaned from Codex");
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
