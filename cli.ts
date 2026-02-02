#!/usr/bin/env bun
import * as p from "@clack/prompts";
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

p.intro("sync-agents");

const s = p.spinner();
s.start(
  isDryRun
    ? "Discovering skills, agents & project docs (dry run)"
    : "Syncing skills, agents & project docs"
);

try {
  const result = await sync({
    claudeDir: sourceDir,
    codexSkillsDir: outputDir,
    dryRun: isDryRun,
    cwd: process.cwd(),
  });

  s.stop("Done");

  const toCodexTotal =
    result.toCodex.skills.length + result.toCodex.agents.length;
  const toClaudeTotal =
    result.toClaude.skills.length + result.toClaude.agents.length;
  const syncTotal = toCodexTotal + toClaudeTotal;
  const docTotal = result.docs.length;

  if (syncTotal === 0 && docTotal === 0) {
    p.log.warn(
      `No new items to sync between ${sourceDir} and ${outputDir}`
    );
  } else {
    if (toCodexTotal > 0) {
      p.log.success("Claude → Codex");
      if (result.toCodex.skills.length > 0) {
        p.log.info(`  Skills (${result.toCodex.skills.length}):`);
        for (const skill of result.toCodex.skills) {
          p.log.info(
            `    ${skill.name} → ${isDryRun ? "(dry run)" : skill.outputPath}`
          );
          if (!isDryRun) {
            for (const f of skill.files) {
              p.log.step(`    ${f}`);
            }
          }
        }
      }

      if (result.toCodex.agents.length > 0) {
        p.log.info(`  Agents (${result.toCodex.agents.length}):`);
        for (const agent of result.toCodex.agents) {
          p.log.info(
            `    ${agent.name} → ${isDryRun ? "(dry run)" : agent.outputPath}`
          );
          if (!isDryRun) {
            for (const f of agent.files) {
              p.log.step(`    ${f}`);
            }
          }
        }
      }
    }

    if (toClaudeTotal > 0) {
      p.log.success("Codex → Claude");
      if (result.toClaude.skills.length > 0) {
        p.log.info(`  Skills (${result.toClaude.skills.length}):`);
        for (const skill of result.toClaude.skills) {
          p.log.info(
            `    ${skill.name} → ${isDryRun ? "(dry run)" : skill.outputPath}`
          );
          if (!isDryRun) {
            for (const f of skill.files) {
              p.log.step(`    ${f}`);
            }
          }
        }
      }

      if (result.toClaude.agents.length > 0) {
        p.log.info(`  Agents (${result.toClaude.agents.length}):`);
        for (const agent of result.toClaude.agents) {
          p.log.info(
            `    ${agent.name} → ${isDryRun ? "(dry run)" : agent.outputPath}`
          );
          if (!isDryRun) {
            for (const f of agent.files) {
              p.log.step(`    ${f}`);
            }
          }
        }
      }
    }

    if (docTotal > 0) {
      p.log.success("Project docs");
      p.log.info(`  Files (${docTotal}):`);
      for (const doc of result.docs) {
        const sourceName = basename(doc.sourcePath);
        const destName = basename(doc.outputPath);
        p.log.info(
          `    ${sourceName} → ${destName} (${doc.action})${isDryRun ? " (dry run)" : ""
          }`
        );
      }
    }

    const summaryParts: string[] = [];
    if (syncTotal > 0) {
      summaryParts.push(
        `${syncTotal} skill/agent item(s) between ${sourceDir} and ${outputDir}`
      );
    }
    if (docTotal > 0) {
      summaryParts.push(`${docTotal} project doc(s) in ${process.cwd()}`);
    }

    p.log.message(
      isDryRun
        ? `Would sync ${summaryParts.join(" and ")}`
        : `Synced ${summaryParts.join(" and ")}`
    );
  }
} catch (err) {
  s.stop("Failed");
  p.log.error(String(err));
  process.exit(1);
}

p.outro(isDryRun ? "Dry run complete" : "Sync complete");
