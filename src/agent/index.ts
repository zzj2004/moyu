/**
 * moyu - Agent core loop
 */

import type { MoyuConfig, PermissionLevel } from '../config/types.js';
import type { LLMProvider, Message, ToolCall, LLMResponse } from '../llm/types.js';
import type { ToolResult, ToolContext } from '../tools/types.js';
import { ToolRegistry } from '../tools/index.js';
import chalk from 'chalk';

const SYSTEM_PROMPT = `You are moyu - an elite AI coding agent operating directly in the user's terminal.

== Mission ==
You are a senior engineer who lives in the terminal. Help users build, debug, refactor, and understand code.

== Tools ==
- read_file, write_file (shows diff), search_code, file_delete, file_rename
- run_command, list_dir
- git_status, git_diff, git_log, git_commit
- MCP: external tools via Model Context Protocol

== Modes ==
- Web Search: /search on (browse the internet)
- Deep Thinking: /thinking on|high|max (extended reasoning)
- Image Analysis: /img <path> (Kimi only)

== Rules ==
1. Think step by step before calling tools
2. Explain your approach before making changes
3. If something fails, diagnose and retry
4. Be concise. No fluff.
5. One step at a time, show progress
6. Respect permissions - ask before sensitive ops
7. Respond in Chinese or English based on the user
`;

export interface AgentContext {
  config: MoyuConfig;
  projectDir: string;
  llm: LLMProvider;
  registry: ToolRegistry;
  permissionMode: PermissionLevel;
  messages: Message[];
}

async function askPermission(
  action: string,
  toolName: string,
  permissionMode: PermissionLevel,
  toolPermissions?: Array<{ toolName: string; level: PermissionLevel }>,
): Promise<boolean> {
  const toolOverride = toolPermissions?.find(p => p.toolName === toolName);
  const effectiveLevel = toolOverride?.level || permissionMode;

  if (effectiveLevel === 'trusted') return true;

  console.log('');
  console.log('');
  console.log(chalk.yellow('  Permission Required'));
  console.log(chalk.gray('  ---------------------------'));
  console.log(action.split('\n').map((l: string) => '  ' + l).join('\n'));
  console.log('');
  console.log(chalk.gray('  [y]es  [n]o  [Y]es always'));

  const answer = await readAnswer();
  return answer === 'y' || answer === 'Y';
}

function readAnswer(): Promise<string> {
  return new Promise((resolve) => {
    const { stdin } = process;
    const onData = (data: Buffer) => {
      stdin.removeListener('data', onData);
      resolve(data.toString().trim().toLowerCase());
    };
    stdin.once('data', onData);
  });
}

export async function runAgent(ctx: AgentContext, userInput: string): Promise<void> {
  if (userInput) {
    ctx.messages.push({ role: 'user', content: userInput });
  }

  let turnCount = 0;
  const maxTurns = 25;

  while (turnCount < maxTurns) {
    turnCount++;

    let response: LLMResponse;
    const systemMsg: Message = {
      role: 'system',
      content: ctx.config.systemPrompt || SYSTEM_PROMPT,
    };
    const tools = ctx.registry.getToolDefinitions();

    process.stdout.write(chalk.cyan('|') + chalk.bold('moyu ') + chalk.gray('> '));

    try {
      response = await ctx.llm.chatStream(
        [systemMsg, ...ctx.messages],
        tools,
        {
          onText: (chunk: string) => {
            process.stdout.write(chunk);
          },
          onToolCall: (toolCall) => {
            console.log('');
            console.log(chalk.dim('  ~') + chalk.yellow('Preparing: ') + chalk.cyan(toolCall.function.name) + chalk.gray('...'));
          },
        },
      );
      console.log('');
    } catch (e) {
      console.log('');
      console.log(chalk.red('  !!') + 'LLM error: ' + (e as Error).message);
      break;
    }

    // Push assistant message if there's content or tool calls
    if (response.content || (response.toolCalls && response.toolCalls.length > 0)) {
      ctx.messages.push({
        role: 'assistant',
        content: response.content || '',
        tool_calls: response.toolCalls,
      });
    }

    // Handle tool calls
    if (response.toolCalls && response.toolCalls.length > 0) {
      for (const toolCall of response.toolCalls) {
        const result = await handleToolCall(ctx, toolCall);
        if (result.error) {
          console.log(chalk.red('  !!') + chalk.bold(toolCall.function.name) + ': ' + result.error);
        } else {
          console.log(chalk.green('  v') + chalk.bold(toolCall.function.name) + ' completed');
        }
        ctx.messages.push({
          role: 'tool',
          content: result.output || result.error || '',
          tool_call_id: toolCall.id,
        });
      }
      continue; // Continue loop to send tool results back to LLM
    }

    // No tool calls - end turn
    if (!response.content) break;
    if (response.stopReason === 'end_turn') break;
  }

  if (turnCount >= maxTurns) {
    console.log(chalk.yellow('  [!] Reached maximum conversation turns.'));
  }
}

async function handleToolCall(ctx: AgentContext, toolCall: ToolCall): Promise<ToolResult> {
  // $web_search is a builtin function handled by the Kimi API internally.
  // The API returns search results in the tool call arguments.
  if (toolCall.function.name === '$web_search') {
    console.log(chalk.dim('  ~') + chalk.cyan('Web search') + chalk.gray(' completed'));
    // Pass through actual search results from the API response
    const searchData = toolCall.function.arguments;
    return {
      toolName: '$web_search',
      success: true,
      output: searchData,
    };
  }

  let args: Record<string, unknown>;
  try {
    args = JSON.parse(toolCall.function.arguments);
  } catch {
    return {
      toolName: toolCall.function.name,
      success: false,
      output: '',
      error: `Failed to parse tool arguments: ${toolCall.function.arguments}`,
    };
  }

  const toolCtx: ToolContext = {
    cwd: ctx.projectDir,
    permissionMode: ctx.permissionMode,
    askPermission: (action, toolName) =>
      askPermission(action, toolName, ctx.permissionMode, ctx.config.toolPermissions),
  };

  console.log(chalk.dim('  ~') + chalk.cyan(toolCall.function.name) + chalk.gray('...'));
  return ctx.registry.executeTool(toolCall.function.name, args, toolCtx);
}

export function printBanner(): void {
  console.log('');
  console.log(chalk.cyan('  ╔══════════════════════════════════════╗'));
  console.log(chalk.cyan('  ║  ███╗   ███╗ ██████╗ ██╗   ██╗██╗   ║'));
  console.log(chalk.cyan('  ║  ████╗ ████║██╔═══██╗╚██╗ ██╔╝██║   ║'));
  console.log(chalk.cyan('  ║  ██╔████╔██║██║   ██║ ╚████╔╝ ██║   ║'));
  console.log(chalk.cyan('  ║  ██║╚██╔╝██║██║   ██║  ╚██╔╝  ██║   ║'));
  console.log(chalk.cyan('  ║  ██║ ╚═╝ ██║╚██████╔╝   ██║   ██║   ║'));
  console.log(chalk.cyan('  ║  ╚═╝     ╚═╝ ╚═════╝    ╚═╝   ╚═╝   ║'));
  console.log(chalk.cyan('  ╚══════════════════════════════════════╝'));
  console.log(chalk.gray('         Terminal AI Coding Agent'));
  console.log(chalk.gray('         v0.1.0  |  MIT License'));
  console.log('');
}
