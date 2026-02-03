# sync-agents
[![npm version](https://img.shields.io/npm/v/sync-agents.svg)](https://www.npmjs.com/package/sync-agents)
[![npm downloads](https://img.shields.io/npm/dm/sync-agents.svg)](https://www.npmjs.com/package/sync-agents)
[![license](https://img.shields.io/npm/l/sync-agents.svg)](https://www.npmjs.com/package/sync-agents)

https://github.com/user-attachments/assets/d061d969-1eef-4784-844c-c788453875c2

Sync between [Claude Code](https://docs.anthropic.com/en/docs/claude-code),[Codex](https://openai.com/index/introducing-codex/) and other coding agents and skills.

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
sync-agents [options]
```

### Flags

| Flag | Description |
|------|-------------|
| `--global` | Sync only global setup (`~/.claude` ↔ `~/.agents`) |
| `--local` | Sync only current folder (`CLAUDE.md` ↔ `AGENTS.md`) |
| `--source <dir>` | Custom Claude source directory (default: `~/.claude`) |
| `--dry-run` | Preview changes without writing any files |
| `--no-cleanup` | Skip removing skills from `~/.codex` after migration |

### Examples

```bash
# Sync everything (global setup + current folder)
sync-agents

# Preview what would be synced without making changes
sync-agents --dry-run

# Sync only global skills and agents
sync-agents --global

# Sync only project docs (CLAUDE.md ↔ AGENTS.md)
sync-agents --local

# Use a custom Claude directory
sync-agents --source ~/my-claude-config

# Migrate from .codex but keep the original files
sync-agents --no-cleanup

# Combine flags
sync-agents --global --dry-run
```

## What it does

### Directory Precedence

1. **`~/.claude`** — Highest precedence (source of truth)
2. **`~/.agents`** — Shared standard, syncs bidirectionally with Claude
3. **`~/.codex`** — Legacy, migrates to `.agents` then gets cleaned up

### Sync Flow

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   .claude   │ ──────► │   .agents   │ ◄────── │   .codex    │
│  (source)   │         │  (shared)   │         │  (legacy)   │
└─────────────┘         └─────────────┘         └─────────────┘
       ▲                       │                       │
       │                       │                       │
       └───────────────────────┘                       │
         (additive only)                               │
                                                       ▼
                                              ┌─────────────┐
                                              │   cleanup   │
                                              └─────────────┘
```

- **Claude → Agents**: Skills and agents from `~/.claude` sync to `~/.agents/skills`. Claude wins on conflicts.
- **Codex → Agents**: Legacy `~/.codex/skills` migrate to `~/.agents/skills` (additive only).
- **Agents → Claude**: Skills from `.agents` that don't exist in Claude sync back (additive only).
- **Cleanup**: After migration, skills are removed from `.codex` (use `--no-cleanup` to preserve).

### Project Docs

If the current directory has both `CLAUDE.md` and `AGENTS.md`, the most recently modified file overwrites the other.

## Why?

The `.agents` folder is becoming the shared standard for coding agents. [Codex now reads skills from `~/.agents/skills`](https://developers.openai.com/codex/skills/) natively, but Claude Code doesn't support it yet.

This tool bridges the gap:
- Maintain skills in Claude Code's format (your source of truth)
- Auto-sync to `.agents` for Codex compatibility
- Migrate existing `.codex` skills to the new standard
- Keep project docs in sync

## Requirements

- [Bun](https://bun.sh) runtime
