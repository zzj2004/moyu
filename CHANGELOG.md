# Changelog

## [0.1.0] - 2026-06-12

### Added
- 🎯 **Core CLI** — Interactive (`moyu`) and non-interactive (`moyu -p "prompt"`) modes
- 🗄️ **11 Built-in Tools** — read_file, write_file (diff confirm), search_code (ripgrep), run_command, list_dir, file_delete, file_rename, git_status, git_diff, git_log, git_commit
- 🔌 **MCP Protocol Support** — Load external tools via Model Context Protocol (JSON-RPC over stdio)
- 🤖 **4 LLM Providers** — DeepSeek, Kimi (Moonshot), OpenAI, Ollama (local)
- 🔄 **Provider/Model Switching** — `/provider`, `/model`, `/models`, `/providers`
- 🔍 **Web Search** — Kimi `$web_search` builtin function
- 🖼️ **Image Analysis** — `/img <path> [question]` (Kimi multimodal)
- 🧠 **Thinking Mode** — `/thinking on|off|high|max` (DeepSeek reasoning_effort + Kimi thinking)
- 🛡️ **Two-level Permissions** — `/trust` (full access), `/confirm` (ask each time)
- 💬 **Streaming Output** — Real-time SSE display
- 💾 **Session Management** — Project-level (`.moyu/sessions/`) + global (`~/.moyu/sessions/`) auto-save, resume on startup
- ⚡ **Graceful Shutdown** — Ctrl+C auto-saves before exit
- 🏗️ **Config Initialization** — `--init` flag creates default config
- 📝 **MIT License**

### Fixed
- Agent loop now uses standard OpenAI `tool` role pattern (was `assistant` role)
- `buildBody` web_search tool no longer overridden by regular function tools
- Provider switching via env (`MOYU_PROVIDER`) correctly updates baseUrl and API key
- `reasoning_content` support for Kimi thinking model tool call messages
- Session load preserves `tool_call_id` and `tool_calls` fields
- Non-interactive mode now auto-saves session
- README and Banner encoding (Chinese characters were garbled)
