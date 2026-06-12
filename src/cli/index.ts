/**
 * moyu - CLI entry point
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import { loadConfig, getProviderApiKey } from '../config/index.js';
import { createLLM } from '../llm/index.js';
import { BUILTIN_PROVIDERS, PROVIDER_CAPS, MODEL_CAPS, type ContentPart } from '../llm/types.js';
import { saveSession, loadLatestSession, loadSession, listSessions, deleteSession, autoSave } from '../session/index.js';
import { OpenAICompatibleProvider } from '../llm/openai.js';
import { ToolRegistry } from '../tools/index.js';
import { runAgent, printBanner, type AgentContext } from '../agent/index.js';
import { readFileSync as fsReadFileSync, existsSync as fsExistsSync } from 'node:fs';
import type { LLMProvider } from '../llm/types.js';
import type { MoyuConfig } from '../config/types.js';

interface CliState {
  config: MoyuConfig;
  llm: LLMProvider;
  projectDir: string;
  registry: ToolRegistry;
  permissionMode: 'confirm' | 'trusted';
  messages: import('../llm/types.js').Message[];
  sessionId: string;
  /** Track message count for auto-save debounce */
  lastSavedCount: number;
}

function parseArgs(): { nonInteractive?: string; help?: boolean; version?: boolean } {
  const args = process.argv.slice(2);
  const result: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '-h': case '--help': result.help = true; break;
      case '-v': case '--version': result.version = true; break;
      case '-p': result.nonInteractive = args[++i]; break;
      default:
        if (!args[i].startsWith('-')) result.nonInteractive = args[i];
    }
  }
  return result as { nonInteractive?: string; help?: boolean; version?: boolean };
}

function printHelp(): void {
  console.log(`Usage: moyu [options] [prompt]

Options:
  -p, --prompt <text>   Non-interactive mode
  -h, --help            Show help
  -v, --version         Show version

Examples:
  moyu                  Interactive session
  moyu -p "explain this"
`);
}

function printVersion(): void {
  let version = '0.1.0';
  try {
    const pkgPath = new URL('../../package.json', import.meta.url).pathname;
    if (existsSync(pkgPath)) version = JSON.parse(readFileSync(pkgPath, 'utf-8')).version || version;
  } catch { /* ignore */ }
  console.log(`moyu v${version}`);
}

/** Create a new LLM provider for a given provider name */
function createProviderFor(config: MoyuConfig, providerName: string): LLMProvider | null {
  const info = BUILTIN_PROVIDERS[providerName];
  if (!info) {
    console.log(chalk.red(`Unknown provider: "${providerName}"`));
    return null;
  }

  // Get API key: try providerKeys map first, then env, then current key
  let apiKey = getProviderApiKey(config, providerName);
  if (!apiKey && providerName === config.llm.provider) apiKey = config.llm.apiKey;
  if (!apiKey) {
    console.log(chalk.red(`No API key configured for "${providerName}". Set MOYU_${providerName.toUpperCase()}_API_KEY env var.`));
    return null;
  }

  return new OpenAICompatibleProvider({
    name: info.name,
    displayName: info.displayName,
    apiKey,
    baseUrl: info.baseUrl,
    model: info.defaultModel,
    availableModels: info.models,
    maxTokens: config.llm.maxTokens || info.maxTokens,
    temperature: config.llm.temperature ?? info.defaultTemperature ?? 1,
    reasoningEffort: config.llm.reasoningEffort,
  });
}

function buildAgentContext(state: CliState): AgentContext {
  return {
    config: state.config,
    projectDir: state.projectDir,
    llm: state.llm,
    registry: state.registry,
    permissionMode: state.permissionMode,
    messages: state.messages,
  };
}

async function startInteractive(state: CliState): Promise<void> {
  printBanner();

  // Check for resumable session (only in interactive mode)
  let initialMessages: import('../llm/types.js').Message[] = [];
  if (process.stdin.isTTY) {
    const resumeSession = loadLatestSession(state.projectDir);
    if (resumeSession && resumeSession.messages && resumeSession.messages.length > 1) {
      console.log(chalk.gray(`Previous session found: ${resumeSession.sessionId} (${resumeSession.messages.length} messages)`));
      console.log(chalk.gray('Resume? (Y/n):'));
      const answer = await askYesNo();
      if (answer) {
        initialMessages = resumeSession.messages;
        state.sessionId = resumeSession.sessionId;
        console.log(chalk.green('Session restored.'));
      }
    }
  }
  state.messages = initialMessages;

  console.log(chalk.gray('Type your questions, or /help for commands. (Ctrl+C to exit)'));
  showStatus(state);
  console.log('');

  const { createInterface } = await import('node:readline');
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.blue('moyu ') + chalk.gray(state.llm.name + '> '),
  });

  // Handle Ctrl+C gracefully
  rl.on('SIGINT', () => {
    console.log('');
    console.log(chalk.blue('Goodbye!'));
    doAutoSave(state);
    state.registry.cleanup();
    process.exit(0);
  });

  safePrompt(rl);

  for await (const line of rl) {
    const input = line.trim();
    if (!input) { safePrompt(rl); continue; }

    if (input.startsWith('/')) {
      await handleCommand(input, state, rl);
    } else {
      const ctx = buildAgentContext(state);
      await runAgent(ctx, input);
      state.messages = ctx.messages;
      doAutoSave(state);
    }

    safePrompt(rl);
  }
}

