/**
 * moyu - Delete file tool (safe: only files and empty directories)
 */

import { unlinkSync, rmdirSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, relative, isAbsolute } from 'node:path';
import type { Tool, ToolResult, ToolContext } from './types.js';

export const deleteFileTool: Tool = {
  name: 'file_delete',
  description: 'Delete a file or empty directory. Shows size info before deletion. Requires confirmation.',
  permissionLevel: 'confirm',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to the file or empty directory to delete' },
      force: { type: 'boolean', description: 'Skip safety checks (use with caution)' },
    },
    required: ['filePath'],
  },

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const filePath = String(args.filePath || '');
    if (!filePath) return { toolName: 'file_delete', success: false, output: '', error: 'filePath is required' };

    const resolvedPath = isAbsolute(filePath) ? filePath : join(ctx.cwd, filePath);
    const relPath = relative(ctx.cwd, resolvedPath);

    if (!existsSync(resolvedPath)) {
      return { toolName: 'file_delete', success: false, output: '', error: 'Not found: ' + filePath };
    }

    const stats = statSync(resolvedPath);
    const isDir = stats.isDirectory();

    // Safety: refuse to delete non-empty directories unless forced
    if (isDir) {
      const contents = readdirSync(resolvedPath);
      if (contents.length > 0 && !args.force) {
        return {
          toolName: 'file_delete', success: false, output: '', error: 'Directory is not empty (' + contents.length + ' items). Use force:true or delete files individually.',
        };
      }
    }

    const size = isDir ? '[DIR]' : '(' + stats.size + ' bytes)';
    const action = 'Delete ' + relPath + ' ' + size;

    const allowed = await ctx.askPermission(action, 'file_delete');
    if (!allowed) return { toolName: 'file_delete', success: false, output: '', error: 'Permission denied' };

    try {
      if (isDir) rmdirSync(resolvedPath);
      else unlinkSync(resolvedPath);
      return { toolName: 'file_delete', success: true, output: 'Deleted: ' + relPath };
    } catch (e) {
      return { toolName: 'file_delete', success: false, output: '', error: 'Delete failed: ' + (e as Error).message };
    }
  },
};

