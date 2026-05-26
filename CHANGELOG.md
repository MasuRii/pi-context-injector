# Changelog

All notable changes to this extension will be documented in this file.

## [Unreleased]

### Changed
- Renamed the extension package and runtime extension ID from `context-injector` to `pi-context-injector` for npm/GitHub publication alignment.
- Standardized root metadata, TypeScript verification scripts, repository links, license metadata, npm publish settings, and package file boundaries.
- Moved runtime configuration to root `config.json` and debug output to root `debug/pi-context-injector-debug.log` with `debug` defaulting to `false`.

### Added
- Added MIT license text, README publication documentation, changelog, `.npmignore`, and TypeScript project configuration.

## [0.1.2] - 2026-05-26

### Changed
- Widened peer dependency ranges from `^0.75.4` to `^0.74.0 || ^0.75.0` for both `@earendil-works/pi-coding-agent` and `@earendil-works/pi-tui`.
- Aligned dev dependencies to `^0.75.5` for `@earendil-works/pi-coding-agent` and `@earendil-works/pi-tui`.

## [0.1.1] - 2026-05-22

### Added
- Added compaction-context deduplication to avoid reinjecting identical session contexts after compaction.

### Changed
- Cached configuration loads by file fingerprint and moved debug logging to asynchronous redacted writes.
- Updated Pi peer dependencies and runtime imports to the `@earendil-works` scope.
