# sync-agents

CLI tool that syncs Claude Code and Codex skills/agents via the shared `.agents` folder.

## Running

```bash
bun cli.ts                    # Sync global setup + current folder
bun cli.ts --global           # Sync only global setup (~/.claude <-> ~/.agents)
bun cli.ts --local            # Sync only current folder (CLAUDE.md <-> AGENTS.md)
bun cli.ts --source <dir>     # Custom source (default: ~/.claude)
bun cli.ts --dry-run          # Preview without writing
bun cli.ts --no-cleanup       # Skip removing skills from ~/.codex after migration
```

## Architecture

- `cli.ts` — Entry point. Parses args, calls `sync()`, prints results via `@clack/prompts`.
- `sync.ts` — Orchestration. Syncs Claude skills/agents to `.agents`, migrates from `.codex`, and syncs back to Claude. Delegates to adapters.
- `adapters/skill.ts` — Transforms a Claude skill directory into an Agents skill. Parses YAML frontmatter with `gray-matter`, strips Claude-specific fields, adapts tool references in content, copies `.ts` files to `scripts/`, and copies sub-markdown docs.
- `adapters/agent.ts` — Transforms a Claude agent `.md` file into an Agents skill folder with SKILL.md. Merges agent metadata (model, description) into frontmatter.
- `adapters/codex.ts` — Transforms an Agents/Codex skill directory into a Claude skill or agent. Preserves frontmatter, copies `scripts/*.ts` into the Claude skill root, and passes through extra markdown docs.

## Directory Precedence

1. **`.claude`** — Highest precedence (source of truth)
2. **`.agents`** — Shared standard, syncs bidirectionally with Claude
3. **`.codex`** — Legacy, migrates to `.agents` then gets cleaned up

## Key behaviors

- Frontmatter transformation (Claude → Agents): keeps `name` and `description`, drops `color`, `model`, `user_invocable`, `tools`.
- Content adaptation (Claude → Agents): rewrites Claude tool references (e.g. "Use the Read tool" → "Read the file").
- Sync direction:
  - Claude → Agents: always overwrites by name (Claude wins on conflicts)
  - Codex → Agents: additive migration, then cleanup from Codex
  - Agents → Claude: additive only (skip existing)
- Codex migration: Skills in `.codex` are copied to `.agents` and then removed from `.codex` (unless `--no-cleanup` is used).
- Agents → Claude: Skills become Claude skills unless the content header indicates the skill was generated from a Claude agent, in which case a Claude agent is created.
- Project docs: if the current directory has `CLAUDE.md` or `AGENTS.md`, the most recently modified file overwrites the other.
- No build step — runs directly with `bun`.

## Dependencies

- `@clack/prompts` — CLI UI
- `gray-matter` — YAML frontmatter parsing
