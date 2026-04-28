# pi-context-injector

[![npm version](https://img.shields.io/npm/v/pi-context-injector?style=flat-square)](https://www.npmjs.com/package/pi-context-injector) [![License](https://img.shields.io/github/license/MasuRii/pi-context-injector?style=flat-square)](LICENSE)

<img width="1389" height="768" alt="image" src="https://github.com/user-attachments/assets/db3c4ceb-e24e-4bc7-93b1-be3ea5f88d5c" />

`pi-context-injector` is a Pi extension that injects compact project context into the first user turn and adds continuity context after conversation compaction.

- **npm**: https://www.npmjs.com/package/pi-context-injector
- **GitHub**: https://github.com/MasuRii/pi-context-injector

## Capabilities

- Adds README excerpts, recent git history, workspace state, and detected tech stack context before the first model response.
- Supports model-aware XML or Markdown formatting for injected context blocks.
- Adds optional compaction continuity context containing workspace state, recent files, todo state, and configured additional context.
- Provides the `/context-injector` TUI command for configuration inspection, path display, reset, and interactive settings.
- Keeps debug logging disabled by default and writes only to the extension-local `debug/` directory when enabled.

## Installation

### npm package

```bash
pi install npm:pi-context-injector
```

### Git repository

```bash
pi install git:github.com/MasuRii/pi-context-injector
```

### Local extension folder

Place this folder in one of Pi's extension discovery paths:

| Scope | Path |
|-------|------|
| Global default | `~/.pi/agent/extensions/pi-context-injector` |
| Project | `.pi/extensions/pi-context-injector` |

Pi discovers the extension through the root `index.ts` entry listed in `package.json`, which forwards to `src/index.ts`.

## Usage

Open the interactive TUI settings modal with:

```text
/context-injector
```

Useful command forms:

```text
/context-injector show
/context-injector path
/context-injector reset
```

## Configuration

Runtime configuration is stored at the extension root:

```text
~/.pi/agent/extensions/pi-context-injector/config.json
```

A starter template is included at `config/config.example.json`. Copy it to `config.json` for local customization, or let the extension create `config.json` with production defaults on first load.

```bash
cp config/config.example.json config.json
```

The published package intentionally excludes local runtime state: `config.json` and `debug/` stay local to each installation.

### Configuration options

| Key | Type | Default | Purpose |
|-----|------|---------|---------|
| `debug` | `boolean` | `false` | Enables debug logging under `debug/pi-context-injector-debug.log` |
| `enabled` | `boolean` | `true` | Enables first-turn and compaction context injection |
| `silent` | `boolean` | `true` | Hides injected context from the chat UI while still sending it to the model |
| `injectionTarget` | `"user_message" \| "system_prompt"` | `"user_message"` | Selects where initial project context is injected |
| `dynamicFormat` | `boolean` | `true` | Selects XML or Markdown formatting based on the model family |
| `readmeLines` | `number` | `50` | Limits README lines before pruning |
| `commitCount` | `number` | `5` | Limits recent commits included in first-turn context |
| `enableReadme` | `boolean` | `true` | Includes README context when a README file is available |
| `enableGit` | `boolean` | `true` | Includes recent commit context from Git repositories |
| `enableWorkspaceState` | `boolean` | `true` | Includes concise workspace status context |
| `enableTechStack` | `boolean` | `true` | Includes detected dependency and project metadata context |
| `maxDependencies` | `number` | `15` | Limits dependency names included in tech-stack context |
| `smartPrune` | `boolean` | `true` | Removes low-signal README content before injection |
| `skipForkedSessions` | `boolean` | `true` | Avoids duplicate initial injection in parent-linked sessions |
| `compaction.enabled` | `boolean` | `true` | Enables post-compaction continuity context |
| `compaction.maxRecentFiles` | `number` | `20` | Limits recent files included in compaction continuity context |
| `compaction.recentFilesMaxAge` | `number` | `7` | Limits recent files to this age in days |
| `compaction.additionalContext` | `string[]` | `[]` | Adds operator-provided continuity notes after compaction |

### Example config

```json
{
  "enabled": true,
  "silent": true,
  "injectionTarget": "user_message",
  "dynamicFormat": true,
  "readmeLines": 50,
  "commitCount": 5,
  "enableReadme": true,
  "enableGit": true,
  "enableWorkspaceState": true,
  "enableTechStack": true,
  "maxDependencies": 15,
  "smartPrune": true,
  "stripBold": true,
  "pruneLicense": true,
  "stripHtmlComments": true,
  "maxCodeBlockLines": 15,
  "stripNavigationLinks": true,
  "stripDetailsTags": true,
  "ignoredSections": [
    "Sponsors",
    "Contributors",
    "Backers",
    "Acknowledgements",
    "Changelog",
    "Donate"
  ],
  "skipForkedSessions": true,
  "debug": false,
  "compaction": {
    "enabled": true,
    "injectWorkspaceState": true,
    "injectTechStack": false,
    "injectActiveFiles": true,
    "injectTodoState": true,
    "maxRecentFiles": 20,
    "recentFilesMaxAge": 7,
    "additionalContext": []
  }
}
```

Invalid or missing values are normalized to bounded defaults when the extension loads configuration.

## Debug logging

Debug logging is disabled by default through `"debug": false`. When enabled, logs are appended only to:

```text
debug/pi-context-injector-debug.log
```

The extension does not write debug output to `console`, `stdout`, or `stderr`, and no debug log file is opened when debug logging is disabled.

## Repository structure

This package follows the same published-extension shape used by local Pi extensions such as `pi-agent-router` and `pi-multi-auth`: the stable Pi discovery entrypoint remains at the repository root, and implementation modules live under `src/`.

```text
pi-context-injector/
├── index.ts                         # Stable Pi extension entrypoint for auto-discovery
├── src/
│   ├── index.ts                     # Extension bootstrap and hook registration
│   ├── command-runner.ts            # Bounded external command execution helpers
│   ├── config-modal.ts              # `/context-injector` command and TUI settings modal
│   ├── config-store.ts              # Config creation, loading, validation, and saving
│   ├── constants.ts                 # Runtime paths, defaults, and message type constants
│   ├── context-builder.ts           # Project and compaction context assembly
│   ├── jsonc.ts                     # JSONC parsing helper for legacy config migration
│   ├── logger.ts                    # File-only debug logger gated by config.json
│   └── types.ts                     # Shared extension types
├── config/
│   └── config.example.json          # Starter config template
├── CHANGELOG.md
├── LICENSE
├── package.json
├── README.md
└── tsconfig.json
```

## Development

```bash
npm install
npm run build
npm run lint
npm run test
npm run check
npm pack --dry-run
```

All verification scripts type-check the strict TypeScript project. The package is configured for public npm publication through `publishConfig.access: "public"`.

## Publishing

The package metadata follows the publish-ready shape used by established local Pi extensions:

- entrypoint: `index.ts`
- package exports: `.` → `./index.ts`
- Pi extension manifest: `pi.extensions`
- published files: source, README, changelog, license, and config template
- runtime `config.json` and `debug/` logs excluded from npm publication

## Related Pi Extensions

| Extension | Install | Description |
|-----------|---------|-------------|
| [pi-agent-router](https://www.npmjs.com/package/pi-agent-router) | `pi install npm:pi-agent-router` | Active-agent routing and controlled subagent delegation that can require context injection for delegated sessions |
| [pi-multi-auth](https://www.npmjs.com/package/pi-multi-auth) | `pi install npm:pi-multi-auth` | Multi-provider credential management, OAuth login, and account rotation |
| [pi-mcp-adapter](https://github.com/MasuRii/pi-mcp-adapter) | `pi install git:github.com/MasuRii/pi-mcp-adapter` | MCP server discovery and Pi tool exposure for external context sources |
| [pi-rtk-optimizer](https://www.npmjs.com/package/pi-rtk-optimizer) | `pi install npm:pi-rtk-optimizer` | RTK command rewriting and tool output compaction that complements compact context injection |

## License

[MIT](LICENSE)