/** Check if current provider supports images */
function checkImageSupport(state: CliState): boolean {
  const caps = PROVIDER_CAPS[state.llm.name];
  if (!caps?.supportsImages) {
    console.log(chalk.yellow(`⚠️  ${state.llm.displayName} does not support image input.`));
    console.log(chalk.yellow('   Switch to Kimi with: /provider kimi'));
    return false;
  }
  return true;
}

/** MIME type from file extension */
function mimeFromExt(ext: string): string {
  const map: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
  };
  return map[ext.toLowerCase()] || 'image/png';
}

/** Load an image file and return a base64 data URL */
function loadImageDataUrl(filePath: string): string | null {
  try {
    const ext = filePath.match(/\.(\w+)$/)?.[0] || '.png';
    const mime = mimeFromExt(ext);
    const data = fsReadFileSync(filePath);
    const base64 = data.toString('base64');
    return `data:${mime};base64,${base64}`;
  } catch (e) {
    console.log(chalk.red(`Failed to read image: ${(e as Error).message}`));
    return null;
  }
}

/** Safe prompt that doesn't crash if readline is already closed */
/** Ask a yes/no question and return boolean */
function askYesNo(): Promise<boolean> {
  return new Promise((resolve) => {
    const { stdin } = process;
    const onData = (data: Buffer) => {
      stdin.removeListener('data', onData);
      const answer = data.toString().trim().toLowerCase();
      resolve(answer === '' || answer === 'y' || answer === 'yes');
    };
    stdin.once('data', onData);
  });
}

function safePrompt(rl: { prompt(): void; closed?: boolean }): void {
  try { if (!rl.closed) rl.prompt(); } catch { /* ignore */ }
}

/** Auto-save current state to both project and global dirs */
function doAutoSave(state: CliState): void {
  if (state.messages.length === state.lastSavedCount) return; // No new messages
  autoSave(state.projectDir, state.sessionId, {
    projectDir: state.projectDir,
    sessionId: state.sessionId,
    provider: state.llm.name,
    model: state.llm.model,
    permissionMode: state.permissionMode,
    messages: state.messages,
  });
  state.lastSavedCount = state.messages.length;
}

function showStatus(state: CliState): void {
  const mode = state.permissionMode === 'trusted' ? chalk.green('Trusted') : chalk.yellow('Confirm');
  const llmObj = state.llm as any;
  const thinking = llmObj.thinkingOn ? chalk.cyan('ON') : chalk.gray('OFF');
  const search = llmObj.webSearchOn ? chalk.cyan('ON') : chalk.gray('OFF');
  const effort = llmObj._reasoningEffort ? chalk.gray(' [' + llmObj._reasoningEffort + ']') : '';
  console.log(chalk.gray(`Provider: ${state.llm.displayName} | Model: ${state.llm.model} | Mode: ${mode} | Thinking: ${thinking}${effort} | Search: ${search}`));
}

