# sync-agents

CLI tool that syncs Claude Code and Codex skills/agents in both directions.

## Running

```bash
bun cli.ts                    # Sync to ~/.codex/skills/
bun cli.ts --source <dir>     # Custom source (default: ~/.claude)
bun cli.ts --dry-run          # Preview without writing
```

## Architecture

- `cli.ts` — Entry point. Parses args, calls `sync()`, prints results via `@clack/prompts`.
- `sync.ts` — Orchestration. Discovers Claude skills/agents and Codex skills, then syncs missing items both ways. Delegates to adapters.
- `adapters/skill.ts` — Transforms a Claude skill directory into a Codex skill. Parses YAML frontmatter with `gray-matter`, strips Claude-specific fields, adapts tool references in content, copies `.ts` files to `scripts/`, and copies sub-markdown docs.
- `adapters/agent.ts` — Transforms a Claude agent `.md` file into a Codex skill folder with SKILL.md. Merges agent metadata (model, description) into Codex frontmatter.
- `adapters/codex.ts` — Transforms a Codex skill directory into a Claude skill or agent. Preserves frontmatter, adds an auto-generation notice, copies `scripts/*.ts` into the Claude skill root, and passes through extra markdown docs.

## Key behaviors

- Frontmatter transformation (Claude → Codex): keeps `name` and `description`, drops `color`, `model`, `user_invocable`, `tools`.
- Content adaptation (Claude → Codex): rewrites Claude tool references (e.g. "Use the Read tool" → "Read the file").
- Sync direction: Claude → Codex always overwrites by name (Claude wins on conflicts). Codex → Claude is additive only.
- Codex → Claude: Codex skills become Claude skills unless the content header indicates the skill was generated from a Claude agent, in which case a Claude agent is created.
- Project docs: if the current directory has `CLAUDE.md` or `AGENTS.md`, the most recently modified file overwrites the other.
- Each output file gets an auto-generation notice.
- No build step — runs directly with `bun`.

## Dependencies

- `@clack/prompts` — CLI UI
- `gray-matter` — YAML frontmatter parsing
