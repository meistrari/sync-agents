import { existsSync } from "fs";
import { copyFile, mkdir, readdir, readFile, stat } from "fs/promises";
import { basename, join } from "path";
import { transformSkill, type SyncedSkill } from "./adapters/skill.ts";
import { transformAgent, type SyncedAgent } from "./adapters/agent.ts";
import {
  transformCodexSkillToClaude,
  type SyncedClaudeItem,
} from "./adapters/codex.ts";

export interface SyncOptions {
  claudeDir: string;
  agentsSkillsDir: string;
  codexSkillsDir: string;
  dryRun: boolean;
  cwd?: string;
  syncGlobal?: boolean;
  syncLocal?: boolean;
  cleanupCodex?: boolean;
}

export interface SyncedDoc {
  name: string;
  sourcePath: string;
  outputPath: string;
  action: "created" | "updated";
}

export interface SyncError {
  name: string;
  source: string;
  message: string;
}

export interface SyncResult {
  toAgents: {
    skills: SyncedSkill[];
    agents: SyncedAgent[];
  };
  toClaude: {
    skills: SyncedClaudeItem[];
    agents: SyncedClaudeItem[];
  };
  migratedFromCodex: {
    skills: SyncedSkill[];
  };
  deletedFromCodex: string[];
  docs: SyncedDoc[];
  errors: SyncError[];
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

async function migrateCodexToAgents(
  codexSkillsDir: string,
  agentsSkillsDir: string,
  excludeNames: Set<string>,
  dryRun: boolean,
  cleanup: boolean
): Promise<{ migrated: SyncedSkill[]; deleted: string[] }> {
  const codexSkillDirs = await discoverSkillDirs(codexSkillsDir);
  const migrated: SyncedSkill[] = [];
  const deleted: string[] = [];

  for (const dir of codexSkillDirs) {
    const name = basename(dir);
    if (excludeNames.has(name)) {
      // Already synced from Claude, just cleanup if enabled
      if (cleanup && !dryRun) {
        await Bun.$`rm -rf ${dir}`;
        deleted.push(name);
      } else if (cleanup) {
        deleted.push(name);
      }
      continue;
    }

    // Migrate to .agents (copy the skill directory)
    const outDir = join(agentsSkillsDir, name);
    const files: string[] = [];

    if (!dryRun) {
      await mkdir(outDir, { recursive: true });

      // Copy all files from codex skill dir to agents skill dir
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile()) {
          const src = join(dir, entry.name);
          const dest = join(outDir, entry.name);
          await copyFile(src, dest);
          files.push(dest);
        } else if (entry.isDirectory()) {
          // Copy subdirectories (like scripts/)
          const subDir = join(dir, entry.name);
          const outSubDir = join(outDir, entry.name);
          await mkdir(outSubDir, { recursive: true });
          const subEntries = await readdir(subDir, { withFileTypes: true });
          for (const subEntry of subEntries) {
            if (subEntry.isFile()) {
              const src = join(subDir, subEntry.name);
              const dest = join(outSubDir, subEntry.name);
              await copyFile(src, dest);
              files.push(dest);
            }
          }
        }
      }
    } else {
      files.push(join(outDir, "SKILL.md"));
    }

    migrated.push({ name, outputPath: outDir, files });

    // Cleanup from codex
    if (cleanup && !dryRun) {
      await Bun.$`rm -rf ${dir}`;
      deleted.push(name);
    } else if (cleanup) {
      deleted.push(name);
    }
  }

  return { migrated, deleted };
}

export async function sync(options: SyncOptions): Promise<SyncResult> {
  const {
    claudeDir,
    agentsSkillsDir,
    codexSkillsDir,
    dryRun,
    cwd = process.cwd(),
    syncGlobal = true,
    syncLocal = true,
    cleanupCodex = true,
  } = options;

  const toAgentsSkills: SyncedSkill[] = [];
  const toAgentsAgents: SyncedAgent[] = [];
  const toClaudeSkills: SyncedClaudeItem[] = [];
  const toClaudeAgents: SyncedClaudeItem[] = [];
  let migratedSkills: SyncedSkill[] = [];
  let deletedFromCodex: string[] = [];
  const errors: SyncError[] = [];

  if (syncGlobal) {
    const claudeSkillsDir = join(claudeDir, "skills");

    const claudeSkillDirs = await discoverSkillDirs(claudeSkillsDir);
    const claudeAgentPaths = await discoverAgents(claudeDir);
    const agentsSkillDirs = await discoverSkillDirs(agentsSkillsDir);

    const claudeSkillNames = new Set(claudeSkillDirs.map((dir) => basename(dir)));
    const claudeAgentNames = new Set(
      claudeAgentPaths.map((path) => basename(path, ".md"))
    );

    // Step 1: Claude → Agents (overwrites by name)
    for (const dir of claudeSkillDirs) {
      try {
        const result = await transformSkill(dir, agentsSkillsDir, dryRun);
        if (result) toAgentsSkills.push(result);
      } catch (err) {
        errors.push({
          name: basename(dir),
          source: dir,
          message: String(err),
        });
      }
    }

    for (const path of claudeAgentPaths) {
      const name = basename(path, ".md");
      if (claudeSkillNames.has(name)) continue;
      try {
        const result = await transformAgent(path, agentsSkillsDir, dryRun);
        if (result) toAgentsAgents.push(result);
      } catch (err) {
        errors.push({
          name,
          source: path,
          message: String(err),
        });
      }
    }

    // Track names synced from Claude
    const claudeNames = new Set([...claudeSkillNames, ...claudeAgentNames]);

    // Step 2: Codex → Agents (migration, additive only)
    if (existsSync(codexSkillsDir)) {
      const migration = await migrateCodexToAgents(
        codexSkillsDir,
        agentsSkillsDir,
        claudeNames,
        dryRun,
        cleanupCodex
      );
      migratedSkills = migration.migrated;
      deletedFromCodex = migration.deleted;

      // Add migrated names to the set for step 3
      for (const skill of migratedSkills) {
        claudeNames.add(skill.name);
      }
    }

    // Step 3: Agents → Claude (additive only, skip existing)
    // Refresh agents skill dirs to include any migrated items
    const updatedAgentsSkillDirs = await discoverSkillDirs(agentsSkillsDir);
    for (const dir of updatedAgentsSkillDirs) {
      const name = basename(dir);
      if (claudeNames.has(name)) continue;
      try {
        const result = await transformCodexSkillToClaude(
          dir,
          join(claudeDir, "skills"),
          join(claudeDir, "agents"),
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
      } catch (err) {
        errors.push({
          name,
          source: dir,
          message: String(err),
        });
      }
    }
  }

  const docs = syncLocal ? await syncProjectDocs(cwd, dryRun) : [];

  return {
    toAgents: {
      skills: toAgentsSkills,
      agents: toAgentsAgents,
    },
    toClaude: {
      skills: toClaudeSkills,
      agents: toClaudeAgents,
    },
    migratedFromCodex: {
      skills: migratedSkills,
    },
    deletedFromCodex,
    docs,
    errors,
  };
}
