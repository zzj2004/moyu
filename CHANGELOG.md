# Changelog

## [0.2.0] - 2026-06-12

### Fixed
- git_log Windows crash — %s format string interpreted by cmd.exe. Replaced execSync with spawnSync (array args avoids shell interpretation).
- Interactive model selector freeze — /models arrow-key selector caused input freeze. Replaced raw-mode stdin with readline.question() numbered input (zero raw mode conflicts).
- setModel() allows nonexistent models — else branch silently accepted invalid model names. Now warns and keeps the current model.
- Inconsistent tool parameter names — file_delete uses filePath (was path), file_rename uses sourcePath/destPath (was source/dest).

### Changed
- System prompt — Added Code Generation Rules section: ESM/CJS detection, JSDoc requirement, input validation, post-write testing.
- Tool parameter names documented in system prompt for better LLM accuracy.
- Version bumped to 0.2.0.

## [0.1.0] - 2026-06-12

### Added
- Core CLI, 11 built-in tools, MCP support, 4 LLM providers
- Provider/model switching, web search, image analysis, thinking mode
- Two-level permissions, session management, streaming output
- MIT License

### Fixed
- Agent loop tool role pattern, provider switching via env, Kimi reasoning_content
- Session load preserves tool fields, non-interactive mode auto-save
- README and banner encoding
