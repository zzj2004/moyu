/**
 * moyu - List directory contents tool
 */

import { readdirSync, statSync } from 'node:fs';
import { join, relative, isAbsolute } from 'node:path';
import type { Tool, ToolResult, ToolContext } from './types.js';

export const listDirTool: Tool = {
  name: 'list_dir',
  description: 'List files and directories in a given path. Shows file sizes and modification dates.',
  permissionLevel: 'trusted',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Directory path (relative or absolute)' },
      depth: { type: 'number', description: 'Recursion depth (0 = current dir only, default: 0)' },
    },
    required: ['path'],
  },

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const dirPath = String(args.path || '.');
    const depth = Number(args.depth) || 0;
    const resolvedPath = isAbsolute(dirPath) ? dirPath : join(ctx.cwd, dirPath);
    const relPath = relative(ctx.cwd, resolvedPath) || '.';

    try {
      const lines = formatDir(resolvedPath, relPath, depth, 0);
      return { toolName: 'list_dir', success: true, output: lines.join('\n') };
    } catch (e) {
      return {
        toolName: 'list_dir', success: false, output: '',
        error: 'Error listing directory: ' + (e as Error).message,
      };
    }
  },
};

function formatDir(dirPath: string, displayName: string, maxDepth: number, curDepth: number): string[] {
  const lines: string[] = [];
  const indent = '  '.repeat(curDepth);
  try {
    const entries = readdirSync(dirPath);
    for (const entry of entries) {
      const fullPath = join(dirPath, entry);
      let stats;
      try { stats = statSync(fullPath); } catch { continue; }
      const isDir = stats.isDirectory();
      const icon = isDir ? '[DIR]' : '[FILE]';
      const size = isDir ? '' : '(' + formatSize(stats.size) + ')';
      lines.push(indent + icon + ' ' + entry + (isDir ? '/' : '') + ' ' + size);
      if (isDir && curDepth < maxDepth) {
        lines.push(...formatDir(fullPath, entry, maxDepth, curDepth + 1));
      }
    }
  } catch (e) {
    lines.push(indent + '[Error: ' + (e as Error).message + ']');
  }
  return lines;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
}

