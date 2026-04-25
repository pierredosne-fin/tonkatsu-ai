# my-team-plugins

A Claude Code plugin marketplace for our team.

## Usage

Add this marketplace to Claude Code:

```shell
/plugin marketplace add <owner>/<repo>
```

Then install any plugin:

```shell
/plugin install <plugin-name>@my-team-plugins
```

## Adding a new plugin

1. Create a directory under `plugins/`:

```
plugins/my-plugin/
  .claude-plugin/
    plugin.json
  skills/
    my-skill/
      SKILL.md
```

2. Write `plugin.json`:

```json
{
  "name": "my-plugin",
  "description": "What it does",
  "version": "1.0.0"
}
```

3. Add skills, commands, agents, hooks, or MCP servers inside the plugin directory.

4. Register it in `.claude-plugin/marketplace.json`:

```json
{
  "name": "my-plugin",
  "source": "my-plugin",
  "description": "What it does"
}
```

Since `metadata.pluginRoot` is set to `./plugins`, the source path is relative to that.

## Plugin structure reference

```
plugins/<name>/
  .claude-plugin/
    plugin.json          # name, description, version
  skills/
    <skill-name>/
      SKILL.md           # skill content (frontmatter + instructions)
  commands/
    <command-name>.md    # slash command
  agents/
    <agent-name>.md      # agent definition
  hooks/
    hooks.json           # hook configuration
```

## Docs

- [Discover plugins](https://code.claude.com/docs/discover-plugins)
- [Create plugins](https://code.claude.com/docs/plugins)
- [Plugin marketplaces](https://code.claude.com/docs/plugin-marketplaces)
- [Plugins reference](https://code.claude.com/docs/plugins-reference)
