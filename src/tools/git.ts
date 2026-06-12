/**
 * moyu - Git operation tools
 */

import { execSync } from 'node:child_process';
import type { Tool, ToolResult, ToolContext } from './types.js';

function runGit(args: string[], cwd: string, timeout = 15000): string {
  return execSync('git ' + args.join(' '), { encoding: 'utf-8', cwd, timeout, maxBuffer: 1024 * 1024 }).trim();
}

const gitAction = 'Git operation';

export const gitStatusTool: Tool = {
  name: 'git_status',
  permissionLevel: 'trusted',
  description: 'Show the working tree status (modified, staged, untracked files). Lightweight read-only operation.',
  inputSchema: { type: 'object', properties: {}, required: [] },

  async execute(_args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    try {
      const output = runGit(['status', '--short'], ctx.cwd);
      const branch = runGit(['branch', '--show-current'], ctx.cwd);
      return {
        toolName: 'git_status', success: true,
        output: 'Branch: ' + branch + '\n' + (output || '(clean working tree)'),
      };
    } catch (e) {
      return { toolName: 'git_status', success: false, output: '', error: (e as Error).message };
    }
  },
};

export const gitDiffTool: Tool = {
  name: 'git_diff',
  permissionLevel: 'trusted',
  description: 'Show unstaged changes (diff) in the working tree. Use with --staged to see staged changes.',
  inputSchema: {
    type: 'object',
    properties: {
      staged: { type: 'boolean', description: 'Show staged changes instead of unstaged' },
      path: { type: 'string', description: 'Only show diff for a specific file' },
    },
  },

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    try {
      const gitArgs = ['diff'];
      if (args.staged) gitArgs.push('--staged');
      if (args.path) gitArgs.push(String(args.path));
      const output = runGit(gitArgs, ctx.cwd);
      return {
        toolName: 'git_diff', success: true,
        output: output || '(no changes)',
      };
    } catch (e) {
      return { toolName: 'git_diff', success: false, output: '', error: (e as Error).message };
    }
  },
};

export const gitLogTool: Tool = {
  name: 'git_log',
  permissionLevel: 'trusted',
  description: 'Show recent commit history. Lightweight read-only operation.',
  inputSchema: {
    type: 'object',
    properties: {
      count: { type: 'number', description: 'Number of commits to show (default: 10)' },
      path: { type: 'string', description: 'Show history for a specific file' },
    },
  },

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    try {
      const count = Number(args.count) || 10;
      const gitArgs = ['log', '--oneline', '-n', String(count), '--format=%h %s (%ar)'];
      if (args.path) gitArgs.push('--', String(args.path));
      const output = runGit(gitArgs, ctx.cwd);
      return {
        toolName: 'git_log', success: true,
        output: output || '(no commits found)',
      };
    } catch (e) {
      return { toolName: 'git_log', success: false, output: '', error: (e as Error).message };
    }
  },
};

export const gitCommitTool: Tool = {
  name: 'git_commit',
  description: 'Create a git commit with the given message. Stages all tracked file changes first. Requires permission.',
  permissionLevel: 'confirm',
  inputSchema: {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'Commit message (required)' },
      addAll: { type: 'boolean', description: 'Auto-stage all changes before commit (default: true)' },
    },
    required: ['message'],
  },

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const message = String(args.message || '');
    if (!message) return { toolName: 'git_commit', success: false, output: '', error: 'message is required' };

    const addAll = args.addAll !== false;
    const action = 'Git commit:\n  Message: ' + message + '\n  Auto-stage: ' + (addAll ? 'yes' : 'no');

    const allowed = await ctx.askPermission(action, 'git_commit');
    if (!allowed) return { toolName: 'git_commit', success: false, output: '', error: 'Permission denied' };

    try {
      if (addAll) runGit(['add', '-A'], ctx.cwd);
      const output = runGit(['commit', '-m', '"' + message.replace(/"/g, '\\"') + '"'], ctx.cwd);
      return { toolName: 'git_commit', success: true, output };
    } catch (e) {
      return { toolName: 'git_commit', success: false, output: '', error: (e as Error).message };
    }
  },
};


