import { existsSync } from "fs";
import { readdir, readFile, stat } from "fs/promises";
import { basename, join } from "path";
import { transformSkill, type SyncedSkill } from "./adapters/skill.ts";
import { transformAgent, type SyncedAgent } from "./adapters/agent.ts";
import {
  transformCodexSkillToClaude,
  type SyncedClaudeItem,
} from "./adapters/codex.ts";

export interface SyncOptions {
  claudeDir: string;
  codexSkillsDir: string;
  dryRun: boolean;
  cwd?: string;
}

export interface SyncedDoc {
  name: string;
  sourcePath: string;
  outputPath: string;
  action: "created" | "updated";
}

export interface SyncResult {
  toCodex: {
    skills: SyncedSkill[];
    agents: SyncedAgent[];
  };
  toClaude: {
    skills: SyncedClaudeItem[];
    agents: SyncedClaudeItem[];
  };
  docs: SyncedDoc[];
}

async function discoverSkillDirs(skillsDir: string): Promise<string[]> {
  if (!existsSync(skillsDir)) return [];

  const entries = await readdir(skillsDir, { withFileTypes: true });
  const dirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => join(skillsDir, e.name));

  const valid: string[] = [];
  for (const dir of dirs) {
    if (existsSync(join(dir, "SKILL.md"))) valid.push(dir);
  }

  return valid;
}

async function discoverAgents(claudeDir: string): Promise<string[]> {
  const agentsDir = join(claudeDir, "agents");
  if (!existsSync(agentsDir)) return [];

  const entries = await readdir(agentsDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => join(agentsDir, e.name));
}

async function syncProjectDocs(
  cwd: string,
  dryRun: boolean
): Promise<SyncedDoc[]> {
  const claudePath = join(cwd, "CLAUDE.md");
  const agentsPath = join(cwd, "AGENTS.md");

  const claudeExists = existsSync(claudePath);
  const agentsExists = existsSync(agentsPath);

  if (!claudeExists && !agentsExists) return [];

  let sourcePath: string;
  let destPath: string;

  if (claudeExists && agentsExists) {
    const [claudeStat, agentsStat] = await Promise.all([
      stat(claudePath),
      stat(agentsPath),
    ]);

    if (claudeStat.mtimeMs === agentsStat.mtimeMs) {
      sourcePath = claudePath;
      destPath = agentsPath;
    } else if (claudeStat.mtimeMs > agentsStat.mtimeMs) {
      sourcePath = claudePath;
      destPath = agentsPath;
    } else {
      sourcePath = agentsPath;
      destPath = claudePath;
    }
  } else if (claudeExists) {
    sourcePath = claudePath;
    destPath = agentsPath;
  } else {
    sourcePath = agentsPath;
    destPath = claudePath;
  }

  const sourceContent = await readFile(sourcePath, "utf-8");
  const destExists = existsSync(destPath);

  if (destExists) {
    const destContent = await readFile(destPath, "utf-8");
    if (destContent === sourceContent) return [];
  }

  if (!dryRun) {
    await Bun.write(destPath, sourceContent);
  }

  return [
    {
      name: basename(destPath),
      sourcePath,
      outputPath: destPath,
      action: destExists ? "updated" : "created",
    },
  ];
}

export async function sync(options: SyncOptions): Promise<SyncResult> {
  const { claudeDir, codexSkillsDir, dryRun, cwd = process.cwd() } = options;

  const claudeSkillsDir = join(claudeDir, "skills");
  const claudeAgentsDir = join(claudeDir, "agents");

  const claudeSkillDirs = await discoverSkillDirs(claudeSkillsDir);
  const claudeAgentPaths = await discoverAgents(claudeDir);
  const codexSkillDirs = await discoverSkillDirs(codexSkillsDir);

  const claudeSkillNames = new Set(claudeSkillDirs.map((dir) => basename(dir)));
  const claudeAgentNames = new Set(
    claudeAgentPaths.map((path) => basename(path, ".md"))
  );
  const toCodexSkills: SyncedSkill[] = [];
  const toCodexAgents: SyncedAgent[] = [];

  for (const dir of claudeSkillDirs) {
    const result = await transformSkill(dir, codexSkillsDir, dryRun);
    if (result) toCodexSkills.push(result);
  }

  for (const path of claudeAgentPaths) {
    const name = basename(path, ".md");
    if (claudeSkillNames.has(name)) continue;
    const result = await transformAgent(path, codexSkillsDir, dryRun);
    if (result) toCodexAgents.push(result);
  }

  const toClaudeSkills: SyncedClaudeItem[] = [];
  const toClaudeAgents: SyncedClaudeItem[] = [];
  const claudeNames = new Set([...claudeSkillNames, ...claudeAgentNames]);

  for (const dir of codexSkillDirs) {
    const name = basename(dir);
    if (claudeNames.has(name)) continue;
    const result = await transformCodexSkillToClaude(
      dir,
      claudeSkillsDir,
      claudeAgentsDir,
      dryRun
    );
    if (result) {
      if (result.kind === "agent") {
        toClaudeAgents.push(result);
      } else {
        toClaudeSkills.push(result);
      }
      claudeNames.add(name);
    }
  }

  const docs = await syncProjectDocs(cwd, dryRun);

  return {
    toCodex: {
      skills: toCodexSkills,
      agents: toCodexAgents,
    },
    toClaude: {
      skills: toClaudeSkills,
      agents: toClaudeAgents,
    },
    docs,
  };
}
