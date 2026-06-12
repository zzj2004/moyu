/**
 * moyu - Run command tool
 * Executes shell commands with permission control.
 * Level 1 (confirm): must approve each command
 * Level 2 (trusted): full access
 */

import { execSync } from 'node:child_process';
import type { Tool, ToolResult, ToolContext } from './types.js';

const DANGEROUS_PATTERNS = ['rm -rf', 'format', 'del /f', 'rd /s', 'Remove-Item -Recurse'];

export const runCommandTool: Tool = {
  name: 'run_command',
  description: 'Execute a shell command in the terminal. Returns stdout + stderr. Use this for running build commands, tests, git operations, etc.',
  permissionLevel: 'confirm',
  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'Command to execute',
      },
      description: {
        type: 'string',
        description: 'Brief description of what this command does (shown to user for approval)',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds (default: 30000)',
      },
    },
    required: ['command'],
  },

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const command = String(args.command || '');
    const description = String(args.description || command);
    const timeout = Number(args.timeout) || 30000;

    if (!command) {
      return { toolName: 'run_command', success: false, output: '', error: 'command is required' };
    }

    // Check for dangerous patterns
    const isDangerous = DANGEROUS_PATTERNS.some(p => command.toLowerCase().includes(p.toLowerCase()));
    const actionLabel = isDangerous
      ? `⚠️  DESTRUCTIVE COMMAND: ${description}\n   Command: ${command}`
      : `Run: ${description}\n   Command: ${command}`;

    const allowed = await ctx.askPermission(actionLabel, 'run_command');
    if (!allowed) {
      return { toolName: 'run_command', success: false, output: '', error: 'Permission denied by user' };
    }

    try {
      const output = execSync(command, {
        encoding: 'utf-8',
        cwd: ctx.cwd,
        timeout,
        maxBuffer: 10 * 1024 * 1024,
      });

      const trimmed = output.trim();
      return {
        toolName: 'run_command',
        success: true,
        output: trimmed || '(command completed with no output)',
      };
    } catch (e) {
      const err = e as Error & { stdout?: string; stderr?: string };
      const stdout = err.stdout || '';
      const stderr = err.stderr || err.message;
      return {
        toolName: 'run_command',
        success: false,
        output: stdout.trim(),
        error: stderr,
      };
    }
  },
};
