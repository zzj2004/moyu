# Changelog

## [0.3.0] - 2026-06-12

### Changed
- DeepSeek PROVIDER_CAPS now shows thinking support (matches MODEL_CAPS for deepseek-v4-pro, deepseek-reasoner)
- MODEL_CAPS extended with all DeepSeek models (deepseek-chat, deepseek-coder explicitly as non-thinking)
- Code generation rules in system prompt: ESM/CJS detection, JSDoc, input validation, post-write testing
- npm test script added for 25-item regression suite
- .gitattributes for cross-platform CRLF/LF normalization

### Fixed
- Tool parameter name alignment in file_delete and file_rename (filePath/sourcePath/destPath now consistent between properties and required arrays)
- Kimi API 400 error caused by JSON Schema mismatch (required field not in properties)

### Known Issues
- Kimi web search ($web_search) triggers tool call with search_id, but second-round API response does not include actual search results. Awaiting Kimi API update or documentation clarification.

## [0.2.0] - 2026-06-12

### Fixed
- git_log Windows crash - replaced execSync with spawnSync (array args avoids shell interpretation)
- Interactive model selector freeze - replaced raw-mode stdin with readline.question() numbered input
- setModel() validation - warns and keeps current model for nonexistent names
- Tool parameter names inconsistency - file_delete/file_rename now use consistent naming

## [0.1.0] - 2026-06-12

### Added
- Core CLI, 11 built-in tools, MCP support, 4 LLM providers
- Provider/model switching, web search, image analysis, thinking mode
- Two-level permissions, session management, streaming output
- MIT License