async function handleCommand(input: string, state: CliState, rl: { prompt(): void }): Promise<void> {
  const parts = input.slice(1).split(' ');
  const cmd = parts[0];
  const arg = parts.slice(1).join(' ');

  switch (cmd) {
    case 'help':
      console.log(`
── Provider & Model ──
  /provider [name]      Show/Switch provider (deepseek, kimi)
  /model [name]         Show/Switch model
  /models               List models for current provider
  /providers            List providers with config status
  /thinking on|off      Toggle thinking mode
  /thinking high|max    Set reasoning effort
  /search on|off        Toggle web search

── Session ──
  /save [name]          Save current session
  /load <name>          Load a session
  /sessions             List all saved sessions
  /session-delete <n>   Delete a session

── Tools & Images ──
  /img <path> [问题]   Send image for analysis (Kimi only)

── Permissions ──
  /trust                Trusted mode (no prompts)
  /confirm              Confirm mode (ask each time)

── Other ──
  /status               Show current settings
  /clear                Clear conversation
  /help                 Show this help
  /exit                 Exit
`);
      break;

    case 'clear':
      state.messages = [];
      console.log(chalk.green('Conversation cleared.'));
      break;

    case 'model':
      if (!arg) {
        console.log(`Current: ${state.llm.displayName} / ${state.llm.model}`);
      } else {
        state.llm.setModel(arg);
        state.messages = [];
        console.log(chalk.green(`Switched model to: ${arg}`));
      }
      break;

    case 'models':
      console.log(chalk.cyan(`Available models for ${state.llm.displayName}:`));
      for (const m of state.llm.availableModels) {
        const marker = m === state.llm.model ? chalk.green(' <--') : '';
        console.log(`  - ${m}${marker}`);
      }
      break;

    case 'provider':
      if (!arg) {
        console.log(`Current: ${state.llm.displayName} (${state.llm.name})`);
      } else {
        const newProvider = createProviderFor(state.config, arg);
        if (newProvider) {
          state.llm = newProvider;
          state.messages = [];
          console.log(chalk.green(`Switched provider to: ${newProvider.displayName}`));
          console.log(chalk.gray(`  Model: ${newProvider.model}`));
        }
      }
      break;

    case 'providers':
      console.log(chalk.cyan('Available providers:'));
    console.log(chalk.gray(' 📷 = image support  🧠 = thinking mode'));
      for (const [name, info] of Object.entries(BUILTIN_PROVIDERS)) {
        const key = getProviderApiKey(state.config, name) || state.config.llm.apiKey;
        const hasKey = key ? chalk.green('✅configured') : chalk.red('❌no API key');
        const caps = PROVIDER_CAPS[name];
    const badge = caps?.supportsImages ? ' 📷' : '';
    const marker = name === state.llm.name ? chalk.green(' <-- active') : '';
        console.log(`  - ${info.displayName} (${name})${badge} ${hasKey}${marker}`);
      }
      break;

    case 'save': {
      const saveName = arg || new Date().toLocaleString('zh-CN').replace(/[/:]/g, '-');
      const saved = saveName; // Use as sessionId
      saveSession(state.projectDir, saveName, {
        projectDir: state.projectDir,
        sessionId: saveName,
        provider: state.llm.name,
        model: state.llm.model,
        permissionMode: state.permissionMode,
        messages: state.messages,
      });
      console.log(chalk.green(`Session saved: "${saveName}" (${state.messages.length} messages)`));
      break;
    }

    case 'load': {
      if (!arg) { console.log(chalk.red('Usage: /load <session-name>')); break; }
      const session = loadSession(state.projectDir, arg.trim());
      if (!session) { console.log(chalk.red('Session not found: ' + arg)); break; }
      // Restore messages
      state.messages = (session.messages || []).map(m => ({
        role: m.role as 'user' | 'assistant' | 'system' | 'tool',
        content: m.content,
      }));
      console.log(chalk.green(`Session loaded: "${session.sessionId}" (${state.messages.length} messages)`));
      if (session.provider !== state.llm.name) {
        console.log(chalk.yellow(`  Note: session was created with ${session.provider}, currently using ${state.llm.displayName}`));
      }
      break;
    }

    case 'sessions': {
      const sessions = listSessions(state.projectDir);
      if (sessions.length === 0) {
        console.log(chalk.gray('No saved sessions.'));
        break;
      }
      console.log(chalk.cyan('Saved sessions:'));
      sessions.forEach((s, i) => {
        const date = s.createdAt ? new Date(s.createdAt).toLocaleString('zh-CN') : '?';
        console.log(`  [${i + 1}] ${chalk.green(s.sessionId)}  ${chalk.gray(date)}  (${s.messageCount} msgs, ${s.provider})`);
      });
      console.log(chalk.gray('Load with: /load <name>'));
      break;
    }

    case 'search': {
      const caps = PROVIDER_CAPS[state.llm.name];
      if (!caps?.supportsWebSearch) {
        console.log(chalk.yellow(`${state.llm.displayName} does not support web search. Switch to Kimi with: /provider kimi`));
        break;
      }
      const llmObj = state.llm as any;
      if (!arg || arg === 'on') {
        llmObj.setWebSearch(true);
        console.log(chalk.green('Web search ON - agent can browse the internet'));
      } else if (arg === 'off') {
        llmObj.setWebSearch(false);
        console.log(chalk.gray('Web search OFF'));
      } else {
        console.log(chalk.red('Usage: /search on|off'));
      }
      break;
    }

    case 'session-delete': {
      if (!arg) { console.log(chalk.red('Usage: /session-delete <name>')); break; }
      if (deleteSession(state.projectDir, arg.trim())) {
        console.log(chalk.green('Session deleted: ' + arg));
      } else {
        console.log(chalk.red('Session not found: ' + arg));
      }
      break;
    }

    case 'thinking': {
      const caps = MODEL_CAPS[state.llm.model] || PROVIDER_CAPS[state.llm.name];
      if (!caps?.supportsThinking) {
        console.log(chalk.yellow(`${state.llm.model} does not support thinking mode.`));
        break;
      }
      if (!arg) {
        const llmObj = state.llm as any;
        const on = llmObj.thinkingOn;
        console.log(`Thinking: ${on ? chalk.green('ON') : chalk.gray('OFF')}`);
        if (caps.supportsThinkingEffort) {
          console.log(`  Effort: ${llmObj._reasoningEffort || 'high'}  (set: /thinking high|max)`);
        }
        break;
      }
      if (arg === 'on' || arg === 'off' || arg === 'high' || arg === 'max' || arg === 'medium' || arg === 'low') {
        const llmObj = state.llm as any;
        if (arg === 'on') {
          llmObj.setThinking(true);
          console.log(chalk.green('Thinking mode ON'));
        } else if (arg === 'off') {
          llmObj.setThinking(false);
          console.log(chalk.gray('Thinking mode OFF'));
        } else {
          // effort value
          if (caps.supportsThinkingEffort) {
            llmObj.setThinking(true);
            llmObj.reasoningEffort = arg;
            console.log(chalk.green(`Thinking mode ON with effort: ${arg}`));
          } else {
            console.log(chalk.yellow(`Effort not supported for this model, setting thinking ON.`));
            llmObj.setThinking(true);
          }
        }
      } else {
        console.log(chalk.red('Usage: /thinking on|off|high|max'));
      }
      break;
    }

    case 'trust':
      state.permissionMode = 'trusted';
      console.log(chalk.green('Switched to trusted mode - no permission prompts.'));
      break;

    case 'confirm':
      state.permissionMode = 'confirm';
      console.log(chalk.yellow('Switched to confirm mode.'));
      break;

    case 'status':
      showStatus(state);
      break;

    case 'img':
    case 'image': {
      // Format: /img <path> [question...]
      const imgPath = arg.split(' ')[0];
      const question = arg.slice(imgPath.length).trim() || '描述这张图';
      const resolvedPath = imgPath.includes('\\') || imgPath.includes('/') || imgPath.includes(':')
        ? imgPath : join(state.projectDir, imgPath);
      if (!checkImageSupport(state)) break;
      if (!fsExistsSync(resolvedPath)) {
        console.log(chalk.red(`File not found: ${imgPath}`));
        break;
      }
      const dataUrl = loadImageDataUrl(resolvedPath);
      if (!dataUrl) break;
      const parts: ContentPart[] = [
        { type: 'text', text: question },
        { type: 'image_url', image_url: { url: dataUrl, detail: 'auto' } },
      ];
      state.messages.push({ role: 'user', content: parts });
      console.log(chalk.gray(`   Image attached: ${resolvedPath}`));
      console.log(chalk.gray(`❓ Question: ${question}`));
      const ctx = buildAgentContext(state);
      await runAgent(ctx, ''); // empty string since the question is already in the message
      state.messages = ctx.messages;
      break;
    }

    case 'exit':
    case 'quit':
      doAutoSave(state);
      console.log(chalk.blue('Goodbye!'));
      state.registry.cleanup();
      process.exit(0);

    default:
      console.log(chalk.red(`Unknown command: /${cmd}. Type /help for commands.`));
  }
}

export async function runCLI(): Promise<void> {
  const args = parseArgs();

  if (args.help) { printHelp(); process.exit(0); }
  if (args.version) { printVersion(); process.exit(0); }

  const config = loadConfig();

  if (!config.llm.apiKey && !config.providerKeys) {
    console.error(chalk.red('Error: No API key configured.'));
    console.error(chalk.yellow('Set MOYU_API_KEY or create ~/.moyu/config.json'));
    process.exit(1);
  }

  const llm = createLLM(config.llm);
  const registry = new ToolRegistry();
  if (config.mcpServers && config.mcpServers.length > 0) {
    await registry.initMCPServers(config.mcpServers);
  }

  const state: CliState = {
    config,
    llm,
    projectDir: config.workDir || process.cwd(),
    registry,
    permissionMode: config.permissionMode,
    messages: [],
    sessionId: new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19),
    lastSavedCount: 0,
  };

  if (args.nonInteractive) {
    const ctx = buildAgentContext(state);
    await runAgent(ctx, args.nonInteractive);
    registry.cleanup();
    process.exit(0);
  }

  await startInteractive(state);
  registry.cleanup();
}



