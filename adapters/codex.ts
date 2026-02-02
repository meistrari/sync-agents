import matter from "gray-matter";
import { existsSync } from "fs";
import { copyFile, mkdir, readdir, readFile } from "fs/promises";
import { basename, join } from "path";

export interface SyncedClaudeItem {
  name: string;
  outputPath: string;
  files: string[];
  kind: "skill" | "agent";
}

const AUTO_HEADER_RE = /^>\s*Auto-generated from .* by sync-agents\s*\n\n?/i;
const AUTO_AGENT_RE = /^>\s*Auto-generated from Claude Code agent\b/i;
const AUTO_SKILL_RE = /^>\s*Auto-generated from Claude Code skill\b/i;

function detectOriginKind(content: string): "agent" | "skill" | "unknown" {
  const trimmed = content.trimStart();
  const firstLine = trimmed.split("\n", 1)[0] ?? "";
  if (AUTO_AGENT_RE.test(firstLine)) return "agent";
  if (AUTO_SKILL_RE.test(firstLine)) return "skill";
  return "unknown";
}

function stripAutoHeader(content: string): string {
  return content.replace(AUTO_HEADER_RE, "");
}

function splitDescriptionAndModel(description?: string): {
  description?: string;
  model?: string;
} {
  if (!description) return {};
  const match = description.match(/(?:^|\.\s)Original model: (.+)$/);
  if (!match) return { description };
  const model = match[1]?.trim();
  const stripped = description.replace(/(?:^|\.\s)Original model: .+$/, "").trim();
  return {
    description: stripped.length > 0 ? stripped : undefined,
    model: model && model.length > 0 ? model : undefined,
  };
}

async function writeClaudeSkill(
  name: string,
  data: Record<string, unknown>,
  content: string,
  skillDir: string,
  outputSkillsDir: string,
  dryRun: boolean
): Promise<SyncedClaudeItem> {
  const outDir = join(outputSkillsDir, name);
  const outFile = join(outDir, "SKILL.md");
  const files = [outFile];

  const frontmatter: Record<string, unknown> = { ...data };
  if (!frontmatter.name) frontmatter.name = name;

  const cleanedContent = stripAutoHeader(content.trimStart()).trimStart();
  const header = `> Auto-generated from Codex skill \`${name}\` by sync-agents\n\n`;
  const output = matter.stringify(header + cleanedContent, frontmatter);

  const entries = await readdir(skillDir, { withFileTypes: true });
  const mdFiles = entries.filter(
    (entry) =>
      entry.isFile() && entry.name.endsWith(".md") && entry.name !== "SKILL.md"
  );

  const scriptsDir = join(skillDir, "scripts");
  const scriptEntries = existsSync(scriptsDir)
    ? await readdir(scriptsDir, { withFileTypes: true })
    : [];
  const tsFiles = scriptEntries.filter(
    (entry) => entry.isFile() && entry.name.endsWith(".ts")
  );

  if (!dryRun) {
    await mkdir(outDir, { recursive: true });
    await Bun.write(outFile, output);

    if (tsFiles.length > 0) {
      for (const entry of tsFiles) {
        const src = join(scriptsDir, entry.name);
        const dest = join(outDir, entry.name);
        await copyFile(src, dest);
        files.push(dest);
      }
    }

    for (const entry of mdFiles) {
      const src = join(skillDir, entry.name);
      const mdRaw = await readFile(src, "utf-8");
      const mdParsed = matter(mdRaw);
      const mdOut = matter.stringify(
        mdParsed.content.trimStart(),
        mdParsed.data as Record<string, unknown>
      );
      const dest = join(outDir, entry.name);
      await Bun.write(dest, mdOut);
      files.push(dest);
    }
  } else {
    for (const entry of tsFiles) {
      files.push(join(outDir, entry.name));
    }
    for (const entry of mdFiles) {
      files.push(join(outDir, entry.name));
    }
  }

  return { name, outputPath: outDir, files, kind: "skill" };
}

async function writeClaudeAgent(
  name: string,
  data: Record<string, unknown>,
  content: string,
  outputAgentsDir: string,
  dryRun: boolean
): Promise<SyncedClaudeItem> {
  const outFile = join(outputAgentsDir, `${name}.md`);
  const files = [outFile];

  const rawDescription =
    typeof data.description === "string" ? data.description : undefined;
  const { description, model } = splitDescriptionAndModel(rawDescription);

  const frontmatter: Record<string, unknown> = {
    name,
  };
  if (description) frontmatter.description = description;
  if (model) frontmatter.model = model;

  const cleanedContent = stripAutoHeader(content.trimStart()).trimStart();
  const header = `> Auto-generated from Codex skill \`${name}\` by sync-agents\n\n`;
  const output = matter.stringify(header + cleanedContent, frontmatter);

  if (!dryRun) {
    await mkdir(outputAgentsDir, { recursive: true });
    await Bun.write(outFile, output);
  }

  return { name, outputPath: outFile, files, kind: "agent" };
}

export async function transformCodexSkillToClaude(
  skillDir: string,
  outputSkillsDir: string,
  outputAgentsDir: string,
  dryRun: boolean
): Promise<SyncedClaudeItem | null> {
  const skillMdPath = join(skillDir, "SKILL.md");
  if (!existsSync(skillMdPath)) return null;

  const name = basename(skillDir);
  const raw = await readFile(skillMdPath, "utf-8");
  const { data, content } = matter(raw);

  const kind = detectOriginKind(content);

  if (kind === "agent") {
    const outFile = join(outputAgentsDir, `${name}.md`);
    if (existsSync(outFile)) return null;
    return writeClaudeAgent(
      name,
      data as Record<string, unknown>,
      content,
      outputAgentsDir,
      dryRun
    );
  }

  const outFile = join(outputSkillsDir, name, "SKILL.md");
  if (existsSync(outFile)) return null;
  return writeClaudeSkill(
    name,
    data as Record<string, unknown>,
    content,
    skillDir,
    outputSkillsDir,
    dryRun
  );
}
