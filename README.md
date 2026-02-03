# sync-agents

[![npm version](https://img.shields.io/npm/v/sync-agents.svg)](https://www.npmjs.com/package/sync-agents)
[![npm downloads](https://img.shields.io/npm/dm/sync-agents.svg)](https://www.npmjs.com/package/sync-agents)
[![license](https://img.shields.io/npm/l/sync-agents.svg)](https://www.npmjs.com/package/sync-agents)

Bi-directional sync between [Claude Code](https://docs.anthropic.com/en/docs/claude-code) and [Codex](https://openai.com/index/introducing-codex/) skills and agents.

## Install

```bash
bunx sync-agents
```

Or install globally:

```bash
bun install -g sync-agents
```
Then run directly:

```bash
sync-agents
```

## Usage

```bash
sync-agents                    # Sync ~/.claude ↔ ~/.codex/skills/
sync-agents --source <dir>     # Use a custom Claude config directory
sync-agents --dry-run          # Preview changes without writing anything
```

## What it does

- **Claude → Codex**: Converts Claude skills and agents into Codex skill folders. Transforms frontmatter, rewrites tool references, and copies scripts.
- **Codex → Claude**: Adds Codex-only skills back into Claude (additive — won't overwrite existing Claude skills).
- **Project docs**: If the current directory has both `CLAUDE.md` and `AGENTS.md`, the most recently modified one overwrites the other.

Claude always wins on name conflicts during Claude → Codex sync.

## Requirements

- [Bun](https://bun.sh) runtime
