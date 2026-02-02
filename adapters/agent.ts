import matter from "gray-matter";
import { readFile, mkdir } from "fs/promises";
import { join, basename } from "path";

export interface SyncedAgent {
  name: string;
  outputPath: string;
  files: string[];
}

function agentToCodexFrontmatter(data: Record<string, unknown>): Record<string, unknown> {
  const codex: Record<string, unknown> = {};
  if (data.name) codex.name = data.name;

  // Build description from agent metadata
  const parts: string[] = [];
  if (data.description) parts.push(String(data.description));
  if (data.model) parts.push(`Original model: ${data.model}`);
  codex.description = parts.join(". ");

  // Strip Claude-specific: color, tools, model
  return codex;
}

function adaptAgentContent(content: string): string {
  let adapted = content;

  // Same tool adaptations as skills
  adapted = adapted.replace(/\bUse the Read tool\b/g, "Read the file");
  adapted = adapted.replace(/\bUse the Write tool\b/g, "Write to the file");
  adapted = adapted.replace(/\bUse the Glob tool\b/g, "Search for files");
  adapted = adapted.replace(/\bUse the Grep tool\b/g, "Search file contents");
  adapted = adapted.replace(/\bUse the Edit tool\b/g, "Edit the file");
  adapted = adapted.replace(/\bUse the Bash tool\b/g, "Run the command");

  // Adapt Bash tool references (backtick form)
  adapted = adapted.replace(/`Glob`/g, "file search");
  adapted = adapted.replace(/`Grep`/g, "content search");
  adapted = adapted.replace(/`Read`/g, "file read");

  return adapted;
}

export async function transformAgent(
  agentPath: string,
  outputDir: string,
  dryRun: boolean
): Promise<SyncedAgent | null> {
  const raw = await readFile(agentPath, "utf-8");
  const { data, content } = matter(raw);

  const name = basename(agentPath, ".md");
  const codexFrontmatter = agentToCodexFrontmatter(data);
  const adaptedContent = adaptAgentContent(content);

  const header = `> Auto-generated from Claude Code agent \`${name}\` by sync-agents\n\n`;
  const output = matter.stringify(header + adaptedContent.trimStart(), codexFrontmatter);

  const outDir = join(outputDir, name);
  const outFile = join(outDir, "SKILL.md");
  const files = [outFile];

  if (!dryRun) {
    await mkdir(outDir, { recursive: true });
    await Bun.write(outFile, output);
  }

  return { name, outputPath: outDir, files };
}
