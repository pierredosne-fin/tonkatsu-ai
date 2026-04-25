# CLAUDE.md

This is a Claude Code plugin marketplace repository.

## Structure

- `.claude-plugin/marketplace.json` — marketplace catalog (lists all plugins)
- `plugins/` — each subdirectory is a plugin
- Each plugin has `.claude-plugin/plugin.json` + skills/, commands/, agents/, hooks/

## Adding a plugin

1. Create `plugins/<name>/.claude-plugin/plugin.json`
2. Add skills/commands/agents inside the plugin dir
3. Register in `.claude-plugin/marketplace.json` plugins array

## Conventions

- Plugin names: kebab-case
- Skill names: kebab-case
- Versions: semver (bump on each release)
- Source paths in marketplace.json are relative to `plugins/` (pluginRoot is set)
