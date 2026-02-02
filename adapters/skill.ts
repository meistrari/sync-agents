import matter from "gray-matter";
import { existsSync } from "fs";
import { readdir, readFile, copyFile, mkdir } from "fs/promises";
import { join, basename } from "path";

export interface SyncedSkill {
  name: string;
  outputPath: string;
  files: string[];
}

function toCodexFrontmatter(data: Record<string, unknown>): Record<string, unknown> {
  const codex: Record<string, unknown> = {};
  if (data.name) codex.name = data.name;
  if (data.description) codex.description = data.description;
  // Strip Claude-specific fields
  return codex;
}

function adaptContent(content: string): string {
  let adapted = content;

  // Adapt tool references
  adapted = adapted.replace(/\bUse the Read tool\b/g, "Read the file");
  adapted = adapted.replace(/\bUse the Write tool\b/g, "Write to the file");
  adapted = adapted.replace(/\bUse the Glob tool\b/g, "Search for files");
  adapted = adapted.replace(/\bUse the Grep tool\b/g, "Search file contents");
  adapted = adapted.replace(/\bUse the Edit tool\b/g, "Edit the file");
  adapted = adapted.replace(/\bUse the Bash tool\b/g, "Run the command");

  return adapted;
}

export async function transformSkill(
  skillDir: string,
  outputDir: string,
  dryRun: boolean
): Promise<SyncedSkill | null> {
  const skillMdPath = join(skillDir, "SKILL.md");
  if (!existsSync(skillMdPath)) return null;

  const name = basename(skillDir);
  const raw = await readFile(skillMdPath, "utf-8");
  const { data, content } = matter(raw);

  const codexFrontmatter = toCodexFrontmatter(data);
  const adaptedContent = adaptContent(content);

  const header = `> Auto-generated from Claude Code skill \`${name}\` by sync-agents\n\n`;
  const output = matter.stringify(header + adaptedContent.trimStart(), codexFrontmatter);

  const outDir = join(outputDir, name);
  const outFile = join(outDir, "SKILL.md");
  const files = [outFile];

  if (!dryRun) {
    await mkdir(outDir, { recursive: true });
    await Bun.write(outFile, output);

    // Copy .ts files into scripts/
    const entries = await readdir(skillDir);
    const tsFiles = entries.filter(
      (e) => e.endsWith(".ts") && e !== "SKILL.md"
    );
    if (tsFiles.length > 0) {
      const scriptsDir = join(outDir, "scripts");
      await mkdir(scriptsDir, { recursive: true });
      for (const f of tsFiles) {
        await copyFile(join(skillDir, f), join(scriptsDir, f));
        files.push(join(scriptsDir, f));
      }
    }

    // Copy sub-markdown files (individual skill docs)
    const mdFiles = entries.filter(
      (e) => e.endsWith(".md") && e !== "SKILL.md"
    );
    for (const f of mdFiles) {
      const mdRaw = await readFile(join(skillDir, f), "utf-8");
      const mdParsed = matter(mdRaw);
      const mdOut = matter.stringify(
        adaptContent(mdParsed.content).trimStart(),
        toCodexFrontmatter(mdParsed.data)
      );
      await Bun.write(join(outDir, f), mdOut);
      files.push(join(outDir, f));
    }
  }

  return { name, outputPath: outDir, files };
}
