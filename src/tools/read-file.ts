/**
 * moyu - Read file tool
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative, isAbsolute } from 'node:path';
import type { Tool, ToolResult, ToolContext } from './types.js';

const MAX_FILE_SIZE = 1024 * 1024; // 1MB

export const readFileTool: Tool = {
  name: 'read_file',
  description: 'Read the contents of a file. Use this when you need to examine code, config files, logs, etc.',
  permissionLevel: 'trusted',
  inputSchema: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: 'Path to the file (relative to working directory or absolute)',
      },
    },
    required: ['filePath'],
  },

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const filePath = String(args.filePath || '');
    if (!filePath) {
      return { toolName: 'read_file', success: false, output: '', error: 'filePath is required' };
    }

    const resolvedPath = isAbsolute(filePath) ? filePath : join(ctx.cwd, filePath);

    if (!existsSync(resolvedPath)) {
      return { toolName: 'read_file', success: false, output: '', error: `File not found: ${filePath}` };
    }

    const stats = statSync(resolvedPath);
    if (stats.isDirectory()) {
      return { toolName: 'read_file', success: false, output: '', error: `${filePath} is a directory, not a file` };
    }

    if (stats.size > MAX_FILE_SIZE) {
      return { toolName: 'read_file', success: false, output: '', error: `File too large (${stats.size} bytes, max ${MAX_FILE_SIZE})` };
    }

    try {
      const content = readFileSync(resolvedPath, 'utf-8');
      const relPath = relative(ctx.cwd, resolvedPath);
      return {
        toolName: 'read_file',
        success: true,
        output: `File: ${relPath}\n\n${content}`,
      };
    } catch (e) {
      return {
        toolName: 'read_file',
        success: false,
        output: '',
        error: `Error reading file: ${(e as Error).message}`,
      };
    }
  },
};

